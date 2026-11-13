// Diseases by reference (a campaign disease record or a published disease): the names to look for in
// power text, a loader for the kit disease, and chips that show a mentioned disease.

import { useEffect, useMemo, useState } from 'react'
import type { Disease } from '@kit'
import type { DiseaseIndexEntry, DiseaseRef, PcDisease } from '@common/types'
import { findDiseaseMentions, type DiseaseName } from '@common/rules/diseases'
import { useCampaignStore } from '../../stores/campaign-store'
import { DiseaseStatblock } from './DiseaseStatblock'

export const diseaseKey = (ref: DiseaseRef) => ref.diseaseId ? `disease:${ref.diseaseId}` : `published:${ref.compendiumId}`

let publishedIndex: Promise<DiseaseIndexEntry[]> | null = null
const loadIndex = () => publishedIndex ??= window.api.compendium.diseaseIndex()

/** Every disease the campaign knows: Custom records first (they win over a published one of the same name), then published. */
export function useDiseaseNames(): DiseaseName<DiseaseRef>[] {
  const records = useCampaignStore(s => s.diseases)
  const [index, setIndex] = useState<DiseaseIndexEntry[]>([])
  useEffect(() => { void loadIndex().then(setIndex) }, [])
  return useMemo(() => {
    const custom = records.map(r => ({ ref: { diseaseId: r.id }, name: r.content.name }))
    const names = new Set(custom.map(c => c.name.toLowerCase()))
    return [...custom, ...index.filter(e => !names.has(e.name.toLowerCase())).map(e => ({ ref: { compendiumId: e.id }, name: e.name }))]
  }, [records, index])
}

/** The kit disease for a reference: undefined while loading, null when it no longer exists. */
export function useDisease(ref: DiseaseRef | undefined): Disease | null | undefined {
  const records = useCampaignStore(s => s.diseases)
  const [disease, setDisease] = useState<Disease | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setDisease(undefined)
    if (!ref) return
    if (ref.diseaseId) setDisease(records.find(r => r.id === ref.diseaseId)?.content ?? null)
    else if (ref.compendiumId) void window.api.compendium.kitGet('disease', ref.compendiumId).then((d: Disease | null) => { if (!cancelled) setDisease(d) })
    return () => { cancelled = true }
  }, [ref?.diseaseId, ref?.compendiumId, records])
  return disease
}

/** Adds a disease to a PC record as "exposed" (unless the PC already has it). */
export async function exposePc(pcId: string, ref: DiseaseRef) {
  const pc = useCampaignStore.getState().playerCharacters.find(p => p.id === pcId)
  if (!pc || (pc.diseases ?? []).some(d => diseaseKey(d) === diseaseKey(ref))) return
  const now = new Date().toISOString()
  const disease: PcDisease = { ...ref, stage: 'exposed', since: now }
  await window.api.entity.save('player-character', { ...pc, diseases: [...(pc.diseases ?? []), disease], updatedAt: now })
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
            style={{ fontSize: 11, padding: '0 6px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'inherit', cursor: 'pointer' }}>
            🦠 {d.name}
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
