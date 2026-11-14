// The campaign-wide party level (campaign.json `partyLevel`) was replaced on 2026-11-14 by each
// PC's own level (`pcLevel`, src/common/rules/party.ts). When a campaign that still has one
// opens, the PCs without an imported sheet or a level of their own get it; the caller then
// drops it from campaign.json.

import { join } from 'path'
import type { PlayerCharacter } from '@common/types'
import { atomicWriteJson, listJsonFiles, readJson } from './file-io'

/** Gives the PCs in `dir` without a sheet or a level the old party level. Returns how many changed. */
export async function migratePartyLevel(dir: string, partyLevel: number): Promise<number> {
  let changed = 0
  for (const file of await listJsonFiles(dir)) {
    const path = join(dir, file)
    const pc = await readJson<PlayerCharacter>(path)
    if (!pc || pc.sheet || pc.level != null) continue
    await atomicWriteJson(path, { ...pc, level: partyLevel })
    changed++
  }
  return changed
}
