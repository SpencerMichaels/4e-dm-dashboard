// Combat on kit content, end to end: an encounter with a templated, level-adjusted campaign creature,
// a published troll, and published minions previews in the encounter editor and starts combat as kit
// combatants; the combat panels render them and recharge powers prompt a roll. Windows are hidden and
// render offscreen. Run with `npm run test:combat:ui` after `npm run build`.
process.env.FOUR_E_HIDDEN_WINDOWS = '1'
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')
const root = mkdtempSync(join(tmpdir(), '4e-combat-ui-'))
app.setPath('appData', root)
mkdirSync(join(root, 'user'))
app.setPath('userData', join(root, 'user'))
// The compendium reads content/ relative to the app path (this script's folder).
const contentLink = join(__dirname, 'content')
if (!existsSync(contentLink)) symlinkSync(resolve(__dirname, '../../content'), contentLink)
require('../../out/main/index.js')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const finish = code => { try { rmSync(contentLink) } catch {} app.exit(code) }
const timeout = setTimeout(() => { console.error('Combat smoke timed out'); finish(1) }, 90000)

const now = new Date().toISOString()
const captain = {
  id: 'captain', name: 'Smoke Captain', hp: 64, maxHp: 64, createdAt: now, updatedAt: now,
  statBlock: {
    level: 5, role: 'soldier', size: 'Medium', origin: 'natural', creatureType: 'humanoid', subtypes: ['human'], xp: 200,
    initiative: 6, perception: 4, senses: '', speed: 5, speeds: {}, ac: 21, defenses: { fortitude: 18, reflex: 16, will: 17 },
    savingThrowBonus: 0, actionPoints: 0, immunities: [], resistances: [], weaknesses: [], skills: {},
    abilities: { str: 18, con: 14, dex: 12, int: 10, wis: 14, cha: 12 }, alignment: 'Unaligned', languages: ['Common'], equipment: [],
    actions: [
      { name: 'Longsword', entryType: 'action', actionType: 'standard', usage: 'at-will', basicAttack: 'melee', keywords: ['weapon'], rangeType: 'melee', rangeValue: '1',
        target: 'one creature', attackBonus: 12, defense: 'AC', damage: [{ expr: '1d8+5', type: '', ongoing: false }], hit: 'The target is marked until the end of the captain\'s next turn.', miss: '', effect: '', trigger: '', requirement: '' },
      { name: 'Sweeping Cut', entryType: 'action', actionType: 'standard', usage: 'recharge', rechargeCondition: '5', keywords: ['weapon'], rangeType: 'close-burst', rangeValue: '1',
        target: 'each enemy in the burst', attackBonus: 10, defense: 'Reflex', damage: [{ expr: '2d6+5', type: '', ongoing: false }], hit: 'The target falls prone.', miss: 'Half damage.', effect: '', trigger: '', requirement: '' },
    ],
  },
}
const encounter = {
  id: 'smoke-fight', name: 'Smoke Fight', tags: [], createdAt: now, updatedAt: now,
  creatures: [
    { creatureId: 'captain', count: 1, monsterTemplates: ['Battle Champion'], levelAdjust: 1 },
    { compendiumId: 'monster723', count: 1 },
    { compendiumId: 'monster4742', count: 2 },
    // Dire Rat: its bite exposes the target to dire rat filth fever.
    { compendiumId: 'monster145', count: 1 },
  ],
  traps: [
    { compendiumId: 'trap40', count: 1 },
    { compendiumId: 'trap41', count: 1, visible: true },
  ],
  // The location adds Ceiling Scythe (trap300); its other traps are already in the encounter.
  locationId: 'vault',
}
// The hero starts with a lasting effect, which joins it in combat.
const hero = { id: 'hero', name: 'Hero', playerName: 'Player', active: true, createdAt: now, updatedAt: now, conditions: [{ kind: 'effect', id: 'curse', name: 'Smoke Curse', description: '-1 to saves', since: now }] }

