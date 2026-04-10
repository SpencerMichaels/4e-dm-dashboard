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
  isPC: boolean
  playerName?: string         // For PCs: the player's real name
  initiative?: number
  hp: number
  maxHp: number
  tempHp: number
  conditions: AppliedCondition[]
  effects: AppliedEffect[]
  usedPowers: Record<number, number>
  usedReaction: boolean
  usedActionPoints: number
  miniIndicator?: string
  statBlock?: Record<string, unknown>
  imageId?: string
  tokenImageId?: string
  entityId?: string
}

export type CombatNotificationType =
  | 'recharge-success' | 'recharge-fail'
  | 'save-success' | 'save-fail'
  | 'bloodied' | 'death'

export interface CombatNotification {
  type: CombatNotificationType
  combatantId: string
  message: string
  detail?: string
}

/** Structured turn item — displayed on both DM and player screens */
export interface PlayerTurnItem {
  id: string
  phase: 'start' | 'end'
  kind: 'ongoing-damage' | 'sont-expire' | 'eont-expire' | 'save' | 'recharge'
  label: string
  conditionId?: string
  damageType?: string
  value?: number
  dc?: number
  result?: 'success' | 'fail'
}

export interface CombatState {
  encounterId?: string
  round: number
  phase: CombatPhase
  turnIndex: number
  initiativeOrder: string[]
  combatants: Record<string, CombatantState>
  delayedIds: string[]
  activeInitiativeId?: string
  // Turn phase state machine
  turnPhase: TurnPhase
  turnItems: PlayerTurnItem[]
  stepperIndex: number           // Currently active stepper item (-1 = none)
  playerExpandConditions: boolean
}

// Stripped version for player screen
export interface PlayerCombatState {
  round: number
  phase: CombatPhase
  turnIndex: number
  initiativeOrder: string[]
  combatants: Record<string, PlayerCombatantState>
  activeInitiativeId?: string
  turnPhase: TurnPhase
  turnItems: PlayerTurnItem[]
  stepperIndex: number
  playerExpandConditions: boolean
}

export interface PlayerCombatantState {
  id: string
  name: string
  isPC: boolean
  playerName?: string
  initiative?: number
  hpDescriptor: string
  hpPct: number
  hpColor: string
  conditions: { conditionId: string; name: string; value?: number; description?: string; customDescription?: string; damageType?: string; durationType?: string; expiresOnName?: string }[]
  effects: { name: string }[]
  miniIndicator?: string
  imageId?: string
  tokenImageId?: string
}
