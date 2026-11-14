// Kit-native campaign record kinds: creatures, items, traps, diseases, templates, themes.

import type { CampaignRecord, EntityType } from './types'

export const RECORD_TYPES = ['creature', 'item', 'trap', 'disease', 'template', 'theme'] as const satisfies readonly EntityType[]
export type RecordType = (typeof RECORD_TYPES)[number]

/** Campaign directory and renderer store key for each record type. */
export const RECORD_STORAGE: Record<RecordType, { dir: string; storeKey: string }> = {
  creature: { dir: 'creatures', storeKey: 'creatures' },
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
  if (r.art !== undefined && (typeof r.art !== 'object' || r.art === null || Array.isArray(r.art))) throw new Error('art must be an object')
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
  creature: RECORD_STORAGE.creature.dir,
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

/** Where a campaign refers to each record type: encounter rows (and their templates and themes), traps, PC diseases. */
export const REFERENCED_FROM: Record<RecordType, EntityType[]> = {
  creature: ['encounter'], trap: ['encounter', 'location'], disease: ['player-character'],
  template: ['encounter'], theme: ['encounter'], item: [],
}

/**
 * Points a campaign entity's references to entry `id` at its new home, after it moved between the campaign
 * and the Library under the same id: `creatureId`/`trapId`/`diseaseId` and `campaign:<id>` refs become
 * `libraryId` and `library:<id>` (`toLibrary`), or back. Mutates `value`; returns whether anything changed.
 */
export function rehomeRefs(type: RecordType, value: unknown, id: string, toLibrary: boolean): boolean {
  const v = value as Record<string, any>
  let changed = false
  const swap = (rows: any[] | undefined, campaignKey: string) => {
    const [from, to] = toLibrary ? [campaignKey, 'libraryId'] : ['libraryId', campaignKey]
    for (const r of rows ?? []) if (r?.[from] === id) { delete r[from]; r[to] = id; changed = true }
  }
  const [oldRef, newRef] = toLibrary ? [`campaign:${id}`, `library:${id}`] : [`library:${id}`, `campaign:${id}`]
  switch (type) {
    case 'creature': swap(v.creatures, 'creatureId'); break
    case 'trap': swap(v.traps, 'trapId'); break
    case 'disease': swap((v.conditions ?? []).filter((c: any) => c?.kind === 'disease'), 'diseaseId'); break
    case 'template':
      for (const c of v.creatures ?? []) if (c?.monsterTemplates?.includes(oldRef)) { c.monsterTemplates = c.monsterTemplates.map((t: string) => t === oldRef ? newRef : t); changed = true }
      break
    case 'theme':
      for (const c of v.creatures ?? []) if (c?.monsterTheme?.name === oldRef) { c.monsterTheme.name = newRef; changed = true }
      break
  }
  return changed
}

/** The Workshop content kind a record type holds (a creature record holds a "monster"). */
export const contentKindFor = (type: RecordType) => type === 'creature' ? 'monster' : type
/** The record type a content kind is stored as: a Workshop "monster" is a campaign creature. */
export const recordTypeFor = (kind: string): RecordType => kind === 'monster' ? 'creature' : kind as RecordType

/**
 * Where a custom entry lives: a campaign (its id) or the Library, custom entries shared by every
 * campaign. Campaign ids are random 12-character ids, so they never equal `LIBRARY`.
 */
export const LIBRARY = 'library'
export type Home = string
export const isLibrary = (home: Home | null | undefined) => home === LIBRARY