app.whenReady().then(async () => {
  try {
    let win
    for (let i = 0; i < 100; i++) { win = BrowserWindow.getAllWindows()[0]; if (win && !win.webContents.isLoading()) break; await sleep(100) }
    const wc = win.webContents
    wc.on('console-message', (_e, level, message) => { if (level >= 2) console.error('renderer:', message) })
    await sleep(1000)
    const js = (fn, ...args) => wc.executeJavaScript(`(${fn})(...${JSON.stringify(args)})`)
    let frame = null
    wc.on('paint', (_e, _dirty, image) => { frame = image })
    const screenshot = async path => { frame = null; wc.invalidate(); for (let i = 0; i < 50 && !frame; i++) await sleep(100); if (frame && !frame.isEmpty()) writeFileSync(join(process.cwd(), path), frame.toPNG()) }
    const until = async (fn, what, ...args) => { for (let i = 0; i < 80; i++) { if (await js(fn, ...args)) return; await sleep(100) } await screenshot('out/combat-smoke-failure.png'); throw new Error('Timed out waiting for ' + what + '\n' + (await js(() => document.body.innerText)).replace(/^[\s\S]*?Clear filters/, '').slice(0, 2500)) }

    await js(() => { window.__confirms = []; window.confirm = m => { window.__confirms.push(m); return true } })
    const campaignId = await js(async () => { const c = await window.api.campaign.create('Combat smoke'); await window.api.campaign.open(c.id); return c.id })
    await sleep(800)
    await js((e, h) => Promise.all([window.api.entity.save('encounter', e), window.api.entity.save('player-character', h)]), encounter, hero)
    // The hero's sheet comes from a Character Builder save.
    const sheetFile = { name: 'brannoc.dnd4e', text: readFileSync(resolve(__dirname, '../../src/common/character/fixtures/brannoc.dnd4e'), 'utf8') }
    const imported = await js(f => window.api.pc.import([f], 'hero'), sheetFile)
    if (JSON.stringify(imported) !== JSON.stringify({ created: [], updated: ['Hero'], errors: [] })) throw new Error('Sheet import failed: ' + JSON.stringify(imported))
    // The captain is a creature file from before creatures became kit records: reopening the campaign converts it.
    writeFileSync(join(root, 'user', 'campaigns', campaignId, 'creatures', 'captain.json'), JSON.stringify(captain))
    await js(id => window.api.campaign.open(id), campaignId)
    await sleep(500)
    const migrated = await js(() => window.api.entity.get('creature', 'captain'))
    if (!migrated?.content || migrated.content.name !== 'Smoke Captain' || migrated.statBlock || migrated.content.powers.length !== 2) throw new Error('The legacy captain was not converted: ' + JSON.stringify(migrated).slice(0, 300))
    if (!existsSync(join(root, 'user', 'campaigns', campaignId, 'creatures', '_legacy-captain.json'))) throw new Error('The legacy captain was not kept')

    // A Library creature (shared by every campaign) resolves live in an encounter row, by libraryId.
    const shade = { id: 'shared-shade', createdAt: now, updatedAt: now, content: { ...migrated.content, id: 'shared-shade', name: 'Shared Shade' } }
    await js(r => window.api.entity.save('creature', r, 'library'), shade)
    const libraryRow = await js(() => window.api.combat.previewRow({ libraryId: 'shared-shade', count: 1, levelAdjust: 1 }))
    if (libraryRow?.monster.name !== 'Shared Shade' || libraryRow.monster.level !== migrated.content.level + 1) throw new Error('A Library creature does not resolve in an encounter row: ' + JSON.stringify(libraryRow?.monster.name))
    await js(r => window.api.entity.save('creature', { ...r, content: { ...r.content, name: 'Shared Shade, renamed' } }, 'library'), shade)
    if ((await js(() => window.api.combat.previewRow({ libraryId: 'shared-shade', count: 1 })))?.monster.name !== 'Shared Shade, renamed') throw new Error('A Library edit does not reach the encounter row')
    await js(() => window.api.entity.delete('creature', 'shared-shade', 'library'))

    // ── A location notes its traps as stat blocks; the search adds another ──
    await js(l => window.api.entity.save('location', l), { id: 'vault', name: 'Smoke Vault', description: '', tags: [], createdAt: now, updatedAt: now, traps: [{ compendiumId: 'trap41' }, { compendiumId: 'trap300' }], encounterIds: ['smoke-fight'] })
    // A second PC without a sheet, two levels below the hero: the party level stays the hero's (the higher on a tie) and both pages flag it.
    await js(p => window.api.entity.save('player-character', p), { id: 'squire', name: 'Squire', playerName: 'Guest', level: 2, createdAt: now, updatedAt: now })
    await sleep(300)
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Home')).click())
    await until(() => document.querySelectorAll('.home-party .level-warning svg').length === 1, "the session board with the squire's level warning")
    if (!await js(() => document.querySelector('.home-party .sb-name').textContent === 'Party (Level 4)')) throw new Error('The party heading does not show the party level')
    if (!await js(() => document.querySelector('.home-party .sb-header').textContent.endsWith('2 Players'))) throw new Error('The party heading does not show the player count')
    await screenshot('out/home.png')
    // The session board is one page: its scroll container (the main area) never scrolls.
    if (await js(() => { const main = document.querySelector('.home-party').parentElement.parentElement; return main.scrollHeight > main.clientHeight })) throw new Error('The session board scrolls')
    // Recently changed fills the rest of the page: its panels reach the bottom of the main area.
    if (await js(() => { const main = document.querySelector('.home-party').parentElement.parentElement; const kind = document.querySelector('.home-recent-kind'); return main.getBoundingClientRect().bottom - kind.getBoundingClientRect().bottom > 48 })) throw new Error('Recently changed does not fill the page')
    await js(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.trim().endsWith('PCs')).click())
    // The PCs page is the character library: no party level or level warnings (those are the Home board's).
    await until(() => document.querySelectorAll('.pc-library .pc-row').length === 2, 'the PCs page rows')
    if (await js(() => !!document.querySelector('.pc-library .level-warning'))) throw new Error('The PCs page shows level warnings')
    // Search matches character and player names; Level sorts.
    const searchPcs = (q) => js((q) => { const i = document.querySelector('.pc-library input[aria-label="Search PCs"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, q); i.dispatchEvent(new Event('input', { bubbles: true })) }, q)
    await searchPcs('guest')
    await until(() => document.querySelectorAll('.pc-library .pc-row').length === 1 && document.querySelector('.pc-row').innerText.includes('Squire'), 'the search by player name')
    await searchPcs('')
    await js(() => [...document.querySelectorAll('.pc-library .sb-columns span')].find(s => s.textContent.trim() === 'Level').click())
    await until(() => document.querySelector('.pc-library .pc-row')?.innerText.includes('Squire'), 'the rows sorted by level')
    // With none clicked, the pane shows the first row; a PC without a sheet picks its mark there and in its row.
    if (!(await js(() => document.querySelector('.pc-detail input[aria-label="Character name"]')?.value === 'Squire' && !!document.querySelector('.pc-detail select[aria-label="Class mark"]') && !!document.querySelector('.pc-row select[aria-label="Class mark"]')))) throw new Error('The detail pane does not show the first row')
    await sleep(500) // let the page paint before the frame is taken
    await screenshot('out/pcs-levels.png')
    await js(() => window.api.entity.delete('player-character', 'squire'))
    await sleep(300)
    await js(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.trim().endsWith('Locations')).click())
    await until(() => [...document.querySelectorAll('*')].some(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Vault'), 'the location list')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Vault').click())
    await until(() => document.querySelector('.location-trap')?.innerText.includes('Countermeasures'), 'the location trap stat block')
    await js(() => { const i = document.querySelector('.location-traps .trap-search input'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Pyrotechnics'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => !!document.querySelector('.location-traps .trap-search-results button'), 'the trap search results')
    await js(() => document.querySelector('.location-traps .trap-search-results button').click())
    await until(() => document.querySelectorAll('.location-trap').length === 3, 'the added trap')
    await sleep(300)
    const vault = await js(() => window.api.entity.get('location', 'vault'))
    if (JSON.stringify(vault.traps) !== JSON.stringify([{ compendiumId: 'trap41' }, { compendiumId: 'trap300' }, { compendiumId: 'trap40' }])) throw new Error('Location traps were not saved: ' + JSON.stringify(vault.traps))
    await screenshot('out/location-traps.png')

    // ── Encounter editor: rows preview as adjusted kit monsters ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Encounters')).click())
    await until(() => [...document.querySelectorAll('*')].some(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Fight'), 'the encounter list')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Fight').click())
    await until(() => document.body.innerText.includes('Smoke Captain') && document.body.innerText.includes('Troll'), 'the encounter rows')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Captain').click())
    await until(() => document.body.innerText.includes('Level 6 Elite Soldier'), 'the row preview')
    const preview = await js(() => document.body.innerText)
    for (const text of ['Battle Champion', 'Sweeping Cut', 'Level 6']) if (!preview.includes(text)) throw new Error(`Row preview is missing "${text}"`)
    await screenshot('out/combat-encounter-preview.png')

    // Traps: rows with XP, and a trap row previews the trap stat block.
    // The location's Ceiling Scythe shows as a read-only row; the other two location traps are the encounter's own.
    await until(() => document.querySelectorAll('.encounter-trap-row').length === 3, 'the trap rows')
    const trapRows = await js(() => [...document.querySelectorAll('.encounter-trap-row')].map(r => r.innerText).join(' | '))
    if (!trapRows.includes('175 XP') || !trapRows.includes('200 XP') || !/Ceiling Scythe[\s\S]*from Smoke Vault/.test(trapRows)) throw new Error('Trap rows wrong: ' + trapRows)
    const xpText = await js(() => (document.body.innerText.match(/[\d,]+ XP/g) ?? []).join(' '))
    // Creatures 950 + dire rat 100; traps 175 + 200 + Ceiling Scythe 250.
    if (!/\b1,?675 XP/.test(xpText)) throw new Error('Encounter XP does not include every trap: ' + xpText)
    // The encounter lists the diseases its creatures can expose a target to.
    await until(() => document.querySelector('.encounter-diseases')?.innerText.includes('Dire Rat Filth Fever'), 'the encounter diseases')
    if (!(await js(() => document.querySelector('.encounter-diseases').innerText.includes('from Dire Rat')))) throw new Error('Disease source missing')
    await js(() => document.querySelectorAll('.encounter-trap-row')[1].click())
    await until(() => document.body.innerText.includes('Leg Breaker Trap') && document.body.innerText.includes('Countermeasures'), 'the trap preview')

    // ── Start combat: main adds the rows as kit combatants ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Start Combat')).click())
    let state
    // Eight from the encounter and its location, plus the active PC that initiative entry adds.
    for (let i = 0; i < 80 && !(state && Object.keys(state.combatants).length === 9); i++) { await sleep(100); state = await js(() => window.api.combat.setInitiativeFocus(null)).catch(() => null) }
    const combatants = Object.values(state.combatants)
    if (combatants.length !== 9) throw new Error('Expected 9 combatants, got ' + combatants.map(c => c.name).join(', '))
    const byName = name => combatants.filter(c => c.name === name)
    const cap = byName('Smoke Captain')[0], troll = byName('Troll')[0], goblins = byName('Corrupt Goblin Cutter')
    if (!cap || !troll || goblins.length !== 2) throw new Error('Missing combatants: ' + combatants.map(c => c.name).join(', '))
    if (combatants.some(c => !c.isPC && (!['creature', 'trap'].includes(c.kind) || !c.content) || 'statBlock' in c)) throw new Error('Combatants are not kit content')
    if (cap.content.rank !== 'elite' || cap.content.level !== 6 || cap.hp !== cap.content.hp) throw new Error('Captain adjustments missing: ' + JSON.stringify([cap.content.rank, cap.content.level, cap.hp]))
    if (troll.content.regeneration?.value !== 5 || JSON.stringify(troll.content.regeneration.suppressedBy) !== '["fire","acid"]') throw new Error('Troll regeneration wrong: ' + JSON.stringify(troll.content.regeneration))
    if (goblins.some(g => g.hp !== 1 || g.content.rank !== 'minion') || goblins[0].initiativeGroupId !== goblins[1].initiativeGroupId) throw new Error('Minions wrong')
    // Initiative in list order, captain first.
    const jets = byName('Pyrotechnics Trap')[0], legBreaker = byName('Leg Breaker Trap')[0]
    if (jets?.kind !== 'trap' || !jets.hidden || jets.content.initiative !== 6) throw new Error('Pyrotechnics Trap wrong: ' + JSON.stringify(jets && [jets.kind, jets.hidden, jets.content.initiative]))
    if (legBreaker?.kind !== 'trap' || legBreaker.hidden || legBreaker.content.initiative !== undefined) throw new Error('Leg Breaker Trap wrong')
    if (!(await js(() => document.querySelector('.triggered-trap-note')?.textContent.includes('Leg Breaker Trap')))) throw new Error('Initiative entry does not list the triggered trap')
    const scythe = byName('Ceiling Scythe')[0], rat = byName('Dire Rat')[0], heroC = combatants.find(c => c.isPC)
    if (scythe?.kind !== 'trap' || !scythe.hidden) throw new Error('The location trap did not join hidden')
    if (!heroC.conditions.some(c => c.carried && c.customName === 'Smoke Curse' && c.duration?.type === 'indefinite')) throw new Error('The hero\'s lasting effect did not join combat: ' + JSON.stringify(heroC.conditions))
    // Initiative: captain first, then the rat (whose bite carries the disease), then the rest.
    const order = [cap, rat, troll, jets, scythe, ...goblins, heroC]
    for (const [i, c] of order.entries()) await js((id, n) => window.api.combat.setInitiative(id, n), c.id, 30 - i)
    await js(() => window.api.combat.start())
    await until(() => document.body.innerText.includes('Sweeping Cut'), 'the current-turn panel')
    await sleep(500)
    await screenshot('out/combat-panel.png')
    const panel = await js(() => document.body.innerText)
    // The template's traits appear with the creature's own powers.
    for (const text of ['Longsword', 'Sweeping Cut', 'Battle Lord Tactics']) if (!panel.includes(text)) throw new Error(`Combat panel is missing "${text}"`)
    // Pin Sweeping Cut before using it: the pinned card is live, so it shows the power as used.
    await js(() => [...document.querySelectorAll('.power-card')].find(c => c.querySelector('.pc-name')?.textContent === 'Sweeping Cut').querySelector('.pc-pin').click())
    await until(() => document.querySelector('.pinned-cards')?.innerText.includes('Sweeping Cut'), 'the pinned card')
    // Pop the pinned cards out into their own window: the same live card, drawn by this renderer.
    const before = new Set(BrowserWindow.getAllWindows())
    await js(() => document.querySelector('.pinned-cards').closest('[style*="position: fixed"]').querySelector('button[aria-label="Open in its own window"]').click())
    let popWin
    for (let i = 0; i < 50 && !popWin; i++) { await sleep(100); popWin = BrowserWindow.getAllWindows().find(w => !before.has(w)) }
    if (!popWin) throw new Error('No popout window opened')
    let popText = ''
    for (let i = 0; i < 50 && !popText.includes('Sweeping Cut'); i++) { await sleep(100); popText = await popWin.webContents.executeJavaScript('document.body.innerText').catch(() => '') }
    if (!popText.includes('Sweeping Cut')) throw new Error('The popout does not show the pinned card: ' + popText.slice(0, 300))
    if (await js(() => !!document.querySelector('.pinned-cards'))) throw new Error('The pinned cards stayed in the DM window')
    // Styles came along: the card has its header background.
    const styled = await popWin.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.power-card .pc-header')).backgroundColor`)
    if (!styled || styled === 'rgba(0, 0, 0, 0)') throw new Error('The popout has no styles')
    { const img = await popWin.webContents.capturePage().catch(() => null); console.error('popout capture', img?.getSize()); if (img && !img.isEmpty()) writeFileSync(join(process.cwd(), 'out/popout-pinned.png'), img.toPNG()) }
    // Closing the window puts the pinned cards back in the app.
    popWin.close()
    await until(() => !!document.querySelector('.pinned-cards'), 'the pinned cards back in the DM window')

    // The rat's turn: the disease named in its Bite applies like a condition: click the name, then the PC.
    await js(() => window.api.combat.endTurn())
    await until(() => !!document.querySelector('.disease-chip') && [...document.querySelectorAll('span[title^="Click, then a PC"]')].some(s => s.textContent === 'dire rat filth fever'), 'the highlighted disease name')
    await js(() => [...document.querySelectorAll('span[title^="Click, then a PC"]')].find(s => s.textContent === 'dire rat filth fever').click())
    await until(() => document.body.innerText.includes('Click a PC to expose to Dire Rat Filth Fever'), 'the expose banner')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Hero').click())
    let heroRecord
    const heroDiseases = r => (r?.conditions ?? []).filter(c => c.kind === 'disease')
    for (let i = 0; i < 30 && !heroDiseases(heroRecord).length; i++) { await sleep(100); heroRecord = await js(() => window.api.entity.get('player-character', 'hero')) }
    if (heroDiseases(heroRecord).length !== 1 || heroDiseases(heroRecord)[0].stage !== 'exposed' || !heroDiseases(heroRecord)[0].compendiumId) throw new Error('Expose did not track the disease: ' + JSON.stringify(heroRecord?.conditions))
    await screenshot('out/combat-disease.png')

    // The hero's imported sheet: defenses in its initiative row, the sheet in its panel.
    if (!(await js(() => document.body.innerText.includes('AC 20 F 18 R 13 W 14')))) throw new Error('The hero row does not show its defenses')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Hero').click())
    await until(() => document.body.innerText.includes('Level 4 Dwarf Fighter') && document.body.innerText.includes('Passive Perception 13, Insight 11'), 'the hero sheet in its panel')
    await screenshot('out/combat-pc-sheet.png')

    // A used recharge power prompts a roll at the start of the captain's next turn (combat entry order).
    const sweepIndex = cap.content.traits.length + cap.content.auras.length + cap.content.powers.findIndex(p => p.name === 'Sweeping Cut')
    await js((id, i) => window.api.combat.usePower(id, i), cap.id, sweepIndex)
    await until(() => document.querySelector('.pinned-cards')?.innerText.includes('Rch 5+ · USED'), 'the live pinned card showing the use')
    const current = () => js(() => window.api.combat.setInitiativeFocus(null))
    let recharge
    for (let step = 0; step < 12 && !recharge; step++) {
      state = await current()
      recharge = state.turnItems.find(t => t.kind === 'recharge')
      if (recharge) break
      // Resolve any other stepper item (saves, regeneration) as a success; otherwise end the turn.
      const open = state.turnItems.findIndex(t => t.result === undefined)
      if ((state.turnPhase === 'end-of-turn' || state.turnPhase === 'start-of-turn') && open >= 0) await js(n => window.api.combat.resolveItem(n, true), open)
      else await js(() => window.api.combat.endTurn())
      await sleep(100)
    }
    if (!recharge || recharge.dc !== 5 || !recharge.label.includes('Sweeping Cut')) throw new Error('No recharge prompt: ' + JSON.stringify(state.turnItems))

    // The triggered trap sits outside the order: Trigger shows its stat block, Disable stops it.
    if (state.initiativeOrder.includes(legBreaker.id)) throw new Error('A triggered trap is in the initiative order')
    await js(() => [...document.querySelectorAll('.triggered-trap button')].find(b => b.textContent === 'Trigger').click())
    await until(() => document.body.innerText.includes('Countermeasures') && document.body.innerText.includes('Leg Breaker Trap'), 'the triggered trap panel')
    await sleep(300)
    await screenshot('out/combat-trap.png')
    await js(() => [...document.querySelectorAll('.triggered-trap button')].find(b => b.textContent === 'Disable').click())
    await until(() => [...document.querySelectorAll('.triggered-trap button')].some(b => b.textContent === 'Re-arm'), 'the disabled trap')
    state = await current()
    if (!state.combatants[legBreaker.id].dead) throw new Error('Disable did not mark the trap')

    // ── Home board: the hero's lasting conditions, with this encounter's on top; the disease opens the conditions dialog,
    // the hero contracts it, then a failed Endurance check worsens it ──
    await js(id => window.api.combat.addCondition(id, { conditionId: 'dazed', duration: { type: 'save-ends' } }), heroC.id)
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Home')).click())
    await until(() => !!document.querySelector('.home-party .home-pc-disease'), 'the disease on the party row')
    if (!(await js(() => [...document.querySelectorAll('.home-party .home-pc-effect')].map(b => b.textContent).join() === 'Smoke Curse'))) throw new Error('The lasting effect is not on the party row once')
    if (!(await js(() => !!document.querySelector('.home-party .home-pc-conditions span[title="Dazed: this encounter only"]')))) throw new Error('The encounter\'s condition is not on the party row')
    await js(() => document.querySelector('.home-party .home-pc-disease').click())
    await until(() => document.querySelector('.pc-disease')?.innerText.includes('Exposed'), 'the exposed disease row')
    await js(() => [...document.querySelectorAll('.pc-disease button')].find(b => b.textContent === 'Contracted').click())
    await until(() => document.querySelector('.pc-disease')?.innerText.includes('Stage 1'), 'stage 1')
    await js(() => { const i = document.querySelector('.pc-disease input[aria-label="Endurance check result"]'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '1'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await sleep(100)
    await js(() => { const i = document.querySelector('.pc-disease input[aria-label="Endurance check result"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    await until(() => document.querySelector('.pc-disease')?.innerText.includes('Stage 2'), 'stage 2 after a failed check')
    heroRecord = await js(() => window.api.entity.get('player-character', 'hero'))
    if (heroDiseases(heroRecord)[0].stage !== 2) throw new Error('Stage not saved: ' + JSON.stringify(heroRecord.conditions))
    // One search adds a standard condition (or a disease, or names an effect).
    await js(() => { const i = document.querySelector('.add-condition input'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'weak'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => document.querySelector('.condition-search-results button')?.innerText.startsWith('Weakened'), 'Weakened offered first')
    await js(() => document.querySelector('.condition-search-results button').click())
    await until(() => !!document.querySelector('.pc-status'), 'the weakened row')
    heroRecord = await js(() => window.api.entity.get('player-character', 'hero'))
    if (!heroRecord.conditions.some(c => c.kind === 'condition' && c.conditionId === 'weakened')) throw new Error('Weakened not saved: ' + JSON.stringify(heroRecord.conditions))
    await screenshot('out/pc-diseases.png')
    await js(() => [...document.querySelectorAll('.dialog-shell button')].find(b => b.textContent === 'Done').click())
    await until(() => !document.querySelector('.pc-disease') && document.querySelector('.home-pc-disease')?.innerText.includes('stage 2'), 'the dialog closed, the row at stage 2')
    // The PCs page: the sheet's class in the row (no mark dropdown), its class mark in the pane.
    await js(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.trim().endsWith('PCs')).click())
    await until(() => !!document.querySelector('.pc-detail'), 'the PCs page')
    if (!(await js(() => [...document.querySelectorAll('.pc-row')].some(r => r.children[4]?.textContent === 'Dwarf' && r.children[5]?.textContent === 'Fighter' && !r.querySelector('select'))))) throw new Error('The PC table does not show the sheet\'s race and class in their columns')
    if (!(await js(() => document.querySelector('.pc-detail').innerText.includes('Combat Challenge')))) throw new Error('The PC pane does not show the sheet\'s class mark')
    if (!(await js(() => document.querySelector('.pc-detail .sb-header .pc-class-level')?.textContent.trim() === 'Dwarf Fighter 4'))) throw new Error('The PC pane header does not show race, class, and level')
    await sleep(300)
    await screenshot('out/pc-detail.png')
    if (heroRecord.sheet?.markType !== 'combat-challenge' || heroRecord.sheetFile !== 'brannoc.dnd4e') throw new Error('Import did not fill the mark or the file name')

    const confirms = await js(() => window.__confirms)
    clearTimeout(timeout)
    console.log('COMBAT_SMOKE_OK: a Library creature resolving live in an encounter row, legacy creature converted on open, encounter row preview (template, level adjustment), the session board and level warnings, combat start in main with kit combatants (elite captain, troll regeneration, grouped minions), combat panel, recharge prompt, live pinned card, location trap stat blocks and search, location traps joining the encounter, encounter diseases, disease name in a power applied to a PC like a condition, the PCs library (search, sort, detail pane), PC lasting conditions (carried into combat, the encounter\'s on top on the Home board, disease stages, adding a condition), PC sheet import (row defenses, panel, PCs page), pinned cards popped out to an OS window and back, trap rows with XP and preview, hidden trap with initiative, triggered trap (Trigger, Disable); confirms: ' + confirms.length + '; screenshots out/home.png, out/pcs-levels.png, out/combat-encounter-preview.png, out/combat-panel.png, out/combat-trap.png, out/location-traps.png, out/combat-disease.png, out/pc-diseases.png, out/combat-pc-sheet.png, out/popout-pinned.png')
    finish(0)
  } catch (err) {
    console.error(err)
    finish(1)
  }
})
