// Sharing an entry with every campaign, and taking it back: a custom entry moves between the open campaign
// and the Library under the same id, so it stays one entry rather than becoming two copies. Its artwork comes
// along, the campaign's references follow it (`rehomeRefs`), and its working copy (with its history) moves too.
// Taking an entry back is refused while another campaign uses it.

import { copyFile } from 'fs/promises'
import { dirname } from 'path'
import type { CampaignRecord, EntityType } from '@common/types'
import { LIBRARY, REFERENCED_FROM, rehomeRefs, type RecordType } from '@common/campaign-records'
import * as store from './campaign-store'
import * as library from './library-store'
import { ensureDir } from './file-io'

/**
 * Moves entry `id` into the Library (`shared`) or out of it into the open campaign. `moveDraft` moves its
 * working copy between homes. Returns the campaign entity types whose references changed.
 */
export async function moveEntry(type: RecordType, id: string, shared: boolean, moveDraft: (from: string, to: string, entityId: string) => Promise<void>): Promise<EntityType[]> {
  const campaignId = store.getActiveCampaignId()
  if (!campaignId) throw new Error('No campaign is open')
  const [from, to] = shared ? [campaignId, LIBRARY] : [LIBRARY, campaignId]
  const read = (home: string) => home === LIBRARY ? library.getLibraryRecord(type, id) : store.getEntity<CampaignRecord<unknown>>(type, id)
  const record = await read(from)
  if (!record) throw new Error(shared ? 'No such campaign entry' : 'No such Library entry')
  if (await read(to)) throw new Error(shared ? 'The Library already has this entry' : 'This campaign already has this entry')
  if (!shared) {
    const others = (await library.libraryUsage(type, id)).filter(u => u.campaignId !== campaignId)
    if (others.length) throw new Error(`Other campaigns use it: ${others.map(u => u.name).join(', ')}. Duplicate it into this campaign instead.`)
  }

  // Images are copied, not moved: a duplicate or an annotation may use the same file.
  for (const image of [record.art?.imageId, record.art?.tokenImageId].filter((x): x is string => typeof x === 'string')) {
    const target = await store.getImagePath(to, image)
    await ensureDir(dirname(target))
    await copyFile(await store.getImagePath(from, image), target).catch(() => {})
  }
  // The new home first, so nothing is lost if a later step fails; the old one goes last.
  if (shared) await library.saveLibraryRecord(type, record)
  else await store.saveEntity(type, record)
  await moveDraft(from, to, id)
  const changed: EntityType[] = []
  for (const entityType of REFERENCED_FROM[type]) {
    let any = false
    for (const entity of await store.listEntities<{ id: string }>(entityType)) {
      if (rehomeRefs(type, entity, id, shared)) { await store.saveEntity(entityType, entity); any = true }
    }
    if (any) changed.push(entityType)
  }
  if (shared) await store.deleteEntity(type, id)
  else await library.deleteLibraryRecord(type, id)
  return changed
}
