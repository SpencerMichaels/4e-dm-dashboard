import type { PluginUIComponents } from '../plugin-types'
import { Dnd4eCreatureDetails } from './Dnd4eCreatureDetails'
import { Dnd4eCreatureList } from './Dnd4eCreatureList'
import { Dnd4eItemBrowser } from './Dnd4eItemBrowser'
import { Dnd4eItemEditor } from './Dnd4eItemEditor'
import { Dnd4eEncounterEditor } from './Dnd4eEncounterEditor'
import { Dnd4eCombatPanel } from './Dnd4eCombatPanel'
import { Dnd4eGroupedCombatPanel } from './Dnd4eGroupedCombatPanel'

const components: PluginUIComponents = {
  CreatureDetails: Dnd4eCreatureDetails,
  CreatureList: Dnd4eCreatureList,
  ItemList: Dnd4eItemBrowser,
  ItemEditor: Dnd4eItemEditor,
  EncounterEditor: Dnd4eEncounterEditor,
  CombatPanel: Dnd4eCombatPanel,
  GroupedCombatPanel: Dnd4eGroupedCombatPanel,
}

export default components
