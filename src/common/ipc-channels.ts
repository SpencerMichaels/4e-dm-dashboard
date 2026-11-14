// IPC channel name constants — single source of truth for main ↔ renderer communication

// Commands (DM renderer → main process via invoke)
export const CMD = {
  AUTHORING_CALL: 'authoring:call',
  // Campaign
  CAMPAIGN_CREATE: 'campaign:create',
  CAMPAIGN_OPEN: 'campaign:open',
  CAMPAIGN_LIST: 'campaign:list',
  CAMPAIGN_UPDATE: 'campaign:update',
  CAMPAIGN_DELETE: 'campaign:delete',

  // Entities
  ENTITY_SAVE: 'entity:save',
  ENTITY_DELETE: 'entity:delete',
  ENTITY_GET: 'entity:get',
  ENTITY_LIST: 'entity:list',

  // Player characters: import .dnd4e / .4ecb sheets
  PC_IMPORT: 'pc:import',

  // Notes (tree structure)
  NOTE_TREE_GET: 'note:tree:get',
  NOTE_TREE_SAVE: 'note:tree:save',

  // Combat
  COMBAT_INIT: 'combat:init',
  COMBAT_START: 'combat:start',
  COMBAT_SET_INITIATIVE: 'combat:set-initiative',
  COMBAT_SET_INITIATIVE_FOCUS: 'combat:set-initiative-focus',
  COMBAT_SET_PLAYER_EXPAND_CONDITIONS: 'combat:set-player-expand-conditions',
  COMBAT_SET_AUTO_HIDE_DEAD: 'combat:set-auto-hide-dead',
  COMBAT_END_TURN: 'combat:end-turn',
  COMBAT_RESOLVE_ITEM: 'combat:resolve-item',
  COMBAT_RESOLVE_DEATH_SAVE: 'combat:resolve-death-save',
  COMBAT_DELAY: 'combat:delay',
  COMBAT_UNDELAY: 'combat:undelay',
  COMBAT_READY: 'combat:ready',
  COMBAT_RESOLVE_READY: 'combat:resolve-ready',
  COMBAT_CANCEL_READY: 'combat:cancel-ready',
  COMBAT_DAMAGE: 'combat:damage',
  COMBAT_HEAL: 'combat:heal',
  COMBAT_ADD_CONDITION: 'combat:add-condition',
  COMBAT_REMOVE_CONDITION: 'combat:remove-condition',
  COMBAT_ADD_EFFECT: 'combat:add-effect',
  COMBAT_REMOVE_EFFECT: 'combat:remove-effect',
  COMBAT_ADD_COMBATANT: 'combat:add-combatant',
  COMBAT_REMOVE_COMBATANT: 'combat:remove-combatant',
  COMBAT_END: 'combat:end',
  COMBAT_UPDATE_COMBATANT: 'combat:update-combatant',
  COMBAT_USE_POWER: 'combat:use-power',
  COMBAT_UNUSE_POWER: 'combat:unuse-power',
  COMBAT_SET_SURPRISE: 'combat:set-surprise',
  COMBAT_REORDER: 'combat:reorder',
  COMBAT_PREVIEW_ROW: 'combat:preview-row',

  // System
  SYSTEM_GET_RULES: 'system:get-rules',

  // App settings (<userData>/app-settings.json)
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_THEME: 'settings:set-theme',
  SETTINGS_DISMISS_TIP: 'settings:dismiss-tip',

  // Links
  LINKS_GET: 'links:get',

  // Images
  IMAGE_IMPORT: 'image:import',
  IMAGE_IMPORT_DIALOG: 'image:import-dialog',
  IMAGE_SAVE_DATA: 'image:save-data',
  IMAGE_GET: 'image:get',

  // Annotations (images/tokens on compendium entries)
  ANNOTATION_GET_ALL: 'annotation:get-all',
  ANNOTATION_SAVE: 'annotation:save',

  // Compendium
  COMPENDIUM_INDEX: 'compendium:index',
  COMPENDIUM_ITEM_INDEX: 'compendium:item-index',
  COMPENDIUM_ITEM_GET: 'compendium:item-get',
  COMPENDIUM_GLOSSARY: 'compendium:glossary',
  COMPENDIUM_TRAP_INDEX: 'compendium:trap-index',
  COMPENDIUM_TRAP_GET: 'compendium:trap-get',
  COMPENDIUM_DISEASE_INDEX: 'compendium:disease-index',
  COMPENDIUM_DISEASE_GET: 'compendium:disease-get',
  /** A published entry converted to the kit schema (traps, diseases, templates, themes). */
  COMPENDIUM_KIT_GET: 'compendium:kit-get',
  /** Index rows for kinds without a parsed index (templates, themes). */
  COMPENDIUM_KIT_INDEX: 'compendium:kit-index',

  // Player
  PLAYER_READY: 'player:ready',

  // Scene
  SCENE_SET: 'scene:set',
  PLAYER_WINDOW_SHOW: 'player-window:show',
} as const

// Broadcasts (main process → all renderers via send)
export const SYNC = {
  AUTHORING: 'sync:authoring',
  CAMPAIGN_STATE: 'sync:campaign-state',
  CAMPAIGN_ENTITY_UPDATE: 'sync:campaign-entity-update',
  COMBAT_STATE: 'sync:combat-state',
  PLAYER_STATE: 'sync:player-state',
  SCENE_STATE: 'sync:scene-state',
  ANNOTATIONS: 'sync:annotations',
  APP_SETTINGS: 'sync:app-settings',
} as const
