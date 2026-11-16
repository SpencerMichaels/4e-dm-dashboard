// Items by reference (a campaign item record, a Library one, or a published item), for treasure: the
// sources to resolve them, their budget facts (level, consumable, price), a search to add one, and a
// random pick for suggestions. Library items are used live, like published ones.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ItemIndexEntry, ItemRef } from '@common/types'
import { itemIndexRow } from '@common/compendium-index'
import type { ItemFacts } from '@common/rules/treasure'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { cachedPerVersion, useContentStore } from '../../stores/content-store'

export const itemKey = (ref: ItemRef) => ref.itemId ? `item:${ref.itemId}` : ref.libraryId ? `library:${ref.libraryId}` : `published:${ref.compendiumId}`

const loadIndex = cachedPerVersion<ItemIndexEntry[]>(() => window.api.compendium.itemIndex())

export interface ItemChoice { ref: ItemRef; entry: ItemIndexEntry; label: string }

/** Index rows for the published items, the campaign's item records, and the Library's, each with its reference. */
export function useItemChoices(): ItemChoice[] {
  const records = useCampaignStore(s => s.items)
  const library = useLibraryStore(s => s.items)
  const [index, setIndex] = useState<ItemIndexEntry[]>([])
  const version = useContentStore(s => s.version)
  useEffect(() => { void loadIndex(version).then(setIndex) }, [version])
  return useMemo(() => [
    ...records.filter(r => r.content).map(r => ({ ref: { itemId: r.id }, entry: itemIndexRow(r.content), label: 'Custom' })),
    ...library.filter(r => r.content).map(r => ({ ref: { libraryId: r.id }, entry: itemIndexRow(r.content), label: 'Shared' })),
    ...index.map(e => ({ ref: { compendiumId: e.id }, entry: e, label: e.source })),
  ], [records, library, index])
}

/** Each version of an item: its level and price. */
export const itemVersions = (e: ItemIndexEntry) => e.versions ?? [{ level: e.level, gp: e.priceGp }]

/** The version of an item nearest a level (the lower on a tie). */
export function nearestVersion(e: ItemIndexEntry, level: number): number {
  return itemVersions(e).reduce((best, v) => Math.abs(v.level - level) < Math.abs(best - level) ? v.level : best, itemVersions(e)[0].level)
}

/** Budget facts for an item reference at a version: undefined while the index loads, null when the item no longer exists. */
export function itemFacts(choices: ItemChoice[], ref: ItemRef, itemLevel?: number): ItemFacts | null {
  const c = choices.find(x => itemKey(x.ref) === itemKey(ref))
  if (!c) return null
  const versions = itemVersions(c.entry)
  const v = versions.find(x => x.level === itemLevel) ?? versions[0]
  return { name: c.entry.name, level: v.level, consumable: c.entry.consumable, priceGp: v.gp, rarity: c.entry.rarity || undefined }
}

/** `itemFacts` over the current sources, as a function of a treasure's item. */
export function useItemFacts() {
  const choices = useItemChoices()
  return useCallback((item: (ItemRef & { itemLevel?: number }) | undefined) => item ? itemFacts(choices, item, item.itemLevel) : undefined, [choices])
}

/**
 * A random permanent item with a version at `level` (and of `rarity` when one of that rarity exists),
 * for a suggested treasure. Published, Library and campaign items alike.
 */
export function randomItem(choices: ItemChoice[], level: number, rarity?: string, rng: () => number = Math.random): (ItemRef & { itemLevel: number }) | null {
  const fits = choices.filter(c => !c.entry.consumable && c.entry.category !== 'ritual' && c.entry.category !== 'set' && !c.entry.tier && itemVersions(c.entry).some(v => v.level === level))
  const ofRarity = rarity ? fits.filter(c => c.entry.rarity.toLowerCase() === rarity) : []
  const pool = ofRarity.length ? ofRarity : fits
  if (!pool.length) return null
  const pick = pool[Math.floor(rng() * pool.length)]
  return { ...pick.ref, itemLevel: level }
}

/**
 * A search box over campaign, Library, and published items; Enter adds the first match. With `level`,
 * matches that have a version at that level come first, and the version nearest it is picked.
 */
export function ItemSearch({ onAdd, level, placeholder = '+ Add an item…', style, autoFocus }: {
  onAdd: (item: ItemRef & { itemLevel: number }) => void
  level?: number
  placeholder?: string
  style?: React.CSSProperties
  autoFocus?: boolean
}) {
  const choices = useItemChoices()
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const matches = choices.filter(c => c.entry.name.toLowerCase().includes(q))
    const at = (c: ItemChoice) => level != null && itemVersions(c.entry).some(v => v.level === level) ? 0 : 1
    return matches.sort((a, b) => at(a) - at(b)).slice(0, 8).map(c => {
      const itemLevel = level != null ? nearestVersion(c.entry, level) : c.entry.level
      return { ...c, itemLevel }
    })
  }, [query, choices, level])
  const add = (r: (typeof results)[number]) => { onAdd({ ...r.ref, itemLevel: r.itemLevel }); setQuery('') }
  const small = { fontSize: 'var(--font-size-xs)' }
  return (
    <div className="item-search" style={{ position: 'relative', ...style }}>
      <input className="ghost" value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} aria-label="Search items to add" autoFocus={autoFocus}
        onKeyDown={e => { if (e.key === 'Enter' && results[0]) add(results[0]); if (e.key === 'Escape') setQuery('') }}
        style={{ ...small, width: '100%' }} />
      {results.length > 0 && (
        <div className="item-search-results" role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 6px' }}>
          {results.map(r => (
            <button key={itemKey(r.ref)} role="option" aria-selected={false} onClick={() => add(r)}
              style={{ ...small, display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0', color: 'inherit', textAlign: 'left' }}>
              <span>{r.entry.name}</span>
              <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.label} · L{r.itemLevel}{r.entry.rarity ? ` · ${r.entry.rarity}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
