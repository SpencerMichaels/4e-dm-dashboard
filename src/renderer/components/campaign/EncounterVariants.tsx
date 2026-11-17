// An encounter's level variants (the same encounter planned for several party levels), as a row of level
// tabs under the encounter editor's subheader, and the form that makes a new one: a copy at another level
// with each creature row's level adjustment shifted (`makeVariant`). Shown when the encounter has variants
// or the form is open (the header's variant button opens it).

import { useState } from 'react'
import type { Encounter, Location } from '@common/types'
import { makeVariant, variantsOf } from '@common/rules/encounter-variants'
import { encounterFrame } from '@common/rules/rewards'
import { generateId } from '@common/utils/id'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'

export function EncounterVariants({ encounter, frame, partyLevel, formOpen, onCloseForm, onSave }: {
  encounter: Encounter
  /** The level this encounter is planned for (its own, else the party's now). */
  frame: number | undefined
  partyLevel: number | undefined
  formOpen: boolean
  onCloseForm: () => void
  /** Saves this encounter (it joins the group when its first variant is made). */
  onSave: (patch: Partial<Encounter>) => void
}) {
  const encounters = useCampaignStore(s => s.encounters)
  const locations = useCampaignStore(s => s.locations)
  const setView = useUiStore(s => s.setView)
  const [level, setLevel] = useState('')
  const variants = variantsOf(encounter, encounters, partyLevel)
  if (variants.length < 2 && !formOpen) return null

  const levels = new Set(variants.map(v => encounterFrame(v, partyLevel)))
  const target = Number(level)
  const valid = frame != null && Number.isInteger(target) && target >= 1 && target <= 30 && !levels.has(target)
  const create = async () => {
    if (!valid) return
    const { variant, original } = makeVariant(encounter, target, frame!, generateId(), new Date().toISOString())
    onSave({ level: original.level, variantGroup: original.variantGroup })
    await window.api.entity.save('encounter', variant as unknown as Record<string, unknown>)
    // A variant is linked to the same location as its original.
    const location = locations.find(l => l.id === variant.locationId)
    if (location && !(location.encounterIds ?? []).includes(variant.id)) {
      await window.api.entity.save('location', { ...location, encounterIds: [...(location.encounterIds ?? []), variant.id], updatedAt: new Date().toISOString() } as Location as unknown as Record<string, unknown>)
    }
    setLevel('')
    onCloseForm()
    setView({ type: 'encounter', encounterId: variant.id })
  }

  return (
    <div className="encounter-variants sb-row" style={{ gap: 4, alignItems: 'center', fontSize: 'var(--font-size-xs)', borderBottom: '1px solid var(--sb-separator)' }}>
      <span style={{ color: 'var(--muted)', marginRight: 2 }}>Variants</span>
      {variants.map(v => {
        const l = encounterFrame(v, partyLevel)
        const current = v.id === encounter.id
        return (
          <button key={v.id} className={`btn btn-sm${current ? ' btn-primary' : ''}`} aria-pressed={current} disabled={current}
            onClick={() => setView({ type: 'encounter', encounterId: v.id })}
            title={current ? 'This variant' : `Open the level ${l ?? '?'} variant${v.name !== encounter.name ? ` (${v.name})` : ''}`}>
            L{l ?? '?'}{l === partyLevel ? ' (party)' : ''}
          </button>
        )
      })}
      {formOpen && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          New variant at level
          <input className="ghost" type="number" min={1} max={30} value={level} autoFocus aria-label="Variant level"
            onChange={e => setLevel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') onCloseForm() }}
            style={{ width: '4ch', textAlign: 'center' }} />
          <button className="btn btn-sm" onClick={() => void create()} disabled={!valid}
            title={frame == null ? 'Give this encounter a level first' : levels.has(target) ? 'There is a variant at that level already' : 'Copy this encounter to that level, each creature adjusted by the difference'}>Create</button>
          <button className="btn btn-sm" onClick={onCloseForm}>Cancel</button>
        </span>
      )}
    </div>
  )
}
