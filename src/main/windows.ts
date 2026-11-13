import { BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { isDarkTheme } from './data/app-settings-store'
const isDev = process.env.NODE_ENV !== 'production'

// Shown before the page paints; matches --background in vendor/4e-kit/styles/tokens.css
export function windowBackground(): string {
  return isDarkTheme() ? '#111727' : '#eef2f6'
}

let dmWindow: BrowserWindow | null = null
let playerWindow: BrowserWindow | null = null

export function getDmWindow(): BrowserWindow | null {
  return dmWindow
}

export function getPlayerWindow(): BrowserWindow | null {
  return playerWindow
}

export function createDmWindow(): BrowserWindow {
  dmWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '4e DM Dashboard — DM',
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  dmWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    dmWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/renderer/index.html')
  } else {
    dmWindow.loadFile(join(__dirname, '../renderer/renderer/index.html'))
  }

  dmWindow.on('closed', () => {
    dmWindow = null
  })

  return dmWindow
}

export function createPlayerWindow(): BrowserWindow {
  const displays = screen.getAllDisplays()
  const externalDisplay = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0)

  const bounds = externalDisplay
    ? { x: externalDisplay.bounds.x, y: externalDisplay.bounds.y }
    : {}

  playerWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    ...bounds,
    title: '4e DM Dashboard — Player',
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/player.js'),
      sandbox: false,
    },
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    playerWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/player/index.html')
  } else {
    playerWindow.loadFile(join(__dirname, '../renderer/player/index.html'))
  }

  playerWindow.on('closed', () => {
    playerWindow = null
  })

  return playerWindow
}

export function broadcastToDm(channel: string, ...args: unknown[]): void {
  dmWindow?.webContents.send(channel, ...args)
}

export function broadcastToPlayer(channel: string, ...args: unknown[]): void {
  playerWindow?.webContents.send(channel, ...args)
}

export function broadcastToAll(channel: string, ...args: unknown[]): void {
  broadcastToDm(channel, ...args)
  broadcastToPlayer(channel, ...args)
}
