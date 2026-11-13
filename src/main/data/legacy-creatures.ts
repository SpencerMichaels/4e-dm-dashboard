// One-time conversion of legacy campaign creatures (the app's `Creature` with a `statBlock` record)
// to kit monster records, run when a campaign opens. Artwork moves to the record's `art`, the
// published entry a clone came from to `basedOn`. The original file is kept beside the record as
// `_legacy-<id>.json` (files starting with "_" are not listed as entities).

import { join } from 'path'
import type { Monster } from '@kit'
import type { CampaignRecord, Creature, RecordArt } from '@common/types'
import { newRecord } from '@common/campaign-records'
import { monsterToCreature } from '@common/authoring/legacy'
import { draftOf, editorModel, monsterFromEditor, monsterToEditor, withDraftNodes } from '@common/authoring/creature-editor-adapter'
import { entryToPower, toEditorEntry } from '@common/authoring/power-adapter'
import { convertMonster } from '../../../tools/content/convert/monster'
import { atomicWriteJson, listJsonFiles, readJson } from './file-io'

const ctx = (by: string) => ({ provenance: { origin: 'parser' as const, at: new Date(0).toISOString(), by } })

/**
 * A legacy creature's stat block as a kit monster: the content converter for the stat rows, with
 * each power's text taken from the editor fields (the converter reads hit, miss, and effect only from
 * printed text, which stored creatures lack).
 */
export function statBlockToMonster(c: Creature): Monster {
  const sb = { ...c.statBlock } as Record<string, any>
  // The creature editor stores senses, languages, and equipment as lists; the parser as text.
  if (Array.isArray(sb.senses)) sb.senses = sb.senses.join(', ')
  if (Array.isArray(sb.languages)) sb.languages = sb.languages.join(', ')
  if (Array.isArray(sb.equipment)) sb.equipment = sb.equipment.join(', ')
  const m = convertMonster(c.id, { name: c.name, hp: c.maxHp || c.hp || sb.hp, statBlock: sb }, ctx('campaign-creature'))
  const actions = ((sb.actions ?? []) as any[]).filter(a => a.entryType !== 'trait' && a.entryType !== 'aura')
  m.powers = m.powers.map((p, i) => actions[i]?.printed ? p : entryToPower(p, {}, toEditorEntry(actions[i])))
  return m
}

/**
 * The kit monster for a legacy creature. A Workshop creature carries its kit content; if its stat
 * block was edited on the Creatures page afterwards (which changed only the stat block), those edits
 * are applied onto the kit content field by field, so kit-only mechanics survive and the edits win.
 */
export function creatureToMonster(c: Creature): Monster {
  if (!c.authoredContent) return statBlockToMonster(c)
  const kit = { ...structuredClone(c.authoredContent), id: c.id }
  const projected = monsterToCreature(kit, c.id)
  const same = JSON.stringify(projected.statBlock) === JSON.stringify(c.statBlock) && projected.name === c.name && projected.hp === (c.maxHp || c.hp)
  if (same) return kit
  // The edited stat block, tagged with the kit entries' positions, in the editor's conventions.
  const d = draftOf(kit)
  const edited = structuredClone({ ...c, hp: c.maxHp || c.hp })
  ;(edited.statBlock as any).actions ??= []
  withDraftNodes(edited, d)
  const description = (c.statBlock as any).description === projected.statBlock.description ? kit.description : undefined
  return monsterFromEditor(kit, monsterToEditor(kit), editorModel(edited, description))
}

/** A legacy creature as a kit monster record. */
export function legacyCreatureToRecord(c: Creature): CampaignRecord<Monster> {
  const now = new Date().toISOString()
  const record = newRecord(c.id, creatureToMonster(c), c.createdAt ?? now, c.compendiumId ? `published/creature/${c.compendiumId}` : undefined)
  record.updatedAt = c.updatedAt ?? now
  const art: RecordArt = { ...(c.imageId ? { imageId: c.imageId } : {}), ...(c.tokenImageId ? { tokenImageId: c.tokenImageId } : {}), ...(c.tokenCrop ? { tokenCrop: c.tokenCrop } : {}) }
  if (Object.keys(art).length) record.art = art
  return record
}

/** Converts every legacy creature file in a campaign's creatures folder; returns how many were converted. */
export async function migrateLegacyCreatures(creaturesDir: string): Promise<number> {
  let converted = 0
  for (const file of await listJsonFiles(creaturesDir)) {
    const path = join(creaturesDir, file)
    const value = await readJson<Creature | CampaignRecord<Monster>>(path)
    if (!value || 'content' in value) continue
    await atomicWriteJson(join(creaturesDir, `_legacy-${file}`), value)
    await atomicWriteJson(path, legacyCreatureToRecord(value))
    converted++
  }
  return converted
}
