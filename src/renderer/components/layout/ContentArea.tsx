import { useUiStore } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { HomeView } from '../campaign/HomeView'
import { NoteEditor } from '../campaign/NoteEditor'
import { CreatureEditor } from '../campaign/CreatureEditor'
import { EncounterEditor } from '../campaign/EncounterEditor'
import { LocationEditor } from '../campaign/LocationEditor'
import { ItemEditor } from '../campaign/ItemEditor'
import { PCEditor } from '../campaign/PCEditor'
import { EntityList } from '../campaign/EntityList'
import { CombatView } from '../combat/CombatView'

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
    case 'item':
      return <ItemEditor itemId={view.itemId} key={view.itemId} />
    case 'player-character':
      return <PCEditor pcId={view.pcId} key={view.pcId} />
    case 'combat':
      return <CombatView />
    case 'entity-list':
      return <EntityList entityType={view.entityType} key={view.entityType} />
    default:
      return <HomeView />
  }
}
