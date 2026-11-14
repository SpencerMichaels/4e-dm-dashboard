// Button affordance smoke test: tours the DM window (home, settings, encounters, combat, PCs,
// locations, maps, every compendium page in preview and edit) and fails if any button with text reads as
// plain text before it is hovered (see button-audit.cjs). Windows are hidden and render offscreen.
// Run with `npm run test:buttons:ui` after `npm run build`.
process.env.FOUR_E_HIDDEN_WINDOWS = '1'
const { app, BrowserWindow } = require('electron')
const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')
const { auditButtons } = require('./button-audit.cjs')
const root = mkdtempSync(join(tmpdir(), '4e-button-ui-'))
app.setPath('appData', root)
mkdirSync(join(root, 'user'))
app.setPath('userData', join(root, 'user'))
// The compendium reads content/ relative to the app path (this script's folder).
const contentLink = join(__dirname, 'content')
if (!existsSync(contentLink)) symlinkSync(resolve(__dirname, '../../content'), contentLink)
require('../../out/main/index.js')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const finish = code => { try { rmSync(contentLink) } catch {} app.exit(code) }
const timeout = setTimeout(() => { console.error('Button smoke timed out'); finish(1) }, 120000)

const now = new Date().toISOString()
const encounter = {
  id: 'smoke-fight', name: 'Smoke Fight', tags: [], createdAt: now, updatedAt: now, locationId: 'vault',
  creatures: [{ compendiumId: 'monster723', count: 1 }, { compendiumId: 'monster4742', count: 2 }, { compendiumId: 'monster145', count: 1 }],
  traps: [{ compendiumId: 'trap40', count: 1 }, { compendiumId: 'trap41', count: 1, visible: true }],
}
const hero = { id: 'hero', name: 'Hero', playerName: 'Player', active: true, createdAt: now, updatedAt: now, diseases: [{ diseaseId: 'disease1', stage: 'exposed', since: now }] }
const vault = { id: 'vault', name: 'Smoke Vault', description: '', tags: [], createdAt: now, updatedAt: now, traps: [{ compendiumId: 'trap41' }], encounterIds: ['smoke-fight'] }

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
    const until = async (fn, what, ...args) => { for (let i = 0; i < 80; i++) { if (await js(fn, ...args)) return; await sleep(100) } throw new Error('Timed out waiting for ' + what) }
    // "text at path" -> the views it was seen on
    const found = new Map()
    const audit = async where => {
      await sleep(300)
      for (const line of await js(auditButtons)) found.set(line, [...(found.get(line) ?? []), where])
      await screenshot(`out/buttons-${where.replace(/\W+/g, '-')}.png`)
    }
    const clickButton = async text => {
      await until(t => [...document.querySelectorAll('button')].some(b => b.textContent.trim().endsWith(t)), 'the ' + text + ' button', text)
      await js(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith(t)).click(), text)
    }
    const clickText = text => js(t => [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent.trim() === t).click(), text)
    const escape = () => js(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    const openDialog = async (title, where) => {
      await js(t => document.querySelector(`button[title^="${t}"]`).click(), title)
      await sleep(300)
      await audit(where)
      await escape()
      await sleep(200)
    }

    await js(() => { window.__confirms = []; window.confirm = m => { window.__confirms.push(m); return true } })
    await audit('home without a campaign')
    await js(async () => { const c = await window.api.campaign.create('Button smoke'); await window.api.campaign.open(c.id) })
    await sleep(800)
    await js((e, h, l) => Promise.all([window.api.entity.save('encounter', e), window.api.entity.save('player-character', h), window.api.entity.save('location', l)]), encounter, hero, vault)
    await sleep(300)

    await clickButton('Home')
    await until(() => !!document.querySelector('.home-party'), 'home')
    await audit('home')
    // Settings, then again with the agent connection on (it shows Copy connection path).
    await openDialog('Settings', 'settings')
    await js(() => document.querySelector('button[title^="Settings"]').click())
    await until(() => !!document.querySelector('.dialog-shell input[type="checkbox"]'), 'the settings dialog')
    await js(() => document.querySelector('.dialog-shell input[type="checkbox"]').click())
    await until(() => document.body.innerText.includes('Copy connection path'), 'the connection path button')
    await audit('settings with the agent on')
    await js(() => document.querySelector('.dialog-shell input[type="checkbox"]').click())
    await escape()
    await sleep(200)
    await openDialog('Keyboard shortcuts', 'keyboard shortcuts')
    await openDialog('Command palette', 'command palette')

    await js(() => [...document.querySelectorAll('nav button')].find(b => b.textContent.trim().endsWith('Locations')).click())
    await until(() => document.body.innerText.includes('Smoke Vault'), 'the location list')
    await audit('location list')
    await clickText('Smoke Vault')
    await until(() => !!document.querySelector('.location-trap'), 'the location page')
    await audit('location page')

    await clickButton('Maps')
    await sleep(300)
    await audit('maps')

    await clickButton('PCs')
    await until(() => !!document.querySelector('.pc-disease'), 'the PCs page')
    await audit('PCs')

    await clickButton('Encounters')
    await until(() => document.body.innerText.includes('Smoke Fight'), 'the encounter list')
    await audit('encounter list')
    await clickText('Smoke Fight')
    await until(() => document.body.innerText.includes('Troll'), 'the encounter editor')
    await audit('encounter editor')
    await clickText('Troll')
    await sleep(300)
    await audit('encounter editor with a preview')
    await js(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Start Combat')).click())
    await sleep(800)
    await audit('initiative entry')
    let state
    for (let i = 0; i < 80 && !(state && Object.keys(state.combatants).length); i++) { await sleep(100); state = await js(() => window.api.combat.setInitiativeFocus(null)).catch(() => null) }
    for (const [i, c] of Object.values(state.combatants).entries()) await js((id, n) => window.api.combat.setInitiative(id, n), c.id, 30 - i)
    await js(() => window.api.combat.start())
    await until(() => !!document.querySelector('.power-card'), 'the combat view')
    await audit('combat')
    await openDialog('Combat log', 'combat log')
    await openDialog('Combat settings', 'combat settings')

    for (const kind of ['Creatures', 'Items', 'Traps', 'Diseases', 'Templates', 'Themes']) {
      await clickButton(kind)
      await until(() => document.querySelectorAll('.record-row').length > 0, `the ${kind} list`)
      await js(() => document.querySelector('.record-row').click())
      await sleep(400)
      await audit(`${kind} preview`)
      await js(() => document.querySelector('.record-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
      await sleep(600)
      await audit(`${kind} editor`)
      if (kind !== 'Traps') continue
      // A first edit adds the campaign copy; its right-click menu holds plain menu items.
      await js(() => { const el = document.querySelector('.compendium-preview input.sb-name'); el.focus(); el.select() })
      await wc.insertText('Button Smoke Trap')
      await until(async () => (await window.api.entity.list('trap')).length > 0, 'the campaign trap')
      await js(() => document.querySelector('.compendium-preview button[aria-label="Done"]').click())
      await until(() => [...document.querySelectorAll('.record-row')].some(r => r.textContent.includes('Button Smoke Trap')), 'the campaign trap row')
      await js(() => { const r = [...document.querySelectorAll('.record-row')].find(r => r.textContent.includes('Button Smoke Trap')); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })) })
      await until(() => !!document.querySelector('.record-menu'), 'the right-click menu')
      await audit('compendium right-click menu')
      await escape()
      await js(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    }

    clearTimeout(timeout)
    if (found.size) {
      console.error(`Buttons that read as plain text (${found.size}):\n` + [...found].map(([line, views]) => `${line} (${views.join(', ')})`).join('\n'))
      finish(1)
      return
    }
    console.log('BUTTON_SMOKE_OK: every text button on the toured views has a border or a fill')
    finish(0)
  } catch (err) {
    console.error(err)
    finish(1)
  }
})
