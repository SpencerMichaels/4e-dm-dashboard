/**
 * Normalize a value that may be a string array, a comma-separated string,
 * or undefined/null into a clean string array.
 *
 * - If already an array, returns it as-is.
 * - If a string, splits on commas, trims whitespace, and drops empty entries.
 * - Otherwise returns an empty array.
 */
export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean)
  return []
}
