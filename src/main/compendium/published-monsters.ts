// Published monsters as kit content, re-parsed from content/raw with their printed text (as the
// Workshop catalog does) and cached. Without the raw file, the parsed entry is converted instead.

import { readFileSync } from 'fs'
import { join } from 'path'
import type { Monster } from '@kit'
import type { Creature } from '@common/types'
import { convertPublishedMonster } from '../../../tools/content/convert/published'
import { statBlockToMonster } from '../data/legacy-creatures'

const ctx = (by: string) => ({ provenance: { origin: 'parser' as const, at: new Date(0).toISOString(), by } })
let raw: Record<string, string> | null | undefined
const published = new Map<string, Monster>()

export function publishedMonster(contentRoot: string, id: string, parsed: () => Creature | null): Monster | null {
  const cached = published.get(id)
  if (cached) return structuredClone(cached)
  if (raw === undefined) {
    try { raw = JSON.parse(readFileSync(join(contentRoot, 'raw/monsters.json'), 'utf-8')) } catch { raw = null }
  }
  let m: Monster | null = null
  if (raw?.[id]) m = convertPublishedMonster(id, raw[id], ctx('published-compendium'))
  else { const c = parsed(); m = c && statBlockToMonster({ ...c, id }) }
  if (m) published.set(id, m)
  return m && structuredClone(m)
}
