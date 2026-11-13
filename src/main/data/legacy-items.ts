// One-time conversion of legacy campaign items (the app's `Item` with an `extra` bag) to kit item
// records, run when a campaign opens. The original file is kept beside the record as
// `_legacy-<id>.json` (files starting with "_" are not listed as entities).

import { join } from 'path'
import type { Item as KitItem } from '@kit'
import type { CampaignRecord, Item as LegacyItem } from '@common/types'
import { newRecord } from '@common/campaign-records'
import { entryToPower } from '@common/authoring/power-adapter'
import { convertItem } from '../../../tools/content/convert/item'
import { atomicWriteJson, listJsonFiles, readJson } from './file-io'

const ctx = (at: string) => ({ provenance: { origin: 'human' as const, at, by: 'legacy-campaign-item' } })

/** The kit item for a legacy campaign item. Workshop items already carry their kit content. */
export function legacyItemToKit(item: LegacyItem): KitItem {
  if (item.authoredContent) return { ...item.authoredContent, id: item.id }
  const x = (item.extra ?? {}) as Record<string, any>
  const list = (v: unknown) => Array.isArray(v) ? v.filter(s => typeof s === 'string') : []
  // The item editor keeps the critical as die, type, and extra text.
  const critical = x.critDie ? `+${x.critDie} ${x.critType ? x.critType + ' ' : ''}damage per plus${x.critExtra ? ' ' + x.critExtra : ''}` : String(x.critical ?? x.critExtra ?? '')
  const kit = convertItem(item.id, {
    name: item.name || x.name || 'Unnamed item', category: x.category || 'item', level: Number(x.level) || 0, rarity: String(x.rarity ?? ''),
    price: String(x.price ?? ''), flavor: String(x.flavor ?? item.description ?? ''), slot: String(x.slot ?? ''), itemType: String(x.itemType ?? ''),
    enhancement: String(x.enhancement ?? ''), critical, properties: list(x.properties), powers: [], groups: list(x.groups),
    damage: x.damage, proficiency: x.proficiency, range: x.range, weight: x.weight, special: x.special, requirement: x.requirement,
    alchemicalType: x.alchemicalType, formulaCost: x.formulaCost, componentCost: x.componentCost, keySkill: x.keySkill, castTime: x.castTime,
    duration: x.duration, source: String(x.source ?? ''),
  } as never, ctx(item.createdAt ?? new Date().toISOString()))
  kit.powers = (Array.isArray(x.powers) ? x.powers : []).map((e: unknown) => entryToPower(undefined, {}, e))
  return kit
}

/** Converts every legacy item file in a campaign's items folder; returns how many were converted. */
export async function migrateLegacyItems(itemsDir: string): Promise<number> {
  let converted = 0
  for (const file of await listJsonFiles(itemsDir)) {
    const path = join(itemsDir, file)
    const value = await readJson<LegacyItem | CampaignRecord<KitItem>>(path)
    if (!value || 'content' in value) continue
    const now = new Date().toISOString()
    const record = newRecord(value.id, legacyItemToKit(value), value.createdAt ?? now)
    record.updatedAt = value.updatedAt ?? now
    await atomicWriteJson(join(itemsDir, `_legacy-${file}`), value)
    await atomicWriteJson(path, record)
    converted++
  }
  return converted
}
