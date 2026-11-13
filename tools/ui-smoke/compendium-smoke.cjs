// Compendium editing smoke test for kit-native kinds (traps, diseases): clone on first edit,
// edit in place, delete, and create new. Windows are hidden and render offscreen; nothing
// appears on the desktop. Run with `npm run test:compendium:ui` after `npm run build`.
process.env.FOUR_E_HIDDEN_WINDOWS = '1'
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')
const root = mkdtempSync(join(tmpdir(), '4e-compendium-ui-'))
app.setPath('appData', root)
mkdirSync(join(root, 'user'))
app.setPath('userData', join(root, 'user'))
// The compendium reads content/parsed relative to the app path (this script's folder).
const contentLink = join(__dirname, 'content')
if (!existsSync(contentLink)) symlinkSync(resolve(__dirname, '../../content'), contentLink)
require('../../out/main/index.js')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const finish = code => { try { rmSync(contentLink) } catch {} app.exit(code) }
const timeout = setTimeout(() => { console.error('Compendium smoke timed out'); finish(1) }, 90000)

app.whenReady().then(async () => {
  try {
    let win
    for (let i = 0; i < 100; i++) { win = BrowserWindow.getAllWindows()[0]; if (win && !win.webContents.isLoading()) break; await sleep(100) }
    const wc = win.webContents
    wc.on('console-message', (_e, level, message) => { if (level >= 2) console.error('renderer:', message) })
    await sleep(1000)
    const js = (fn, ...args) => wc.executeJavaScript(`(${fn})(...${JSON.stringify(args)})`)
    const until = async (fn, what, ...args) => { for (let i = 0; i < 60; i++) { if (await js(fn, ...args)) return; await sleep(100) } throw new Error('Timed out waiting for ' + what) }
    let frame = null
    wc.on('paint', (_e, _dirty, image) => { frame = image })
    const screenshot = async path => { frame = null; wc.invalidate(); for (let i = 0; i < 50 && !frame; i++) await sleep(100); if (frame && !frame.isEmpty()) writeFileSync(join(process.cwd(), path), frame.toPNG()) }
    // Type into a field through the DOM selection, the way a user's typing replaces it.
    const typeInto = async (selector, text, last = false) => { await js((s, l) => { const all = document.querySelectorAll(s); const el = l ? all[all.length - 1] : all[0]; el.focus(); el.select() }, selector, last); await wc.insertText(text); await sleep(100) }
    const records = type => js(t => window.api.entity.list(t), type)

    await js(() => { window.__confirms = []; window.confirm = m => { window.__confirms.push(m); return true } })
    await js(async () => { const c = await window.api.campaign.create('Compendium smoke'); await window.api.campaign.open(c.id) })
    await sleep(800)

    // ── Traps: a published entry is read-only; editing it clones on the first change ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Traps')).click())
    await until(() => document.querySelectorAll('.record-row').length > 10, 'the trap list')
    await js(() => { const i = document.querySelector('.record-compendium input.sb-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Collapsing Ceiling'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => [...document.querySelectorAll('.record-row')].some(r => r.textContent.includes('Hazard')), 'the search result')
    await js(() => [...document.querySelectorAll('.record-row')].find(r => r.textContent.includes('Hazard')).click())
    await until(() => document.querySelector('.compendium-preview .kit-statblock .sb-name')?.textContent === 'Collapsing Ceiling', 'the published preview')
    const published = await js(() => document.querySelector('.compendium-preview').innerText)
    if (!published.includes('Trigger') || !published.includes('Countermeasures')) throw new Error('Published trap preview is missing sections')
    if (await js(() => !!document.querySelector('.compendium-preview input'))) throw new Error('Published preview is editable')
    await js(() => [...document.querySelectorAll('.record-action')].find(b => b.textContent === 'Copy to campaign').click())
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the editor')
    if (!(await js(() => document.querySelector('.record-editbar').textContent.includes('Draft (saves on first edit)')))) throw new Error('Clone is not marked as an unsaved draft')
    if ((await records('trap')).length) throw new Error('Cloning saved before any edit')
    await typeInto('.compendium-preview input.sb-name', 'Collapsing Vault')
    await sleep(900)
    let saved = await records('trap')
    if (saved.length !== 1 || saved[0].content.name !== 'Collapsing Vault' || !/^published\/trap\//.test(saved[0].basedOn ?? '')) throw new Error('First edit did not save the clone: ' + JSON.stringify(saved.map(r => [r.content.name, r.basedOn])))
    const original = await js(id => window.api.compendium.kitGet('trap', id), saved[0].basedOn.split('/').pop())
    if (JSON.stringify(saved[0].content.powers) !== JSON.stringify(original.powers) || saved[0].content.countermeasures.length !== original.countermeasures.length) throw new Error('The clone lost published mechanics')
    if (!(await js(() => document.activeElement === document.querySelector('.compendium-preview input.sb-name')))) throw new Error('Saving the clone moved focus out of the editor')

    // Edit in place: trigger prose and a countermeasure, then add a countermeasure.
    await typeInto('.compendium-preview textarea[aria-label="When the trap acts"]', 'A creature pries at the loose keystone.')
    await js(() => [...document.querySelectorAll('.compendium-preview .sb-add')].find(b => b.textContent.includes('countermeasure')).click())
    await sleep(100)
    await typeInto('.compendium-preview textarea[aria-label="How characters can stop or avoid it"]', 'Shoring the ceiling with timber stops the collapse.', true)
    await sleep(900)
    saved = await records('trap')
    const vault = saved[0].content
    const kept = JSON.stringify(vault.countermeasures.slice(0, -1)) === JSON.stringify(original.countermeasures) && vault.countermeasures.at(-1).text === 'Shoring the ceiling with timber stops the collapse.'
    if (vault.trigger.text !== 'A creature pries at the loose keystone.' || !kept) throw new Error('In-place edits were not saved: ' + JSON.stringify({ trigger: vault.trigger, counters: vault.countermeasures.map(c => c.text) }))
    if (!(await js(() => document.querySelector('.record-editbar').textContent.includes('Saved at')))) throw new Error('No saved indicator')
    await screenshot('out/compendium-trap-edit.png')

    // Back to the preview: the copy is listed as Custom; delete it from the context menu.
    await js(() => [...document.querySelectorAll('.record-editbar button')].find(b => b.textContent.includes('Back')).click())
    await js(() => { const i = document.querySelector('.record-compendium input.sb-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Collapsing'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => [...document.querySelectorAll('.record-row')].some(r => r.textContent.includes('Collapsing Vault') && r.textContent.includes('Custom')), 'the Custom row')
    await js(() => { const r = [...document.querySelectorAll('.record-row')].find(r => r.textContent.includes('Collapsing Vault')); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })) })
    await until(() => !!document.querySelector('.record-menu'), 'the context menu')
    await js(() => document.querySelector('.record-menu button').click())
    await sleep(400)
    if ((await records('trap')).length) throw new Error('Delete did not remove the record')

    // New trap: blank until the first edit, then saved.
    await js(() => [...document.querySelectorAll('.record-compendium button')].find(b => b.textContent.trim() === '+ new').click())
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the new trap editor')
    if ((await records('trap')).length) throw new Error('New trap saved before any edit')
    await typeInto('.compendium-preview input.sb-name', 'Spiked Pit')
    // Autosave is debounced (500 ms); poll rather than race it.
    for (let i = 0; i < 30 && (saved = await records('trap')).length !== 1; i++) await sleep(100)
    if (saved.length !== 1 || saved[0].content.name !== 'Spiked Pit' || saved[0].basedOn) throw new Error('New trap was not saved by its first edit')

    // ── Diseases: new disease, add a stage, set the DCs ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Diseases')).click())
    await until(() => document.querySelectorAll('.record-row').length > 10, 'the disease list')
    await js(() => [...document.querySelectorAll('.record-compendium button')].find(b => b.textContent.trim() === '+ new').click())
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the new disease editor')
    await typeInto('.compendium-preview input.sb-name', 'Grave Cough')
    await js(() => [...document.querySelectorAll('.compendium-preview .sb-add')].find(b => b.textContent.includes('stage')).click())
    await sleep(100)
    await typeInto('.compendium-preview textarea[aria-label="Effect at this stage"]', 'The target is weakened.')
    await typeInto('.compendium-preview input[aria-label="Improve DC"]', '20')
    await sleep(900)
    const disease = (await records('disease'))[0]?.content
    if (!disease || disease.name !== 'Grave Cough' || disease.stages.at(-1).line.text !== 'The target is weakened.' || disease.endurance.improveDc !== 20) throw new Error('Disease edits were not saved: ' + JSON.stringify(disease))
    await screenshot('out/compendium-disease-edit.png')

    // ── Items: published entries clone losslessly; the item editor types normally ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Items')).click())
    await until(() => document.querySelectorAll('.record-row').length > 10, 'the item list')
    await js(() => { const i = document.querySelector('.record-compendium input.sb-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Flaming Weapon'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => [...document.querySelectorAll('.record-row .record-name')].some(n => n.textContent === 'Flaming Weapon'), 'the Flaming Weapon row')
    await js(() => [...document.querySelectorAll('.record-row')].find(r => r.querySelector('.record-name').textContent === 'Flaming Weapon').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the item editor')
    await typeInto('.compendium-preview input.sb-name', 'Searing Weapon')
    // One character at a time, as a person types: the spaces must survive.
    await js(() => { const el = document.querySelector('.compendium-preview input[placeholder="Any melee"]'); el.focus(); el.select() })
    for (const ch of 'Any heavy blade') await wc.insertText(ch)
    await sleep(900)
    const searing = (await records('item')).find(r => r.content.name === 'Searing Weapon')
    const flaming = await js(id => window.api.compendium.kitGet('item', id), (searing?.basedOn ?? '').split('/').pop())
    if (!searing || JSON.stringify(searing.content.powers) !== JSON.stringify(flaming.powers) || JSON.stringify(searing.content.critical) !== JSON.stringify(flaming.critical)) throw new Error('Item clone was not saved losslessly: ' + JSON.stringify(searing?.content.name))
    const typedType = await js(() => [...document.querySelectorAll('.compendium-preview input')].find(i => i.placeholder === 'Any melee')?.value)
    if (typedType !== 'Any heavy blade' || searing.content.itemType !== 'Any heavy blade') throw new Error('Typing lost characters: ' + JSON.stringify([typedType, searing.content.itemType]))
    await screenshot('out/compendium-item-edit.png')

    // ── Templates and themes: published entries clone into campaign records ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Templates')).click())
    await until(() => [...document.querySelectorAll('.record-row')].some(r => r.textContent.includes('Lich')), 'the template list')
    await js(() => [...document.querySelectorAll('.record-row')].find(r => r.querySelector('.record-name').textContent === 'Lich').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the template editor')
    await typeInto('.compendium-preview input.sb-name', 'Dust Lich')
    await sleep(900)
    const lich = (await records('template'))[0]
    const publishedLich = await js(() => window.api.compendium.kitGet('template', 'lich'))
    if (lich?.content.name !== 'Dust Lich' || JSON.stringify(lich.content.powers) !== JSON.stringify(publishedLich.powers) || lich.content.hpPerLevel !== publishedLich.hpPerLevel) throw new Error('Template clone was not saved losslessly: ' + JSON.stringify(lich?.content.name))
    await screenshot('out/compendium-template-edit.png')
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Themes')).click())
    await until(() => document.querySelectorAll('.record-row').length > 5, 'the theme list')
    await js(() => [...document.querySelectorAll('.record-compendium button')].find(b => b.textContent.trim() === '+ new').click())
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the new theme editor')
    await typeInto('.compendium-preview input.sb-name', 'Ashen Court')
    await sleep(900)
    if ((await records('theme'))[0]?.content.name !== 'Ashen Court') throw new Error('New theme was not saved')
    await screenshot('out/compendium-theme-edit.png')


    // ── Creatures: the shared page with the creature viewer, art, pop-outs, and the benchmark editor ──
    // A published monster's art is a compendium annotation; a copy takes it into the record's art.
    await js(() => window.api.annotation.save('monster145', { imageId: 'rat-art' }))
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Creatures')).click())
    await until(() => document.querySelectorAll('.record-row').length > 10, 'the creature list')
    await js(() => { const i = document.querySelector('.record-compendium input.sb-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Dire Rat'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => [...document.querySelectorAll('.record-row .record-name')].some(n => n.textContent === 'Dire Rat'), 'the Dire Rat row')
    await js(() => [...document.querySelectorAll('.record-row')].find(r => r.querySelector('.record-name').textContent === 'Dire Rat').click())
    await until(() => document.querySelector('.compendium-preview')?.innerText.includes('Bite'), 'the published creature preview')
    if (await js(() => !!document.querySelector('.compendium-preview input.sb-name'))) throw new Error('Published creature preview is editable')
    await js(() => document.querySelector('.compendium-preview button[title="Pop out stat block"]').click())
    await until(() => [...document.querySelectorAll('*')].some(el => el.children.length === 0 && el.textContent.trim() === '📑 Dire Rat'), 'the pop-out')
    await js(() => [...document.querySelectorAll('.record-action')].find(b => b.textContent === 'Copy to campaign').click())
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the creature editor')
    if (!(await js(() => [...document.querySelectorAll('.compendium-preview input')].some(i => i.value === 'Bite')))) throw new Error('The creature editor lacks the powers')
    await typeInto('.compendium-preview input.sb-name', 'Sewer Rat')
    let sewer
    for (let i = 0; i < 30 && !(sewer = (await records('creature')).find(r => r.content.name === 'Sewer Rat')); i++) await sleep(100)
    const direRat = await js(() => window.api.compendium.kitGet('monster', 'monster145'))
    if (!sewer || sewer.basedOn !== 'published/creature/monster145' || sewer.art?.imageId !== 'rat-art') throw new Error('Creature copy wrong: ' + JSON.stringify(sewer && [sewer.basedOn, sewer.art]))
    if (JSON.stringify(sewer.content.powers) !== JSON.stringify(direRat.powers) || sewer.content.hp !== direRat.hp) throw new Error('Creature copy was not lossless')
    await screenshot('out/compendium-creature-edit.png')
    // A new creature is saved by its first edit.
    await js(() => [...document.querySelectorAll('.record-compendium button')].find(b => b.textContent.trim() === '+ new').click())
    await until(() => document.querySelector('.compendium-preview input.sb-name')?.value === 'New Creature', 'the new creature editor')
    await typeInto('.compendium-preview input.sb-name', 'Bog Thing')
    let bog
    for (let i = 0; i < 30 && !(bog = (await records('creature')).find(r => r.content.name === 'Bog Thing')); i++) await sleep(100)
    if (!bog || bog.content.level !== 1) throw new Error('New creature was not saved')
    // Edit in Workshop opens an update draft for the campaign creature.
    await js(() => [...document.querySelectorAll('.record-editbar button')].find(b => b.textContent.includes('Back')).click())
    await js(() => [...document.querySelectorAll('.record-action')].find(b => b.textContent === 'Edit in Workshop').click())
    let drafts
    for (let i = 0; i < 30 && !(drafts = await js(() => window.api.authoring.call('list_drafts'))).some(d => d.name === 'Bog Thing'); i++) await sleep(100)
    if (!drafts.some(d => d.name === 'Bog Thing' && d.kind === 'monster')) throw new Error('Edit in Workshop made no creature draft: ' + JSON.stringify(drafts.map(d => [d.name, d.kind])))
    const confirms = await js(() => window.__confirms)
    if (confirms.length) throw new Error('Unexpected confirmation prompts: ' + JSON.stringify(confirms))
    console.log('COMPENDIUM_SMOKE_OK: published trap preview, clone on first edit (lossless, focus kept), in-place edits with autosave, Custom listing, delete, new trap and disease saved by their first edit, item clone with typed edits, template clone and new theme, creatures (published preview, pop-out, art carried into a lossless copy, new creature, Edit in Workshop); screenshots out/compendium-trap-edit.png, out/compendium-disease-edit.png')
    clearTimeout(timeout); finish(0)
  } catch (e) { console.error(e); clearTimeout(timeout); finish(1) }
})
