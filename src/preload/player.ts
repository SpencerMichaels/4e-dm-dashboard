import { contextBridge, ipcRenderer } from 'electron'
import { SYNC } from '@common/ipc-channels'

// Player preload — receive-only, no commands

const api = {
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
    theme: (callback: (theme: any) => void) => {
      const handler = (_event: any, theme: any) => callback(theme)
      ipcRenderer.on(SYNC.THEME, handler)
      return () => ipcRenderer.removeListener(SYNC.THEME, handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type PlayerApi = typeof api
