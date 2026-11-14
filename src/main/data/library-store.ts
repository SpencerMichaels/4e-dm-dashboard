// The Library: custom creatures, items, traps, diseases, templates, and themes shared by every campaign,
// in `<userData>/library/` as the same record envelopes campaigns use, with its own artwork folder.
// Campaigns reference its entries live, like published ones (docs/shared-library-plan.md).

import { join } from 'path'
import type { CampaignRecord } from '@common/types'
import { checkRecord, RECORD_STORAGE, RECORD_TYPES, type RecordType } from '@common/campaign-records'
import { readdir } from 'fs/promises'
import { getCampaignsRoot, getLibraryAssetsDir, getLibraryDir } from './paths'
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

/**
 * The campaigns that use a Library entry (encounter rows and their templates and themes, location traps,
 * PC diseases), so deleting it can say where it will show as missing. Copies (`basedOn`) are not uses.
 */
export async function libraryUsage(type: RecordType, id: string): Promise<{ campaignId: string; name: string; uses: number }[]> {
  const root = getCampaignsRoot()
  const dirs = await readdir(root, { withFileTypes: true }).catch(() => [])
  const ref = `library:${id}`
  const usesIn = (value: unknown): number => {
    const v = value as Record<string, any>
    switch (type) {
      case 'creature': return (v.creatures ?? []).filter((c: any) => c?.libraryId === id).length
      case 'trap': return (v.traps ?? []).filter((t: any) => t?.libraryId === id).length
      case 'disease': return (v.diseases ?? []).filter((d: any) => d?.libraryId === id).length
      case 'template': return (v.creatures ?? []).filter((c: any) => (c?.monsterTemplates ?? []).includes(ref)).length
      case 'theme': return (v.creatures ?? []).filter((c: any) => c?.monsterTheme?.name === ref).length
      default: return 0
    }
  }
  // Where each kind can be referenced from.
  const folders: Record<RecordType, string[]> = {
    creature: ['encounters'], trap: ['encounters', 'locations'], disease: ['player-characters'],
    template: ['encounters'], theme: ['encounters'], item: [],
  }
  const result: { campaignId: string; name: string; uses: number }[] = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const meta = await readJson<{ id: string; name: string }>(join(root, d.name, 'campaign.json'))
    if (!meta) continue
    let uses = 0
    for (const folder of folders[type]) {
      const dir = join(root, d.name, folder)
      for (const f of await listJsonFiles(dir)) uses += usesIn(await readJson(join(dir, f)) ?? {})
    }
    if (uses) result.push({ campaignId: meta.id, name: meta.name, uses })
  }
  return result
}
