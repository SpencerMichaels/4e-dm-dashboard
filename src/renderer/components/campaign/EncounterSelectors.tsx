// The encounter builder's selectors, as tabs under the encounter: Monsters (the creature search), Traps, Skill challenges and
// Items (the compendium pages' lists: published, Shared and campaign entries). Click previews on the right;
// double click adds to the encounter (a creature row, a trap row, or treasure placed in this encounter).

import { useEffect, useState } from 'react'
import type { Item } from '@kit'
import type { EncounterChallenge, ItemRef, TrapRef } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { ItemStatblock } from '../item/ItemStatblock'
import { RecordListPanel, type RecordListState } from '../compendium/RecordList'
import type { RecordRow } from '../compendium/RecordCompendium'

export type SelectorTab = 'monsters' | 'traps' | 'items' | 'challenges'
const TABS: { key: SelectorTab; label: string }[] = [{ key: 'monsters', label: 'Monsters' }, { key: 'traps', label: 'Traps' }, { key: 'challenges', label: 'Skill challenges' }, { key: 'items', label: 'Items' }]

/** What the builder previews from a selector: a trap, a skill challenge or an item, by reference (`key` identifies the row). */
export type SelectorPick = { kind: 'trap'; ref: TrapRef; key: string } | { kind: 'challenge'; ref: EncounterChallenge; key: string } | { kind: 'item'; ref: ItemRef & { itemLevel: number }; key: string }

const rowKey = (r: RecordRow) => `${r.custom ? (r.library ? 'library' : 'campaign') : 'published'}:${r.id}`
export const trapRefOf = (r: RecordRow): TrapRef => r.custom ? (r.library ? { libraryId: r.id } : { trapId: r.id }) : { compendiumId: r.id }
export const challengeRefOf = (r: RecordRow): EncounterChallenge => r.custom ? (r.library ? { libraryId: r.id } : { challengeId: r.id }) : { compendiumId: r.id }
/** An item row as treasure: its lowest version. */
export const itemRefOf = (r: RecordRow): ItemRef & { itemLevel: number } => ({ ...(r.custom ? (r.library ? { libraryId: r.id } : { itemId: r.id }) : { compendiumId: r.id }), itemLevel: r.level })

export function SelectorTabs({ tab, onTab }: { tab: SelectorTab; onTab: (t: SelectorTab) => void }) {
  return (
    <div className="encounter-selector-tabs" role="tablist" aria-label="Add to the encounter" style={{ display: 'flex', gap: 4, flexShrink: 0, marginBottom: -8 }}>
      {TABS.map(t => <button key={t.key} role="tab" aria-selected={tab === t.key} className={`btn btn-sm${tab === t.key ? ' btn-primary' : ''}`} onClick={() => onTab(t.key)}>{t.label}</button>)}
    </div>
  )
}

/** A Traps, Skill challenges or Items list: click picks it for the preview, double click adds it. */
export function RecordSelector({ list, pick, onPick, onAdd, kind, headerExtra }: {
  list: RecordListState
  pick: SelectorPick | null
  onPick: (p: SelectorPick) => void
  onAdd: (r: RecordRow) => void
  kind: 'trap' | 'challenge' | 'item'
  headerExtra?: React.ReactNode
}) {
  const toPick = (r: RecordRow): SelectorPick => kind === 'trap' ? { kind, ref: trapRefOf(r), key: rowKey(r) } : kind === 'challenge' ? { kind, ref: challengeRefOf(r), key: rowKey(r) } : { kind, ref: itemRefOf(r), key: rowKey(r) }
  return (
    <RecordListPanel list={list} className={`stat-block-4e record-compendium encounter-selector encounter-selector-${kind}s`}
      style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12 }}
      isActive={r => pick?.kind === kind && pick.key === rowKey(r)}
      onSelect={r => onPick(toPick(r))} onActivate={r => onAdd(r)} headerExtra={headerExtra} />
  )
}

/** An item's stat block by reference: a campaign or Library record, or a published item. */
export function ItemPreview({ item }: { item: ItemRef }) {
  const records = useCampaignStore(s => s.items)
  const library = useLibraryStore(s => s.items)
  const [published, setPublished] = useState<Item | null>(null)
  useEffect(() => {
    let cancelled = false
    setPublished(null)
    if (item.compendiumId) void window.api.compendium.kitGet('item', item.compendiumId).then((i: Item | null) => { if (!cancelled) setPublished(i) })
    return () => { cancelled = true }
  }, [item.compendiumId])
  const content = item.itemId ? records.find(r => r.id === item.itemId)?.content : item.libraryId ? library.find(r => r.id === item.libraryId)?.content : published
  return content ? <ItemStatblock item={content} /> : null
}
