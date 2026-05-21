import { useUiStore } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { HomeView } from '../campaign/HomeView'
import { NoteEditor } from '../campaign/NoteEditor'
import { CreatureEditor } from '../campaign/CreatureEditor'
import { EncounterEditor } from '../campaign/EncounterEditor'
import { LocationEditor } from '../campaign/LocationEditor'
import { MapEditor } from '../campaign/MapEditor'
import { ItemEditor } from '../campaign/ItemEditor'
import { EntityList } from '../campaign/EntityList'
import { CombatView } from '../combat/CombatView'
import { Dnd4eTrapBrowser } from '../../plugins/dnd-4e/Dnd4eTrapBrowser'
import { Dnd4eDiseaseBrowser } from '../../plugins/dnd-4e/Dnd4eDiseaseBrowser'
import { Dnd4eTemplateBrowser } from '../../plugins/dnd-4e/Dnd4eTemplateBrowser'
import { Dnd4eThemeBrowser } from '../../plugins/dnd-4e/Dnd4eThemeBrowser'

export function ContentArea() {
  const view = useUiStore((s) => s.view)
  const campaignId = useCampaignStore((s) => s.campaignId)

  if (!campaignId) {
    return <HomeView />
  }

  switch (view.type) {
    case 'home':
      return <HomeView />
    case 'note':
      return <NoteEditor noteId={view.noteId} key={view.noteId} />
    case 'creature':
      return <CreatureEditor creatureId={view.creatureId} key={view.creatureId} />
    case 'encounter':
      return <EncounterEditor encounterId={view.encounterId} key={view.encounterId} />
    case 'location':
      return <LocationEditor locationId={view.locationId} key={view.locationId} />
    case 'map':
      return <MapEditor mapId={view.mapId} key={view.mapId} />
    case 'item':
      return <ItemEditor itemId={view.itemId} key={view.itemId} />
    case 'combat':
      return <CombatView />
    case 'entity-list':
      return <EntityList entityType={view.entityType} key={view.entityType} />
    case 'trap-compendium':
      return <Dnd4eTrapBrowser />
    case 'disease-compendium':
      return <Dnd4eDiseaseBrowser />
    case 'template-compendium':
      return <Dnd4eTemplateBrowser />
    case 'theme-compendium':
      return <Dnd4eThemeBrowser />
    default:
      return <HomeView />
  }
}
