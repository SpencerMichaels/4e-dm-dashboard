// Compendium editing smoke test for kit-native kinds (traps, diseases): clone on first edit,
// edit in place, delete, and create new. Windows are hidden and render offscreen; nothing
// appears on the desktop. Run with `npm run test:compendium:ui` after `npm run build`.
process.env.FOUR_E_HIDDEN_WINDOWS = '1'
// Published traps from the parser, not a content repo on this machine.
process.env.CONTENT_REPO = '/nonexistent-content-repo'
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
    // New: a blank entry in the open campaign (or the Library without one).
    const newEntry = () => js(() => [...document.querySelectorAll('.record-compendium button')].find(b => b.textContent.trim() === 'New').click())
    // The entry's controls in its stat block title bar: where it lives, Edit/Done, and the ⋯ menu.
    const headerButton = label => js(l => document.querySelector(`.compendium-preview .sb-header-actions button[aria-label="${l}"]`).click(), label)
    const done = () => headerButton('Done')
    const homeChip = () => js(() => document.querySelector('.compendium-preview .sb-header-home')?.textContent ?? null)
    const homeChipTitle = () => js(() => document.querySelector('.compendium-preview .sb-header-home')?.title ?? '')
    const menuItem = async label => {
      await js(() => document.querySelector('.compendium-preview button[aria-label="More actions"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
      await until(() => !!document.querySelector('.record-menu'), 'the entry menu')
      // A Library entry's Shared item waits for its usage check.
      await until(l => [...document.querySelectorAll('.record-menu button')].some(b => b.textContent.trim() === l && !b.disabled), 'the enabled menu item ' + label, label)
      await js(l => [...document.querySelectorAll('.record-menu button')].find(b => b.textContent.trim() === l).click(), label)
    }
    const records = type => js(t => window.api.entity.list(t), type)

    await js(() => { window.__confirms = []; window.confirm = m => { window.__confirms.push(m); return true } })
    // ── The Library: custom entries outside every campaign. With none open, New makes one there. ──
    const library = type => js(async key => (await window.api.library.state())[key] ?? [], { trap: 'traps', creature: 'creatures' }[type])
    const search = text => js(t => { const i = document.querySelector('.record-compendium input.sb-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, t); i.dispatchEvent(new Event('input', { bubbles: true })) }, text)
    // The source filter (after the kind's own filters): Published or Custom, then a book or a home beside it.
    const setSelect = (label, value) => js((l, v) => { const s = document.querySelector(`.record-compendium select[aria-label="${l}"]`); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, v); s.dispatchEvent(new Event('change', { bubbles: true })) }, label, value)
    const filterSource = async (source, within = '') => {
      await setSelect('Source', source)
      if (!within) return
      const label = source === 'published' ? 'Book' : 'Custom source'
      await until(l => !!document.querySelector(`.record-compendium select[aria-label="${l}"]`), 'the ' + label + ' filter', label)
      await setSelect(label, within)
    }
    const rowNames = () => js(() => [...document.querySelectorAll('.record-row .record-name')].map(n => n.textContent))
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Traps')).click())
    await until(() => document.querySelectorAll('.record-row').length > 10, 'the trap list without a campaign')
    await js(() => [...document.querySelectorAll('.record-compendium button')].find(b => b.textContent.trim() === 'New').click())
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the new Library trap editor')
    if (await homeChip() !== 'New' || !(await homeChipTitle()).includes('as a shared entry')) throw new Error('A new entry without a campaign does not say it goes into the Library')
    // The controls sit in the stat block's title bar, right after the name and before the level.
    const order = await js(() => [...document.querySelector('.compendium-preview .sb-header').children].map(c => c.className))
    if (order[0] !== 'ghost sb-name' || order[1] !== 'sb-header-actions') throw new Error('The entry controls are not right after the name: ' + JSON.stringify(order))
    await typeInto('.compendium-preview input.sb-name', 'Shared Snare')
    let shared
    for (let i = 0; i < 30 && !(shared = (await library('trap')).find(r => r.content.name === 'Shared Snare')); i++) await sleep(100)
    if (!shared) throw new Error('The new Library trap was not saved to the Library')
    await done()
    await search('Shared Snare')
    await filterSource('custom')
    await until(() => [...document.querySelectorAll('.record-row')].some(r => r.textContent.includes('Shared Snare')), 'the Library row')
    if (await js(() => !!document.querySelector('.record-row .record-custom'))) throw new Error('Rows still carry home labels')
    await filterSource('published')
    await until(() => ![...document.querySelectorAll('.record-row')].some(r => r.textContent.includes('Shared Snare')), 'the Library entry filtered out')
    // Published narrows by book; a magazine's issues are one choice.
    await search('')
    await filterSource('published')
    await until(() => !!document.querySelector('.record-compendium select[aria-label="Book"]') && document.querySelectorAll('.record-row').length > 10, 'the book filter and every published trap')
    const bookList = await js(() => [...document.querySelectorAll('.record-compendium select[aria-label="Book"] option')].map(o => o.value))
    if (!bookList.includes('Dungeon Magazine') || bookList.some(b => /Magazine \d/.test(b))) throw new Error('Book options: ' + JSON.stringify(bookList.slice(0, 20)))
    const allPublished = await js(() => document.querySelector('.record-count').textContent)
    await filterSource('published', 'Dungeon Magazine')
    await until(n => document.querySelector('.record-count').textContent !== n && document.querySelectorAll('.record-row').length > 0, 'the Dungeon Magazine traps', allPublished)
    await filterSource('')
    if (await js(() => !!document.querySelector('.record-compendium select[aria-label="Book"]'))) throw new Error('The book filter stays without Published')

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
    // Edit (double-click) on a published entry: an unsaved copy that the first change adds.
    await js(() => [...document.querySelectorAll('.record-row')].find(r => r.textContent.includes('Hazard')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the editor')
    if (await homeChip() !== 'New' || !(await homeChipTitle()).includes('Your first change adds it to Compendium smoke')) throw new Error('Clone is not marked as an unsaved draft')
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
    if (await homeChip() !== 'Campaign') throw new Error('The saved copy does not say it is in the campaign')
    if (!(await js(() => [...document.querySelectorAll('.compendium-preview .sb-header-actions button')].some(b => b.title.includes('saved at'))))) throw new Error('No saved indicator')
    await screenshot('out/compendium-trap-edit.png')

    // Back to the preview: the copy is listed as a campaign entry; delete it from the context menu.
    await done()
    await js(() => { const i = document.querySelector('.record-compendium input.sb-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Collapsing'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => [...document.querySelectorAll('.record-row')].some(r => r.textContent.includes('Collapsing Vault')), 'the campaign row')
    // Custom content sorts in with published entries (by level, then name: the level-2 copy between the two published Collapsing Ceilings).
    if (JSON.stringify((await rowNames()).slice(0, 2)) !== JSON.stringify(['Collapsing Ceiling', 'Collapsing Vault'])) throw new Error('Custom rows do not sort with published ones: ' + JSON.stringify(await rowNames()))
    await js(() => { const r = [...document.querySelectorAll('.record-row')].find(r => r.textContent.includes('Collapsing Vault')); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })) })
    await until(() => !!document.querySelector('.record-menu'), 'the context menu')
    const items = await js(() => [...document.querySelectorAll('.record-menu button')].map(b => b.textContent.trim()))
    if (JSON.stringify(items) !== JSON.stringify(['Shared with every campaign', 'Duplicate', 'Delete'])) throw new Error('Entry menu: ' + JSON.stringify(items))
    await js(() => [...document.querySelectorAll('.record-menu button')].find(b => b.textContent === 'Delete').click())
    await sleep(400)
    if ((await records('trap')).length) throw new Error('Delete did not remove the record')

    // New trap: blank until the first edit, then saved.
    await newEntry()
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the new trap editor')
    if ((await records('trap')).length) throw new Error('New trap saved before any edit')
    await typeInto('.compendium-preview input.sb-name', 'Spiked Pit')
    // Autosave is debounced (500 ms); poll rather than race it.
    for (let i = 0; i < 30 && (saved = await records('trap')).length !== 1; i++) await sleep(100)
    if (saved.length !== 1 || saved[0].content.name !== 'Spiked Pit' || saved[0].basedOn) throw new Error('New trap was not saved by its first edit')

    // Shared with every campaign: the entry moves into the Library under the same id, and this campaign's uses
    // of it follow; turned off, it moves back. The editor stays open on it throughout.
    const pit = saved[0]
    await js(id => window.api.entity.save('encounter', { id: 'pit-room', name: 'Pit room', creatures: [], traps: [{ trapId: id, count: 1 }] }), pit.id)
    await menuItem('Shared with every campaign')
    // The move writes the new home first and removes the old one last: wait for the end of it.
    for (let i = 0; i < 50 && (!(await library('trap')).some(r => r.id === pit.id) || (await records('trap')).length); i++) await sleep(100)
    if (!(await library('trap')).some(r => r.id === pit.id && r.content.name === 'Spiked Pit') || (await records('trap')).length) throw new Error('Sharing did not move the entry into the Library')
    if ((await js(() => window.api.entity.get('encounter', 'pit-room'))).traps[0].libraryId !== pit.id) throw new Error('The encounter does not follow the shared trap')
    await until(() => document.querySelector('.compendium-preview .sb-header-home')?.textContent === 'Shared' && document.querySelector('.compendium-preview input.sb-name')?.value === 'Spiked Pit', 'the shared entry, still in the editor')
    await typeInto('.compendium-preview input.sb-name', 'Shared Pit')
    for (let i = 0; i < 30 && (await library('trap')).find(r => r.id === pit.id)?.content.name !== 'Shared Pit'; i++) await sleep(100)
    if ((await library('trap')).find(r => r.id === pit.id)?.content.name !== 'Shared Pit') throw new Error('Editing after sharing did not reach the Library entry')
    if ((await js(() => window.api.authoring.call('list_drafts'))).filter(d => d.name === 'Shared Pit').length !== 1) throw new Error('Sharing left the entry with more than one working copy')
    await menuItem('Shared with every campaign')
    for (let i = 0; i < 50 && (await library('trap')).some(r => r.id === pit.id); i++) await sleep(100)
    if ((await library('trap')).some(r => r.id === pit.id) || (await js(() => window.api.entity.get('encounter', 'pit-room'))).traps[0].trapId !== pit.id) throw new Error('Unsharing did not move the entry and its uses back')
    await until(() => document.querySelector('.compendium-preview .sb-header-home')?.textContent === 'Campaign', 'the entry back in the campaign')

    // The Library's entries show in the campaign too. Duplicate copies one beside it, at once, based on it;
    // deleting a Library entry asks first.
    await done()
    await search('Shared Snare')
    await filterSource('custom', 'library')
    await until(() => [...document.querySelectorAll('.record-row .record-name')].some(n => n.textContent === 'Shared Snare'), 'the Library row in the campaign')
    await js(() => [...document.querySelectorAll('.record-row')].find(r => r.querySelector('.record-name').textContent === 'Shared Snare').click())
    await until(() => document.querySelector('.compendium-preview .sb-header-home')?.textContent === 'Shared', 'the Library entry preview')
    await menuItem('Duplicate')
    let copy
    for (let i = 0; i < 30 && !(copy = (await library('trap')).find(r => r.content.name === 'Shared Snare (copy)')); i++) await sleep(100)
    if (!copy || copy.basedOn !== `library/trap/${shared.id}`) throw new Error('Duplicate did not add a copy based on it: ' + JSON.stringify(copy?.basedOn))
    if ((await library('trap')).find(r => r.id === shared.id)?.content.name !== 'Shared Snare') throw new Error('Duplicate changed the original')
    await until(() => document.querySelector('.compendium-preview .kit-statblock .sb-name')?.textContent === 'Shared Snare (copy)' && !document.querySelector('.record-entry-editor'), 'the copy, shown selected')
    await search('Snare')
    await until(() => document.querySelectorAll('.record-row').length === 2, 'the Library entry and its copy (Library filter)')
    await filterSource('custom')
    await until(() => JSON.stringify([...document.querySelectorAll('.record-row .record-name')].map(n => n.textContent)) === JSON.stringify(['Shared Snare', 'Shared Snare (copy)']), 'custom snares only (no published Field of Snares)')
    await filterSource('custom', 'library')
    await sleep(500); await screenshot('out/compendium-library.png')
    await menuItem('Delete')
    for (let i = 0; i < 30 && (await library('trap')).some(r => r.id === copy.id); i++) await sleep(100)
    if ((await library('trap')).some(r => r.id === copy.id)) throw new Error('Deleting a Library entry did not remove it')
    if (!(await js(() => window.__confirms.some(m => m.includes('Delete the shared'))))) throw new Error('Deleting a Library entry did not warn about campaigns using it')
    await js(() => { window.__confirms = [] })

    // ── Diseases: new disease, add a stage, set the DCs ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Diseases')).click())
    await until(() => document.querySelectorAll('.record-row').length > 10, 'the disease list')
    await newEntry()
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
    let searing
    for (let i = 0; i < 30 && !(searing = (await records('item')).find(r => r.content.name === 'Searing Weapon' && r.content.itemType === 'Any heavy blade')); i++) await sleep(100)
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
    await newEntry()
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
    // The title bar: a published entry has no home chip or menu; every control is a same-size icon.
    const controls = await js(() => [...document.querySelectorAll('.compendium-preview .sb-header-actions > *')].map(e => [e.tagName, e.getAttribute('aria-label'), Math.round(e.getBoundingClientRect().height)]))
    if (JSON.stringify(controls.map(c => c[1])) !== JSON.stringify(['Pop out', 'Edit'])) throw new Error('Published creature controls: ' + JSON.stringify(controls))
    if (new Set(controls.map(c => c[2])).size !== 1) throw new Error('Title bar controls differ in height: ' + JSON.stringify(controls))
    // Edit in the title bar: a copy that the first change adds, with the published art.
    await headerButton('Edit')
    await until(() => !!document.querySelector('.compendium-preview input.sb-name'), 'the creature editor')
    if (!(await js(() => [...document.querySelectorAll('.compendium-preview input')].some(i => i.value === 'Bite')))) throw new Error('The creature editor lacks the powers')
    await typeInto('.compendium-preview input.sb-name', 'Sewer Rat')
    let sewer
    for (let i = 0; i < 30 && !(sewer = (await records('creature')).find(r => r.content.name === 'Sewer Rat')); i++) await sleep(100)
    if ((await records('creature')).length !== 1) throw new Error('Editing the copy did not update it in place')
    const direRat = await js(() => window.api.compendium.kitGet('monster', 'monster145'))
    if (!sewer || sewer.basedOn !== 'published/creature/monster145' || sewer.art?.imageId !== 'rat-art') throw new Error('Creature copy wrong: ' + JSON.stringify(sewer && [sewer.basedOn, sewer.art]))
    if (JSON.stringify(sewer.content.powers) !== JSON.stringify(direRat.powers) || sewer.content.hp !== direRat.hp) throw new Error('Creature copy was not lossless')
    await screenshot('out/compendium-creature-edit.png')
    const heights = await js(() => [...document.querySelectorAll('.compendium-preview .sb-header-actions > *')].map(e => Math.round(e.getBoundingClientRect().height)))
    if (heights.length !== 4 || new Set(heights).size !== 1) throw new Error('Title bar controls (chip, pop out, edit, menu) differ in height: ' + JSON.stringify(heights))

    // Pop out while editing: the editor moves into an OS window of its own, with the same controls, and stays editable.
    const before = new Set(BrowserWindow.getAllWindows())
    await headerButton('Pop out')
    let popWin
    for (let i = 0; i < 50 && !popWin; i++) { await sleep(100); popWin = BrowserWindow.getAllWindows().find(w => !before.has(w)) }
    if (!popWin) throw new Error('Pop out opened no window')
    await until(() => !document.querySelector('.compendium-preview .sb-header'), 'the preview emptied by the pop-out')
    const pop = fn => popWin.webContents.executeJavaScript(`(${fn})()`)
    for (let i = 0; i < 50 && !(await pop(() => document.querySelector('.record-entry-editor input.sb-name')?.value === 'Sewer Rat')); i++) await sleep(100)
    const popControls = await pop(() => [...document.querySelectorAll('.sb-header-actions > *')].map(e => e.getAttribute('aria-label') ?? e.textContent))
    if (JSON.stringify(popControls) !== JSON.stringify(['Campaign', 'Done', 'More actions'])) throw new Error('Pop-out controls: ' + JSON.stringify(popControls))
    await pop(() => { const el = document.querySelector('input.sb-name'); el.focus(); el.select() })
    await popWin.webContents.insertText('Sewer Brute')
    for (let i = 0; i < 30 && (await records('creature')).find(r => r.id === sewer.id)?.content.name !== 'Sewer Brute'; i++) await sleep(100)
    if ((await records('creature')).find(r => r.id === sewer.id)?.content.name !== 'Sewer Brute') throw new Error('Editing in the pop-out did not reach the entry')
    // e in the pop-out is its own: done editing there, the page untouched.
    await pop(() => { document.activeElement?.blur(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })) })
    for (let i = 0; i < 30 && (await pop(() => !!document.querySelector('.record-entry-editor'))); i++) await sleep(100)
    if (await pop(() => !!document.querySelector('.record-entry-editor')) || !(await pop(() => document.body.innerText.includes('Sewer Brute')))) throw new Error('e in the pop-out did not end editing there')
    if (await js(() => !!document.querySelector('.compendium-preview .sb-header'))) throw new Error('e in the pop-out acted on the page')
    popWin.close()
    for (let i = 0; i < 30 && !popWin.isDestroyed(); i++) await sleep(100)

    // A new creature is saved by its first edit.
    await newEntry()
    await until(() => document.querySelector('.compendium-preview input.sb-name')?.value === 'New Creature', 'the new creature editor')
    await typeInto('.compendium-preview input.sb-name', 'Bog Thing')
    let bog
    for (let i = 0; i < 30 && !(bog = (await records('creature')).find(r => r.content.name === 'Bog Thing')); i++) await sleep(100)
    if (!bog || bog.content.level !== 1) throw new Error('New creature was not saved')
    // The AI agent connection is off by default: no comment markers. Turn it on for the agent steps.
    if (await js(() => !!document.querySelector('.compendium-preview .annotation-marker'))) throw new Error('Comment markers show with the agent connection off')
    if ((await js(() => window.api.settings.get())).agentConnection) throw new Error('The agent connection is on by default')
    await js(() => window.api.settings.setAgentConnection(true))
    await until(() => !!document.querySelector('.compendium-preview .annotation-marker'), 'comment markers once the agent connection is on')
    // The creature's working copy is the one draft an AI agent edits too: what the DM has open is current_entry,
    // and an agent edit appears in the open editor and in the entry, with no mode to switch.
    const agentEdit = name => js(async name => { const { open } = await window.api.authoring.call('current_entry'); const d = await window.api.authoring.call('get_draft', { id: open.draftId }); await window.api.authoring.call('patch_draft', { id: d.id, revision: d.revision, changes: [{ path: '/content/name', value: name }] }) }, name)
    const opened = await js(() => window.api.authoring.call('current_entry'))
    if (opened.open?.entityId !== bog.id || !opened.open.editing || !opened.open.draftId) throw new Error('current_entry is not the open creature: ' + JSON.stringify(opened))
    if ((await js(() => window.api.authoring.call('list_drafts'))).filter(d => d.name === 'Bog Thing').length !== 1) throw new Error('The creature has more than one working copy')
    await agentEdit('Bog Beast')
    await until(() => document.querySelector('.record-entry-editor input.sb-name')?.value === 'Bog Beast', 'the agent edit in the open editor')
    for (let i = 0; i < 30 && (await records('creature')).find(r => r.id === bog.id)?.content.name !== 'Bog Beast'; i++) await sleep(100)
    if ((await records('creature')).find(r => r.id === bog.id)?.content.name !== 'Bog Beast') throw new Error('The agent edit did not reach the entry')
    // Back in the read-only preview, the agent's next edit shows there too, with comment markers on the stat block.
    await done()
    await until(() => !document.querySelector('.record-entry-editor') && !!document.querySelector('.compendium-preview .annotation-marker'), 'the preview with comment markers')
    await agentEdit('Bog Horror')
    await until(() => document.querySelector('.compendium-preview')?.innerText.includes('Bog Horror'), 'the agent edit in the preview')
    const confirms = await js(() => window.__confirms)
    if (confirms.length) throw new Error('Unexpected confirmation prompts: ' + JSON.stringify(confirms))
    console.log('COMPENDIUM_SMOKE_OK: the entry controls in the stat block title bar (same-height icons), an editor popped out into an OS window (same controls, edits reach the entry, its own e key), the Library (new entry with no campaign open, listed in a campaign, Duplicate with its source, delete with a warning), sharing an entry with every campaign and back (references and working copy follow), the open creature as current_entry with agent edits reaching the open editor, the entry, and the preview (with comment markers), published trap preview, clone on first edit (lossless, focus kept), in-place edits with autosave, Custom listing, delete, new trap and disease saved by their first edit, item clone with typed edits, template clone and new theme, creatures (published preview, art carried into a lossless copy, new creature); screenshots out/compendium-trap-edit.png, out/compendium-disease-edit.png')
    clearTimeout(timeout); finish(0)
  } catch (e) { console.error(e); clearTimeout(timeout); finish(1) }
})
