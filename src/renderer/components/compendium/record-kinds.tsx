// Kind adapters for RecordCompendium: where each kind's published entries come from, how a row
// reads, and which statblock shows and edits it.

import type { Disease, Item, MonsterTemplate, MonsterTheme, Trap } from '@kit'
import type { DiseaseIndexEntry, ItemIndexEntry, TrapIndexEntry } from '@common/types'
import { scaffold } from '@common/authoring/core'
import { TrapStatblock } from '../trap/TrapStatblock'
import { DiseaseStatblock } from '../disease/DiseaseStatblock'
import { TemplateStatblock } from '../template/TemplateStatblock'
import { ThemeStatblock } from '../theme/ThemeStatblock'
import { ItemStatblock } from '../item/ItemStatblock'
import type { RecordKind } from './RecordCompendium'

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

export const TRAP_KIND: RecordKind<Trap> = {
  type: 'trap', singular: 'trap', plural: 'traps',
  columns: [{ label: 'Type', width: '65px' }, { label: 'Role', width: '70px' }],
  filters: [{ label: 'type', column: 0 }, { label: 'role', column: 1 }],
  index: async () => (await window.api.compendium.trapIndex() as TrapIndexEntry[]).map(e => ({ id: e.id, name: e.name, level: e.level, cells: [e.trapType, e.role] })),
  row: t => ({ name: t.name, level: t.level, cells: [cap(t.kind), cap(t.role)] }),
  get: id => window.api.compendium.kitGet('trap', id),
  blank: () => scaffold('trap', 'New Trap', 1) as Trap,
  Statblock: ({ value, onChange }) => <TrapStatblock trap={value} onChange={onChange} />,
}

export const DISEASE_KIND: RecordKind<Disease> = {
  type: 'disease', singular: 'disease', plural: 'diseases',
  columns: [], filters: [],
  index: async () => (await window.api.compendium.diseaseIndex() as DiseaseIndexEntry[]).map(e => ({ id: e.id, name: e.name, level: e.level, cells: [] })),
  row: d => ({ name: d.name, level: d.level, cells: [] }),
  get: id => window.api.compendium.kitGet('disease', id),
  blank: () => scaffold('disease', 'New Disease', 1) as Disease,
  Statblock: ({ value, onChange }) => <DiseaseStatblock disease={value} onChange={onChange} />,
}

export const TEMPLATE_KIND: RecordKind<MonsterTemplate> = {
  type: 'template', singular: 'template', plural: 'templates',
  columns: [{ label: 'Role', width: '80px' }, { label: 'Source', width: '70px' }],
  filters: [{ label: 'role', column: 0 }, { label: 'source', column: 1 }],
  index: () => window.api.compendium.kitIndex('template'),
  row: t => ({ name: t.name, level: 0, cells: [t.role, t.sources[0]?.book ?? ''] }),
  get: id => window.api.compendium.kitGet('template', id),
  blank: () => scaffold('template', 'New Template') as MonsterTemplate,
  Statblock: ({ value, onChange }) => <TemplateStatblock template={value} onChange={onChange} />,
  levelless: true,
}

export const THEME_KIND: RecordKind<MonsterTheme> = {
  type: 'theme', singular: 'theme', plural: 'themes',
  columns: [{ label: 'Source', width: '80px' }],
  filters: [{ label: 'source', column: 0 }],
  index: () => window.api.compendium.kitIndex('theme'),
  row: t => ({ name: t.name, level: 0, cells: [t.sources[0]?.book ?? ''] }),
  get: id => window.api.compendium.kitGet('theme', id),
  blank: () => scaffold('theme', 'New Theme') as MonsterTheme,
  Statblock: ({ value, onChange }) => <ThemeStatblock theme={value} onChange={onChange} />,
  levelless: true,
}

const itemPrice = (i: Item) => i.levels[0] ? (i.levels[0].price !== null ? `${i.levels[0].price.toLocaleString('en-US')} gp` : i.levels[0].priceText ?? '') : ''
const itemSlot = (i: Item) => i.slot === 'wondrous' ? 'Wondrous Item' : i.slot ? cap(i.slot) : i.subtype ?? ''

export const ITEM_KIND: RecordKind<Item> = {
  type: 'item', singular: 'item', plural: 'items',
  columns: [{ label: 'Category', width: '75px' }, { label: 'Slot', width: '90px' }, { label: 'Rarity', width: '75px' }, { label: 'Price', width: '80px' }],
  filters: [{ label: 'category', column: 0 }, { label: 'slot', column: 1 }, { label: 'rarity', column: 2 }],
  index: async () => (await window.api.compendium.itemIndex() as ItemIndexEntry[]).map(e => ({ id: e.id, name: e.name, level: e.level, cells: [cap(e.category), e.slot, e.rarity, e.price] })),
  row: i => ({ name: i.name, level: i.level, cells: [cap(i.category), itemSlot(i), i.rarity ? cap(i.rarity) : '', itemPrice(i)] }),
  get: id => window.api.compendium.kitGet('item', id),
  blank: () => scaffold('item', 'New Item', 1) as Item,
  Statblock: ({ value, onChange }) => <ItemStatblock item={value} onChange={onChange} />,
}
