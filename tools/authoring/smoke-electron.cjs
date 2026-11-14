// Never show test windows on the desktop (see src/main/windows.ts).
process.env.FOUR_E_HIDDEN_WINDOWS = '1'
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')
const root = mkdtempSync(join(tmpdir(), '4e-authoring-ui-'))
app.setPath('appData', root)
mkdirSync(join(root, 'user'))
app.setPath('userData', join(root, 'user'))
// The compendium and glossary load content/parsed relative to the app path (this script's folder).
const contentLink = join(__dirname, 'content')
if (!existsSync(contentLink)) symlinkSync(resolve(__dirname, '../../content'), contentLink)
process.on('exit', () => { try { rmSync(contentLink) } catch {} })
require('../../out/main/index.js')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const timeout = setTimeout(() => { console.error('UI smoke timed out'); app.exit(1) }, 60000)

// DOM helpers injected into the renderer. They locate controls of the shared compendium editor
// (Dnd4eCreatureDetails / PowerEntryEditor) by their printed labels, inside the workshop wrapper.
const helpers = `
  // Native confirm dialogs would appear on the DM's desktop and block the test; record them instead.
  window.__confirms = []
  window.confirm = message => {
    const where = document.querySelector('.authoring-draft-head h2')?.textContent ?? 'home'
    const bar = document.querySelector('.authoring-edit-bar')?.textContent ?? ''
    window.__confirms.push(message + ' @ ' + where + ' / ' + bar)
    return true
  }
  window.__smoke = {
    editor: () => document.querySelector('.native-draft-editor'),
    statInput: label => [...document.querySelectorAll('.native-draft-editor .sb-label')].find(b => b.textContent === label).parentElement.querySelector('input'),
    powerRow: name => [...document.querySelectorAll('.native-draft-editor input')].find(i => i.value === name)?.closest('div[style*="flex: 1"]'),
    powerField: (name, label) => [...(window.__smoke.powerRow(name)?.querySelectorAll('b') ?? [])].find(b => b.textContent === label)?.parentElement.querySelector('input, textarea'),
    button: text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text),
    draft: id => window.api.authoring.call('get_draft', { id }),
    // AI sessions show on their kind's compendium page as entries marked AI: go there from the sidebar, then click the row.
    nav: label => [...document.querySelectorAll('button')].find(b => b.textContent.replace(/^[^A-Za-z]+/, '').startsWith(label)).click(),
    row: name => [...document.querySelectorAll('.record-row')].find(r => r.querySelector('.record-name').firstChild.textContent === name),
    // An entry's page from the sidebar, its row, then Edit (its working copy, the one the agent edits too).
    openDraft: async (kind, name) => {
      window.__smoke.nav({ monster: 'Creatures', item: 'Items', trap: 'Traps', disease: 'Diseases', template: 'Templates', theme: 'Themes' }[kind])
      const wait = async test => { for (let i = 0; i < 50 && !test(); i++) await new Promise(r => setTimeout(r, 100)) }
      await wait(() => window.__smoke.row(name))
      window.__smoke.row(name).click()
      await wait(() => window.__smoke.button('Edit'))
      window.__smoke.button('Edit').click()
      await wait(() => document.querySelector('.record-entry-editor .native-draft-editor'))
    },
  }
  true
`

