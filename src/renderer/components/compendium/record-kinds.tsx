// Kind adapters for RecordCompendium: where each kind's published entries come from, how a row
// reads, and which statblock shows and edits it.

import type { Disease, Item, Monster, MonsterTemplate, MonsterTheme, SkillChallenge, Trap } from '@kit'
import type { CompendiumEntry, DiseaseIndexEntry, ItemIndexEntry, TrapIndexEntry } from '@common/types'
import { scaffold } from '@common/authoring/core'
import { decorate } from '@common/authoring/kit-editor-adapter'
import type { RecordType } from '@common/campaign-records'
import { itemIndexRow, type KitIndexRow } from '@common/compendium-index'
import { TrapStatblock } from '../trap/TrapStatblock'
import { DiseaseStatblock } from '../disease/DiseaseStatblock'
import { TemplateStatblock } from '../template/TemplateStatblock'
import { ThemeStatblock } from '../theme/ThemeStatblock'
import { ChallengeStatblock } from '../challenge/ChallengeStatblock'
import { ItemStatblock } from '../item/ItemStatblock'
import { MonsterStatblock } from '../creature/MonsterStatblock'
import { isMinionEntry } from './use-compendium'
import type { RecordKind } from './RecordCompendium'

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

export const TRAP_KIND: RecordKind<Trap> = {
  type: 'trap', singular: 'trap', plural: 'traps',
  columns: [{ label: 'Type', width: '65px' }, { label: 'Role', width: '70px' }],
  filters: [{ label: 'type', column: 0 }, { label: 'role', column: 1 }],
  index: async () => (await window.api.compendium.trapIndex() as TrapIndexEntry[]).map(e => ({ id: e.id, name: e.name, level: e.level, cells: [e.trapType, e.role], book: e.source })),
  row: t => ({ name: t.name, level: t.level, cells: [cap(t.kind), cap(t.role)] }),
  get: id => window.api.compendium.kitGet('trap', id),
  blank: () => scaffold('trap', 'New Trap', 1) as Trap,
  Statblock: ({ value, draft }) => <TrapStatblock trap={draft ? decorate<Trap>(draft) : value} />,
}

export const DISEASE_KIND: RecordKind<Disease> = {
  type: 'disease', singular: 'disease', plural: 'diseases',
  columns: [], filters: [],
  index: async () => (await window.api.compendium.diseaseIndex() as DiseaseIndexEntry[]).map(e => ({ id: e.id, name: e.name, level: e.level, cells: [], book: e.source })),
  row: d => ({ name: d.name, level: d.level, cells: [] }),
  get: id => window.api.compendium.kitGet('disease', id),
  blank: () => scaffold('disease', 'New Disease', 1) as Disease,
  Statblock: ({ value, draft }) => <DiseaseStatblock disease={draft ? decorate<Disease>(draft) : value} />,
}

export const TEMPLATE_KIND: RecordKind<MonsterTemplate> = {
  type: 'template', singular: 'template', plural: 'templates',
  columns: [{ label: 'Role', width: '80px' }, { label: 'Source', width: '70px' }],
  filters: [{ label: 'role', column: 0 }],
  index: () => window.api.compendium.kitIndex('template'),
  row: t => ({ name: t.name, level: 0, cells: [t.role, t.sources[0]?.book ?? ''] }),
  get: id => window.api.compendium.kitGet('template', id),
  blank: () => scaffold('template', 'New Template') as MonsterTemplate,
  Statblock: ({ value, draft }) => <TemplateStatblock template={draft ? decorate<MonsterTemplate>(draft) : value} />,
  levelless: true,
}

export const THEME_KIND: RecordKind<MonsterTheme> = {
  type: 'theme', singular: 'theme', plural: 'themes',
  columns: [{ label: 'Source', width: '80px' }],
  filters: [],
  index: () => window.api.compendium.kitIndex('theme'),
  row: t => ({ name: t.name, level: 0, cells: [t.sources[0]?.book ?? ''] }),
  get: id => window.api.compendium.kitGet('theme', id),
  blank: () => scaffold('theme', 'New Theme') as MonsterTheme,
  Statblock: ({ value, draft }) => <ThemeStatblock theme={draft ? decorate<MonsterTheme>(draft) : value} />,
  levelless: true,
}


