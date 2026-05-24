/**
 * Capitalize the first character of a string.
 * Returns the input unchanged if it's empty or falsy.
 */
export function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
