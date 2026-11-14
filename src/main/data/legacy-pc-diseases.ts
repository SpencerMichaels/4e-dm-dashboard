// PC diseases (`PlayerCharacter.diseases`) became one kind of lasting condition
// (`PlayerCharacter.conditions`) on 2026-11-14. When a campaign opens, PC files that still have
// `diseases` are rewritten (migratePcDiseases in src/common/rules/pc-conditions.ts).

import { join } from 'path'
import { migratePcDiseases } from '@common/rules/pc-conditions'
import { atomicWriteJson, listJsonFiles, readJson } from './file-io'

/** Moves the diseases of the PCs in `dir` into their conditions. Returns how many changed. */
export async function migrateLegacyPcDiseases(dir: string): Promise<number> {
  let changed = 0
  for (const file of await listJsonFiles(dir)) {
    const path = join(dir, file)
    const pc = await readJson<Record<string, unknown>>(path)
    if (!pc || !migratePcDiseases(pc)) continue
    await atomicWriteJson(path, pc)
    changed++
  }
  return changed
}
