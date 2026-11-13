import type { CombatantState, CombatNotification, CombatState } from '@common/types'
import type { ConditionDef } from '@common/types/system-plugin'

/** Props for the system-specific combat detail panel */
export interface PluginCombatPanelProps {
  combatant: CombatantState
  combat: CombatState
  isCurrent: boolean
  isDelayed: boolean
  isReadied?: boolean
  onUsePower: (powerIndex: number) => void
  onUnusePower: (powerIndex: number) => void
  onQuickDamage: (amount: number) => void
  onDamage: () => void
  onHeal: () => void
  onAddCondition: () => void
  onAddEffect: () => void
  onDelay: () => void
  onUndelay: () => void
  onReady?: () => void
  onResolveReady?: () => void
  onCancelReady?: () => void
  onRemove: () => void
  conditions: ConditionDef[]
  notifications: CombatNotification[]
  onPinCard: (card: { combatantName: string; title: string; content: any; key: string }) => void
  pinnedKeys: Set<string>
  onPopoutStatblock?: (combatantId: string) => void
  /** Traps: a countermeasure stopped it, or it works again. */
  onToggleDisabled?: () => void
  onApplyConditionToTargets: (condition: { conditionId: string; value?: number; customDescription?: string; sourceId?: string; duration?: { type: string; remaining?: number; expiresOnId?: string } }, multi: boolean) => void
  /** A disease named in a power: select PCs to expose (tracked on their PC records). */
  onApplyDiseaseToTargets?: (disease: import('@common/types').DiseaseRef, name: string, multi: boolean) => void
  /** When true, hide powers that require a standard, move, or minor action */
  hideMainActionPowers?: boolean
}

/** Props for the grouped combat panel (multiple creatures of the same base type) */
export interface GroupedCombatPanelProps {
  combatants: CombatantState[]
  combat: CombatState
  conditions: ConditionDef[]
  notifications: CombatNotification[]
  onDamage: (combatantId: string) => void
  onHeal: (combatantId: string) => void
  onAddCondition: (combatantId: string) => void
  onAddEffect: (combatantId: string) => void
  hideMainActionPowers?: boolean
  onPinCard: (card: { combatantName: string; title: string; content: any; key: string }) => void
  pinnedKeys: Set<string>
  onPopoutStatblock?: (combatantId: string) => void
}
