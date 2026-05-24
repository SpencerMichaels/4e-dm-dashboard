import type { ConditionDef } from '@common/types/system-plugin'

/**
 * Calculate the HP percentage, clamped to 0 when maxHp is zero.
 */
export function hpPercentage(hp: number, maxHp: number): number {
  return maxHp > 0 ? (hp / maxHp) * 100 : 0
}

/**
 * Return the appropriate CSS color variable for an HP percentage.
 */
export function hpColor(hpPct: number): string {
  return hpPct > 50
    ? 'var(--color-hp-full)'
    : hpPct > 25
      ? 'var(--color-hp-mid)'
      : 'var(--color-hp-low)'
}

/**
 * Derive a human-readable name for a condition instance.
 *
 * Priority:
 * 1. `customName` on the condition instance
 * 2. Special handling for 'ongoing-damage' prefix
 * 3. Matching definition's `.name`
 * 4. Fallback: title-case the conditionId (replace hyphens with spaces)
 */
export function formatConditionName(
  conditionId: string,
  conditionDefs: ConditionDef[],
  customName?: string | null,
): string {
  if (customName) return customName

  // Handle ongoing-damage variants (e.g. "ongoing-damage-fire-5")
  if (conditionId.startsWith('ongoing-damage')) {
    const def = conditionDefs.find(d => d.id === 'ongoing-damage')
    return def?.name ?? 'Ongoing Damage'
  }

  const def = conditionDefs.find(d => d.id === conditionId)
  if (def) return def.name

  // Fallback: title-case from the hyphenated ID
  return conditionId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase())
}
