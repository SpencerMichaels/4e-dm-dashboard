// Small text normalizers shared by the content parsers (build-time only).

/**
 * Rejoin words that the source split at an "fi"/"fl" ligature ("fi re" -> "fire",
 * "fl y" -> "fly", "diffi cult" -> "difficult"). No 4e word ends in "fi" or "fl",
 * so a word fragment ending in one of them followed by a space and a lowercase
 * letter is always a split ligature.
 */
export function fixLigatureSplits(text: string): string {
  return text.replace(/\b([A-Za-z]*[fF][il]) (?=[a-z])/g, '$1')
}

const DIE_FACES: Record<string, string> = { '⚀': '1', '⚁': '2', '⚂': '3', '⚃': '4', '⚄': '5', '⚅': '6' }

/** Replace die-face glyphs (⚄ ⚅) with digits. */
export function dieGlyphsToDigits(text: string): string {
  return text.replace(/[⚀-⚅]/g, c => DIE_FACES[c])
}

/**
 * Normalize a recharge condition: die glyphs or digit lists become "N-6" style
 * ranges ("⚄ ⚅" -> "5-6", "⚅" -> "6"); other text is returned trimmed.
 */
export function normalizeRecharge(text: string): string {
  const rc = dieGlyphsToDigits(text).replace(/\s+/g, ' ').trim()
  if (/^[1-6](?:\s*[1-6])*$/.test(rc)) {
    const nums = rc.replace(/\s+/g, '').split('').map(Number).sort((a, b) => a - b)
    const lo = nums[0], hi = nums[nums.length - 1]
    return lo === hi ? String(lo) : `${lo}-${hi}`
  }
  return rc
}

const ACTION_LABELS = [
  'Standard Action', 'Move Action', 'Minor Action', 'Free Action',
  'Immediate Interrupt', 'Immediate Reaction', 'Opportunity Action', 'No Action',
]

/**
 * Canonical capitalization for an action-type label ("Immediate ReAction" ->
 * "Immediate Reaction", "No action" -> "No Action"). Text that is not a plain
 * action label (e.g. "1/round; Free Action") keeps its prefix and gets the
 * label part normalized.
 */
export function normalizeActionLabel(text: string): string {
  let out = text.trim()
  for (const label of ACTION_LABELS) {
    out = out.replace(new RegExp(`\\b${label.replace(' ', '\\s+')}s?\\b`, 'i'), label)
  }
  return out
}
