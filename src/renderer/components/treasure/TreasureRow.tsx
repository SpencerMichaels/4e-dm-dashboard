// One treasure as a row: found, what it is (an item, or monetary treasure as text and gp), its value,
// optionally its level frame, where it is placed, and remove. Shared by the Rewards page and the
// location and encounter pages.

import type { Treasure, TreasureSlot } from '@common/types'
import type { ItemFacts } from '@common/rules/treasure'
import { Icon } from '../shared/Icon'
import { deleteTreasure, gp, useLiveTreasure, usePlaces } from './treasure-data'

const small = { fontSize: 'var(--font-size-xs)' }
const muted = { ...small, color: 'var(--muted)', whiteSpace: 'nowrap' as const }

export function TreasureRow({ treasure, facts, showLevel, showPlace = true, slots }: {
  treasure: Treasure
  /** The item's facts (undefined for money; null when the item no longer exists). */
  facts?: ItemFacts | null
  /** Show the level frame (an input), where rows from several levels mix. */
  showLevel?: boolean
  showPlace?: boolean
  /** Empty slots this treasure could fill, for a slot picker (on the Rewards page). */
  slots?: TreasureSlot[]
}) {
  const [t, update] = useLiveTreasure(treasure)
  return (
    <div className="treasure-row sb-row" style={{ gap: 6, alignItems: 'center' }}>
      <input type="checkbox" checked={!!t.found} onChange={e => update({ found: e.target.checked || undefined })}
        title="The party has found this" aria-label="Found" />
      {t.money ? <>
        <input className="ghost" value={t.money.text} placeholder="Coins, gems, art objects…" aria-label="Monetary treasure"
          onChange={e => update({ money: { ...t.money!, text: e.target.value } })} style={{ ...small, flex: 1, minWidth: 0 }} />
        <input className="ghost" type="number" min={0} value={t.money.gp} aria-label="Value in gp" title="Value in gp"
          onChange={e => update({ money: { ...t.money!, gp: Math.max(0, Number(e.target.value) || 0) } })} style={{ ...small, width: 72, textAlign: 'right' }} />
        <span style={muted}>gp</span>
      </> : <>
        <span style={{ ...small, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
          {facts === undefined ? 'Loading…' : facts === null ? 'This item no longer exists' : facts.name}
        </span>
        <span style={muted}>{facts ? facts.consumable ? `L${facts.level} · ${facts.priceGp != null ? gp(facts.priceGp) : 'no price'}` : `L${facts.level}${facts.rarity ? ' ' + facts.rarity : ''}` : ''}</span>
      </>}
      {showLevel && (
        <label style={{ ...muted, display: 'flex', alignItems: 'center', gap: 2 }} title="The party level this treasure is planned for">
          for L<input className="ghost" type="number" min={1} max={30} value={t.level} aria-label="Planned for party level"
            onChange={e => update({ level: Math.min(30, Math.max(1, Number(e.target.value) || 1)), slot: undefined })} style={{ ...small, width: 34, textAlign: 'center' }} />
        </label>
      )}
      {slots && slots.length > 0 && !t.slot && <SlotPicker onPick={slot => update({ slot })} slots={slots} />}
      {showPlace && <PlacePicker treasure={t} onChange={update} />}
      <button onClick={() => void deleteTreasure(t.id)} title="Remove this treasure" aria-label="Remove this treasure"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="x" /></button>
    </div>
  )
}

/** Where a treasure is: unplaced, a location, an encounter, or a quest's reward. */
function PlacePicker({ treasure: t, onChange }: { treasure: Treasure; onChange: (patch: Partial<Treasure>) => void }) {
  const { locations, encounters, quests, placeOf } = usePlaces()
  const place = placeOf(t)
  const value = place ? `${place.kind[0]}:${place.id}` : ''
  return (
    <select className="ghost" value={value} aria-label="Placed in" title="Where the party finds it (a quest: its reward)"
      onChange={e => {
        const [kind, id] = e.target.value.split(':')
        onChange({ locationId: kind === 'l' ? id : undefined, encounterId: kind === 'e' ? id : undefined, questId: kind === 'q' ? id : undefined })
      }}
      style={{ ...small, maxWidth: 160, color: place ? 'inherit' : 'var(--muted)' }}>
      <option value="">Not placed</option>
      {locations.length > 0 && <optgroup label="Locations">{locations.map(l => <option key={l.id} value={`l:${l.id}`}>{l.name}</option>)}</optgroup>}
      {encounters.length > 0 && <optgroup label="Encounters">{encounters.map(e => <option key={e.id} value={`e:${e.id}`}>{e.name}</option>)}</optgroup>}
      {quests.length > 0 && <optgroup label="Quest rewards">{quests.map(q => <option key={q.id} value={`q:${q.id}`}>{q.name}</option>)}</optgroup>}
    </select>
  )
}

function SlotPicker({ slots, onPick }: { slots: TreasureSlot[]; onPick: (key: string) => void }) {
  return (
    <select className="ghost" value="" aria-label="Fill a slot" title="Count this treasure as one of the level's slots"
      onChange={e => e.target.value && onPick(e.target.value)} style={{ ...small, maxWidth: 140, color: 'var(--muted)' }}>
      <option value="">No slot</option>
      {slots.map(s => <option key={s.key} value={s.key}>{s.label}{s.kind === 'item' ? ` (L${s.itemLevel})` : ` (${gp(s.gp ?? 0)})`}</option>)}
    </select>
  )
}
