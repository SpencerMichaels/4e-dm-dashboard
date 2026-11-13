/**
 * `color` at `opacity` (0–1), as a CSS color-mix() expression.
 *
 * Use this instead of appending hex alpha digits (`color + '40'`), which only
 * works for 6-digit hex and silently breaks for theme tokens like
 * `var(--danger)`.
 */
export function withAlpha(color: string, opacity: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, opacity)) * 100)
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

/** `color` blended toward `base` (default: the surface color), keeping `amount` (0–1) of `color`. */
export function tint(color: string, amount: number, base = 'var(--surface)'): string {
  const pct = Math.round(Math.min(1, Math.max(0, amount)) * 100)
  return `color-mix(in srgb, ${color} ${pct}%, ${base})`
}
