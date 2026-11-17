// Skill challenges by reference (a campaign challenge record, a Library one, or a published one), shared by
// encounters, locations and combat: the sources to resolve them, a row's facts (name, level, complexity) for
// lists, and the whole challenge for its statblock. Library challenges are used live, like published ones.

import { useEffect, useMemo, useState } from 'react'
import type { SkillChallenge } from '@kit'
import type { EncounterChallenge } from '@common/types'
import type { KitIndexRow } from '@common/compendium-index'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { cachedPerVersion, useContentStore } from '../../stores/content-store'

type Ref = Pick<EncounterChallenge, 'challengeId' | 'libraryId' | 'compendiumId'>
export const challengeKey = (r: Ref) => r.challengeId ? `challenge:${r.challengeId}` : r.libraryId ? `library:${r.libraryId}` : `published:${r.compendiumId}`

const loadIndex = cachedPerVersion<KitIndexRow[]>(() => window.api.compendium.kitIndex('challenge'))

/** What lists show of a challenge: its name, own level (null: follows the party's) and complexity. */
export interface ChallengeFacts { name: string; level: number | null; complexity: number }

/** The facts of a challenge reference: undefined while the published index loads, null when it no longer exists. */
export function useChallengeFacts(): (ref: Ref) => ChallengeFacts | null | undefined {
  const records = useCampaignStore(s => s.challenges)
  const library = useLibraryStore(s => s.challenges)
  const [index, setIndex] = useState<KitIndexRow[] | null>(null)
  const version = useContentStore(s => s.version)
  useEffect(() => { void loadIndex(version).then(setIndex) }, [version])
  return useMemo(() => (ref: Ref) => {
    const custom = ref.challengeId ? records.find(r => r.id === ref.challengeId) : ref.libraryId ? library.find(r => r.id === ref.libraryId) : undefined
    if (ref.challengeId || ref.libraryId) return custom ? { name: custom.content.name, level: custom.content.level, complexity: custom.content.complexity } : null
    if (!index) return undefined
    const e = index.find(x => x.id === ref.compendiumId)
    return e ? { name: e.name, level: e.level || null, complexity: Number(e.cells[1]) || 1 } : null
  }, [records, library, index])
}

/** The whole challenge for a reference: undefined while loading, null when it no longer exists. */
export function useChallenge(ref: Ref | undefined): SkillChallenge | null | undefined {
  const records = useCampaignStore(s => s.challenges)
  const library = useLibraryStore(s => s.challenges)
  const [published, setPublished] = useState<SkillChallenge | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setPublished(undefined)
    if (ref?.compendiumId) void window.api.compendium.kitGet('challenge', ref.compendiumId).then((c: SkillChallenge | null) => { if (!cancelled) setPublished(c) })
    return () => { cancelled = true }
  }, [ref?.compendiumId])
  if (!ref) return undefined
  if (ref.challengeId) return records.find(r => r.id === ref.challengeId)?.content ?? null
  if (ref.libraryId) return library.find(r => r.id === ref.libraryId)?.content ?? null
  return published
}
