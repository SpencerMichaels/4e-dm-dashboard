/** Deterministic background color from a creature name.
 *  Used by CombatToken (DM + player initiative cards) and the player toast
 *  component so monsters get a consistent visual identity even without an
 *  uploaded token image. */
export function tokenColorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 40%, 35%)`
}
