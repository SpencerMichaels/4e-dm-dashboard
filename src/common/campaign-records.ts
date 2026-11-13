// Kit-native campaign record kinds: traps, diseases, templates, themes.

import type { CampaignRecord, EntityType } from './types'

export const RECORD_TYPES = ['item', 'trap', 'disease', 'template', 'theme'] as const satisfies readonly EntityType[]
export type RecordType = (typeof RECORD_TYPES)[number]

/** Campaign directory and renderer store key for each record type. */
export const RECORD_STORAGE: Record<RecordType, { dir: string; storeKey: string }> = {
  item: { dir: 'items', storeKey: 'items' },
  trap: { dir: 'traps', storeKey: 'traps' },
  disease: { dir: 'diseases', storeKey: 'diseases' },
  template: { dir: 'templates', storeKey: 'templates' },
  theme: { dir: 'themes', storeKey: 'themes' },
}

export const isRecordType = (t: string): t is RecordType => (RECORD_TYPES as readonly string[]).includes(t)

/** A new record around kit content. The content's own id follows the record id. */
export function newRecord<T extends { id: string }>(id: string, content: T, at: string, basedOn?: string): CampaignRecord<T> {
  return { id, createdAt: at, updatedAt: at, ...(basedOn ? { basedOn } : {}), content: { ...content, id } }
}

/**
 * Checks a record before it is written. Kit-schema problems are not rejected here: the DM may be
 * mid-edit, and the editor shows them. Only a malformed envelope is refused.
 */
export function checkRecord(type: RecordType, value: unknown): CampaignRecord<{ id: string }> {
  const r = value as CampaignRecord<{ id: string }> | null
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) throw new Error(`A ${type} record needs an id`)
  if (!r.content || typeof r.content !== 'object' || Array.isArray(r.content)) throw new Error(`A ${type} record needs kit content`)
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') throw new Error(`A ${type} record needs createdAt and updatedAt`)
  if (r.basedOn !== undefined && typeof r.basedOn !== 'string') throw new Error('basedOn must be a string')
  return { ...r, content: { ...r.content, id: r.id } }
}

/** The campaign entity type a Workshop content kind saves as ("monster" is a creature). */
export function entityTypeForKind(kind: string): EntityType {
  if (kind === 'monster') return 'creature'
  if (isRecordType(kind)) return kind as EntityType
  throw new Error(`Unknown content kind: ${kind}`)
}

/** Each entity type's folder inside a campaign directory. */
export const ENTITY_DIRS: Record<EntityType, string> = {
  note: 'story/notes',
  creature: 'creatures',
  encounter: 'encounters',
  location: 'locations',
  item: RECORD_STORAGE.item.dir,
  'player-character': 'player-characters',
  map: 'maps',
  trap: RECORD_STORAGE.trap.dir,
  disease: RECORD_STORAGE.disease.dir,
  template: RECORD_STORAGE.template.dir,
  theme: RECORD_STORAGE.theme.dir,
}
