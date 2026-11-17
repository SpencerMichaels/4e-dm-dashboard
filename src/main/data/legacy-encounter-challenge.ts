// An encounter's skill challenge was one inline `challenge` (level, complexity, notes, name, progress) from
// 2026-11-17 until skill challenges became records of their own the same day (kit v16, like traps). When a
// campaign opens, each encounter that still has one gets a campaign challenge record and a row referring to it.

import { join } from 'path'
import type { SkillChallenge } from '@kit'
import { newRecord } from '@common/campaign-records'
import { scaffold } from '@common/authoring/core'
import { generateId } from '@common/utils/id'
import { atomicWriteJson, listJsonFiles, readJson } from './file-io'

interface LegacyChallenge { name?: string; level?: number; complexity?: number; notes?: string; successes?: number; failures?: number }

/** Moves the inline challenges of the encounters in `encountersDir` into records in `challengesDir`. Returns how many moved. */
export async function migrateLegacyEncounterChallenges(encountersDir: string, challengesDir: string, at = new Date().toISOString()): Promise<number> {
  let moved = 0
  for (const file of await listJsonFiles(encountersDir)) {
    const path = join(encountersDir, file)
    const encounter = await readJson<Record<string, any>>(path)
    const old = encounter?.challenge as LegacyChallenge | undefined
    if (!encounter || !old || typeof old !== 'object') continue
    const id = generateId()
    const standalone = !encounter.creatures?.length && !encounter.traps?.length
    const content: SkillChallenge = {
      ...(scaffold('challenge', old.name || (standalone ? encounter.name : `${encounter.name}: skill challenge`) || 'Skill challenge') as SkillChallenge),
      level: old.level ?? null, complexity: old.complexity ?? 1, ...(old.notes ? { special: old.notes } : {}),
    }
    await atomicWriteJson(join(challengesDir, `${id}.json`), newRecord(id, content, at))
    const { challenge: _old, ...rest } = encounter
    await atomicWriteJson(path, { ...rest, challenges: [...(encounter.challenges ?? []), { challengeId: id, ...(old.successes ? { successes: old.successes } : {}), ...(old.failures ? { failures: old.failures } : {}) }] })
    moved++
  }
  return moved
}
