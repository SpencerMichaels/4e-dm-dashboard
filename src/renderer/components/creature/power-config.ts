import type { CreatureBuilderConfig } from '@common/types'

// 4e power vocabulary for the native power editor (PowerEntryEditor).
export const DND4E_ACTION_TYPES = [
  { value: 'standard', label: 'Standard Action', icon: 'Std' },
  { value: 'move', label: 'Move Action', icon: 'Mov' },
  { value: 'minor', label: 'Minor Action', icon: 'Min' },
  { value: 'free', label: 'Free Action', icon: 'Free' },
  { value: 'immediate-interrupt', label: 'Immediate Interrupt', icon: 'Int' },
  { value: 'immediate-reaction', label: 'Immediate Reaction', icon: 'Rcn' },
]
/** Traps and hazards also act with these. */
export const EXTRA_ACTION_TYPES = [
  { value: 'opportunity', label: 'Opportunity Action', icon: 'Opp' },
  { value: 'no-action', label: 'No Action', icon: '—' },
]
export const DND4E_USAGE_TYPES = [
  { value: 'at-will', label: 'At-Will' },
  { value: 'encounter', label: 'Encounter' },
  { value: 'recharge', label: 'Recharge', hasDetail: true, detailPlaceholder: '5-6, when bloodied, etc.' },
]
export const DND4E_RANGE_TYPES = [
  { value: 'melee', label: 'Melee' },
  { value: 'ranged', label: 'Ranged' },
  { value: 'close-burst', label: 'Close burst' },
  { value: 'close-blast', label: 'Close blast' },
  { value: 'area-burst', label: 'Area burst' },
  { value: 'area-wall', label: 'Area wall' },
  { value: 'personal', label: 'Personal' },
]
export const DND4E_TARGET_DEFENSES = ['AC', 'Fortitude', 'Reflex', 'Will']
export const DND4E_TRIGGERED = ['immediate-interrupt', 'immediate-reaction']

/** The grouped power editor configuration used by monster-like statblocks. */
export function powerEditorConfig(config: CreatureBuilderConfig, extraActions = false): CreatureBuilderConfig {
  return {
    ...config,
    actionTypes: extraActions ? [...DND4E_ACTION_TYPES, ...EXTRA_ACTION_TYPES] : DND4E_ACTION_TYPES,
    usageTypes: DND4E_USAGE_TYPES,
    rangeTypes: DND4E_RANGE_TYPES,
    targetDefenses: DND4E_TARGET_DEFENSES,
    triggeredActionTypes: DND4E_TRIGGERED,
    useGroupedActions: true,
  }
}
