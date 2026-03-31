import type { ComponentType } from 'react'
import type { Creature, CreatureBuilderConfig } from '@common/types'

/** Props for the system-specific creature details editor */
export interface PluginCreatureDetailsProps {
  creature: Creature
  onSave: (updated: Creature) => void
  config: CreatureBuilderConfig
}

/** What a plugin UI module exports */
export interface PluginUIComponents {
  CreatureDetails?: ComponentType<PluginCreatureDetailsProps>
}
