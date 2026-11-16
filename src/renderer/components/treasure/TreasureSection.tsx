// The treasure placed in a location or an encounter: its rows (each with the party level it is planned
// for), and adding an item or monetary treasure here. The same records the Treasure page budgets.

import type { Treasure } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { Icon } from '../shared/Icon'
import { ItemSearch, useItemFacts } from './item-refs'
import { TreasureRow } from './TreasureRow'
import { createTreasure, useParty } from './treasure-data'

type Place = { locationId: string } | { encounterId: string }

export function TreasureSection({ place, label, encounterStyle }: { place: Place; label?: React.ReactNode; encounterStyle?: boolean }) {
  const treasures = useCampaignStore(s => s.treasures)
  const facts = useItemFacts()
  const party = useParty()
  const setView = useUiStore(s => s.setView)
  const here = treasures
    .filter(t => 'locationId' in place ? t.locationId === place.locationId : t.encounterId === place.encounterId)
    .sort((a, b) => a.level - b.level || a.createdAt.localeCompare(b.createdAt))
  const level = party.level ?? 1
  const add = (patch: Partial<Treasure>) => void createTreasure(level, { ...patch, ...place })
  const toPage = () => setView({ type: 'treasure', level: here[0]?.level ?? party.level })
  const controls = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
      <ItemSearch onAdd={item => add({ item })} level={level} style={{ flex: 1, maxWidth: 220 }} />
      <button className="btn btn-sm" onClick={() => add({ money: { text: '', gp: 0 } })} title="Add coins, gems, or art objects">+ Money</button>
      <button className="sb-icon-btn" onClick={toPage} title="Open the Treasure page" aria-label="Open the Treasure page"><Icon name="coins" /></button>
    </span>
  )
  return (
    <div className="treasure-section" style={encounterStyle ? { borderTop: '1px solid var(--sb-separator)' } : { marginBottom: 'var(--space-3)' }}>
      {encounterStyle
        ? <div className="sb-row" style={{ justifyContent: 'space-between', gap: 6 }}><b className="sb-label">Treasure</b>{controls}</div>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{label}{controls}</div>}
      {here.map(t => <TreasureRow key={t.id} treasure={t} facts={t.item ? facts(t.item) : undefined} showLevel />)}
    </div>
  )
}
