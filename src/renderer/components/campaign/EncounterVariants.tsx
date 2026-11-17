// An encounter's variants (the same encounter planned for several parties: levels and sizes), as a row of
// tabs under the encounter builder's subheader, and the form that makes a new one: a copy for another party with
// each creature row's level adjustment shifted by the difference in level (`makeVariant`). Shown when the
// encounter has variants or the form is open (the header's variant button opens it).

import { useState } from 'react'
import type { Encounter, Location } from '@common/types'
import { makeVariant, variantLabel, variantsOf, type PartyNow } from '@common/rules/encounter-variants'
import { encounterFrame, encounterPartySize } from '@common/rules/rewards'
import { generateId } from '@common/utils/id'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'

export function EncounterVariants({ encounter, frame, party, formOpen, onCloseForm, onSave }: {
  encounter: Encounter
  /** The party this encounter is planned for (its own level and size, else the party's now). */
  frame: { level: number | undefined; size: number }
  /** The active party now: the default frame, and what the tabs mark. */
  party: PartyNow
  formOpen: boolean
  onCloseForm: () => void
  /** Saves this encounter (it joins the group when its first variant is made). */
  onSave: (patch: Partial<Encounter>) => void
}) {
  const encounters = useCampaignStore(s => s.encounters)
  const locations = useCampaignStore(s => s.locations)
  const setView = useUiStore(s => s.setView)
  const [level, setLevel] = useState('')
  const [size, setSize] = useState('')
  const variants = variantsOf(encounter, encounters, party)
  if (variants.length < 2 && !formOpen) return null

  const frameKey = (l: number | undefined, s: number) => `${l}/${s}`
  const taken = new Set(variants.map(v => frameKey(encounterFrame(v, party.level), encounterPartySize(v, party.size))))
  // Empty fields keep this encounter's level or size.
  const target = { level: level ? Number(level) : frame.level ?? 0, size: size ? Number(size) : frame.size }
  const validNumbers = Number.isInteger(target.level) && target.level >= 1 && target.level <= 30 && Number.isInteger(target.size) && target.size >= 1 && target.size <= 12
  const exists = taken.has(frameKey(target.level, target.size))
  const valid = frame.level != null && validNumbers && !exists
  const create = async () => {
    if (!valid) return
    const { variant, original } = makeVariant(encounter, target, { level: frame.level!, size: frame.size }, generateId(), new Date().toISOString())
    onSave({ level: original.level, partySize: original.partySize, variantGroup: original.variantGroup })
    await window.api.entity.save('encounter', variant as unknown as Record<string, unknown>)
    // A variant is linked to the same location as its original.
    const location = locations.find(l => l.id === variant.locationId)
    if (location && !(location.encounterIds ?? []).includes(variant.id)) {
      await window.api.entity.save('location', { ...location, encounterIds: [...(location.encounterIds ?? []), variant.id], updatedAt: new Date().toISOString() } as Location as unknown as Record<string, unknown>)
    }
    setLevel('')
    setSize('')
    onCloseForm()
    setView({ type: 'encounter', encounterId: variant.id })
  }
  const keys = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') onCloseForm() }

  return (
    <div className="encounter-variants sb-row" style={{ gap: 4, alignItems: 'center', fontSize: 'var(--font-size-xs)', borderBottom: '1px solid var(--sb-separator)' }}>
      <span style={{ color: 'var(--muted)', marginRight: 2 }}>Variants</span>
      {variants.map(v => {
        const label = variantLabel(v, variants, party)
        const current = v.id === encounter.id
        const isParty = encounterFrame(v, party.level) === party.level && encounterPartySize(v, party.size) === party.size
        return (
          <button key={v.id} className={`btn btn-sm${current ? ' btn-primary' : ''}`} aria-pressed={current} disabled={current}
            onClick={() => setView({ type: 'encounter', encounterId: v.id })}
            title={current ? 'This variant' : `Open the ${label} variant${v.name !== encounter.name ? ` (${v.name})` : ''}`}>
            {label}{isParty ? ' (party)' : ''}
          </button>
        )
      })}
      {formOpen && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          New variant for
          <input className="ghost" type="number" min={1} max={12} value={size} placeholder={String(frame.size)} aria-label="Variant party size" title="Party size (empty: this encounter's)"
            onChange={e => setSize(e.target.value)} onKeyDown={keys} style={{ width: '4ch', textAlign: 'center' }} />
          PCs at level
          <input className="ghost" type="number" min={1} max={30} value={level} placeholder={frame.level != null ? String(frame.level) : ''} autoFocus aria-label="Variant level" title="Level (empty: this encounter's)"
            onChange={e => setLevel(e.target.value)} onKeyDown={keys} style={{ width: '4ch', textAlign: 'center' }} />
          <button className="btn btn-sm" onClick={() => void create()} disabled={!valid}
            title={frame.level == null ? 'Give this encounter a level first' : exists ? 'There is a variant for that party already' : 'Copy this encounter for that party: each creature adjusted by the difference in level (for a different size, rebalance it with the budget)'}>Create</button>
          <button className="btn btn-sm" onClick={onCloseForm}>Cancel</button>
        </span>
      )}
    </div>
  )
}
