import type { AppliedCondition } from './system-plugin'

export type CombatPhase = 'initiative-entry' | 'active' | 'ended'

/** Where we are in the turn lifecycle */
export type TurnPhase =
  | 'active'           // Creature's turn is live
  | 'end-of-turn'      // Stepper: DM resolving end-of-turn saves
  | 'end-of-turn-done' // All saves resolved, 1.2s animation pause
  | 'start-of-turn'    // Stepper: DM resolving ongoing damage + recharges

// ─── Combat Event Log ───

export type CombatEventType =
  | 'damage' | 'heal'
  | 'condition-applied' | 'condition-removed'
  | 'save-success' | 'save-fail'
  | 'recharge-success' | 'recharge-fail'
  | 'bloodied' | 'death'
  | 'turn-start' | 'turn-end'
  | 'attack-hit' | 'attack-miss'

export interface CombatEvent {
  timestamp: number
  round: number
  type: CombatEventType
  sourceId?: string
  sourceName?: string
  targetId: string
  targetName: string
  data: Record<string, unknown>
}

export interface AppliedEffect {
  id: string
  name: string
  description?: string
  durationType?: 'rounds' | 'encounter' | 'unlimited'
  durationRounds?: number
  remainingRounds?: number
  sourceId?: string
  appliedConditionIds?: string[]
}

export interface CombatantState {
  id: string
  name: string
  baseName?: string             // Original creature name without color/number — used to recompute display name
  isPC: boolean
  playerName?: string         // For PCs: the player's real name
  initiative?: number
  hp: number
  maxHp: number
  tempHp: number
  dead?: boolean              // Manually marked dead — distinct from hp <= 0 (e.g., trolls regen)
  hiddenDead?: boolean        // Permanently hidden from initiative list after dying (auto-hide feature)
  hidden?: boolean            // Hidden from player display (e.g. ambushers not yet revealed)
  regenInhibited?: boolean    // Set when regen-inhibiting damage is dealt or DM removes Regenerating condition; cleared at turn start
  deathSaveFailures?: number  // Failed death saves accumulated this combat (PCs only)
  conditions: AppliedCondition[]
  effects: AppliedEffect[]
  readiedAction?: string        // Freeform text: what action is readied + trigger
  usedPowers: Record<number, number>
  usedReaction: boolean
  usedActionPoints: number
  miniIndicator?: string
  miniNumber?: number           // Numbered marker (1–9) shown on the token badge
  miniDescriptor?: string       // Short descriptor appended in parens, e.g. "bow" → "Orc Raider (bow)"
  statBlock?: Record<string, unknown>
  imageId?: string
  tokenImageId?: string
  color?: string              // PC chip color or monster mini color (CSS color string)
  entityId?: string
  initiativeGroupId?: string  // Shared by creatures that roll initiative as a unit
}

export type CombatNotificationType =
  | 'recharge-success' | 'recharge-fail'
  | 'save-success' | 'save-fail'
  | 'bloodied' | 'death'
  | 'damage' | 'heal' | 'condition'
  | 'regeneration'

export interface CombatNotification {
  /** Stable id used by the player toast component to dedup re-renders. */
  id?: string
  type: CombatNotificationType
  /** Subject (target) — the creature the event happened *to*. */
  combatantId: string
  combatantName?: string
  message: string
  detail?: string
  /** Source/attacker. Omitted when unknown or self. */
  sourceId?: string
  sourceName?: string
  /** Damage / heal amount */
  amount?: number
  /** True when this damage hit caused the target to cross the bloodied threshold */
  becameBloodied?: boolean
  /** True for ongoing-damage ticks (no source attribution, different verb) */
  ongoing?: boolean
  /** Damage type for damage notifications (e.g. "fire", "necrotic") */
  damageType?: string
  /** Condition id for condition notifications */
  conditionId?: string
  /** Condition display name (handles class-mark short names, customName overrides) */
  conditionName?: string
  /** Wall-clock timestamp (ms since epoch) for client-side aging */
  timestamp?: number
}

/** Structured turn item — displayed on both DM and player screens */
export interface PlayerTurnItem {
  id: string
  phase: 'start' | 'end'
  kind: 'ongoing-damage' | 'sont-expire' | 'eont-expire' | 'save' | 'recharge' | 'death-save' | 'regeneration' | 'revival'
  label: string
  conditionId?: string
  damageType?: string
  value?: number
  dc?: number
  result?: 'success' | 'fail' | 'none'
  /** For sont/eont-expire items where the carrier is *not* the active creature
   *  (i.e. the source applied the condition to a different combatant and it
   *  expires on the source's turn), these point at that other combatant. */
  targetId?: string
  targetName?: string
}

export interface CombatState {
  encounterId?: string
  round: number
  phase: CombatPhase
  turnIndex: number
  initiativeOrder: string[]
  combatants: Record<string, CombatantState>
  delayedIds: string[]
  readiedIds: string[]
  activeInitiativeId?: string
  // Turn phase state machine
  turnPhase: TurnPhase
  turnItems: PlayerTurnItem[]
  stepperIndex: number           // Currently active stepper item (-1 = none)
  playerExpandConditions: boolean
  autoHideDeadCreatures: boolean
  /** Ring buffer of recent notifications (damage/heal/condition/death/etc).
   *  Forwarded into PlayerCombatState; the player window animates new ones in
   *  as toasts. Capped at NOTIFICATION_BUFFER_SIZE. */
  notifications: CombatNotification[]
  /** True if this combat begins with a surprise round (round 0). */
  surpriseRound?: boolean
  /** Combatant IDs that act during the surprise round; everyone else is Surprised. */
  surpriseActorIds?: string[]
}

// Stripped version for player screen
export interface PlayerCombatState {
  round: number
  phase: CombatPhase
  turnIndex: number
  initiativeOrder: string[]
  combatants: Record<string, PlayerCombatantState>
  delayedIds: string[]
  readiedIds: string[]
  activeInitiativeId?: string
  turnPhase: TurnPhase
  turnItems: PlayerTurnItem[]
  stepperIndex: number
  playerExpandConditions: boolean
  notifications: CombatNotification[]
  surpriseRound?: boolean
}

export interface PlayerCombatantState {
  id: string
  name: string
  baseName?: string
  isPC: boolean
  playerName?: string
  initiative?: number
  hpDescriptor: string
  hpPct: number
  hpColor: string
  dead?: boolean
  readiedAction?: string
  deathSaveFailures?: number
  conditions: { conditionId: string; name: string; value?: number; description?: string; customDescription?: string; damageType?: string; durationType?: string; expiresOnName?: string; customColor?: string; customIcon?: string; grantsCATo?: 'all' | 'source' | 'source-allies'; sourceId?: string }[]
  effects: { name: string }[]
  miniIndicator?: string
  miniNumber?: number
  imageId?: string
  tokenImageId?: string
  color?: string
}
