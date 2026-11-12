import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import dnd4e from '../../common/rules/dnd4e'
import { broadcastToAll, getPlayerWindow, createPlayerWindow } from '../windows'
import type { SceneState } from '@common/types'

let currentScene: SceneState = { mode: 'story' }

export function registerSystemHandlers(): void {
  ipcMain.handle(CMD.SYSTEM_GET_RULES, async () => {
    // Serializable subset of the 4e rules module (no compendium provider)
    return {
      id: dnd4e.id,
      name: dnd4e.name,
      version: dnd4e.version,
      conditions: dnd4e.conditions,
      hpDescriptors: dnd4e.hpDescriptors,
      creatureBuilder: dnd4e.creatureBuilder,
      settings: dnd4e.settings,
    }
  })

  ipcMain.handle(CMD.PLAYER_WINDOW_SHOW, async () => {
    if (!getPlayerWindow()) createPlayerWindow()
    else getPlayerWindow()?.focus()
  })

  ipcMain.handle(CMD.SCENE_SET, async (_e, scene: SceneState) => {
    currentScene = scene
    // Open the player window if it isn't already
    if (!getPlayerWindow()) createPlayerWindow()
    broadcastToAll(SYNC.SCENE_STATE, currentScene)
    return currentScene
  })
}

export function getCurrentScene(): SceneState {
  return currentScene
}

export function setCurrentScene(scene: SceneState): void {
  currentScene = scene
}
