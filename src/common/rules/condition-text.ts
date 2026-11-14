// Condition descriptions from the installed content pack (conditions.json), by condition id. Main
// sets them at startup and after a pack import; the rules served to the renderers and the combat
// engine's player view read them through withConditionText.

import type { ConditionDef } from '../types/system-plugin'

let text: Record<string, string> = {}

export function setConditionText(descriptions: Record<string, string>): void {
  text = descriptions
}

/** `def` with the pack's description when it has none of its own. */
export function withConditionText<T extends ConditionDef | undefined>(def: T): T {
  return def && !def.description && text[def.id] ? { ...def, description: text[def.id] } : def
}
