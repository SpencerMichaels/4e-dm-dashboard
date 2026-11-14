// Published compendium entries as kit content, for the kit-native statblocks.

import { contentRoot } from '../content-root'
import type { Disease, Item, Monster, MonsterTemplate, MonsterTheme, Trap } from '@kit'
import type { Creature } from '@common/types'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { publishedMonster } from './published-monsters'
import { convertTrap } from '../../../tools/content/convert/trap'
import { convertDisease } from '../../../tools/content/convert/disease'
import { convertItem } from '../../../tools/content/convert/item'
import { dnd4eCompendium as compendium } from './compendium'
import { convertTemplate, convertTheme } from '../../../tools/content/convert/template'
import { MONSTER_TEMPLATES } from '../../renderer/components/creature/monster-templates'
import { MONSTER_THEMES } from '../../renderer/components/creature/monster-themes'

export type KitKind = 'monster' | 'item' | 'trap' | 'disease' | 'template' | 'theme'
const ctx = () => ({ provenance: { origin: 'parser' as const, at: new Date(0).toISOString(), by: 'legacy-compendium-adapter' } })
const cache = new Map<string, unknown>()

type KitEntry = Monster | Item | Trap | Disease | MonsterTemplate | MonsterTheme

/**
 * The agent-cleaned content repo, until the content pack (TODO section 8) replaces this bridge:
 * $CONTENT_REPO, or ~/Projects/4e-content when it exists. Its traps carry effect clauses
 * (countermeasures with checks and DCs) that the parser's do not.
 */
const contentRepo = (): string | null => {
  const dir = process.env.CONTENT_REPO ?? join(homedir(), 'Projects', '4e-content')
  return existsSync(join(dir, 'traps')) ? dir : null
}

/** A published trap from the content repo, or null (no repo, no file, or unreadable). */
function repoTrap(id: string): Trap | null {
  const dir = contentRepo()
  if (!dir || !/^[\w-]+$/.test(id)) return null
  try { return JSON.parse(readFileSync(join(dir, 'traps', `${id}.json`), 'utf-8')) as Trap } catch { return null }
}

// Templates and themes are still built-in data (DMG, DMG2); the content pack will replace that source.
let templates: MonsterTemplate[] | null = null
let themes: MonsterTheme[] | null = null
const publishedTemplates = () => templates ??= MONSTER_TEMPLATES.map(t => convertTemplate(t, ctx()))
const publishedThemes = () => themes ??= MONSTER_THEMES.map(t => convertTheme(t, ctx()))

/** Index rows for kinds without a parsed index file. */
export function getKitIndex(kind: 'template' | 'theme'): { id: string; name: string; level: number; cells: string[]; book: string }[] {
  if (kind === 'template') return publishedTemplates().map(t => ({ id: t.id, name: t.name, level: 0, cells: [t.role, t.sources[0]?.book ?? ''], book: t.sources[0]?.book ?? '' }))
  return publishedThemes().map(t => ({ id: t.id, name: t.name, level: 0, cells: [t.sources[0]?.book ?? ''], book: t.sources[0]?.book ?? '' }))
}

export function getKitEntry(kind: KitKind, id: string): KitEntry | null {
  if (kind === 'template') return structuredClone(publishedTemplates().find(t => t.id === id) ?? null)
  if (kind === 'theme') return structuredClone(publishedThemes().find(t => t.id === id) ?? null)
  // Monsters keep their own cache (re-parsed from content/raw with printed text).
  if (kind === 'monster') return publishedMonster(contentRoot(), id, () => compendium.resolveCreature!(id) as unknown as Creature | null)
  const key = `${kind}/${id}`
  if (cache.has(key)) return structuredClone(cache.get(key)) as KitEntry
  let value: KitEntry | null = null
  if (kind === 'item') { const i = compendium.getItem!(id); value = i ? convertItem(id, i as never, ctx()) : null }
  else if (kind === 'trap') { const t = compendium.getTrap!(id); value = t ? repoTrap(id) ?? convertTrap(id, t as never, ctx()) : null }
  else if (kind === 'disease') { const d = compendium.getDisease!(id); value = d ? convertDisease(id, d as never, ctx()) : null }
  if (value) cache.set(key, value)
  return value && structuredClone(value)
}

/** Published templates and themes, for applying them to encounter creatures. */
export const publishedTemplateList = (): MonsterTemplate[] => structuredClone(publishedTemplates())
export const publishedThemeList = (): MonsterTheme[] => structuredClone(publishedThemes())
