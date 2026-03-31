import type { ComponentType, ReactNode } from 'react'
import type { Creature, CreatureBuilderConfig } from '@common/types'

/** Props for the system-specific creature details editor */
export interface PluginCreatureDetailsProps {
  creature: Creature
  onSave: (updated: Creature) => void
  config: CreatureBuilderConfig
}

/** Props for plugin creature list (replaces EntityList for creatures) */
export interface PluginCreatureListProps {
  creatures: Creature[]
  onNavigate: (creatureId: string) => void
  onCreate: () => void
}

/** What a plugin UI module exports */
export interface PluginUIComponents {
  CreatureDetails?: ComponentType<PluginCreatureDetailsProps>
  CreatureList?: ComponentType<PluginCreatureListProps>
}
