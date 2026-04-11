import type { ComponentType, ReactNode } from 'react'
import type { Creature, CreatureBuilderConfig, Item, Encounter, CombatantState, CombatNotification, CombatState } from '@common/types'
import type { ConditionDef } from '@common/types/system-plugin'

/** Props for the system-specific creature details editor */
export interface PluginCreatureDetailsProps {
  creature: Creature
  onSave: (updated: Creature) => void
  config: CreatureBuilderConfig
  /** When true, render in a single-column layout (for narrow inline panes) */
  compact?: boolean
}

/** Props for plugin creature list (replaces EntityList for creatures) */
export interface PluginCreatureListProps {
  creatures: Creature[]
  onNavigate: (creatureId: string) => void
  onCreate: () => void
}

/** Props for plugin item list (replaces EntityList for items) */
export interface PluginItemListProps {
  items: any[]
  onNavigate: (itemId: string) => void
  onCreate: () => void
}

/** Props for plugin item editor */
export interface PluginItemEditorProps {
  item: Item
  onSave: (updated: Item) => void
}

/** Props for plugin encounter editor */
export interface PluginEncounterEditorProps {
  encounter: Encounter
  onSave: (updated: Encounter) => void
  creatures: Creature[]
  onNavigate: (creatureId: string) => void
}

/** Props for the system-specific combat detail panel */
export interface PluginCombatPanelProps {
  combatant: CombatantState
  combat: CombatState
  isCurrent: boolean
  isDelayed: boolean
  onUsePower: (powerIndex: number) => void
  onUnusePower: (powerIndex: number) => void
  onQuickDamage: (amount: number) => void
  onDamage: () => void
  onHeal: () => void
  onAddCondition: () => void
  onAddEffect: () => void
  onDelay: () => void
  onUndelay: () => void
  onRemove: () => void
  conditions: ConditionDef[]
  notifications: CombatNotification[]
  onPinCard: (card: { combatantName: string; title: string; content: any; key: string }) => void
  pinnedKeys: Set<string>
  onPopoutStatblock?: (combatantId: string) => void
  onApplyConditionToTargets: (condition: { conditionId: string; value?: number; customDescription?: string; sourceId?: string; duration?: { type: string; remaining?: number; expiresOnId?: string } }, multi: boolean) => void
}

/** What a plugin UI module exports */
export interface PluginUIComponents {
  CreatureDetails?: ComponentType<PluginCreatureDetailsProps>
  CreatureList?: ComponentType<PluginCreatureListProps>
  ItemList?: ComponentType<PluginItemListProps>
  ItemEditor?: ComponentType<PluginItemEditorProps>
  EncounterEditor?: ComponentType<PluginEncounterEditorProps>
  CombatPanel?: ComponentType<PluginCombatPanelProps>
}
