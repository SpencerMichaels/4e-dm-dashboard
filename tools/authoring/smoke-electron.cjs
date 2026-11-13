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
    // From any Workshop view: back to the list, pick the kind tab, open the draft by name from the table.
    openDraft: async (kind, name) => {
      document.querySelector('.authoring-back')?.click(); await new Promise(r => setTimeout(r, 150));
      [...document.querySelectorAll('.authoring-kind-tabs button')].find(b => b.textContent.toLowerCase().includes(kind === 'monster' ? 'creature' : kind)).click(); await new Promise(r => setTimeout(r, 150));
      [...document.querySelectorAll('.authoring-table button')].find(b => b.textContent === name).click()
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
      const campaign = await window.api.campaign.create('Authoring smoke campaign');
      const content = await window.api.authoring.call('scaffold', {kind:'monster', name:'Thorn witch',level:8,role:'controller'});
      content.powers.push({name:'Briar lash',action:'standard',usage:'at-will',keywords:['poison'],attacks:[{label:'primary',range:{kind:'melee',reach:2},target:'one creature',bonus:{kind:'fixed',value:12},vs:'reflex',hit:{text:'1d8 + 5 poison damage, and the target is slowed until the end of its next turn.',clauses:[{kind:'unparsed',quote:'the target is slowed until the end of its next turn'}]}},{label:'secondary',after:'hit',range:{kind:'melee',reach:2},target:'the same creature',bonus:{kind:'fixed',value:10},vs:'fortitude',hit:{text:'The target is restrained (save ends).',clauses:[]}}]});
      const draft = await window.api.authoring.call('create_draft',{kind:'monster',content,intent:'Accurate attacks, low damage, fast but brittle.',destinations:[{type:'campaign',id:campaign.id}]});
      [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Workshop')).click();
      return {id:draft.id,campaignId:campaign.id};
    })()`)
    const id = JSON.stringify(result.id)
    // Kit-native campaign records (traps, diseases, templates, themes) save and list through the entity IPC.
    const records = await js(`(async () => { const trap = await window.api.authoring.call('scaffold', { kind: 'trap', name: 'Smoke needle', level: 2 });
      await window.api.entity.save('trap', { id: 'smoke-needle', createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z', content: trap });
      return (await window.api.entity.list('trap')).map(r => r.content.name + ':' + r.content.id) })()`)
    if (JSON.stringify(records) !== '["Smoke needle:smoke-needle"]') throw new Error('Trap record did not round-trip: ' + JSON.stringify(records))
    await sleep(500)
    // First visit explains the Workshop once; dismissing it is stored in app settings.
    if (!(await js(`!!document.querySelector('.authoring-intro')`))) throw new Error('Workshop intro is missing on first visit')
    await js(`document.querySelector('.authoring-intro > button').click()`)
    await sleep(200)
    if (!(await js(`window.api.settings.get()`)).dismissedTips.includes('workshop-intro') || await js(`!!document.querySelector('.authoring-intro')`)) throw new Error('Dismissing the intro was not saved')
    await js(`__smoke.openDraft('monster', 'Thorn witch')`)
    await sleep(500)
    const preview = await js(`document.body.innerText`)
    if (!preview.includes('Briar lash') || !preview.includes('Save to Authoring smoke campaign')) throw new Error('Draft preview did not render')

    // The edit tab renders the compendium's own editor, not a lookalike.
    await js(`__smoke.button('Edit').click()`)
    await sleep(300)
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

    // The same field changed by both asks the DM to choose; nothing is applied until then.
    await replaceText(`__smoke.statInput('HP')`, '46')
    await js(`(async()=>{const d=await __smoke.draft(${id});await window.api.authoring.call('patch_draft',{id:d.id,revision:d.revision,changes:[{path:'/content/hp',value:50}]})})()`)
    await sleep(900)
    const collision = await js(`({ alert: document.querySelector('.authoring-collision')?.textContent ?? '', value: __smoke.statInput('HP').value, hp: 0 })`)
    if (!collision.alert.includes('HP') || collision.value !== '46') throw new Error('Same-field change did not ask: ' + JSON.stringify(collision))
    if ((await js(`__smoke.draft(${id})`)).content.hp !== 50) throw new Error('A collided edit was applied before the DM chose')
    await js(`__smoke.button('Keep mine').click()`)
    await sleep(500)
    const rebased = await js(`__smoke.draft(${id})`)
    if (rebased.content.hp !== 46 || await js(`!!document.querySelector('.authoring-collision')`)) throw new Error('Keeping the DM value failed: ' + rebased.content.hp)

    // History lists dated versions with who changed which field, not revision or event numbers.
    await js(`__smoke.button('History').click()`)
    await sleep(400)
    const versions = await js(`[...document.querySelectorAll('.authoring-versions > li')].map(li => li.textContent)`)
    // (Agent calls in this test go through the DM's IPC, so they read "You".)
    if (!versions[0]?.includes('You changed HP') || !versions.some(v => v.includes('changed Decisions')) || !versions.at(-1).includes('created the draft') || versions.some(v => /revision|event/i.test(v))) throw new Error('Version history: ' + JSON.stringify(versions))
    await js(`__smoke.button('Edit').click()`)
    await sleep(300)

    // The numeric recipe is a form, and its preview lists field changes rather than JSON.
    await js(`[...document.querySelectorAll('.authoring details > summary')].find(s => s.textContent.startsWith('Numeric recipe')).parentElement.open = true`)
    await replaceText(`[...document.querySelectorAll('.recipe-field')].find(l => l.textContent.startsWith('HP')).querySelector('input')`, '0.5')
    key('Enter')
    await sleep(500)
    if ((await js(`__smoke.draft(${id})`)).recipe?.hpMultiplier !== 0.5) throw new Error('Recipe form did not save the HP multiplier: ' + JSON.stringify(await js(`({ value: [...document.querySelectorAll('.recipe-field')].map(l => l.textContent + '=' + l.querySelector('input').value), alerts: [...document.querySelectorAll('[role=alert]')].map(a => a.textContent), recipe: null })`)))
    await js(`__smoke.button('Preview calculated changes').click()`)
    await sleep(400)
    const proposal = await js(`document.querySelector('.recipe-proposal')?.textContent ?? ''`)
    if (!/Kept as you edited them: HP/.test(proposal) || proposal.includes('"path"')) throw new Error('Recipe preview: ' + proposal.slice(0, 300))
    await js(`[...document.querySelectorAll('.authoring details > summary')].find(s => s.textContent.startsWith('Numeric recipe')).parentElement.open = false`)

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
    await js(`__smoke.button('Stat block').click()`)
    await sleep(300)
    await js("document.querySelector('.authoring').parentElement.scrollTop=0")
    await sleep(100)
    await screenshot('out/authoring-smoke.png')
    const receipt = await js(`(async()=>{let d=await __smoke.draft(${id});d=await window.api.authoring.call('review',{id:d.id,revision:d.revision,assumptions:'Smoke-test review only.',findings:[]});return window.api.authoring.call('approve',{id:d.id,revision:d.revision,event:d.event,acceptedAdvisories:true})})()`)
    if (!receipt.receipt?.targets.length) throw new Error('Approval failed')

    // New draft: a blank monster opens in the native editor and is saved by its first edit, without losing focus.
    await js(`document.querySelector('.authoring-back').click()`)
    await sleep(200)
    await js(`__smoke.button('+ New creature').click()`)
    await sleep(300)
    const before = (await js(`window.api.authoring.call('list_drafts')`)).length
    if (!(await js(`!!document.querySelector('.native-draft-editor .sb-name')`))) throw new Error('New monster did not open in the editor')
    await js(`window.__nameEl = document.querySelector('.native-draft-editor .sb-name'); true`)
    await replaceText(`document.querySelector('.native-draft-editor .sb-name')`, 'Briar hag')
    await sleep(900)
    const listed = await js(`window.api.authoring.call('list_drafts')`)
    const fresh = listed.find(d => d.name === 'Briar hag')
    if (listed.length !== before + 1 || !fresh) throw new Error('First edit did not create the draft: ' + JSON.stringify(listed.map(d => d.name)))
    if (!(await js(`document.activeElement === document.querySelector('.native-draft-editor .sb-name')`))) throw new Error('Creating the draft moved focus out of the editor: ' + JSON.stringify(await js(`({ same: window.__nameEl === document.querySelector('.native-draft-editor .sb-name'), connected: window.__nameEl.isConnected, active: document.activeElement?.tagName + '.' + document.activeElement?.className, value: document.querySelector('.native-draft-editor .sb-name')?.value })`)))
    await wc.insertText(' elder')
    await sleep(900)
    const elder = (await js(`window.api.authoring.call('list_drafts')`)).filter(d => d.name.startsWith('Briar hag'))
    if (elder.length !== 1 || elder[0].name !== 'Briar hag elder') throw new Error('Typing after creation did not reach the new draft: ' + JSON.stringify(elder.map(d => d.name)))
    // Every other kind previews and edits with its statblock, like creatures.
    for (const kind of ['item', 'trap', 'disease', 'template', 'theme']) {
      const name = 'UI ' + kind + ' test'
      await js(`window.api.authoring.call('create_draft',{kind:${JSON.stringify(kind)},name:${JSON.stringify(name)},level:7})`)
      await sleep(250)
      await js(`__smoke.openDraft(${JSON.stringify(kind)}, ${JSON.stringify(name)})`)
      await sleep(250)
      const rendered = await js(`document.querySelector('.authoring .stat-block-4e')?.textContent ?? ''`)
      if (!rendered.includes(name)) throw new Error(kind + ' statblock preview did not render')
      const slots = () => js(`document.querySelectorAll('.authoring .stat-block-4e .sb-annotation-slot button.annotation-marker').length`)
      if (await slots() < 1) throw new Error(kind + ' statblock preview has no comment markers')
      await js(`__smoke.button('Edit').click()`)
      await sleep(150)
      const editor = await js(`document.querySelector('.native-draft-editor input.sb-name')?.value`)
      if (editor !== name) throw new Error(kind + ' statblock editor did not render: ' + editor)
      if (await slots() < 1) throw new Error(kind + ' statblock editor has no comment markers')
    }

    // A trap draft end to end: statblock edit, apply, approve into the campaign as a kit record.
    const trapDraft = await js(`window.api.authoring.call('create_draft',{kind:'trap',name:'Smoke snare',level:4,destinations:[{type:'campaign',id:${JSON.stringify(result.campaignId)}}]})`)
    await js(`__smoke.openDraft('trap', 'Smoke snare')`)
    await sleep(250)
    await js(`__smoke.button('Edit').click()`)
    await sleep(150)
    await replaceText(`document.querySelector('.native-draft-editor textarea[aria-label="When the trap acts"]')`, 'A creature steps on the tripwire.')
    await sleep(900)
    let snare = await js(`__smoke.draft(${JSON.stringify(trapDraft.id)})`)
    if (snare.content.trigger?.text !== 'A creature steps on the tripwire.' || !snare.overrides.includes('/content/trigger')) throw new Error('Trap statblock edit was not applied: ' + JSON.stringify(snare.content.trigger))
    snare = await js(`(async()=>{let d=await __smoke.draft(${JSON.stringify(trapDraft.id)});d=await window.api.authoring.call('review',{id:d.id,revision:d.revision,assumptions:'Smoke-test review only.',findings:[]});return window.api.authoring.call('approve',{id:d.id,revision:d.revision,event:d.event,acceptedAdvisories:true})})()`)
    const trapRecords = await js(`window.api.entity.list('trap')`)
    const savedSnare = trapRecords.find(r => r.content.name === 'Smoke snare')
    if (!savedSnare || savedSnare.content.trigger.text !== 'A creature steps on the tripwire.' || savedSnare.id !== snare.receipt.targets[0].entityId) throw new Error('Approved trap was not saved as a campaign record')
    const confirms = await js(`window.__confirms`)
    if (confirms.length) throw new Error('Unexpected confirmation prompts: ' + JSON.stringify(confirms))
    console.log('UI_SMOKE_OK: trap campaign record, native compendium creature editor (HP, damage, hit prose applied without an Apply step, agent merge and same-field collision, version history, recipe form and readable preview, anchored power comment), approval and campaign save, intro dismissal, new draft created by its first edit and kept live, statblock previews and editors with comment markers for every kind, trap draft approved into a campaign record; screenshots out/authoring-edit-smoke.png, out/authoring-smoke.png')
    await sleep(100)
    clearTimeout(timeout); app.exit(0)
  } catch (e) { console.error(e); clearTimeout(timeout); app.exit(1) }
})
