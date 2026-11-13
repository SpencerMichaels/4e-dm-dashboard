// Where each published kind's converter input comes from. Shared by the
// content-repo writer (index.ts) and the authoring catalog, so both see the
// printed hit/miss/effect text: content/parsed leaves it out of monsters.
//
// Monsters are re-parsed from content/raw with the parser's `printed` option,
// traps are re-parsed from content/raw (trait text and extra labeled lines),
// items come from content/parsed with the raw item HTML for the tier heading,
// and diseases come from content/parsed.

import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Disease, Item, Monster, Trap } from '@kit'
import { parseMonsterHtml } from '../html-parser'
import { parseTrapHtml } from '../trap-parser'
import type { ConvertContext } from './common'
import { convertDisease } from './disease'
import { convertItem } from './item'
import { convertMonster } from './monster'
import { convertTrap } from './trap'

export type PublishedKind = 'monster' | 'item' | 'trap' | 'disease'

const RAW_ITEM_FILES = ['item.json', 'weapon.json', 'armor.json', 'implement.json', 'ritual.json']

/** Files (relative to the content root) each kind is read from, in the order `publishedEntries` needs them. */
export const PUBLISHED_FILES: Record<PublishedKind, string[]> = {
  monster: ['raw/monsters.json'],
  item: ['parsed/items.json', ...RAW_ITEM_FILES.map(f => `raw/${f}`)],
  trap: ['raw/trap.json'],
  disease: ['parsed/diseases.json'],
}

type Converted = { monster: Monster; item: Item; trap: Trap; disease: Disease }

export function convertPublishedMonster(id: string, html: string, ctx: ConvertContext): Monster {
  const warnings: string[] = []
  const creature: any = parseMonsterHtml(html, warnings, { printed: true })
  if (warnings.length > 0) creature.statBlock._importWarnings = warnings
  return convertMonster(id, creature, ctx)
}

/**
 * Every entry of one kind as [id, convert] pairs, sorted by id. Conversion is
 * deferred so a caller can catch and report one failing entry. Throws ENOENT
 * when the kind's first file is missing.
 */
export async function publishedEntries<K extends PublishedKind>(contentRoot: string, kind: K, ctx: ConvertContext): Promise<[string, () => Converted[K]][]> {
  const read = async (file: string) => JSON.parse(await readFile(join(contentRoot, file), 'utf-8')) as Record<string, any>
  const [main, ...rest] = PUBLISHED_FILES[kind]
  const data = await read(main)
  const ids = Object.keys(data).sort()
  let convert: (id: string) => unknown
  if (kind === 'monster') convert = id => convertPublishedMonster(id, data[id], ctx)
  else if (kind === 'trap') convert = id => convertTrap(id, parseTrapHtml(data[id]), ctx)
  else if (kind === 'disease') convert = id => convertDisease(id, data[id], ctx)
  else {
    // The raw item HTML only adds the tier heading; do without it if a file is missing.
    const rawItems: Record<string, string> = Object.assign({}, ...await Promise.all(rest.map(f => read(f).catch(() => ({})))))
    convert = id => convertItem(id, data[id], ctx, rawItems[id])
  }
  return ids.map(id => [id, () => convert(id) as Converted[K]])
}
