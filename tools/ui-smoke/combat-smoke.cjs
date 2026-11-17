// Combat on kit content, end to end: an encounter with a templated, level-adjusted campaign creature,
// a published troll, and published minions previews in the encounter editor and starts combat as kit
// combatants; the combat panels render them and recharge powers prompt a roll. Windows are hidden and
// render offscreen. Run with `npm run test:combat:ui` after `npm run build`.
process.env.FOUR_E_HIDDEN_WINDOWS = '1'
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')
const root = mkdtempSync(join(tmpdir(), '4e-combat-ui-'))
app.setPath('appData', root)
mkdirSync(join(root, 'user'))
app.setPath('userData', join(root, 'user'))
// Published content: the invented fixture pack (test-content.cjs), never the DM's install.
process.env.FOUR_E_CONTENT_DIR = require('./test-content.cjs').testContentDir()
// The build to test: $FOUR_E_OUT_DIR (`npm run test:ui` builds a private one per run), else out/.
require(join(process.env.FOUR_E_OUT_DIR || resolve(__dirname, '../../out'), 'main/index.js'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const finish = code => app.exit(code)
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
    { creatureId: 'captain', count: 1, monsterTemplates: ['Drillmaster'], levelAdjust: 1 },
    { compendiumId: 'monster9001', count: 1 },
    { compendiumId: 'monster9002', count: 2 },
    // Mire Rat: its bite exposes the target to mire fever.
    { compendiumId: 'monster9003', count: 1 },
  ],
  traps: [
    { compendiumId: 'trap9001', count: 1 },
    { compendiumId: 'trap41', count: 1, visible: true },
  ],
  // The location adds Swinging Blade (trap9002); its other traps are already in the encounter.
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
    await js(l => window.api.entity.save('location', l), { id: 'vault', name: 'Smoke Vault', description: '', tags: [], createdAt: now, updatedAt: now, traps: [{ compendiumId: 'trap41' }, { compendiumId: 'trap9002' }], encounterIds: ['smoke-fight'] })
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
    await js(() => { const i = document.querySelector('.location-traps .trap-search input'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Spark'); i.dispatchEvent(new Event('input', { bubbles: true })) })
    await until(() => !!document.querySelector('.location-traps .trap-search-results button'), 'the trap search results')
    await js(() => document.querySelector('.location-traps .trap-search-results button').click())
    await until(() => document.querySelectorAll('.location-trap').length === 3, 'the added trap')
    await sleep(300)
    const vault = await js(() => window.api.entity.get('location', 'vault'))
    if (JSON.stringify(vault.traps) !== JSON.stringify([{ compendiumId: 'trap41' }, { compendiumId: 'trap9002' }, { compendiumId: 'trap9001' }])) throw new Error('Location traps were not saved: ' + JSON.stringify(vault.traps))
    await screenshot('out/location-traps.png')

    // ── Treasure: added on the location, budgeted on the Rewards page (party of one at level 4) ──
    const setInput = (sel, value) => js((s, v) => { const i = document.querySelector(s); i.focus(); const proto = i instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event(i instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })) }, sel, value)
    const treasures = () => js(() => window.api.entity.list('treasure'))
    await setInput('.treasure-section .item-search input', 'Lantern')
    await until(() => !!document.querySelector('.treasure-section .item-search-results button'), 'the item search results')
    await js(() => document.querySelector('.treasure-section .item-search-results button').click())
    await until(() => document.querySelectorAll('.treasure-section .treasure-row').length === 1, 'the added item treasure')
    await js(() => [...document.querySelectorAll('.treasure-section button')].find(b => b.textContent.trim() === '+ Money').click())
    await until(() => document.querySelectorAll('.treasure-section .treasure-row').length === 2, 'the added money treasure')
    await setInput('.treasure-section input[aria-label="Monetary treasure"]', 'a silver idol')
    await setInput('.treasure-section input[aria-label="Value in gp"]', '250')
    await sleep(300)
    let placed = await treasures()
    const lantern = placed.find(t => t.item?.compendiumId === 'wondrous9001')
    if (placed.length !== 2 || !lantern || lantern.level !== 4 || lantern.item.itemLevel !== 4 || placed.some(t => t.locationId !== 'vault') || !placed.some(t => t.money?.text === 'a silver idol' && t.money.gp === 250))
      throw new Error('Location treasure was not saved: ' + JSON.stringify(placed))
    await js(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.trim().endsWith('Rewards')).click())
    await until(() => document.querySelector('.rewards-level-row[aria-selected="true"]')?.textContent.startsWith('Level 4 (party)'), 'the Rewards page at the party level')
    // DMG parcels for one PC (DMG p. 125): parcel 3 (a level 6 item) and parcels 6-10 (420 + 280 + 280 + 140 + 90 gp).
    if (await js(() => [...document.querySelectorAll('.treasure-slot')].map(s => s.dataset.slot).join()) !== 'dmg:3,dmg:6,dmg:7,dmg:8,dmg:9,dmg:10') throw new Error('The DMG slots for a party of one are wrong')
    const meter = () => js(() => [...document.querySelectorAll('.rewards-bar:not([aria-label="Experience"])')].map(b => `${b.getAttribute('aria-valuenow')}/${b.getAttribute('aria-valuemax')}`).join())
    if (await meter() !== '1/1,250/1210') throw new Error('The treasure meter is wrong: ' + await meter())
    // The location's treasure shows here, placed in its location.
    if (!await js(() => [...document.querySelectorAll('.treasure-others .treasure-row')].some(r => r.textContent.includes('Lantern of Paths') && r.querySelector('select[aria-label="Placed in"]').selectedOptions[0].textContent === 'Smoke Vault'))) throw new Error('The location treasure is not on the Rewards page')
    // The level's encounters: Smoke Fight has no level of its own, so it counts at the party's level; the XP bar
    // compares its XP per PC (one PC) with the 1,750 XP from level 4 to 5 (PHB p. 29).
    await until(() => [...document.querySelectorAll('.level-encounter-row')].some(r => r.textContent.includes('Smoke Fight (party level)')), "the level's encounters")
    await until(() => Number(document.querySelector('.rewards-bar[aria-label="Experience"]')?.getAttribute('aria-valuenow')) > 0, 'the experience bar')
    const fightXp = (await js(() => window.api.combat.encounterXp()))['smoke-fight']
    if (await js(() => { const b = document.querySelector('.rewards-bar[aria-label="Experience"]'); return `${b.getAttribute('aria-valuenow')}/${b.getAttribute('aria-valuemax')}` }) !== `${fightXp}/1750`) throw new Error('The experience bar does not show the encounter XP per PC against the next level')
    // A quest on the level: Major gives each PC one standard monster of its level, 175 XP at level 4 (DMG p. 122);
    // its reward treasure is placed on it.
    await js(() => [...document.querySelectorAll('.rewards-level .quest-section button')].find(b => b.textContent.trim() === '+ Quest').click())
    await until(() => !!document.querySelector('.rewards-level .quest-row'), 'the new quest')
    await setInput('.rewards-level .quest-row input[aria-label="Quest name"]', 'Find the idol')
    await setInput('.rewards-level .quest-row select[aria-label="Quest kind"]', 'major')
    await until(xp => document.querySelector('.rewards-bar[aria-label="Experience"]')?.getAttribute('aria-valuenow') === String(xp), 'the quest XP in the experience bar', fightXp + 175)
    await js(() => [...document.querySelectorAll('.rewards-level .quest-row button')].find(b => b.textContent.trim().startsWith('Reward')).click())
    await js(() => [...document.querySelectorAll('.rewards-level .quest-row-wrap .treasure-section button')].find(b => b.textContent.trim() === '+ Money').click())
    await until(() => [...document.querySelectorAll('.rewards-level .quest-row button')].some(b => b.textContent.trim() === 'Reward (1)'), 'the quest reward')
    const quest = (await js(() => window.api.entity.list('quest')))[0]
    if (quest?.name !== 'Find the idol' || quest.kind !== 'major' || quest.level !== 4 || !(await treasures()).some(t => t.questId === quest.id)) throw new Error('The quest or its reward was not saved: ' + JSON.stringify(quest))
    await js(() => [...document.querySelectorAll('.rewards-level .quest-row button')].find(b => b.textContent.trim().startsWith('Reward')).click())
    // Suggest fills the money parcels as printed; the fixture pack has no permanent level 6 item, so parcel 3 stays open.
    await js(() => [...document.querySelectorAll('.rewards-level button')].find(b => b.textContent.trim() === 'Suggest').click())
    try { await until(() => document.querySelectorAll('.treasure-slot .treasure-row').length === 5, 'the suggested money parcels') } catch (e) {
      // Main's records against the page's, to tell a lost save from a stale page.
      throw new Error(e.message.split('\n')[0] + '; main has ' + JSON.stringify((await treasures()).map(t => t.slot ?? t.money?.text ?? t.item?.compendiumId)) + ', the page ' + JSON.stringify(await js(() => [...document.querySelectorAll('.treasure-slot')].map(s => s.dataset.slot + (s.querySelector('.treasure-row') ? '+' : '')))))
    }
    if (await meter() !== '1/1,1460/1210') throw new Error('The meter does not count the suggested parcels: ' + await meter())
    await js(() => document.querySelector('.treasure-others .treasure-row input[aria-label="Found"]').click())
    await until(() => document.querySelector('.treasure-others .treasure-row input[aria-label="Found"]').checked, 'the found mark')
    await sleep(300)
    await screenshot('out/treasure-dmg.png')
    // RC rolls: ten rolled treasures become the slots; the DMG-slotted treasure stays at the level, outside them.
    await setInput('.rewards-level select[aria-label="Budget"]', 'rc')
    await until(() => [...document.querySelectorAll('.rewards-level button')].some(b => b.textContent.trim() === 'Roll'), 'the Roll button')
    // A party of one rolls at -8 (RC p. 299), so a level can come up empty (about 1 in 14): every die rolls its highest here,
    // a natural 20 on each line: 5d6 x 10 gp, three 100 gp gems, two 250 gp art objects, and a rare item of level 1d4 + 4 = 8.
    await js(() => { window.__random = Math.random; Math.random = () => 0.999 })
    await js(() => [...document.querySelectorAll('.rewards-level button')].find(b => b.textContent.trim() === 'Roll').click())
    await until(() => document.querySelectorAll('.treasure-slot[data-slot^="rc:"]').length > 0, 'the rolled slots')
    const plan = await js(() => window.api.entity.get('level', '4'))
    await js(() => { Math.random = window.__random })
    if (plan?.treasure?.mode !== 'rc' || plan.treasure.rolled?.length !== 20 || plan.treasure.rolled.some(s => s.kind === 'item' ? s.itemLevel !== 8 || s.rarity !== 'rare' : s.gp !== 5 * 6 * 10 + 3 * 100 + 2 * 250)) throw new Error('The rolled plan was not saved: ' + JSON.stringify(plan))
    // Seven from before the roll and the quest's reward (at this level, outside the slots).
    if (await js(() => document.querySelectorAll('.treasure-others .treasure-row').length) !== 8) throw new Error('The DMG-slotted treasure is not listed outside the rolled slots')
    await sleep(300)
    await screenshot('out/treasure-rc.png')

    // ── Encounter editor: rows preview as adjusted kit monsters ──
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('Encounters')).click())
    await until(() => [...document.querySelectorAll('*')].some(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Fight'), 'the encounter list')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Fight').click())
    await until(() => document.body.innerText.includes('Smoke Captain') && document.body.innerText.includes('Moss Troll'), 'the encounter rows')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Captain').click())
    await until(() => document.body.innerText.includes('Level 6 Elite Soldier'), 'the row preview')
    const preview = await js(() => document.body.innerText)
    for (const text of ['Drillmaster', 'Sweeping Cut', 'Level 6']) if (!preview.includes(text)) throw new Error(`Row preview is missing "${text}"`)
    await screenshot('out/combat-encounter-preview.png')
    if (!await js(() => document.querySelector('.treasure-section .sb-label')?.textContent === 'Treasure')) throw new Error('The encounter editor has no Treasure section')
    // The encounter's own level (its level frame) sets its budget; the party's level shows beside it when they differ.
    await setInput('input[aria-label="Planned for party level"]', '6')
    await until(() => document.querySelector('.encounter-level-note')?.textContent === '(the party is level 4)', 'the party level note')
    if ((await js(() => window.api.entity.get('encounter', 'smoke-fight'))).level !== 6) throw new Error('The encounter level was not saved')
    await setInput('input[aria-label="Planned for party level"]', '')
    await until(() => !document.querySelector('.encounter-level-note'), 'the encounter back at the party level')
    // A level variant: a copy two levels up, each creature row's level adjustment shifted by 2, in one group with the original.
    await js(() => document.querySelector('button[aria-label="New level variant"]').click())
    await until(() => !!document.querySelector('.encounter-variants input[aria-label="Variant level"]'), 'the variant form')
    await setInput('.encounter-variants input[aria-label="Variant level"]', '6')
    await js(() => [...document.querySelectorAll('.encounter-variants button')].find(b => b.textContent.trim() === 'Create').click())
    await until(() => [...document.querySelectorAll('.encounter-variants button')].map(b => b.textContent.trim()).join() === 'L4 (party),L6', 'the variant tabs')
    const fights = (await js(() => window.api.entity.list('encounter'))).filter(e => e.variantGroup === 'smoke-fight')
    const original = fights.find(e => e.id === 'smoke-fight'), variant = fights.find(e => e.id !== 'smoke-fight')
    if (fights.length !== 2 || original.level !== 4 || variant.level !== 6 || variant.creatures.some((c, i) => (c.levelAdjust ?? 0) !== (original.creatures[i].levelAdjust ?? 0) + 2))
      throw new Error('The level variant was not made: ' + JSON.stringify(fights.map(e => ({ id: e.id, level: e.level, rows: e.creatures.map(c => c.levelAdjust) }))))
    if (!(await js(() => window.api.entity.get('location', 'vault'))).encounterIds.includes(variant.id)) throw new Error('The variant is not linked to the location')
    await screenshot('out/encounter-variant.png')
    // The Encounters list shows the group once, with a tab per level.
    await js(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.trim().endsWith('Encounters')).click())
    await until(() => [...document.querySelectorAll('.encounter-variant-chips button')].map(b => b.textContent).join() === 'L4,L6', 'the grouped encounter row')
    await js(id => window.api.entity.delete('encounter', id), variant.id)
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Smoke Fight').click())
    await until(() => !!document.querySelector('input[aria-label="Planned for party level"]') && !document.querySelector('.encounter-variants'), 'the original without its variant')

    // Traps: rows with XP, and a trap row previews the trap stat block.
    // The location's Swinging Blade shows as a read-only row; the other two location traps are the encounter's own.
    await until(() => document.querySelectorAll('.encounter-trap-row').length === 3, 'the trap rows')
    const trapRows = await js(() => [...document.querySelectorAll('.encounter-trap-row')].map(r => r.innerText).join(' | '))
    if (!trapRows.includes('175 XP') || !trapRows.includes('200 XP') || !/Swinging Blade[\s\S]*from Smoke Vault/.test(trapRows)) throw new Error('Trap rows wrong: ' + trapRows)
    const xpText = await js(() => (document.body.innerText.match(/[\d,]+ XP/g) ?? []).join(' '))
    // Creatures 950 + dire rat 100; traps 175 + 200 + Swinging Blade 250.
    if (!/\b1,?675 XP/.test(xpText)) throw new Error('Encounter XP does not include every trap: ' + xpText)
    // The encounter lists the diseases its creatures can expose a target to.
    await until(() => document.querySelector('.encounter-diseases')?.innerText.includes('Mire Fever'), 'the encounter diseases')
    if (!(await js(() => document.querySelector('.encounter-diseases').innerText.includes('from Mire Rat')))) throw new Error('Disease source missing')
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
    const cap = byName('Smoke Captain')[0], troll = byName('Moss Troll')[0], goblins = byName('Gutter Knifer')
    if (!cap || !troll || goblins.length !== 2) throw new Error('Missing combatants: ' + combatants.map(c => c.name).join(', '))
    if (combatants.some(c => !c.isPC && (!['creature', 'trap'].includes(c.kind) || !c.content) || 'statBlock' in c)) throw new Error('Combatants are not kit content')
    if (cap.content.rank !== 'elite' || cap.content.level !== 6 || cap.hp !== cap.content.hp) throw new Error('Captain adjustments missing: ' + JSON.stringify([cap.content.rank, cap.content.level, cap.hp]))
    if (troll.content.regeneration?.value !== 5 || JSON.stringify(troll.content.regeneration.suppressedBy) !== '["fire","acid"]') throw new Error('Troll regeneration wrong: ' + JSON.stringify(troll.content.regeneration))
    if (goblins.some(g => g.hp !== 1 || g.content.rank !== 'minion') || goblins[0].initiativeGroupId !== goblins[1].initiativeGroupId) throw new Error('Minions wrong')
    // Initiative in list order, captain first.
    const jets = byName('Spark Jets')[0], legBreaker = byName('Leg Breaker Trap')[0]
    if (jets?.kind !== 'trap' || !jets.hidden || jets.content.initiative !== 6) throw new Error('Spark Jets wrong: ' + JSON.stringify(jets && [jets.kind, jets.hidden, jets.content.initiative]))
    if (legBreaker?.kind !== 'trap' || legBreaker.hidden || legBreaker.content.initiative !== undefined) throw new Error('Leg Breaker Trap wrong')
    if (!(await js(() => document.querySelector('.triggered-trap-note')?.textContent.includes('Leg Breaker Trap')))) throw new Error('Initiative entry does not list the triggered trap')
    const scythe = byName('Swinging Blade')[0], rat = byName('Mire Rat')[0], heroC = combatants.find(c => c.isPC)
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
    for (const text of ['Longsword', 'Sweeping Cut', 'Rally Cry']) if (!panel.includes(text)) throw new Error(`Combat panel is missing "${text}"`)
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
    await until(() => !!document.querySelector('.disease-chip') && [...document.querySelectorAll('span[title^="Click, then a PC"]')].some(s => s.textContent.includes('mire fever')), 'the highlighted disease name')
    await js(() => [...document.querySelectorAll('span[title^="Click, then a PC"]')].find(s => s.textContent.includes('mire fever')).click())
    await until(() => document.body.innerText.includes('Click a PC to expose to Mire Fever'), 'the expose banner')
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
    // Click-to-apply from effect clauses: "slowed and weakened (save ends both)" highlights as one group,
    // and one click applies both, ended by one save.
    const groupSpans = () => js(() => [...document.querySelectorAll('.power-card .pc-apply')].filter(s => s.title.startsWith('Click to apply Slowed and Weakened (save ends both)')).map(s => s.textContent))
    if (JSON.stringify(await groupSpans()) !== JSON.stringify(['slowed', 'weakened (save ends both)'])) throw new Error('The save group spans: ' + JSON.stringify(await groupSpans()))
    await js(() => [...document.querySelectorAll('.power-card .pc-apply')].find(s => s.textContent === 'slowed').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    await until(() => document.querySelectorAll('.power-card .pc-apply-hover').length === 2, 'the save group lit up together')
    await screenshot('out/combat-save-group.png')
    await js(() => [...document.querySelectorAll('.power-card .pc-apply')].find(s => s.textContent === 'slowed').click())
    await until(() => document.body.innerText.includes('Click a target to apply condition'), 'the apply banner')
    await js(() => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === 'Hero').click())
    let grouped = []
    for (let i = 0; i < 30 && grouped.length < 2; i++) { await sleep(100); grouped = (await current()).combatants[heroC.id].conditions.filter(c => c.conditionId === 'slowed' || c.conditionId === 'weakened') }
    if (grouped.length !== 2 || !grouped[0].saveGroup || grouped[0].saveGroup !== grouped[1].saveGroup || grouped.some(c => c.duration?.type !== 'save-ends' || c.sourceId !== legBreaker.id))
      throw new Error('The save group did not apply together: ' + JSON.stringify(grouped))
    for (const c of grouped) await js((id, cid) => window.api.combat.removeCondition(id, cid), heroC.id, c.conditionId)
    await js(() => [...document.querySelectorAll('.triggered-trap button')].find(b => b.textContent === 'Disable').click())
    await until(() => [...document.querySelectorAll('.triggered-trap button')].some(b => b.textContent === 'Re-arm'), 'the disabled trap')
    state = await current()
    if (!state.combatants[legBreaker.id].dead) throw new Error('Disable did not mark the trap')

    // Countermeasures (from the content repo's clauses): the panel lists each with its checks, action, and
    // attackable part; the strip has their actions; a skill challenge's last success disables the trap.
    const cmText = await js(() => document.querySelector('.trap-countermeasures')?.innerText ?? '')
    if (!cmText.includes('Thievery DC 17') || !cmText.includes('Standard Action') || !cmText.includes('AC 10, Fort 10, Ref 10, Will 10; HP 20')) throw new Error('Countermeasures panel wrong: ' + cmText)
    if (await js(() => [...document.querySelectorAll('.stat-block-4e, .power-card')].some(e => e.querySelector('.pc-name, .pc-title')?.textContent === 'Countermeasures'))) throw new Error('Countermeasures also drawn as a text card')
    await js(() => [...document.querySelectorAll('.triggered-trap button')].find(b => b.textContent === 'Re-arm').click())
    await until(() => !!document.querySelector('.trap-countermeasures-compact'), 'the strip countermeasure actions')
    const stripActions = await js(() => [...document.querySelectorAll('.trap-countermeasures-compact button')].map(b => b.textContent.trim()))
    const stripRows = await js(() => [...document.querySelectorAll('.trap-countermeasures-compact > div')].map(r => r.innerText.replace(/\s+/g, ' ').trim()))
    if (JSON.stringify(stripRows) !== JSON.stringify(['Thievery DC 17 Disable', 'AC 10, Fort 10, Ref 10, Will 10; HP 20 Destroy', 'Dungeoneering DC 17 Successes 0/3 Failures 0/2'])) throw new Error('Strip countermeasure rows: ' + JSON.stringify(stripRows))
    if (JSON.stringify(stripActions) !== JSON.stringify(['Disable', 'Destroy', 'Successes 0/3', 'Failures 0/2'])) throw new Error('Strip countermeasure actions: ' + JSON.stringify(stripActions))
    await sleep(500)
    await screenshot('out/combat-trap-countermeasures.png')
    for (let n = 1; n <= 3; n++) {
      await js(() => [...document.querySelectorAll('.trap-countermeasures-compact button')].find(b => b.textContent.startsWith('Successes')).click())
      if (n < 3) await until(k => [...document.querySelectorAll('.trap-countermeasures-compact button')].some(b => b.textContent.trim() === `Successes ${k}/3`), 'success ' + n, n)
    }
    await until(() => [...document.querySelectorAll('.triggered-trap button')].some(b => b.textContent === 'Re-arm'), 'the skill challenge disabling the trap')
    state = await current()
    if (!state.combatants[legBreaker.id].dead || state.combatants[legBreaker.id].countermeasures?.['2/0']?.successes !== 3) throw new Error('Skill challenge state: ' + JSON.stringify(state.combatants[legBreaker.id].countermeasures))
    await js(() => document.querySelector('button[aria-label="Combat log"]').click())
    await until(() => document.body.innerText.includes('Leg Breaker Trap is disabled (Dungeoneering DC 17)') && document.body.innerText.includes('Dungeoneering DC 17 succeeded (3/3)'), 'the countermeasure in the combat log')
    await js(() => document.querySelector('button[aria-label="Combat log"]').click())

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
    console.log('COMBAT_SMOKE_OK: a Library creature resolving live in an encounter row, legacy creature converted on open, encounter row preview (template, level adjustment), the session board and level warnings, combat start in main with kit combatants (elite captain, troll regeneration, grouped minions), combat panel, recharge prompt, live pinned card, location trap stat blocks and search, rewards (an encounter planned for a level, a level variant of it (grouped in the list), a major quest with its XP and a reward treasure, treasure added on a location, the Rewards page: the level\'s encounters and XP per PC against the next level, DMG slots for a party of one, meter, Suggest, found, RC rolls), location traps joining the encounter, encounter diseases, disease name in a power applied to a PC like a condition, the PCs library (search, sort, detail pane), PC lasting conditions (carried into combat, the encounter\'s on top on the Home board, disease stages, adding a condition), PC sheet import (row defenses, panel, PCs page), pinned cards popped out to an OS window and back, trap rows with XP and preview, hidden trap with initiative, triggered trap (Trigger, Disable), trap countermeasures from content-repo clauses (checks, action, part, strip actions, a skill challenge disabling the trap, logged), click-to-apply from effect clauses (a save ends both group highlighted and applied together); confirms: ' + confirms.length + '; screenshots out/home.png, out/pcs-levels.png, out/combat-encounter-preview.png, out/combat-panel.png, out/combat-trap.png, out/combat-trap-countermeasures.png, out/combat-save-group.png, out/location-traps.png, out/treasure-dmg.png, out/treasure-rc.png, out/combat-disease.png, out/pc-diseases.png, out/combat-pc-sheet.png, out/popout-pinned.png')
    finish(0)
  } catch (err) {
    console.error(err)
    finish(1)
  }
})
