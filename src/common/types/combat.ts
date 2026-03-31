import type { AppliedCondition } from './system-plugin'

export type CombatPhase = 'initiative-entry' | 'active' | 'ended'

export interface AppliedEffect {
  id: string
  name: string
  description?: string
  durationRounds?: number
  remainingRounds?: number
  sourceId?: string              // Combatant who created this effect
  appliedConditionIds?: string[] // Conditions this effect applies/removes
}

export interface CombatantState {
  id: string
  name: string
  isPC: boolean
  initiative?: number
  hp: number
  maxHp: number
  tempHp: number
  conditions: AppliedCondition[]
  effects: AppliedEffect[]
  miniIndicator?: string         // Letter/number/color for tracking minis
  statBlock?: Record<string, unknown>  // Snapshot of creature stats
  imageId?: string
  entityId?: string              // Link back to source creature/PC
}

export interface CombatState {
  encounterId?: string
  round: number
  phase: CombatPhase
  turnIndex: number
  initiativeOrder: string[]      // Sorted combatant IDs
  combatants: Record<string, CombatantState>
  delayedIds: string[]
}

// Stripped version for player screen — no exact HP, no stat blocks
export interface PlayerCombatState {
  round: number
  phase: CombatPhase
  turnIndex: number
  initiativeOrder: string[]
  combatants: Record<string, PlayerCombatantState>
}

export interface PlayerCombatantState {
  id: string
  name: string
  isPC: boolean
  initiative?: number
  hpDescriptor: string           // "Healthy", "Bloodied", etc.
  hpColor: string
  conditions: { name: string; value?: number }[]
  effects: { name: string }[]
  miniIndicator?: string
  imageId?: string
}
