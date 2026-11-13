import { contextBridge, ipcRenderer } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { AppSettings } from '@common/app-settings'

// Player preload — mostly receive-only, with image access

const api = {
  image: {
    get: (imageId: string) => ipcRenderer.invoke(CMD.IMAGE_GET, imageId) as Promise<string | null>,
  },
  // Read-only: the Player window follows the DM's theme
  settings: {
    get: () => ipcRenderer.invoke(CMD.SETTINGS_GET) as Promise<AppSettings>,
  },
  requestState: () => ipcRenderer.invoke(CMD.PLAYER_READY),
  on: {
    playerState: (callback: (state: any) => void) => {
      const handler = (_event: any, state: any) => callback(state)
      ipcRenderer.on(SYNC.PLAYER_STATE, handler)
      return () => ipcRenderer.removeListener(SYNC.PLAYER_STATE, handler)
    },
    combatState: (callback: (state: any) => void) => {
      const handler = (_event: any, state: any) => callback(state)
      ipcRenderer.on(SYNC.COMBAT_STATE, handler)
      return () => ipcRenderer.removeListener(SYNC.COMBAT_STATE, handler)
    },
    sceneState: (callback: (state: any) => void) => {
      const handler = (_event: any, state: any) => callback(state)
      ipcRenderer.on(SYNC.SCENE_STATE, handler)
      return () => ipcRenderer.removeListener(SYNC.SCENE_STATE, handler)
    },
    appSettings: (callback: (settings: AppSettings) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings) => callback(settings)
      ipcRenderer.on(SYNC.APP_SETTINGS, handler)
      return () => ipcRenderer.removeListener(SYNC.APP_SETTINGS, handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type PlayerApi = typeof api
