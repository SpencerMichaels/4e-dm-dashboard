import { useUiStore } from '../../stores/ui-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { HomeView } from '../campaign/HomeView'
import { EncounterEditor } from '../campaign/EncounterEditor'
import { LocationEditor } from '../campaign/LocationEditor'
import { MapEditor } from '../campaign/MapEditor'
import { EntityList } from '../campaign/EntityList'
import { CombatView } from '../combat/CombatView'
import { TreasureView } from '../treasure/TreasureView'
import { RecordCompendium } from '../compendium/RecordCompendium'
import { RECORD_KINDS } from '../compendium/record-kinds'

export function ContentArea() {
  const view = useUiStore((s) => s.view)
  const campaignId = useCampaignStore((s) => s.campaignId)

  // Compendium pages work without a campaign: published entries and Workshop drafts.
  if (view.type === 'compendium') {
    return <RecordCompendium kind={RECORD_KINDS[view.kind]} initialId={view.id} draftId={view.draftId} key={view.kind} />
  }
  if (!campaignId) {
    return <HomeView />
  }

  switch (view.type) {
    case 'home':
      return <HomeView />
    case 'encounter':
      return <EncounterEditor encounterId={view.encounterId} key={view.encounterId} />
    case 'location':
      return <LocationEditor locationId={view.locationId} key={view.locationId} />
    case 'map':
      return <MapEditor mapId={view.mapId} key={view.mapId} />
    case 'treasure':
      return <TreasureView initialLevel={view.level} key={view.level ?? ''} />
    case 'combat':
      return <CombatView />
    case 'entity-list':
      return <EntityList entityType={view.entityType} key={view.entityType} />
    default:
      return <HomeView />
  }
}
