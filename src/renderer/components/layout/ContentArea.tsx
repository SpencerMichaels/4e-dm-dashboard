import { useUiStore } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { HomeView } from '../campaign/HomeView'
import { AuthoringView } from '../authoring/AuthoringView'
import { NoteEditor } from '../campaign/NoteEditor'
import { EncounterEditor } from '../campaign/EncounterEditor'
import { LocationEditor } from '../campaign/LocationEditor'
import { MapEditor } from '../campaign/MapEditor'
import { EntityList } from '../campaign/EntityList'
import { CombatView } from '../combat/CombatView'
import { RecordCompendium } from '../compendium/RecordCompendium'
import { ITEM_KIND, MONSTER_KIND, TRAP_KIND, DISEASE_KIND, TEMPLATE_KIND, THEME_KIND } from '../compendium/record-kinds'

export function ContentArea() {
  const view = useUiStore((s) => s.view)
  const campaignId = useCampaignStore((s) => s.campaignId)

  if (view.type === 'authoring') return <AuthoringView draftId={view.draftId} />
  if (!campaignId) {
    return <HomeView />
  }

  switch (view.type) {
    case 'home':
      return <HomeView />
    case 'note':
      return <NoteEditor noteId={view.noteId} key={view.noteId} />
    case 'creature':
      return <RecordCompendium kind={MONSTER_KIND} initialId={view.creatureId} key="creature" />
    case 'encounter':
      return <EncounterEditor encounterId={view.encounterId} key={view.encounterId} />
    case 'location':
      return <LocationEditor locationId={view.locationId} key={view.locationId} />
    case 'map':
      return <MapEditor mapId={view.mapId} key={view.mapId} />
    case 'item':
      return <RecordCompendium kind={ITEM_KIND} initialId={view.itemId} key="item" />
    case 'combat':
      return <CombatView />
    case 'entity-list':
      return <EntityList entityType={view.entityType} key={view.entityType} />
    case 'trap-compendium':
      return <RecordCompendium kind={TRAP_KIND} key="trap" />
    case 'disease-compendium':
      return <RecordCompendium kind={DISEASE_KIND} key="disease" />
    case 'template-compendium':
      return <RecordCompendium kind={TEMPLATE_KIND} key="template" />
    case 'theme-compendium':
      return <RecordCompendium kind={THEME_KIND} key="theme" />
    default:
      return <HomeView />
  }
}