/** Skill challenges: complexity and level (one that follows the party's level has none of its own: "Party"). */
export const CHALLENGE_KIND: RecordKind<SkillChallenge> = {
  type: 'challenge', singular: 'skill challenge', plural: 'skill challenges',
  columns: [{ label: 'Complexity', width: '80px' }, { label: 'Level', width: '50px' }],
  filters: [{ label: 'complexity', column: 0 }],
  index: async () => (await window.api.compendium.kitIndex('challenge') as KitIndexRow[]).map(e => ({ ...e, cells: challengeCells(e.level || null, Number(e.cells[1])) })),
  row: c => ({ name: c.name, level: c.level ?? 0, cells: challengeCells(c.level, c.complexity) }),
  get: id => window.api.compendium.kitGet('challenge', id),
  blank: () => scaffold('challenge', 'New Skill Challenge') as SkillChallenge,
  Statblock: ({ value, draft }) => <ChallengeStatblock challenge={draft ? decorate<SkillChallenge>(draft) : value} />,
  levelless: true,
}
const challengeCells = (level: number | null, complexity: number) => [String(complexity), level == null ? 'Party' : String(level)]
/** An item row from its index entry, the same for published and custom items: price sorts by gold pieces
 *  (unpriced last), and consumables filter apart from permanent items. */
const itemRow = (e: ItemIndexEntry) => ({ name: e.name, level: e.level, cells: [cap(e.category), e.slot, e.rarity, e.price],
  sortKeys: [undefined, undefined, undefined, e.priceGp], facets: [e.consumable ? 'Consumable' : 'Permanent'] })

export const ITEM_KIND: RecordKind<Item> = {
  type: 'item', singular: 'item', plural: 'items',
  columns: [{ label: 'Category', width: '75px' }, { label: 'Slot', width: '90px' }, { label: 'Rarity', width: '75px' }, { label: 'Price', width: '80px' }],
  filters: [{ label: 'category', column: 0 }, { label: 'slot', column: 1 }, { label: 'rarity', column: 2 }, { label: 'use', facet: 0 }],
  index: async () => (await window.api.compendium.itemIndex() as ItemIndexEntry[]).map(e => ({ id: e.id, book: e.source, ...itemRow(e) })),
  row: i => itemRow(itemIndexRow(i)),
  get: id => window.api.compendium.kitGet('item', id),
  blank: () => scaffold('item', 'New Item', 1) as Item,
  Statblock: ({ value, draft }) => <ItemStatblock item={draft ? decorate<Item>(draft) : value} />,
}

/** Creatures: the published index's role, type, rank, size, and origin, with artwork and pop-outs. */
const rankOf = (e: CompendiumEntry) => e.modifier || (isMinionEntry(e) ? 'minion' : 'standard')
const typeLabel = (t: string | null | undefined) => cap(String(t ?? '').replace(/-/g, ' '))
export const MONSTER_KIND: RecordKind<Monster> = {
  type: 'creature', singular: 'creature', plural: 'creatures',
  columns: [{ label: 'Type', width: '90px' }, { label: 'Role', width: '80px' }],
  filters: [{ label: 'role', column: 1 }, { label: 'rank', facet: 0 }, { label: 'type', column: 0 }, { label: 'size', facet: 1 }, { label: 'origin', facet: 2 }],
  index: async () => (await window.api.compendium.index() as CompendiumEntry[]).filter(e => e.source !== 'Custom' && e.source !== 'Library').map(e => ({
    id: e.id, name: e.name, level: e.level, book: e.source, cells: [typeLabel(e.type), cap(e.role)], facets: [cap(rankOf(e)), cap(e.size), cap(e.origin)],
  })),
  row: m => ({ name: m.name, level: m.level, cells: [typeLabel(m.type), cap(m.role ?? m.classRole ?? '')], facets: [cap(m.rank), cap(m.size), cap(m.origin ?? '')] }),
  get: id => window.api.compendium.kitGet('monster', id),
  blank: () => scaffold('monster', 'New Creature', 1) as Monster,
  Statblock: props => <MonsterStatblock {...props} />,
  art: true,
}

/** Every kind's page, by record type. */
export const RECORD_KINDS: Record<RecordType, RecordKind<any>> = {
  creature: MONSTER_KIND, item: ITEM_KIND, trap: TRAP_KIND, disease: DISEASE_KIND, template: TEMPLATE_KIND, theme: THEME_KIND, challenge: CHALLENGE_KIND,
}
