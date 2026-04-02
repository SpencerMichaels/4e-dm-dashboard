import { contextBridge, ipcRenderer } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'

// DM preload — full API: commands + sync

const api = {
  // Campaign commands
  campaign: {
    create: (name: string, systemId: string) => ipcRenderer.invoke(CMD.CAMPAIGN_CREATE, name, systemId),
    open: (campaignId: string) => ipcRenderer.invoke(CMD.CAMPAIGN_OPEN, campaignId),
    list: () => ipcRenderer.invoke(CMD.CAMPAIGN_LIST),
  },

  // Entity CRUD
  entity: {
    save: (entityType: string, entity: any) => ipcRenderer.invoke(CMD.ENTITY_SAVE, entityType, entity),
    delete: (entityType: string, entityId: string) => ipcRenderer.invoke(CMD.ENTITY_DELETE, entityType, entityId),
    get: (entityType: string, entityId: string) => ipcRenderer.invoke(CMD.ENTITY_GET, entityType, entityId),
    list: (entityType: string) => ipcRenderer.invoke(CMD.ENTITY_LIST, entityType),
  },

  // Notes
  note: {
    save: (note: any) => ipcRenderer.invoke(CMD.NOTE_SAVE, note),
    delete: (noteId: string) => ipcRenderer.invoke(CMD.NOTE_DELETE, noteId),
    get: (noteId: string) => ipcRenderer.invoke(CMD.NOTE_GET, noteId),
    treeGet: () => ipcRenderer.invoke(CMD.NOTE_TREE_GET),
    treeSave: (tree: any) => ipcRenderer.invoke(CMD.NOTE_TREE_SAVE, tree),
  },

  // Combat commands
  combat: {
    start: (encounterId?: string) => ipcRenderer.invoke(CMD.COMBAT_START, encounterId),
    begin: () => ipcRenderer.invoke(CMD.COMBAT_BEGIN),
    setInitiative: (combatantId: string, initiative: number) =>
      ipcRenderer.invoke(CMD.COMBAT_SET_INITIATIVE, combatantId, initiative),
    nextTurn: () => ipcRenderer.invoke(CMD.COMBAT_NEXT_TURN),
    prevTurn: () => ipcRenderer.invoke(CMD.COMBAT_PREV_TURN),
    delay: (combatantId: string) => ipcRenderer.invoke(CMD.COMBAT_DELAY, combatantId),
    undelay: (combatantId: string, afterCombatantId?: string) =>
      ipcRenderer.invoke(CMD.COMBAT_UNDELAY, combatantId, afterCombatantId),
    damage: (combatantId: string, amount: number) => ipcRenderer.invoke(CMD.COMBAT_DAMAGE, combatantId, amount),
    heal: (combatantId: string, amount: number) => ipcRenderer.invoke(CMD.COMBAT_HEAL, combatantId, amount),
    addCondition: (combatantId: string, condition: any) =>
      ipcRenderer.invoke(CMD.COMBAT_ADD_CONDITION, combatantId, condition),
    removeCondition: (combatantId: string, conditionId: string) =>
      ipcRenderer.invoke(CMD.COMBAT_REMOVE_CONDITION, combatantId, conditionId),
    addEffect: (combatantId: string, effect: any) =>
      ipcRenderer.invoke(CMD.COMBAT_ADD_EFFECT, combatantId, effect),
    removeEffect: (combatantId: string, effectId: string) =>
      ipcRenderer.invoke(CMD.COMBAT_REMOVE_EFFECT, combatantId, effectId),
    addCombatant: (combatant: any) => ipcRenderer.invoke(CMD.COMBAT_ADD_COMBATANT, combatant),
    removeCombatant: (combatantId: string) => ipcRenderer.invoke(CMD.COMBAT_REMOVE_COMBATANT, combatantId),
    updateCombatant: (combatantId: string, updates: any) =>
      ipcRenderer.invoke(CMD.COMBAT_UPDATE_COMBATANT, combatantId, updates),
    end: () => ipcRenderer.invoke(CMD.COMBAT_END),
  },

  // System
  system: {
    getPlugin: (pluginId: string) => ipcRenderer.invoke(CMD.SYSTEM_GET_PLUGIN, pluginId),
    listPlugins: () => ipcRenderer.invoke(CMD.SYSTEM_LIST_PLUGINS),
  },

  // Links
  links: {
    get: () => ipcRenderer.invoke(CMD.LINKS_GET),
  },

  // Images
  image: {
    import: (sourcePath: string) => ipcRenderer.invoke(CMD.IMAGE_IMPORT, sourcePath),
  },

  // Import
  importer: {
    creature: (url: string) => ipcRenderer.invoke(CMD.IMPORT_CREATURE, url),
  },

  // Compendium
  compendium: {
    index: (systemId: string) => ipcRenderer.invoke(CMD.COMPENDIUM_INDEX, systemId),
    get: (systemId: string, monsterId: string) => ipcRenderer.invoke(CMD.COMPENDIUM_GET, systemId, monsterId),
    itemIndex: (systemId: string) => ipcRenderer.invoke(CMD.COMPENDIUM_ITEM_INDEX, systemId),
    itemGet: (systemId: string, itemId: string) => ipcRenderer.invoke(CMD.COMPENDIUM_ITEM_GET, systemId, itemId),
  },

  // Scene
  scene: {
    set: (scene: any) => ipcRenderer.invoke(CMD.SCENE_SET, scene),
  },

  // Sync listeners
  on: {
    campaignState: (callback: (state: any) => void) => {
      const handler = (_event: any, state: any) => callback(state)
      ipcRenderer.on(SYNC.CAMPAIGN_STATE, handler)
      return () => ipcRenderer.removeListener(SYNC.CAMPAIGN_STATE, handler)
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

export type DmApi = typeof api
