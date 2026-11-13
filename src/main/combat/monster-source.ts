// Kit monsters for combat. Combat runs on kit content; campaign creatures are still stored in the
// legacy shape (TODO section 3), so they convert here when they enter combat. Stored files never change.

import { readFileSync } from 'fs'
import { join } from 'path'
import type { Monster } from '@kit'
import type { Creature } from '@common/types'
import { entryToPower, toEditorEntry } from '@common/authoring/power-adapter'
import { convertMonster } from '../../../tools/content/convert/monster'
import { convertPublishedMonster } from '../../../tools/content/convert/published'

const ctx = (by: string) => ({ provenance: { origin: 'parser' as const, at: new Date(0).toISOString(), by } })

/**
 * A campaign creature as a kit monster. Workshop creatures carry their kit content. Others (made in
 * the creature editor or cloned from the compendium) go through the content converter for the stat
 * rows, with each power's text taken from the editor fields, the way the Workshop maps editor edits:
 * the converter reads hit, miss, and effect only from printed text, which stored creatures lack.
 */
export function creatureToMonster(c: Creature): Monster {
  if (c.authoredContent) return { ...structuredClone(c.authoredContent), id: c.id }
  const sb = { ...c.statBlock } as Record<string, any>
  // The creature editor stores senses as a list; the parser as text.
  if (Array.isArray(sb.senses)) sb.senses = sb.senses.join(', ')
  if (Array.isArray(sb.languages)) sb.languages = sb.languages.join(', ')
  if (Array.isArray(sb.equipment)) sb.equipment = sb.equipment.join(', ')
  const m = convertMonster(c.id, { name: c.name, hp: c.maxHp || c.hp || sb.hp, statBlock: sb }, ctx('campaign-creature'))
  const actions = ((sb.actions ?? []) as any[]).filter(a => a.entryType !== 'trait' && a.entryType !== 'aura')
  m.powers = m.powers.map((p, i) => actions[i]?.printed ? p : entryToPower(p, {}, toEditorEntry(actions[i])))
  return m
}

let raw: Record<string, string> | null | undefined
const published = new Map<string, Monster>()

/**
 * A published monster with its printed text, re-parsed from `content/raw` (as the Workshop catalog
 * does). Without the raw file, the parsed entry goes through `creatureToMonster`.
 */
export function publishedMonster(contentRoot: string, id: string, parsed: () => Creature | null): Monster | null {
  const cached = published.get(id)
  if (cached) return structuredClone(cached)
  if (raw === undefined) {
    try { raw = JSON.parse(readFileSync(join(contentRoot, 'raw/monsters.json'), 'utf-8')) } catch { raw = null }
  }
  let m: Monster | null = null
  if (raw?.[id]) m = convertPublishedMonster(id, raw[id], ctx('published-compendium'))
  else { const c = parsed(); m = c && creatureToMonster({ ...c, id }) }
  if (m) published.set(id, m)
  return m && structuredClone(m)
}