app.whenReady().then(async () => {
  try {
    let win
    for (let i = 0; i < 100; i++) { win = BrowserWindow.getAllWindows()[0]; if (win && !win.webContents.isLoading()) break; await sleep(100) }
    const wc = win.webContents
    wc.on('console-message', (_e, level, message) => { if (level >= 2) console.error('renderer:', message) })
    await sleep(1000)
    const js = code => wc.executeJavaScript(code)
    const key = (keyCode, modifiers = []) => { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }) }
    // Select through the DOM: a synthetic Ctrl+A can arrive after insertText and insert instead of replacing.
    const replaceText = async (selector, text) => { await js(`(() => { const el = ${selector}; el.focus(); el.select() })()`); await wc.insertText(text); await sleep(100) }
    // Test windows render offscreen and deliver frames through 'paint'; force one and keep the latest.
    let frame = null
    wc.on('paint', (_e, _dirty, image) => { frame = image })
    const screenshot = async path => {
      frame = null; wc.invalidate()
      for (let i = 0; i < 50 && !frame; i++) await sleep(100)
      if (frame && !frame.isEmpty()) writeFileSync(join(process.cwd(), path), frame.toPNG())
      else console.warn('screenshot skipped (no frame):', path)
    }
    await js(helpers)
    const result = await js(`(async () => {
      // The AI agent connection is off by default; this test works with an agent.
      await window.api.settings.setAgentConnection(true);
      const campaign = await window.api.campaign.create('Authoring smoke campaign');
      const content = await window.api.authoring.call('scaffold', {kind:'monster', name:'Thorn witch',level:8,role:'controller'});
      content.powers.push({name:'Briar lash',action:'standard',usage:'at-will',keywords:['poison'],attacks:[{label:'primary',range:{kind:'melee',reach:2},target:'one creature',bonus:{kind:'fixed',value:12},vs:'reflex',hit:{text:'1d8 + 5 poison damage, and the target is slowed until the end of its next turn.',clauses:[{kind:'unparsed',quote:'the target is slowed until the end of its next turn'}]}},{label:'secondary',after:'hit',range:{kind:'melee',reach:2},target:'the same creature',bonus:{kind:'fixed',value:10},vs:'fortitude',hit:{text:'The target is restrained (save ends).',clauses:[]}}]});
      const draft = await window.api.authoring.call('create_draft',{kind:'monster',content,intent:'Accurate attacks, low damage, fast but brittle.',destinations:[{type:'campaign',id:campaign.id}]});
      return {id:draft.id,campaignId:campaign.id};
    })()`)
    const id = JSON.stringify(result.id)
    // Kit-native campaign records (traps, diseases, templates, themes) save and list through the entity IPC.
    const records = await js(`(async () => { const trap = await window.api.authoring.call('scaffold', { kind: 'trap', name: 'Smoke needle', level: 2 });
      await window.api.entity.save('trap', { id: 'smoke-needle', createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z', content: trap });
      return (await window.api.entity.list('trap')).map(r => r.content.name + ':' + r.content.id) })()`)
    if (JSON.stringify(records) !== '["Smoke needle:smoke-needle"]') throw new Error('Trap record did not round-trip: ' + JSON.stringify(records))
    await sleep(500)
    await js(`__smoke.openDraft('monster', 'Thorn witch')`)
    await sleep(300)
    // The agent's creature went straight into the campaign; Edit opened the agent's working copy of it.
    const witch = (await js(`window.api.entity.list('creature')`)).find(r => r.content.name === 'Thorn witch')
    const live = await js(`__smoke.draft(${id})`)
    if (!witch || live.destinations[0]?.entityId !== witch.id) throw new Error('The agent creature is not a campaign entry bound to its session: ' + JSON.stringify([witch?.id, live.destinations]))
    if ((await js(`window.api.authoring.call('list_drafts')`)).filter(d => d.name === 'Thorn witch').length !== 1) throw new Error('Edit made a second working copy instead of using the agent working copy')
    await sleep(500)
    const opened = await js(`({ panel: true, accept: true, power: [...document.querySelectorAll('.record-entry-editor input')].some(i => i.value === 'Briar lash') })`)
    if (!opened.panel || !opened.accept || !opened.power) throw new Error('AI editor did not open: ' + JSON.stringify(opened))

    // The AI editor is the compendium's own editor, not a lookalike.
    const native = await js(`({ statblock: !!document.querySelector('.native-draft-editor .stat-block-4e .sb-header input.sb-name'), name: document.querySelector('.native-draft-editor .sb-name')?.value, damage: __smoke.powerField('Briar lash', 'Damage')?.value, hit: __smoke.powerField('Briar lash', 'Hit')?.value, tabs: [...document.querySelectorAll('[role=tab]')].map(t => t.textContent + ':' + t.getAttribute('aria-selected')), text: document.querySelector('.authoring-workspace')?.innerText.slice(0, 600) })`)
    if (!native.statblock || native.name !== 'Thorn witch') throw new Error('Native compendium editor did not render: ' + JSON.stringify(native))
    if (native.damage !== '1d8 + 5' || native.hit !== 'and the target is slowed until the end of its next turn.') throw new Error('Damage was not split into the native damage editor: ' + JSON.stringify(native))

    // HP: one field, one DM-authored override.
    const original = await js(`__smoke.draft(${id})`)
    await replaceText(`__smoke.statInput('HP')`, '44')
    // No Apply step: the edit goes into the draft after a short pause.
    await sleep(900)
    const hp = await js(`__smoke.draft(${id})`)
    if (hp.content.hp !== 44 || JSON.stringify(hp.overrides) !== '["/content/hp"]' || hp.stale.length) throw new Error('HP edit failed: ' + JSON.stringify({ hp: hp.content.hp, overrides: hp.overrides }))

    // Damage and hit prose: recombined into the kit Line, stable node, secondary attack and clauses kept, metadata flagged.
    await replaceText(`__smoke.powerField('Briar lash', 'Damage')`, '2d6 + 3')
    await sleep(900)
    const dmg = await js(`__smoke.draft(${id})`)
    const lash = dmg.content.powers[0]
    if (lash.attacks[0].hit.text !== '2d6 + 3 poison damage, and the target is slowed until the end of its next turn.') throw new Error('Damage edit produced: ' + lash.attacks[0].hit.text)
    if (dmg.nodes.powers[0] !== original.nodes.powers[0] || lash.attacks.length !== 2 || lash.attacks[0].hit.clauses.length !== 1) throw new Error('Power edit lost identity or kit-only mechanics')
    if (!dmg.stale.includes('/content/powers/@' + original.nodes.powers[0])) throw new Error('Edited power metadata was not flagged for review')
    await replaceText(`__smoke.powerField('Briar lash', 'Hit')`, 'and the target is slowed (save ends).')
    await sleep(900)
    const prose = await js(`__smoke.draft(${id})`)
    if (prose.content.powers[0].attacks[0].hit.text !== '2d6 + 3 poison damage, and the target is slowed (save ends).') throw new Error('Hit prose edit produced: ' + prose.content.powers[0].attacks[0].hit.text)

    // An agent change to another field while the DM edits merges without asking.
    await replaceText(`__smoke.statInput('HP')`, '45')
    await js(`(async()=>{const d=await __smoke.draft(${id});await window.api.authoring.call('patch_draft',{id:d.id,revision:d.revision,changes:[{path:'/decisions',value:'Concurrent update'}]})})()`)
    await sleep(900)
    const merged = await js(`__smoke.draft(${id})`)
    if (merged.content.hp !== 45 || merged.decisions !== 'Concurrent update') throw new Error('Merging with an agent change lost a change: ' + JSON.stringify({ hp: merged.content.hp, decisions: merged.decisions }))

    // The same field changed by both: no prompt; the DM's edit (made in the moment) wins, and the agent's value stays in History.
    await replaceText(`__smoke.statInput('HP')`, '46')
    await js(`(async()=>{const d=await __smoke.draft(${id});await window.api.authoring.call('patch_draft',{id:d.id,revision:d.revision,changes:[{path:'/content/hp',value:50}]})})()`)
    await sleep(900)
    const rebased = await js(`__smoke.draft(${id})`)
    if (rebased.content.hp !== 46 || await js(`!!document.querySelector('[role=alert]')`)) throw new Error('The DM value did not win the same-field change: ' + rebased.content.hp)

    // History is the agent's (versions, restore_draft), not shown in the editor: dated versions with who changed which field.
    if (await js(`!!document.querySelector('.entry-history, .authoring-versions')`)) throw new Error('The editor shows History')
    const versions = await js(`window.api.authoring.call('versions', { id: ${id} })`)
    // (Agent calls in this test go through the DM's IPC, so they read "dm".)
    if (versions[0]?.by !== 'dm' || versions[0].changes[0]?.label !== 'HP' || !versions.some(v => v.changes.some(c => c.label === 'Decisions')) || versions.at(-1).action !== 'created') throw new Error('Version history: ' + JSON.stringify(versions.map(v => [v.by, v.action, v.changes.map(c => c.label)])))


    // The comment marker on a power card opens a thread anchored to that power.
    const marker = `__smoke.powerRow('Briar lash').parentElement.querySelector(':scope > .sb-annotation-slot button.annotation-marker')`
    await js(`${marker}.click()`)
    await sleep(150)
    const thread = await js(`({ label: document.querySelector('.annotation-thread header b')?.textContent, focused: document.activeElement === document.querySelector('.annotation-thread textarea') })`)
    if (thread.label !== 'Briar lash' || !thread.focused) throw new Error('Power comment thread did not open: ' + JSON.stringify(thread))
    await wc.insertText('Is slowed the right control for a controller?')
    key('Enter', ['control'])
    await sleep(400)
    const commented = await js(`__smoke.draft(${id})`)
    const anchoredComment = commented.comments.find(c => c.text.startsWith('Is slowed'))
    if (anchoredComment?.target !== '/content/powers/@' + original.nodes.powers[0]) throw new Error('Comment was not anchored to the power: ' + anchoredComment?.target)
    if (await js(`${marker}.title`) !== '1 open comment') throw new Error('Marker does not show the new comment')
    key('Escape')
    await sleep(100)

    wc.setZoomFactor(0.65)
    await sleep(100)
    await js(`__smoke.editor().scrollIntoView({block:'start'})`)
    await sleep(100)
    await screenshot('out/authoring-edit-smoke.png')
    await js(`(async()=>{const d=await __smoke.draft(${id});await window.api.authoring.call('patch_draft',{id:d.id,revision:d.revision,changes:[{path:'/content/powers/@'+d.nodes.powers[0]+'/attacks/0/hit/clauses',value:[{text:'the target is slowed (save ends)'}]}],reconciled:d.stale})})()`)
    await sleep(300)
    await js("document.querySelector('.compendium-preview').scrollTop=0")
    await sleep(100)
    await screenshot('out/authoring-smoke.png')
    // Edits are live: the entry has every change made in the session.
    const entry = async () => (await js(`window.api.entity.list('creature')`)).find(r => r.id === witch.id)
    if ((await entry()).content.hp !== 46) throw new Error('The entry does not have the session edits: ' + (await entry()).content.hp)
    // History restores an earlier version, and the entry follows.
    const firstVersion = await js(`(async()=>{const v=await window.api.authoring.call('versions',{id:${id}});return v.at(-1).event})()`)
    await js(`(async()=>{const d=await __smoke.draft(${id});await window.api.authoring.call('restore_draft',{id:d.id,revision:d.revision,event:${firstVersion}})})()`)
    for (let i = 0; i < 30 && (await entry()).content.hp === 46; i++) await sleep(100)
    if ((await entry()).content.hp !== original.content.hp) throw new Error('Restoring the first version did not reach the entry: ' + (await entry()).content.hp)
    // Back closes the editor; the entry previews as it now is.
    await js(`[...document.querySelectorAll('.record-editbar button')].find(b => b.textContent.includes('Back')).click()`)
    await sleep(300)
    if (await js(`!!document.querySelector('.record-entry-editor')`)) throw new Error('Back did not close the editor')

    // Every other kind edits with its own statblock in the AI editor, with comment markers.
    const campaignDest = JSON.stringify([{ type: 'campaign', id: result.campaignId }])
    for (const kind of ['item', 'trap', 'disease', 'template', 'theme']) {
      const name = 'UI ' + kind + ' test'
      await js(`window.api.authoring.call('create_draft',{kind:${JSON.stringify(kind)},name:${JSON.stringify(name)},level:7,destinations:${campaignDest}})`)
      await sleep(250)
      await js(`__smoke.openDraft(${JSON.stringify(kind)}, ${JSON.stringify(name)})`)
      await sleep(300)
      const editor = await js(`document.querySelector('.native-draft-editor input.sb-name')?.value`)
      if (editor !== name) throw new Error(kind + ' statblock editor did not render: ' + editor)
      const slots = await js(`document.querySelectorAll('.record-entry-editor .stat-block-4e .sb-annotation-slot button.annotation-marker').length`)
      if (slots < 1) throw new Error(kind + ' statblock editor has no comment markers')
    }

    // A trap end to end: an agent's trap is a campaign record at once, and a statblock edit in the AI editor reaches it.
    const trapDraft = await js(`window.api.authoring.call('create_draft',{kind:'trap',name:'Smoke snare',level:4,destinations:${campaignDest}})`)
    await js(`__smoke.openDraft('trap', 'Smoke snare')`)
    await sleep(300)
    await replaceText(`document.querySelector('.native-draft-editor textarea[aria-label="When the trap acts"]')`, 'A creature steps on the tripwire.')
    await sleep(900)
    let snare = await js(`__smoke.draft(${JSON.stringify(trapDraft.id)})`)
    if (snare.content.trigger?.text !== 'A creature steps on the tripwire.' || !snare.overrides.includes('/content/trigger')) throw new Error('Trap statblock edit was not applied: ' + JSON.stringify(snare.content.trigger))
    const trapRecords = await js(`window.api.entity.list('trap')`)
    const savedSnare = trapRecords.find(r => r.content.name === 'Smoke snare')
    if (!savedSnare || savedSnare.content.trigger.text !== 'A creature steps on the tripwire.' || savedSnare.id !== snare.destinations[0].entityId) throw new Error('The trap edit did not reach its campaign record as a campaign record')
    const confirms = await js(`window.__confirms`)
    if (confirms.length) throw new Error('Unexpected confirmation prompts: ' + JSON.stringify(confirms))
    console.log('UI_SMOKE_OK: trap campaign record, compendium creature editor on the working copy (HP, damage, hit prose applied without an Apply step, agent merge, the DM winning a same-field change without a prompt, version history, anchored power comment), an agent creature becoming a campaign entry at once, Edit opening its working copy, edits live in the entry and History restore reaching it, statblock editors with comment markers for every kind, a trap edit reaching its campaign record; screenshots out/authoring-edit-smoke.png, out/authoring-smoke.png')
    await sleep(100)
    clearTimeout(timeout); app.exit(0)
  } catch (e) { console.error(e); clearTimeout(timeout); app.exit(1) }
})
