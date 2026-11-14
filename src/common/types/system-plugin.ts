// SystemPlugin — shape of the D&D 4e rules module (src/common/rules/dnd4e.ts)

export type DurationType = 'save-ends' | 'eont' | 'sont' | 'encounter' | 'indefinite' | 'custom' | 'rounds' | 'minutes' | 'unlimited'

export interface ConditionDef {
  id: string
  name: string
  /** One-line rules summary. Book conditions get theirs from the content pack (withConditionText). */
  description?: string
  hasValue: boolean                   // e.g. Frightened 2 — has a numeric value
  hidden?: boolean                    // If true, don't show in condition picker (auto-managed)
}

export interface HpDescriptor {
  minPercent: number                  // Inclusive lower bound
  maxPercent: number                  // Exclusive upper bound
  label: string                       // e.g. "Bloodied", "Barely Standing"
  color: string                       // CSS color for player display (a theme token, e.g. 'var(--hp-low)')
}

export interface AppliedCondition {
  conditionId: string
  customName?: string                  // For custom/ad-hoc conditions not in the system list
  customDescription?: string
  value?: number
  duration?: { type: DurationType; remaining?: number; note?: string; expiresOnId?: string }
  sourceId?: string                   // Who applied it
  customColor?: string                // Optional override for the pill background (e.g. class marks use the source PC's chip color)
  customIcon?: string                 // Optional override for the pill icon (e.g. defender marks use the class feature's icon)
  // Only meaningful for `combat-advantage`: who the affected creature grants CA to.
  //   'all'           — every attacker (default, e.g. plain "grants CA", prone)
  //   'source'        — only the creature in `sourceId` (e.g. "grants CA to the bugbear")
  //   'source-allies' — allies of `sourceId` (e.g. "grants CA to the hag's allies")
  grantsCATo?: 'all' | 'source' | 'source-allies'
  inhibitDamageTypes?: string[]    // Damage types that suppress this regeneration
  saveGroup?: string               // Links conditions so one successful save removes all in the group
  carried?: boolean                // Copied from the PC's lasting conditions when it joined combat (src/common/rules/pc-conditions.ts)
}

// Creature builder: level/role benchmark data for the 4e creature editor
export interface CreatureBuilderStatDef {
  key: string
  label: string
  tiers: readonly string[]            // e.g. ['extreme', 'high', 'moderate', 'low']
  table: { [level: number]: Record<string, number> }
  statBlockKey: string
  statBlockPath?: string[]            // nested path e.g. ['saves', 'fort']
}

export interface CreatureBuilderConfig {
  minLevel: number
  maxLevel: number
  statDefs: CreatureBuilderStatDef[]
  strikeDamageDice?: { [level: number]: Record<string, string> }  // level -> tier -> dice expr (normal/at-will)
  limitedDamageDice?: { [level: number]: Record<string, string> }  // level -> tier -> dice expr (encounter/recharge)
  // Attack bonus tables for inline quick-fill on powers (not shown as top-level rows)
  attackBonusTables?: { key: string; label: string; table: { [level: number]: Record<string, number> } }[]
  damageTypes: string[]
  creatureTraits: string[]
  attackTraits: string[]
  speedTypes: { key: string; label: string }[]
  // If set, all role-based stats use a single shared role selector instead of per-stat tiers
  useSharedRole?: boolean
  roles?: string[]  // e.g. ['skirmisher', 'brute', 'soldier', ...] — displayed as the role picker
  // Action types for powers (standard/move/minor/etc.)
  actionTypes?: { value: string; label: string; icon?: string }[]
  // Power usage options (4e: at-will/encounter/recharge)
  usageTypes?: { value: string; label: string; hasDetail?: boolean; detailPlaceholder?: string }[]
  // Range types for powers (4e: melee/ranged/close burst/close blast/area burst/area wall)
  rangeTypes?: { value: string; label: string }[]
  // Defenses that powers can target (4e: AC/Fortitude/Reflex/Will)
  targetDefenses?: string[]
  // Ability score configuration
  abilityScores?: {
    names: string[]                  // e.g. ['str','dex','con','int','wis','cha']
    pairs?: [string, string][]       // e.g. [['str','con'],['dex','int'],['wis','cha']]
    defensePairs?: { defense: string; abilities: [string, string]; baseOffset: number }[]
    defaultPrimary?: number          // base primary score offset (e.g. 16 for 4e)
    defaultSecondary?: number        // base secondary score offset (e.g. 13)
    defaultLow?: number             // base low score offset (e.g. 10)
    hpAbility?: string              // ability used for HP (e.g. 'con')
    hpBaseline?: number             // assumed baseline score (e.g. 14)
  }
  // Tier display: colors and short labels for tier/role buttons
  tierDisplay?: Record<string, { color: string; label: string }>
  // Available creature sizes
  sizes?: string[]
  // Available alignments (if the system uses a fixed set)
  alignments?: string[]
  // Known skill names for autocomplete
  skills?: string[]
  // Whether the action entry editor uses grouped layout (traits/auras/actions)
  useGroupedActions?: boolean
  // Which action types are "triggered" (show trigger field)
  triggeredActionTypes?: string[]
}

/** A user-facing setting exposed by a system plugin (e.g. "Hide power type text"). */
export interface SystemSettingDef {
  key: string
  label: string
  type: 'boolean' | 'string' | 'number' | 'select'
  default: unknown
  description?: string
  options?: { value: string; label: string }[]  // for type: 'select'
}

export interface SystemPlugin {
  id: string
  name: string
  version: string
  conditions: ConditionDef[]
  hpDescriptors: HpDescriptor[]
  creatureBuilder?: CreatureBuilderConfig  // System-specific creature builder
  settings?: SystemSettingDef[]            // Plugin-defined user settings

}
