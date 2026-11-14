// Published compendium entries as kit content, from the installed content pack (src/main/content/store.ts).

import type { Disease, Item, Monster, MonsterTemplate, MonsterTheme, Trap } from '@kit'
import type { KitIndexRow } from '@common/compendium-index'
import { publishedIndexes, readEntry } from '../content/store'

export type KitKind = 'monster' | 'item' | 'trap' | 'disease' | 'template' | 'theme'
type KitEntry = Monster | Item | Trap | Disease | MonsterTemplate | MonsterTheme

/** Index rows for kinds without an index type of their own. */
export function getKitIndex(kind: 'template' | 'theme'): KitIndexRow[] {
  return kind === 'template' ? publishedIndexes().templates : publishedIndexes().themes
}

/** A published entry, or null when no pack is installed or it has no such entry. */
export function getKitEntry(kind: KitKind, id: string): KitEntry | null {
  return readEntry<KitEntry>(kind, id)
}

/** Published templates and themes, for applying them to encounter creatures. */
export const publishedTemplateList = (): MonsterTemplate[] =>
  getKitIndex('template').flatMap(r => readEntry<MonsterTemplate>('template', r.id) ?? [])
export const publishedThemeList = (): MonsterTheme[] =>
  getKitIndex('theme').flatMap(r => readEntry<MonsterTheme>('theme', r.id) ?? [])
