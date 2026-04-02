import type { PluginUIComponents } from '../plugin-types'
import { Dnd4eCreatureDetails } from './Dnd4eCreatureDetails'
import { Dnd4eCreatureList } from './Dnd4eCreatureList'
import { Dnd4eItemBrowser } from './Dnd4eItemBrowser'

const components: PluginUIComponents = {
  CreatureDetails: Dnd4eCreatureDetails,
  CreatureList: Dnd4eCreatureList,
  ItemList: Dnd4eItemBrowser,
}

export default components
