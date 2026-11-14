import { contextBridge, ipcRenderer } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type {
  AppliedCondition,
  AppliedEffect,
  CombatantState,
  CombatState,
  CompendiumAnnotation,
  EncounterCreature,
  EntityType,
  SceneState,
} from '@common/types'
import type { AppSettings } from '@common/app-settings'
import type { ThemePreference } from '@kit/theme'

// DM preload — full API: commands + sync

const api = {
  authoring: {
    call: (method: string, args: Record<string, unknown> = {}): Promise<any> => ipcRenderer.invoke(CMD.AUTHORING_CALL, method, args),
    onChange: (callback: (event: { draft?: import('../common/authoring/types').Draft; open?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, value: { draft?: import('../common/authoring/types').Draft; open?: string }) => callback(value)
      ipcRenderer.on(SYNC.AUTHORING, handler)
      return () => { ipcRenderer.removeListener(SYNC.AUTHORING, handler) }
    },
  },
  // Campaign commands
  campaign: {
    create: (name: string) => ipcRenderer.invoke(CMD.CAMPAIGN_CREATE, name),
    open: (campaignId: string) => ipcRenderer.invoke(CMD.CAMPAIGN_OPEN, campaignId),
    list: () => ipcRenderer.invoke(CMD.CAMPAIGN_LIST),
    update: (patch: Record<string, unknown>) => ipcRenderer.invoke(CMD.CAMPAIGN_UPDATE, patch),
    delete: (campaignId: string) => ipcRenderer.invoke(CMD.CAMPAIGN_DELETE, campaignId),
  },

  // Entity CRUD
  entity: {
    // `home`: "library" for a Library entry; otherwise the open campaign.
    save: (entityType: EntityType, entity: Record<string, unknown>, home?: string) => ipcRenderer.invoke(CMD.ENTITY_SAVE, entityType, entity, home),
    delete: (entityType: EntityType, entityId: string, home?: string) => ipcRenderer.invoke(CMD.ENTITY_DELETE, entityType, entityId, home),
    get: (entityType: EntityType, entityId: string) => ipcRenderer.invoke(CMD.ENTITY_GET, entityType, entityId),
    list: (entityType: EntityType) => ipcRenderer.invoke(CMD.ENTITY_LIST, entityType),
  },

  // The Library: custom entries shared by every campaign (saved and deleted through entity with home "library").
  library: {
    state: () => ipcRenderer.invoke(CMD.LIBRARY_STATE) as Promise<Record<string, unknown[]>>,
    usage: (entityType: EntityType, id: string) => ipcRenderer.invoke(CMD.LIBRARY_USAGE, entityType, id) as Promise<{ campaignId: string; name: string; uses: number }[]>,
  },

  // Player characters
  pc: {
    /** Imports .dnd4e / .4ecb files: new PCs, or updates (`targetId`: that PC). */
    import: (files: { name: string; text: string }[], targetId?: string): Promise<{ created: string[]; updated: string[]; errors: string[] }> =>
      ipcRenderer.invoke(CMD.PC_IMPORT, files, targetId),
  },

  // Combat commands
  combat: {
    init: (encounterId?: string) => ipcRenderer.invoke(CMD.COMBAT_INIT, encounterId),
    start: () => ipcRenderer.invoke(CMD.COMBAT_START),
    setInitiative: (combatantId: string, initiative: number) =>
      ipcRenderer.invoke(CMD.COMBAT_SET_INITIATIVE, combatantId, initiative),
    setInitiativeFocus: (combatantId: string | null) =>
      ipcRenderer.invoke(CMD.COMBAT_SET_INITIATIVE_FOCUS, combatantId),
    setPlayerExpandConditions: (value: boolean) =>
      ipcRenderer.invoke(CMD.COMBAT_SET_PLAYER_EXPAND_CONDITIONS, value),
    setAutoHideDeadCreatures: (value: boolean) =>
      ipcRenderer.invoke(CMD.COMBAT_SET_AUTO_HIDE_DEAD, value),
    endTurn: () => ipcRenderer.invoke(CMD.COMBAT_END_TURN),
    resolveItem: (index: number, success: boolean) => ipcRenderer.invoke(CMD.COMBAT_RESOLVE_ITEM, index, success),
    resolveDeathSave: (index: number, outcome: 'fail' | 'none' | 'success') => ipcRenderer.invoke(CMD.COMBAT_RESOLVE_DEATH_SAVE, index, outcome),
    reorder: (combatantId: string, newIndex: number) =>
      ipcRenderer.invoke(CMD.COMBAT_REORDER, combatantId, newIndex),
    delay: (combatantId: string) => ipcRenderer.invoke(CMD.COMBAT_DELAY, combatantId),
    undelay: (combatantId: string, afterCombatantId?: string) =>
      ipcRenderer.invoke(CMD.COMBAT_UNDELAY, combatantId, afterCombatantId),
    ready: (combatantId: string, actionText: string) =>
      ipcRenderer.invoke(CMD.COMBAT_READY, combatantId, actionText),
    resolveReady: (combatantId: string) =>
      ipcRenderer.invoke(CMD.COMBAT_RESOLVE_READY, combatantId),
    cancelReady: (combatantId: string) =>
      ipcRenderer.invoke(CMD.COMBAT_CANCEL_READY, combatantId),
    damage: (combatantId: string, amount: number, wasHit: boolean = true, sourceId?: string) => ipcRenderer.invoke(CMD.COMBAT_DAMAGE, combatantId, amount, wasHit, sourceId),
    heal: (combatantId: string, amount: number, sourceId?: string) => ipcRenderer.invoke(CMD.COMBAT_HEAL, combatantId, amount, sourceId),
    addCondition: (combatantId: string, condition: AppliedCondition) =>
      ipcRenderer.invoke(CMD.COMBAT_ADD_CONDITION, combatantId, condition),
    removeCondition: (combatantId: string, conditionId: string) =>
      ipcRenderer.invoke(CMD.COMBAT_REMOVE_CONDITION, combatantId, conditionId),
    addEffect: (combatantId: string, effect: Omit<AppliedEffect, 'id'>) =>
      ipcRenderer.invoke(CMD.COMBAT_ADD_EFFECT, combatantId, effect),
    removeEffect: (combatantId: string, effectId: string) =>
      ipcRenderer.invoke(CMD.COMBAT_REMOVE_EFFECT, combatantId, effectId),
    addCombatant: (combatant: CombatantState) => ipcRenderer.invoke(CMD.COMBAT_ADD_COMBATANT, combatant),
    /** The encounter editor's preview of a row (null theme: none; omitted: the row's own). */
    previewRow: (row: EncounterCreature, theme?: { name: string; attackPower: string; utilityPower: string; skillChoice?: number } | null) =>
      ipcRenderer.invoke(CMD.COMBAT_PREVIEW_ROW, row, theme),
    removeCombatant: (combatantId: string) => ipcRenderer.invoke(CMD.COMBAT_REMOVE_COMBATANT, combatantId),
    updateCombatant: (combatantId: string, updates: Partial<CombatantState>) =>
      ipcRenderer.invoke(CMD.COMBAT_UPDATE_COMBATANT, combatantId, updates),
    usePower: (combatantId: string, powerIndex: number) =>
      ipcRenderer.invoke(CMD.COMBAT_USE_POWER, combatantId, powerIndex),
    unusePower: (combatantId: string, powerIndex: number) =>
      ipcRenderer.invoke(CMD.COMBAT_UNUSE_POWER, combatantId, powerIndex),
    end: () => ipcRenderer.invoke(CMD.COMBAT_END),
    setSurprise: (enabled: boolean, actorIds?: string[]) =>
      ipcRenderer.invoke(CMD.COMBAT_SET_SURPRISE, enabled, actorIds),
  },

  // System
  system: {
    getRules: () => ipcRenderer.invoke(CMD.SYSTEM_GET_RULES),
  },

  // App settings (stored by main in <userData>/app-settings.json)
  settings: {
    get: () => ipcRenderer.invoke(CMD.SETTINGS_GET) as Promise<AppSettings>,
    setTheme: (theme: ThemePreference) => ipcRenderer.invoke(CMD.SETTINGS_SET_THEME, theme) as Promise<AppSettings>,
    setAgentConnection: (on: boolean) => ipcRenderer.invoke(CMD.SETTINGS_SET_AGENT_CONNECTION, on) as Promise<AppSettings>,
  },

  // Images
  image: {
    // `home`: "library" stores the image with the Library (a Library entry's art); otherwise the open campaign.
    import: (sourcePath: string, home?: string) => ipcRenderer.invoke(CMD.IMAGE_IMPORT, sourcePath, home),
    importDialog: (home?: string) => ipcRenderer.invoke(CMD.IMAGE_IMPORT_DIALOG, home) as Promise<string | null>,
    saveData: (base64Data: string, ext: string, home?: string) => ipcRenderer.invoke(CMD.IMAGE_SAVE_DATA, base64Data, ext, home) as Promise<string>,
    get: (imageId: string) => ipcRenderer.invoke(CMD.IMAGE_GET, imageId) as Promise<string | null>,
  },

  // Annotations (images on compendium entries)
  annotation: {
    getAll: () => ipcRenderer.invoke(CMD.ANNOTATION_GET_ALL),
    save: (compendiumId: string, annotation: CompendiumAnnotation) => ipcRenderer.invoke(CMD.ANNOTATION_SAVE, compendiumId, annotation),
  },

  // Compendium
  compendium: {
    index: () => ipcRenderer.invoke(CMD.COMPENDIUM_INDEX),
    itemIndex: () => ipcRenderer.invoke(CMD.COMPENDIUM_ITEM_INDEX),
    itemGet: (itemId: string) => ipcRenderer.invoke(CMD.COMPENDIUM_ITEM_GET, itemId),
    glossary: () => ipcRenderer.invoke(CMD.COMPENDIUM_GLOSSARY),
    trapIndex: () => ipcRenderer.invoke(CMD.COMPENDIUM_TRAP_INDEX),
    trapGet: (trapId: string) => ipcRenderer.invoke(CMD.COMPENDIUM_TRAP_GET, trapId),
    diseaseIndex: () => ipcRenderer.invoke(CMD.COMPENDIUM_DISEASE_INDEX),
    diseaseGet: (diseaseId: string) => ipcRenderer.invoke(CMD.COMPENDIUM_DISEASE_GET, diseaseId),
    kitGet: (kind: 'monster' | 'item' | 'trap' | 'disease' | 'template' | 'theme', id: string) => ipcRenderer.invoke(CMD.COMPENDIUM_KIT_GET, kind, id),
    kitIndex: (kind: 'template' | 'theme') => ipcRenderer.invoke(CMD.COMPENDIUM_KIT_INDEX, kind),
  },

  // Scene
  scene: {
    set: (scene: SceneState) => ipcRenderer.invoke(CMD.SCENE_SET, scene),
  },

  // Player window
  playerWindow: {
    show: () => ipcRenderer.invoke(CMD.PLAYER_WINDOW_SHOW),
  },

  // Sync listeners
  on: {
    campaignState: (callback: (state: Record<string, unknown> | null) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: Record<string, unknown> | null) => callback(state)
      ipcRenderer.on(SYNC.CAMPAIGN_STATE, handler)
      return () => ipcRenderer.removeListener(SYNC.CAMPAIGN_STATE, handler)
    },
    campaignEntityUpdate: (callback: (update: { entityType: EntityType; key: string; data: Record<string, unknown> | null }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, update: { entityType: EntityType; key: string; data: Record<string, unknown> | null }) => callback(update)
      ipcRenderer.on(SYNC.CAMPAIGN_ENTITY_UPDATE, handler)
      return () => ipcRenderer.removeListener(SYNC.CAMPAIGN_ENTITY_UPDATE, handler)
    },
    libraryUpdate: (callback: (update: { entityType: EntityType; key: string; data: unknown[] }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, update: { entityType: EntityType; key: string; data: unknown[] }) => callback(update)
      ipcRenderer.on(SYNC.LIBRARY_UPDATE, handler)
      return () => ipcRenderer.removeListener(SYNC.LIBRARY_UPDATE, handler)
    },
    combatState: (callback: (state: CombatState | null) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: CombatState | null) => callback(state)
      ipcRenderer.on(SYNC.COMBAT_STATE, handler)
      return () => ipcRenderer.removeListener(SYNC.COMBAT_STATE, handler)
    },
    sceneState: (callback: (state: SceneState | null) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: SceneState | null) => callback(state)
      ipcRenderer.on(SYNC.SCENE_STATE, handler)
      return () => ipcRenderer.removeListener(SYNC.SCENE_STATE, handler)
    },
    appSettings: (callback: (settings: AppSettings) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings) => callback(settings)
      ipcRenderer.on(SYNC.APP_SETTINGS, handler)
      return () => ipcRenderer.removeListener(SYNC.APP_SETTINGS, handler)
    },
    annotations: (callback: (annotations: Record<string, CompendiumAnnotation>) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, annotations: Record<string, CompendiumAnnotation>) => callback(annotations)
      ipcRenderer.on(SYNC.ANNOTATIONS, handler)
      return () => ipcRenderer.removeListener(SYNC.ANNOTATIONS, handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type DmApi = typeof api
