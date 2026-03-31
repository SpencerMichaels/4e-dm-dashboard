import type { PluginUIComponents } from '../plugin-types'
import { Dnd4eCreatureDetails } from './Dnd4eCreatureDetails'
import { Dnd4eCreatureList } from './Dnd4eCreatureList'

const components: PluginUIComponents = {
  CreatureDetails: Dnd4eCreatureDetails,
  CreatureList: Dnd4eCreatureList,
}

export default components
