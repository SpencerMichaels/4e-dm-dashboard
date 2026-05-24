// SystemPlugin — the interface every system plugin must implement

export type DurationType = 'save-ends' | 'eont' | 'sont' | 'encounter' | 'indefinite' | 'custom' | 'rounds' | 'minutes' | 'unlimited'

export type AutomationRule =
  | { type: 'decrement' }            // Reduce value by 1 at turn start/end
  | { type: 'remove-at-zero' }       // Auto-remove when value hits 0
  | { type: 'prompt-save'; dc?: string; ability?: string } // Prompt for save at turn start/end
  | { type: 'custom'; hook: string }

export interface ConditionDef {
  id: string
  name: string
  description: string
  hasValue: boolean                   // e.g. Frightened 2 — has a numeric value
  durationTypes: DurationType[]
  automation: AutomationRule[]
  appliedAt?: 'start' | 'end'        // When automation triggers (default: start)
  hidden?: boolean                    // If true, don't show in condition picker (auto-managed)
}

export type SchemaFieldType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'dice'       // Dice expression like "2d6+3"
  | 'group'      // Nested group of fields

export interface SchemaField {
  key: string
  label: string
  type: SchemaFieldType
  required?: boolean
  default?: unknown
  options?: { value: string; label: string }[]  // For select/multiselect
  fields?: SchemaField[]                        // For group type
  placeholder?: string
  min?: number
  max?: number
}

export interface InitiativeRules {
  diceExpression: string              // e.g. "1d20" or "1d20+perception"
  modifierFields: string[]            // Fields from statBlock to use as modifiers
  tiebreaker?: 'modifier' | 'reroll' | 'dm-choice'
}

export interface HpDescriptor {
  minPercent: number                  // Inclusive lower bound
  maxPercent: number                  // Exclusive upper bound
  label: string                       // e.g. "Bloodied", "Barely Standing"
  color: string                       // CSS color for player display
}

export interface TurnAction {
  type: 'auto'                        // Automatically applied
  description: string
  apply: () => void
}

export interface TurnPrompt {
  type: 'prompt'
  description: string                 // e.g. "Save vs Frightened (DC 18)"
  choices: { label: string; action: string }[]
}

export interface TurnHooks {
  onTurnStart?: (combatant: TurnHookCombatant) => (TurnAction | TurnPrompt)[]
  onTurnEnd?: (combatant: TurnHookCombatant) => (TurnAction | TurnPrompt)[]
}

/** Subset of CombatantState passed to turn hooks — avoids circular import */
export interface TurnHookCombatant {
  id: string
  name: string
  isPC: boolean
  hp: number
  maxHp: number
  conditions: AppliedCondition[]
  effects: { id: string; name: string; remainingRounds?: number }[]
  usedPowers: Record<number, number>
  statBlock?: Record<string, unknown>
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
}

export interface SystemTheme {
  cssVariables: Record<string, string>
}

// Creature builder: tier-based stat generation (optional per system)
export interface CreatureBuilderStatDef {
  key: string
  label: string
  tiers: string[]                     // e.g. ['extreme', 'high', 'moderate', 'low']
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
  resistWeakRange?: { [level: number]: { min: number; max: number } }  // PF2e: range
  resistWeakDefault?: { [level: number]: number }                      // 4e: single value auto-set
  damageTypes: string[]
  creatureTraits: string[]
  attackTraits: string[]
  speedTypes: { key: string; label: string }[]
  // If set, all role-based stats use a single shared role selector instead of per-stat tiers
  useSharedRole?: boolean
  roles?: string[]  // e.g. ['skirmisher', 'brute', 'soldier', ...] — displayed as the role picker
  // Label for the actions section (e.g. "Abilities" for PF2e, "Powers" for 4e)
  actionsLabel?: string
  // Action types for powers/attacks (e.g. PF2e: 1/2/3 actions; 4e: standard/move/minor/etc.)
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
  // Monster type modifiers (e.g. 4e elite/solo)
  monsterModifiers?: { value: string; label: string; description?: string }[]
  // Label for weakness/vulnerability entries
  weaknessLabel?: string            // 'Weaknesses' for PF2e, 'Vulnerabilities' for 4e
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
  // Encounter creature modifiers (e.g. "Minion" toggle that sets HP to 1)
  encounterCreatureModifiers?: { value: string; label: string; hpOverride?: number }[]
  // Speed defaults
  defaultSpeed?: number     // default when adding a new speed (25 for PF2e feet, 6 for 4e squares)
  speedStep?: number        // input step (5 for PF2e, 1 for 4e)
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
  statBlockSchema: SchemaField[]
  pcSchema: SchemaField[]
  itemSchema: SchemaField[]
  initiativeRules: InitiativeRules
  hpDescriptors: HpDescriptor[]
  turnHooks: TurnHooks
  creatureBuilder?: CreatureBuilderConfig  // System-specific creature builder
  rechargeRoll?: { die: string; defaultThreshold: number }  // e.g. { die: '1d6', defaultThreshold: 4 }
  theme?: SystemTheme                      // v2
  settings?: SystemSettingDef[]            // Plugin-defined user settings
}
