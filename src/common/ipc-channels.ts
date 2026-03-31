// IPC channel name constants — single source of truth for main ↔ renderer communication

// Commands (DM renderer → main process via invoke)
export const CMD = {
  // Campaign
  CAMPAIGN_CREATE: 'campaign:create',
  CAMPAIGN_OPEN: 'campaign:open',
  CAMPAIGN_LIST: 'campaign:list',
  CAMPAIGN_GET_META: 'campaign:get-meta',

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
  COMBAT_START: 'combat:start',
  COMBAT_BEGIN: 'combat:begin',
  COMBAT_SET_INITIATIVE: 'combat:set-initiative',
  COMBAT_NEXT_TURN: 'combat:next-turn',
  COMBAT_PREV_TURN: 'combat:prev-turn',
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

  // System
  SYSTEM_GET_PLUGIN: 'system:get-plugin',
  SYSTEM_LIST_PLUGINS: 'system:list-plugins',

  // Links
  LINKS_GET: 'links:get',

  // Images
  IMAGE_IMPORT: 'image:import',

  // Import
  IMPORT_CREATURE: 'import:creature',

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
} as const
