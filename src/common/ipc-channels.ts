// IPC channel name constants — single source of truth for main ↔ renderer communication

// Commands (DM renderer → main process via invoke)
export const CMD = {
  // Campaign
  CAMPAIGN_CREATE: 'campaign:create',
  CAMPAIGN_OPEN: 'campaign:open',
  CAMPAIGN_LIST: 'campaign:list',
  CAMPAIGN_GET_META: 'campaign:get-meta',
  CAMPAIGN_UPDATE: 'campaign:update',

  // Entities
  ENTITY_SAVE: 'entity:save',
  ENTITY_DELETE: 'entity:delete',
  ENTITY_GET: 'entity:get',
  ENTITY_LIST: 'entity:list',

  // Notes (special — has tree structure)
  NOTE_SAVE: 'note:save',
  NOTE_DELETE: 'note:delete',
  NOTE_GET: 'note:get',
  NOTE_TREE_GET: 'note:tree:get',
  NOTE_TREE_SAVE: 'note:tree:save',

  // Combat
  COMBAT_INIT: 'combat:init',
  COMBAT_START: 'combat:start',
  COMBAT_SET_INITIATIVE: 'combat:set-initiative',
  COMBAT_SET_INITIATIVE_FOCUS: 'combat:set-initiative-focus',
  COMBAT_SET_PLAYER_EXPAND_CONDITIONS: 'combat:set-player-expand-conditions',
  COMBAT_END_TURN: 'combat:end-turn',
  COMBAT_RESOLVE_ITEM: 'combat:resolve-item',
  COMBAT_RESOLVE_DEATH_SAVE: 'combat:resolve-death-save',
  COMBAT_DELAY: 'combat:delay',
  COMBAT_UNDELAY: 'combat:undelay',
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

  // System
  SYSTEM_GET_PLUGIN: 'system:get-plugin',
  SYSTEM_LIST_PLUGINS: 'system:list-plugins',

  // Links
  LINKS_GET: 'links:get',

  // Images
  IMAGE_IMPORT: 'image:import',
  IMAGE_IMPORT_DIALOG: 'image:import-dialog',
  IMAGE_SAVE_DATA: 'image:save-data',
  IMAGE_GET: 'image:get',

  // Import
  IMPORT_CREATURE: 'import:creature',

  // Annotations (images/tokens on compendium entries)
  ANNOTATION_GET_ALL: 'annotation:get-all',
  ANNOTATION_SAVE: 'annotation:save',

  // Compendium
  COMPENDIUM_INDEX: 'compendium:index',
  COMPENDIUM_GET: 'compendium:get',
  COMPENDIUM_RESOLVE: 'compendium:resolve',
  COMPENDIUM_ITEM_INDEX: 'compendium:item-index',
  COMPENDIUM_ITEM_GET: 'compendium:item-get',
  COMPENDIUM_GLOSSARY: 'compendium:glossary',
  COMPENDIUM_TRAP_INDEX: 'compendium:trap-index',
  COMPENDIUM_TRAP_GET: 'compendium:trap-get',
  COMPENDIUM_DISEASE_INDEX: 'compendium:disease-index',
  COMPENDIUM_DISEASE_GET: 'compendium:disease-get',

  // Player
  PLAYER_READY: 'player:ready',

  // Scene
  SCENE_SET: 'scene:set',
} as const

// Broadcasts (main process → all renderers via send)
export const SYNC = {
  CAMPAIGN_STATE: 'sync:campaign-state',
  COMBAT_STATE: 'sync:combat-state',
  PLAYER_STATE: 'sync:player-state',
  SCENE_STATE: 'sync:scene-state',
  THEME: 'sync:theme',
  ANNOTATIONS: 'sync:annotations',
} as const
