/**
 * Detect condition keywords in power card text fields.
 * Returns structured data about which conditions a power applies and their durations.
 */

import type { ConditionDef } from '@common/types/system-plugin'

export interface DetectedCondition {
  conditionId: string
  conditionName: string
  value?: number            // for ongoing damage
  damageType?: string       // for ongoing damage: 'fire', 'necrotic', etc.
  duration?: { type: import('@common/types/system-plugin').DurationType; remaining?: number; note?: string }
  sourceField: 'hit' | 'effect' | 'miss'
  matchStart: number        // character offset in the source field text
  matchEnd: number
  matchText: string         // the matched substring
}

interface PowerFields {
  hit?: string
  effect?: string
  miss?: string
  target?: string           // if empty/missing, skip detection (self-referencing power)
}

// Conditions to detect — ordered by specificity (longer patterns first)
const CONDITION_MATCHERS: { id: string; name: string; pattern: RegExp }[] = [
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

// Default durations when no explicit duration is stated in the power text
const CONDITION_DEFAULT_DURATION: Record<string, DetectedCondition['duration']> = {
  'prone': { type: 'indefinite' },
  'marked': { type: 'eont' },
  'unconscious': { type: 'indefinite' },
  'combat-advantage': { type: 'indefinite' },
  'dying': { type: 'indefinite' },
  // All others default to save-ends
}
const FALLBACK_DURATION: DetectedCondition['duration'] = { type: 'save-ends' }

// Context exclusion — if these patterns appear near the condition name, it's a reference, not an application
const EXCLUSION_BEFORE = /(?:while\s+|while\s+.{0,20}\s+is\s+|against\s+(?:a\s+)?|if\s+(?:the\s+)?(?:target|creature|enemy)\s+|if\s+.{0,20}\s+is\s+|a\s+\w+\s+)$/i

function extractDuration(text: string, afterPos: number, conditionId: string): { duration: DetectedCondition['duration']; endPos: number } {
  const remaining = text.substring(afterPos, afterPos + 120)
  for (const dp of DURATION_PATTERNS) {
    const m = remaining.match(dp.pattern)
    if (m) return { duration: dp.duration, endPos: afterPos + m.index! + m[0].length }
  }
  return { duration: CONDITION_DEFAULT_DURATION[conditionId] ?? FALLBACK_DURATION, endPos: afterPos }
}

function detectInField(
  text: string,
  field: 'hit' | 'effect' | 'miss',
): DetectedCondition[] {
  if (!text) return []
  const results: DetectedCondition[] = []

  for (const matcher of CONDITION_MATCHERS) {
    // Reset regex state
    matcher.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = matcher.pattern.exec(text)) !== null) {
      // Check for exclusion context — look at the 40 chars before the match
      const before = text.substring(Math.max(0, match.index - 40), match.index)
      if (EXCLUSION_BEFORE.test(before)) continue

      const { duration, endPos } = extractDuration(text, match.index + match[0].length, matcher.id)
      const fullEnd = endPos > match.index + match[0].length ? endPos : match.index + match[0].length
      const detected: DetectedCondition = {
        conditionId: matcher.id,
        conditionName: matcher.name,
        sourceField: field,
        matchStart: match.index,
        matchEnd: fullEnd,
        matchText: text.substring(match.index, fullEnd),
        duration,
      }

      // For ongoing damage, extract the value and damage type
      if (matcher.id === 'ongoing-damage' && match[1]) {
        detected.value = parseInt(match[1])
        if (match[2]) detected.damageType = match[2].trim().toLowerCase()
      }

      results.push(detected)
    }
  }

  return results
}

/**
 * Detect conditions applied by a power's hit/effect/miss text.
 * Skips powers that have no target and no attack — these are self-referencing.
 */
export function detectConditions(power: PowerFields): DetectedCondition[] {
  // Skip self-referencing powers: no target, no attack characteristics
  const hasTarget = !!power.target?.trim()
  const hasAttack = !!(power as any).attackBonus || !!(power as any).defense || !!(power as any).rangeType
  if (!hasTarget && !hasAttack && !power.hit) return []

  const results: DetectedCondition[] = []
  if (power.hit) results.push(...detectInField(power.hit, 'hit'))
  if (power.effect) results.push(...detectInField(power.effect, 'effect'))
  if (power.miss) results.push(...detectInField(power.miss, 'miss'))
  return results
}

/**
 * Given a text string and detected conditions within it, split into segments
 * for rendering with highlighted condition keywords.
 */
export function splitTextWithHighlights(
  text: string,
  detections: DetectedCondition[],
  field: 'hit' | 'effect' | 'miss',
): { text: string; detection?: DetectedCondition }[] {
  const fieldDetections = detections
    .filter(d => d.sourceField === field)
    .sort((a, b) => a.matchStart - b.matchStart)

  if (fieldDetections.length === 0) return [{ text }]

  const segments: { text: string; detection?: DetectedCondition }[] = []
  let pos = 0
  for (const d of fieldDetections) {
    if (d.matchStart > pos) {
      segments.push({ text: text.substring(pos, d.matchStart) })
    }
    segments.push({ text: d.matchText, detection: d })
    pos = d.matchEnd
  }
  if (pos < text.length) {
    segments.push({ text: text.substring(pos) })
  }
  return segments
}
