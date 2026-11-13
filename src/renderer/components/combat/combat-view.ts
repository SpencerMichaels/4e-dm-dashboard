// A combatant's kit content as the stat block the combat panels, reaction tiles, and popout render.
// Behavior (recharges, regeneration, damage modifiers) is read from src/common/combat/facts.ts; this is
// only the display projection, with each action carrying the facts the panels show for it.

import type { Monster, Trap } from '@kit'
import type { CombatantState } from '@common/types'
import { combatEntries } from '@common/combat/facts'
import { powerToLegacy } from '@common/authoring/legacy'
import { kitStatBlock } from '../creature/kit-view'

const cache = new WeakMap<object, Record<string, any>>()

export function combatStatBlock(c: CombatantState): Record<string, any> {
  if (!c.content) return {}
  const cached = cache.get(c.content)
  if (cached) return cached
  const sb = c.kind === 'trap' ? trapStatBlock(c.content as Trap) : kitStatBlock(c.content as Monster, c.attribution)
  // Actions start with the combat entries, in their order (traits, auras, powers), so usedPowers indexes both.
  const entries = combatEntries(c)
  sb.actions = (sb.actions as Record<string, unknown>[]).map((a, i) => {
    const e = entries[i]
    return e ? { ...a, ...(e.usesPerEncounter ? { encounterUses: e.usesPerEncounter } : {}), ...e.hints } : a
  })
  cache.set(c.content, sb)
  return sb
}

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

/**
 * A trap in the creature stat block's shape. Detection, the trigger, and countermeasures follow the
 * powers as text entries (after the combat entries, so power indexes are unchanged).
 */
export function trapStatBlock(t: Trap): Record<string, any> {
  const { walk, notes, ...speeds } = t.speed ?? { walk: 0 }
  const text = (name: string, effect: string) => ({ name, entryType: 'trait', keywords: [], effect })
  return {
    level: t.level, role: t.role, monsterModifier: t.rank === 'standard' ? '' : t.rank, creatureType: cap(t.kind),
    xp: t.xp, initiative: t.initiative, hp: t.hp, hpText: t.hpText, noHitPoints: t.hp === undefined,
    speed: walk || undefined, speeds, speedNotes: notes,
    ac: t.defenses?.ac, defenses: t.defenses ?? {}, immunities: t.immune, resistances: t.resist, weaknesses: [],
    actions: [
      ...t.traits.map(x => ({ name: x.name, entryType: 'trait', keywords: x.keywords, effect: x.text.text })),
      ...t.auras.map(x => ({ name: x.name, entryType: 'aura', keywords: x.keywords, auraRange: x.range, effect: x.text.text })),
      ...t.powers.map(powerToLegacy),
      ...(t.trigger ? [text('Trigger', t.trigger.text)] : []),
      ...(t.detect.length ? [text('Detect', t.detect.map(d => `${cap(d.skill)}${d.dc === null ? '' : ` DC ${d.dc}`}: ${d.text}`).join('\n'))] : []),
      ...(t.countermeasures.length ? [text('Countermeasures', t.countermeasures.map(x => x.text).join('\n'))] : []),
    ],
    description: [t.flavor, t.description].filter(Boolean).join('\n'),
    source: t.sources.map(s => `${s.book}${s.page ? ', ' + s.page : ''}`).join('; '),
  }
}
