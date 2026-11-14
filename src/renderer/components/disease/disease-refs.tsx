// Diseases by reference (a campaign disease record, a Library one, or a published disease): the names to look
// for in power text, a loader for the kit disease, and chips that show a mentioned disease.

import { useEffect, useMemo, useState } from 'react'
import type { Disease } from '@kit'
import type { DiseaseIndexEntry, DiseaseRef, PcDisease } from '@common/types'
import { findDiseaseMentions, type DiseaseName } from '@common/rules/diseases'
import { diseaseKey, pcDiseases } from '@common/rules/pc-conditions'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { cachedPerVersion, useContentStore } from '../../stores/content-store'
import { DiseaseStatblock } from './DiseaseStatblock'
import { Icon } from '../shared/Icon'

export { diseaseKey } from '@common/rules/pc-conditions'

const loadIndex = cachedPerVersion<DiseaseIndexEntry[]>(() => window.api.compendium.diseaseIndex())

/**
 * Every disease the campaign knows: its own records first, then the Library's, then published ones; an
 * earlier one wins over a later one of the same name.
 */
export function useDiseaseNames(): DiseaseName<DiseaseRef>[] {
  const records = useCampaignStore(s => s.diseases)
  const library = useLibraryStore(s => s.diseases)
  const [index, setIndex] = useState<DiseaseIndexEntry[]>([])
  const version = useContentStore(s => s.version)
  useEffect(() => { void loadIndex(version).then(setIndex) }, [version])
  return useMemo(() => {
    const names = new Set<string>()
    const unseen = (name: string) => !names.has(name.toLowerCase()) && !!names.add(name.toLowerCase())
    return [
      ...records.filter(r => unseen(r.content.name)).map(r => ({ ref: { diseaseId: r.id }, name: r.content.name })),
      ...library.filter(r => unseen(r.content.name)).map(r => ({ ref: { libraryId: r.id }, name: r.content.name })),
      ...index.filter(e => unseen(e.name)).map(e => ({ ref: { compendiumId: e.id }, name: e.name })),
    ]
  }, [records, library, index])
}

/** The kit disease for a reference: undefined while loading, null when it no longer exists. */
export function useDisease(ref: DiseaseRef | undefined): Disease | null | undefined {
  const records = useCampaignStore(s => s.diseases)
  const library = useLibraryStore(s => s.diseases)
  const [disease, setDisease] = useState<Disease | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setDisease(undefined)
    if (!ref) return
    if (ref.diseaseId) setDisease(records.find(r => r.id === ref.diseaseId)?.content ?? null)
    else if (ref.libraryId) setDisease(library.find(r => r.id === ref.libraryId)?.content ?? null)
    else if (ref.compendiumId) void window.api.compendium.kitGet('disease', ref.compendiumId).then((d: Disease | null) => { if (!cancelled) setDisease(d) })
    return () => { cancelled = true }
  }, [ref?.diseaseId, ref?.libraryId, ref?.compendiumId, records, library])
  return disease
}

/** Adds a disease to a PC's conditions as "exposed" (unless the PC already has it). */
export async function exposePc(pcId: string, ref: DiseaseRef) {
  const pc = useCampaignStore.getState().playerCharacters.find(p => p.id === pcId)
  if (!pc || pcDiseases(pc).some(d => diseaseKey(d) === diseaseKey(ref))) return
  const now = new Date().toISOString()
  const disease: PcDisease = { kind: 'disease', ...ref, stage: 'exposed', since: now }
  await window.api.entity.save('player-character', { ...pc, conditions: [...(pc.conditions ?? []), disease], updatedAt: now })
}

/** Chips for the diseases a power's text exposes its target to; a chip opens the disease. (In combat, the name in the text applies it, like a condition.) */
export function DiseaseChips({ text }: { text: string }) {
  const names = useDiseaseNames()
  const found = useMemo(() => findDiseaseMentions(text, names), [text, names])
  const [open, setOpen] = useState<string | null>(null)
  if (!found.length) return null
  return (
    <div className="disease-chips" style={{ marginTop: 2 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {found.map(d => (
          <button key={diseaseKey(d.ref)} className="disease-chip" onClick={() => setOpen(open === diseaseKey(d.ref) ? null : diseaseKey(d.ref))}
            aria-expanded={open === diseaseKey(d.ref)} title="Show the disease"
            style={{ fontSize: 11, padding: '0 6px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icon name="biohazard" /> {d.name}
          </button>
        ))}
      </div>
      {found.filter(d => diseaseKey(d.ref) === open).map(d => <OpenDisease key={diseaseKey(d.ref)} diseaseRef={d.ref} />)}
    </div>
  )
}

function OpenDisease({ diseaseRef }: { diseaseRef: DiseaseRef }) {
  const disease = useDisease(diseaseRef)
  if (disease === undefined) return <div style={{ fontSize: 11, color: 'var(--muted)' }}>Loading…</div>
  if (!disease) return <div style={{ fontSize: 11, color: 'var(--muted)' }}>This disease no longer exists.</div>
  return <div className="disease-open" style={{ marginTop: 4 }}><DiseaseStatblock disease={disease} /></div>
}

/** "Diseases": every disease the encounter's creatures and traps can expose a target to, with where it comes from. */
export function EncounterDiseases({ sources }: { sources: { from: string; text: string }[] }) {
  const names = useDiseaseNames()
  const found = useMemo(() => {
    const byKey = new Map<string, { name: string; from: string[] }>()
    // Line by line, so exposure wording in one power doesn't pair with a name in another.
    for (const s of sources) for (const d of s.text.split('\n').flatMap(line => findDiseaseMentions(line, names))) {
      const entry = byKey.get(diseaseKey(d.ref)) ?? { name: d.name, from: [] }
      if (!entry.from.includes(s.from)) entry.from.push(s.from)
      byKey.set(diseaseKey(d.ref), entry)
    }
    return [...byKey.values()]
  }, [sources, names])
  if (!found.length) return null
  return (
    <div className="encounter-diseases sb-row" style={{ flexDirection: 'column', alignItems: 'stretch', borderTop: '1px solid var(--sb-separator)' }}>
      <b className="sb-label">Diseases</b>
      {found.map(d => (
        <div key={d.name} style={{ fontSize: 'var(--font-size-xs)' }}>
          <DiseaseChips text={`exposed to ${d.name}`} /> <span style={{ color: 'var(--muted)' }}>from {d.from.join(', ')}</span>
        </div>
      ))}
    </div>
  )
}
