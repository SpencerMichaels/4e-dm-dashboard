// A trap's countermeasures as combat acts on them: each printed countermeasure line with the
// structured countermeasure clauses in it (schema v15: what success does, the checks and DCs, the
// check's action, a skill challenge's complexity, an attackable part's defenses and hit points).
// Published traps carry these clauses when they come from the agent-cleaned content repo; a line
// without one is only text.

import type { Ability, ActionType, CounterCheck, Defense, Trap } from '@kit'

type CountermeasureClause = Extract<Trap['countermeasures'][number]['clauses'][number], { kind: 'countermeasure' }>

export interface Countermeasure {
  /** Stable within the trap: `<line>/<clause>`, the key of its skill challenge progress. */
  key: string
  effect: CountermeasureClause['effect']
  checks: CounterCheck[]
  action?: ActionType
  complexity?: { successes: number; failures?: number }
  defenses?: Partial<Record<Defense, number>>
  hp?: number
}

export interface CountermeasureLine { text: string; measures: Countermeasure[] }

/** Skill challenge progress per countermeasure key (`CombatantState.countermeasures`). */
export type CountermeasureProgress = Record<string, { successes: number; failures: number }>

export function countermeasureLines(t: Trap): CountermeasureLine[] {
  return t.countermeasures.map((line, i) => ({
    text: line.text,
    measures: line.clauses.flatMap((c, j) => c.kind !== 'countermeasure' ? [] : [{
      key: `${i}/${j}`, effect: c.effect, checks: c.checks ?? [],
      ...(c.action ? { action: c.action } : {}), ...(c.complexity ? { complexity: c.complexity } : {}),
      ...(c.defenses ? { defenses: c.defenses } : {}), ...(c.hp !== undefined ? { hp: c.hp } : {}),
    }]),
  }))
}

const ABILITY_NAMES: Record<Ability, string> = { str: 'Strength', con: 'Constitution', dex: 'Dexterity', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Thievery DC 22", "Strength DC 28", "Dungeoneering DC 30 (trained)". */
export function checkLabel(c: CounterCheck): string {
  const name = c.skill.startsWith('ability:') ? ABILITY_NAMES[c.skill.slice(8) as Ability] ?? c.skill.slice(8) : cap(c.skill)
  return `${name}${c.dc !== undefined ? ` DC ${c.dc}` : ''}${c.trained ? ' (trained)' : ''}`
}

const DEFENSE_SHORT: Record<Defense, string> = { ac: 'AC', fortitude: 'Fort', reflex: 'Ref', will: 'Will' }

/** An attackable part: "AC 4, Ref 4, Fort 10; HP 60". */
export function partLabel(m: Pick<Countermeasure, 'defenses' | 'hp'>): string {
  const defs = Object.entries(m.defenses ?? {}).map(([d, v]) => `${DEFENSE_SHORT[d as Defense] ?? d} ${v}`).join(', ')
  return [defs, m.hp !== undefined ? `HP ${m.hp}` : ''].filter(Boolean).join('; ')
}

/** What the effect button does to the whole trap: disable and destroy stop it; delay is only logged. */
export const STOPS_TRAP: Partial<Record<Countermeasure['effect'], true>> = { disable: true, destroy: true }
export const EFFECT_LABEL: Partial<Record<Countermeasure['effect'], string>> = { disable: 'Disable', destroy: 'Destroy', delay: 'Delay' }

/**
 * One more success or failure (or one fewer, with `delta` -1) on a skill challenge countermeasure.
 * `done` says the challenge just reached its successes (`'success'`) or its failures (`'failure'`).
 */
export function recordCheck(progress: CountermeasureProgress | undefined, m: Countermeasure, outcome: 'success' | 'failure', delta: 1 | -1 = 1):
  { progress: CountermeasureProgress; done?: 'success' | 'failure' } {
  const before = progress?.[m.key] ?? { successes: 0, failures: 0 }
  const field = outcome === 'success' ? 'successes' : 'failures'
  const after = { ...before, [field]: Math.max(0, before[field] + delta) }
  const next = { ...progress, [m.key]: after }
  const goal = outcome === 'success' ? m.complexity?.successes : m.complexity?.failures
  const done = delta > 0 && goal !== undefined && before[field] < goal && after[field] >= goal ? outcome : undefined
  return done ? { progress: next, done } : { progress: next }
}
