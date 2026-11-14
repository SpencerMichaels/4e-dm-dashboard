// A PC's lasting conditions (`PlayerCharacter.conditions`): diseases, standard 4e conditions that
// outlast an encounter, and effects the DM names (curses, boons, ...). They are the PC's global set;
// combat is an overlay on it. When a PC joins combat its lasting conditions are copied onto its
// combatant (`carried`), the encounter's own conditions go on top, and nothing is written back
// (disease exposure in combat is saved to the PC at once, as before).

import type { Disease } from '@kit'
import type { AppliedCondition, DiseaseRef, PcCondition, PcDisease, PlayerCharacter } from '../types'
import dnd4e from './dnd4e'
import { stageText } from './diseases'

export const diseaseKey = (ref: DiseaseRef) => ref.diseaseId ? `disease:${ref.diseaseId}` : ref.libraryId ? `library:${ref.libraryId}` : `published:${ref.compendiumId}`

/** A key unique among one PC's conditions. */
export function pcConditionKey(c: PcCondition): string {
  switch (c.kind) {
    case 'disease': return diseaseKey(c)
    case 'condition': return `condition:${c.conditionId}`
    case 'effect': return `effect:${c.id}`
  }
}

export const pcDiseases = (pc: PlayerCharacter): PcDisease[] => (pc.conditions ?? []).filter((c): c is PcDisease => c.kind === 'disease')

/**
 * Standard conditions a PC can keep between encounters: the condition list without the ones combat
 * manages itself (dying, bloodied, reacted, surprise, ongoing damage, regeneration, class marks).
 */
const COMBAT_ONLY = new Set(['dead', 'dying', 'bloodied', 'reacted', 'surprised', 'ongoing-damage', 'regenerating'])
export const lastingConditionDefs = () => dnd4e.conditions.filter(d => !d.hidden && !COMBAT_ONLY.has(d.id))

export const conditionName = (conditionId: string) => dnd4e.conditions.find(d => d.id === conditionId)?.name ?? conditionId

/** The disease's chip text: "Mummy Rot (stage 2)" or "Mummy Rot (exposed)". */
export const diseaseLabel = (name: string, stage: PcDisease['stage']) => `${name} (${stage === 'exposed' ? 'exposed' : `stage ${stage}`})`

/**
 * The combat conditions a PC starts an encounter with. `diseaseOf` resolves a disease reference
 * (null when the entry no longer exists; such a disease is left out).
 */
export function carriedConditions(pc: PlayerCharacter, diseaseOf: (ref: DiseaseRef) => Disease | null): AppliedCondition[] {
  const lasting = { duration: { type: 'indefinite' as const }, carried: true }
  return (pc.conditions ?? []).flatMap((c): AppliedCondition[] => {
    switch (c.kind) {
      case 'condition':
        return [{ conditionId: c.conditionId, duration: { type: 'indefinite', note: c.note }, carried: true }]
      case 'effect':
        return [{ conditionId: `pc-effect-${c.id}`, customName: c.name, customDescription: c.description, customIcon: 'sparkles', ...lasting }]
      case 'disease': {
        const disease = diseaseOf(c)
        if (!disease) return []
        const text = c.stage === 'exposed' ? 'Exposed: resolve the disease after the encounter.' : stageText(disease, c.stage)
        return [{ conditionId: `pc-disease-${diseaseKey(c)}`, customName: diseaseLabel(disease.name, c.stage), customDescription: text, customIcon: 'biohazard', ...lasting }]
      }
    }
  })
}

/**
 * PC records from before 2026-11-14 kept diseases in `diseases`. Moves them into `conditions`
 * (mutating the record); returns whether anything changed.
 */
export function migratePcDiseases(pc: Record<string, any>): boolean {
  if (!('diseases' in pc)) return false
  const diseases = (pc.diseases ?? []).map((d: Omit<PcDisease, 'kind'>) => ({ kind: 'disease', ...d }))
  pc.conditions = [...diseases, ...(pc.conditions ?? [])]
  delete pc.diseases
  return true
}
