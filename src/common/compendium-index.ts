// Compendium index rows from kit entries: the published content pack's (built when a pack is
// installed, src/main/content/store.ts) and the campaign's and Library's custom creatures.

import type { Disease, Item, Monster, MonsterTemplate, MonsterTheme, Trap } from '@kit'
import type { CompendiumEntry, DiseaseIndexEntry, ItemIndexEntry, TrapIndexEntry } from './types/compendium'

const cap = (s: string | null | undefined) => s ? s[0].toUpperCase() + s.slice(1) : ''
const firstBook = (e: { sources: { book: string }[] }) => e.sources[0]?.book ?? ''

export function monsterIndexRow(m: Monster, id: string, source: string): CompendiumEntry {
  return {
    id,
    name: m.name,
    level: m.level ?? 1,
    // A companion or NPC block's class role ("Level 4 Defender") stands in for the monster role.
    role: m.role ?? m.classRole ?? '',
    // Elites and solos are marked; minions show by their quarter XP.
    modifier: m.rank === 'elite' || m.rank === 'solo' ? m.rank : '',
    size: cap(m.size) || 'Medium',
    type: (m.type ?? '').replace(/-/g, ' '),
    origin: m.origin ?? '',
    alignment: m.alignment ?? '',
    xp: m.xp ?? 0,
    source,
  }
}

/** "Wondrous Item", "Neck", or the subtype for slotless items. */
export const itemSlotLabel = (i: Item): string => i.slot === 'wondrous' ? 'Wondrous Item' : i.slot ? cap(i.slot) : i.subtype ?? ''

const levelPrice = (l: Item['levels'][number] | undefined) => !l ? '' : l.price !== null ? `${l.price.toLocaleString('en-US')} gp` : l.priceText ?? ''

export function itemIndexRow(i: Item): ItemIndexEntry {
  const lowest = i.levels.reduce<Item['levels'][number] | undefined>((a, b) => (!a || b.level < a.level ? b : a), undefined)
  const row: ItemIndexEntry = {
    id: i.id,
    name: i.name,
    category: i.category,
    level: i.level,
    rarity: cap(i.rarity),
    price: levelPrice(lowest),
    slot: itemSlotLabel(i),
    source: firstBook(i),
    priceGp: lowest?.price ?? null,
    consumable: /^(consumable|ammunition)$/i.test(i.subtype ?? '') || i.powers.some(p => p.usage === 'consumable'),
  }
  if (i.levels.length > 1) row.maxLevel = Math.max(...i.levels.map(l => l.level))
  if (i.subtype) row.subtype = i.subtype
  if (i.tier) row.tier = i.tier
  if (lowest?.enhancement !== undefined) row.enhancement = lowest.enhancement
  if (i.enhancementTargets) row.enhancementTargets = i.enhancementTargets
  return row
}

export const trapIndexRow = (t: Trap): TrapIndexEntry =>
  ({ id: t.id, name: t.name, trapType: cap(t.kind), level: t.level, role: cap(t.role), xp: t.xp, source: firstBook(t) })

export const diseaseIndexRow = (d: Disease): DiseaseIndexEntry =>
  ({ id: d.id, name: d.name, level: d.level, source: firstBook(d) })

/** Template and theme rows, in RecordCompendium's shape (they have no index type of their own). */
export interface KitIndexRow { id: string; name: string; level: number; cells: string[]; book: string }
export const templateIndexRow = (t: MonsterTemplate): KitIndexRow =>
  ({ id: t.id, name: t.name, level: 0, cells: [t.role, firstBook(t)], book: firstBook(t) })
export const themeIndexRow = (t: MonsterTheme): KitIndexRow =>
  ({ id: t.id, name: t.name, level: 0, cells: [firstBook(t)], book: firstBook(t) })

// Same-named entries (reprints) keep a stable order: by id, numbers compared as numbers (trap40 before trap266).
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, 'en', { numeric: true })
const byLevelName = (a: { id: string; level: number; name: string }, b: { id: string; level: number; name: string }) => a.level - b.level || a.name.localeCompare(b.name) || byId(a, b)
const byName = (a: { id: string; name: string }, b: { id: string; name: string }) => a.name.localeCompare(b.name) || byId(a, b)

/** Every kind's index, sorted as the compendium pages list them. */
export interface PublishedIndexes {
  monsters: CompendiumEntry[]
  items: ItemIndexEntry[]
  traps: TrapIndexEntry[]
  diseases: DiseaseIndexEntry[]
  templates: KitIndexRow[]
  themes: KitIndexRow[]
}

export const EMPTY_INDEXES: PublishedIndexes = { monsters: [], items: [], traps: [], diseases: [], templates: [], themes: [] }

export function sortIndexes(ix: PublishedIndexes): PublishedIndexes {
  return {
    monsters: ix.monsters.sort(byLevelName),
    items: ix.items.sort(byName),
    traps: ix.traps.sort(byLevelName),
    diseases: ix.diseases.sort(byLevelName),
    templates: ix.templates.sort(byName),
    themes: ix.themes.sort(byName),
  }
}
