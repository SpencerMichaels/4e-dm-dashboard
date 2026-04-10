import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import { getPlugin, getAllPlugins } from '../plugins/plugin-loader'
import { broadcastToAll } from '../windows'
import type { SceneState } from '@common/types'

let currentScene: SceneState = { mode: 'story' }

export function registerSystemHandlers(): void {
  ipcMain.handle(CMD.SYSTEM_GET_PLUGIN, async (_e, pluginId: string) => {
    const plugin = getPlugin(pluginId)
    if (!plugin) return null
    // Return serializable subset (strip functions like turnHooks)
    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      conditions: plugin.conditions,
      statBlockSchema: plugin.statBlockSchema,
      pcSchema: plugin.pcSchema,
      itemSchema: plugin.itemSchema,
      initiativeRules: plugin.initiativeRules,
      hpDescriptors: plugin.hpDescriptors,
      creatureBuilder: plugin.creatureBuilder,
    }
  })

  ipcMain.handle(CMD.SYSTEM_LIST_PLUGINS, async () => {
    return getAllPlugins().map(p => ({ id: p.id, name: p.name, version: p.version }))
  })

  ipcMain.handle(CMD.SCENE_SET, async (_e, scene: SceneState) => {
    currentScene = scene
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
