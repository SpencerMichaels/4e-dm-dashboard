// The Library: custom creatures, items, traps, diseases, templates, and themes shared by every campaign,
// in `<userData>/library/` as the same record envelopes campaigns use, with its own artwork folder.
// Campaigns reference its entries live, like published ones (docs/shared-library-plan.md).

import { join } from 'path'
import type { CampaignRecord } from '@common/types'
import { checkRecord, RECORD_STORAGE, RECORD_TYPES, type RecordType } from '@common/campaign-records'
import { getLibraryAssetsDir, getLibraryDir } from './paths'
import { atomicWriteJson, deleteFile, ensureDir, listJsonFiles, readJson } from './file-io'
import { withWriteLock } from './write-lock'

const dir = (type: RecordType) => join(getLibraryDir(), RECORD_STORAGE[type].dir)
export const libraryRecordPath = (type: RecordType, id: string) => join(dir(type), `${id}.json`)

export async function listLibrary<T = unknown>(type: RecordType): Promise<CampaignRecord<T>[]> {
  const files = await listJsonFiles(dir(type))
  const records = await Promise.all(files.map(f => readJson<CampaignRecord<T>>(join(dir(type), f))))
  return records.filter((r): r is CampaignRecord<T> => !!r)
}

/** Every record type's entries, keyed like the campaign store (`creatures`, `items`, ...). */
export async function libraryState(): Promise<Record<string, CampaignRecord<unknown>[]>> {
  const lists = await Promise.all(RECORD_TYPES.map(t => listLibrary(t)))
  return Object.fromEntries(RECORD_TYPES.map((t, i) => [RECORD_STORAGE[t].storeKey, lists[i]]))
}

export function getLibraryRecord<T = unknown>(type: RecordType, id: string) {
  return readJson<CampaignRecord<T>>(libraryRecordPath(type, id))
}

export async function saveLibraryRecord(type: RecordType, input: unknown): Promise<void> {
  // As in campaigns: the envelope is checked; kit-schema problems are the editor's to show.
  const record = checkRecord(type, input)
  const path = libraryRecordPath(type, record.id)
  await ensureDir(dir(type))
  await withWriteLock(path, () => atomicWriteJson(path, record))
}

export async function deleteLibraryRecord(type: RecordType, id: string): Promise<void> {
  const path = libraryRecordPath(type, id)
  await withWriteLock(path, () => deleteFile(path))
}

export async function ensureLibrary(): Promise<void> {
  await Promise.all([...RECORD_TYPES.map(t => ensureDir(dir(t))), ensureDir(getLibraryAssetsDir())])
}
