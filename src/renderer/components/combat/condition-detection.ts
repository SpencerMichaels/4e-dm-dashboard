// Click-to-apply's fallback for text no effect clause covers (src/common/combat/clause-effects.ts):
// creatures made in the editor, parser-only entries, and words the DM added after an agent cleaned the
// entry. Regex matches for condition keywords, ongoing damage, grants-CA, regeneration, and disease
// names. The card runs it only on a power's Hit, Miss, and Effect lines (diseases on traits too),
// and keeps only matches in text no clause covers.

import { locateDiseaseMentions, type DiseaseName } from '@common/rules/diseases'
import type { DiseaseRef, DurationType } from '@common/types'

export interface DetectedCondition {
  conditionId: string
  conditionName: string
  value?: number            // for ongoing damage and regeneration
  damageType?: string       // for ongoing damage: 'fire', 'necrotic', etc.
  duration?: { type: DurationType; remaining?: number; note?: string }
  matchStart: number        // character offset in the text
  matchEnd: number
  grantsCATo?: 'all' | 'source' | 'source-allies'  // only for combat-advantage
}

// Conditions to detect — ordered by specificity (longer patterns first)
const CONDITION_MATCHERS: { id: string; name: string; pattern: RegExp }[] = [
  { id: 'regenerating', name: 'Regenerating', pattern: /\bgains?\s+regeneration\s+(\d+)\b/gi },
  { id: 'ongoing-damage', name: 'Ongoing Damage', pattern: /\bongoing\s+(\d+)\s+((?:\w+\s+(?:and\s+\w+\s+)?)?)?damage\b/gi },
  { id: 'combat-advantage', name: 'Grants Combat Advantage', pattern: /\bgrants?\s+combat\s+advantage\b/gi },
  { id: 'immobilized', name: 'Immobilized', pattern: /\b(?:is\s+|becomes?\s+)immobilized\b/gi },
  { id: 'unconscious', name: 'Unconscious', pattern: /\b(?:is\s+|becomes?\s+|falls?\s+)unconscious\b/gi },
  { id: 'restrained', name: 'Restrained', pattern: /\b(?:is\s+|becomes?\s+)restrained\b/gi },
  { id: 'dominated', name: 'Dominated', pattern: /\b(?:is\s+|becomes?\s+)dominated\b/gi },
  { id: 'weakened', name: 'Weakened', pattern: /\b(?:is\s+|becomes?\s+)weakened\b/gi },
  { id: 'blinded', name: 'Blinded', pattern: /\b(?:is\s+|becomes?\s+)blinded\b/gi },
  { id: 'stunned', name: 'Stunned', pattern: /\b(?:is\s+|becomes?\s+)stunned\b/gi },
  { id: 'slowed', name: 'Slowed', pattern: /\b(?:is\s+|becomes?\s+)slowed\b/gi },
  { id: 'marked', name: 'Marked', pattern: /\bis\s+marked\b/gi },
  { id: 'dazed', name: 'Dazed', pattern: /\b(?:is\s+|becomes?\s+)dazed\b/gi },
  { id: 'prone', name: 'Prone', pattern: /\b(?:knocked\s+|falls?\s+|is\s+)prone\b/gi },
  { id: 'petrified', name: 'Petrified', pattern: /\b(?:is\s+|becomes?\s+)petrified\b/gi },
]

// Duration patterns — check text AFTER the condition match
const DURATION_PATTERNS: { pattern: RegExp; duration: DetectedCondition['duration'] }[] = [
  { pattern: /\(save ends both\)/i, duration: { type: 'save-ends' } },
  { pattern: /\(save ends all\)/i, duration: { type: 'save-ends' } },
  { pattern: /\(save ends\)/i, duration: { type: 'save-ends' } },
  { pattern: /until the (?:end|beginning) of .+?next turn/i, duration: { type: 'eont' } },
  { pattern: /until the start of .+?next turn/i, duration: { type: 'sont' } },
  { pattern: /until the end of the encounter/i, duration: { type: 'encounter' } },
]

