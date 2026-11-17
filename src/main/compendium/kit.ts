// Published compendium entries as kit content, from the installed content pack (src/main/content/store.ts).

import type { Disease, Item, Monster, MonsterTemplate, MonsterTheme, SkillChallenge, Trap } from '@kit'
import type { KitIndexRow } from '@common/compendium-index'
import { publishedIndexes, readEntry } from '../content/store'

export type KitKind = 'monster' | 'item' | 'trap' | 'disease' | 'template' | 'theme' | 'challenge'
type KitEntry = Monster | Item | Trap | Disease | MonsterTemplate | MonsterTheme | SkillChallenge

/** Index rows for kinds without an index type of their own. */
export function getKitIndex(kind: 'template' | 'theme' | 'challenge'): KitIndexRow[] {
  return kind === 'template' ? publishedIndexes().templates : kind === 'theme' ? publishedIndexes().themes : publishedIndexes().challenges
}

/** A published entry, or null when no pack is installed or it has no such entry. */
export function getKitEntry(kind: KitKind, id: string): KitEntry | null {
  return readEntry<KitEntry>(kind, id)
}

/** Published templates and themes, for applying them to encounter creatures. */
export const publishedTemplateList = (): MonsterTemplate[] =>
  getKitIndex('template').flatMap(r => readEntry<MonsterTemplate>('template', r.id) ?? [])
/** Published skill challenges whole, for the encounter XP (small: a few dozen). */
export const publishedChallenge = (id: string): SkillChallenge | null => readEntry<SkillChallenge>('challenge', id)
export const publishedThemeList = (): MonsterTheme[] =>
  getKitIndex('theme').flatMap(r => readEntry<MonsterTheme>('theme', r.id) ?? [])
