// Traps by reference (a campaign trap record or a published trap), shared by encounters and locations:
// the sources to resolve them, a loader for the kit trap, and a search to add one.

import { useEffect, useMemo, useState } from 'react'
import type { Trap } from '@kit'
import type { TrapIndexEntry, TrapRef } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'

export const trapKey = (ref: TrapRef) => ref.trapId ? `trap:${ref.trapId}` : `published:${ref.compendiumId}`

let publishedIndex: Promise<TrapIndexEntry[]> | null = null
const loadIndex = () => publishedIndex ??= window.api.compendium.trapIndex()

/** The published trap index and the campaign's trap records. */
export function useTrapSources() {
  const records = useCampaignStore(s => s.traps)
  const [index, setIndex] = useState<TrapIndexEntry[]>([])
  useEffect(() => { void loadIndex().then(setIndex) }, [])
  return { records, index }
}

/** The kit trap a reference points to: the campaign record, or the published entry converted by main. */
export async function loadTrap(ref: TrapRef, records: { id: string; content: Trap }[]): Promise<Trap | null> {
  if (ref.trapId) return records.find(r => r.id === ref.trapId)?.content ?? null
  return ref.compendiumId ? window.api.compendium.kitGet('trap', ref.compendiumId) : null
}

/** The kit trap for a reference: undefined while loading, null when it no longer exists. */
export function useTrap(ref: TrapRef | undefined): Trap | null | undefined {
  const records = useCampaignStore(s => s.traps)
  const [trap, setTrap] = useState<Trap | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setTrap(undefined)
    if (ref) void loadTrap(ref, records).then(t => { if (!cancelled) setTrap(t) })
    return () => { cancelled = true }
  }, [ref?.trapId, ref?.compendiumId, records])
  return trap
}

/** A search box over Custom and published traps; Enter adds the first match. */
export function TrapSearch({ onAdd, placeholder = '+ Add a trap…', style }: { onAdd: (ref: TrapRef) => void; placeholder?: string; style?: React.CSSProperties }) {
  const { records, index } = useTrapSources()
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const custom = records.filter(r => r.content.name.toLowerCase().includes(q)).map(r => ({ ref: { trapId: r.id }, name: r.content.name, level: r.content.level, label: 'Custom' }))
    const published = index.filter(e => e.name.toLowerCase().includes(q)).map(e => ({ ref: { compendiumId: e.id }, name: e.name, level: e.level, label: e.trapType }))
    return [...custom, ...published].slice(0, 8)
  }, [query, records, index])
  const add = (ref: TrapRef) => { onAdd(ref); setQuery('') }
  const small = { fontSize: 'var(--font-size-xs)' }
  return (
    <div className="trap-search" style={{ position: 'relative', ...style }}>
      <input className="ghost" value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} aria-label="Search traps to add"
        onKeyDown={e => { if (e.key === 'Enter' && results[0]) add(results[0].ref); if (e.key === 'Escape') setQuery('') }}
        style={{ ...small, width: '100%' }} />
      {results.length > 0 && (
        <div className="trap-search-results" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 6px' }}>
          {results.map(r => (
            <button key={trapKey(r.ref)} onClick={() => add(r.ref)}
              style={{ ...small, display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0', color: 'inherit' }}>
              <span>{r.name}</span><span style={{ color: 'var(--muted)' }}>{r.label} · L{r.level}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Several kit traps at once (references that no longer resolve are left out). */
export function useTraps(refs: TrapRef[]): Trap[] {
  const records = useCampaignStore(s => s.traps)
  const [traps, setTraps] = useState<Trap[]>([])
  const key = refs.map(trapKey).join('|')
  useEffect(() => {
    let cancelled = false
    void Promise.all(refs.map(r => loadTrap(r, records))).then(ts => { if (!cancelled) setTraps(ts.filter((t): t is Trap => !!t)) })
    return () => { cancelled = true }
  }, [key, records])
  return traps
}