// "Grants combat advantage" recipient classification — looks at text immediately
// after the match. Order matters: check 'all' before 'allies' to avoid mistaking
// "to all enemies" for an allies clause.
const GRANTS_CA_ALL_PATTERN = /^[\s,.]*\bto\s+(?:all\b|any\s+(?:enemy|creature))/i
const GRANTS_CA_ALLIES_PATTERN = /^[\s,.]*\bto\s+(?:[\w'\- ]*?\b)?allies\b/i
const GRANTS_CA_TO_PATTERN = /^[\s,.]*\bto\s+/i

function classifyGrantsCATarget(textAfterMatch: string): 'all' | 'source' | 'source-allies' {
  const window = textAfterMatch.substring(0, 80)
  if (GRANTS_CA_ALL_PATTERN.test(window)) return 'all'
  if (GRANTS_CA_ALLIES_PATTERN.test(window)) return 'source-allies'
  if (GRANTS_CA_TO_PATTERN.test(window)) return 'source'
  // No "to X" phrase — plain "grants combat advantage" is universal
  return 'all'
}

// Default durations when no explicit duration is stated in the power text
const CONDITION_DEFAULT_DURATION: Record<string, DetectedCondition['duration']> = {
  'prone': { type: 'indefinite' },
  'marked': { type: 'eont' },
  'unconscious': { type: 'indefinite' },
  'combat-advantage': { type: 'indefinite' },
  'regenerating': { type: 'encounter' },
  'dying': { type: 'indefinite' },
  'bloodied': { type: 'indefinite' },
  // All others default to save-ends
}
const FALLBACK_DURATION: DetectedCondition['duration'] = { type: 'save-ends' }

// Context exclusion — if these patterns appear near the condition name, it's a reference, not an application
const EXCLUSION_BEFORE = /(?:while\s+|while\s+.{0,20}\s+is\s+|against\s+(?:a\s+)?|if\s+(?:the\s+)?(?:target|creature|enemy)\s+|if\s+.{0,20}\s+is\s+|a\s+\w+\s+)$/i

function extractDuration(text: string, afterPos: number, conditionId: string): DetectedCondition['duration'] {
  const remaining = text.substring(afterPos, afterPos + 120)
  for (const dp of DURATION_PATTERNS) {
    if (dp.pattern.test(remaining)) return dp.duration
  }
  return CONDITION_DEFAULT_DURATION[conditionId] ?? FALLBACK_DURATION
}

/** Condition keywords in printed text, with the duration printed after them. */
export function detectConditionsInText(text: string): DetectedCondition[] {
  if (!text) return []
  const results: DetectedCondition[] = []
  for (const matcher of CONDITION_MATCHERS) {
    matcher.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = matcher.pattern.exec(text)) !== null) {
      // A reference ("while the target is slowed"), not an application.
      const before = text.substring(Math.max(0, match.index - 40), match.index)
      if (EXCLUSION_BEFORE.test(before)) continue
      // Highlight only the match itself; the duration printed after it is still assigned.
      const detected: DetectedCondition = {
        conditionId: matcher.id, conditionName: matcher.name, matchStart: match.index, matchEnd: match.index + match[0].length,
        duration: extractDuration(text, match.index + match[0].length, matcher.id),
      }
      if (matcher.id === 'ongoing-damage' && match[1]) {
        detected.value = parseInt(match[1])
        if (match[2]) detected.damageType = match[2].trim().toLowerCase()
      }
      if (matcher.id === 'regenerating' && match[1]) detected.value = parseInt(match[1])
      if (matcher.id === 'combat-advantage') detected.grantsCATo = classifyGrantsCATarget(text.substring(match.index + match[0].length))
      results.push(detected)
    }
  }
  return results
}

/** Disease names in printed text that talks about exposure. */
export function detectDiseasesInText(text: string, names: DiseaseName<DiseaseRef>[]) {
  return locateDiseaseMentions(text, names).map(m => ({ start: m.start, end: m.end, name: m.disease.name, ref: m.disease.ref }))
}
