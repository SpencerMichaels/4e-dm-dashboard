// What a power's printed line lets the DM apply in combat, read from its effect clauses (kit `Line`):
// each applicable clause with its span in the text, what it applies (a condition, ongoing damage,
// grants-CA, regeneration, a disease, or a named effect such as a penalty or a resistance), and its
// "save ends both" group (clauses sharing a `saveGroup` are applied together and end on one save).
// Text no clause covers is left to the card's regex fallback (`uncoveredRanges`).

import type { Clause, Duration, Line, OptionClause, Who } from '@kit'
import type { DurationType } from '../types/system-plugin'
import dnd4e from '../rules/dnd4e'

/**
 * A duration before the targets are known. EONT/SONT name whose turn ends it: the source's (the
 * power's owner) or the target's; `next: false` is the current turn ("until the end of your turn").
 */
export interface ApplyDuration { type: DurationType; note?: string; whose?: 'source' | 'target'; next?: boolean }

/** One condition-like effect, in `AppliedCondition`'s terms (without source, target, or save group). */
export interface ApplyCondition {
  /** A condition id, 'ongoing-damage', 'regenerating', 'combat-advantage', or 'custom' for a named effect. */
  conditionId: string
  customName?: string
  customDescription?: string
  value?: number
  duration: ApplyDuration
  grantsCATo?: 'all' | 'source' | 'source-allies'
}

export type ClauseEffect =
  | { kind: 'condition'; label: string; apply: ApplyCondition }
  | { kind: 'disease'; label: string; disease: string; diseaseId?: string; stage?: number }

export interface ClauseSpan {
  at: [number, number]
  effect: ClauseEffect
  /** Applied together with this one: the effects of its save group (itself included), in print order. */
  group: ClauseEffect[]
  who: Who[]
  /** Its save group, unique within the line (a choice option is a scope of its own). */
  saveGroup?: string
  /** The printed conditions under which it applies, or does not; shown, never checked. */
  if?: string[]
  unless?: string[]
  optional?: true
}

const CONDITION_NAMES = new Map(dnd4e.conditions.map(c => [c.id, c.name]))
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
const list = <T,>(v: T | T[] | undefined): T[] => v === undefined ? [] : Array.isArray(v) ? v : [v]

export function applyDuration(d: Duration | undefined): ApplyDuration | undefined {
  switch (d?.kind) {
    case 'save-ends': return { type: 'save-ends' }
    case 'turn-end': return { type: 'eont', whose: d.whose, next: d.next }
    case 'turn-start': return { type: 'sont', whose: d.whose, next: d.next }
    case 'encounter': return { type: 'encounter' }
    case 'sustain': return { type: 'custom', note: `sustain ${d.action}` }
    case 'until': return { type: 'custom', note: d.text }
    case 'while-in-aura': return { type: 'custom', note: 'while in the aura' }
    case 'indefinite': return { type: 'indefinite' }
    default: return undefined
  }
}

/** A value at a level: the highest `byLevel` step at or below it ("Level 21: regeneration 10"). */
export function atLevel(value: number, byLevel: { level: number; value: number | string }[] | undefined, level: number | undefined): number {
  if (level === undefined || !byLevel) return value
  const step = byLevel.filter(s => s.level <= level && typeof s.value === 'number').sort((a, b) => b.level - a.level)[0]
  return step ? step.value as number : value
}

const damageTypes = (types: string[], choice?: string[]) => types.length ? types.join(' and ') : (choice ?? []).join(' or ')
const signed = (v: number | string) => typeof v === 'number' && v > 0 ? `+${v}` : String(v)
const STAT_NAMES: Record<string, string> = { ac: 'AC', 'saving-throws': 'saves', 'death-saves': 'death saves', 'skill-checks': 'skill checks', 'ability-checks': 'ability checks', 'forced-movement': 'forced movement' }
const statName = (s: string) => STAT_NAMES[s] ?? s.replace(/^(skill|ability):/, '').replace(/-/g, ' ')

/** A named effect's short label: "-2 attack", "resist 10 fire"; other kinds use their printed words. */
function effectLabel(c: Clause, printed: string, level?: number): string {
  switch (c.kind) {
    case 'modifier': return `${signed(typeof c.value === 'number' ? atLevel(c.value, c.byLevel, level) : c.value)} ${list(c.stat).map(statName).join(', ')}`
    case 'resistance': return `Resist ${atLevel(c.value, c.byLevel, level)} ${c.type === 'choice' ? damageTypes([], c.typeChoice) : c.type}`
    case 'vulnerability': return `Vulnerable ${c.value} ${c.type === 'choice' ? damageTypes([], c.typeChoice) : c.type}`
    case 'status': return cap(c.status.replace(/-/g, ' '))
    case 'state': return cap(c.name)
    case 'immunity': return `Immune ${c.to.join(', ')}`
    default: {
      const words = printed.replace(/\s*\((?:save ends[^)]*)\)\s*$/i, '').trim()
      return cap(words.length > 48 ? words.slice(0, 47).trimEnd() + '…' : words)
    }
  }
}

/** Kinds that become a named effect on the target while their duration lasts. */
const NAMED_EFFECT_KINDS = new Set<Clause['kind']>([
  'modifier', 'resistance', 'vulnerability', 'status', 'state', 'immunity', 'lose-resistance', 'reduced-healing',
  'power-restriction', 'concealment', 'speed', 'crit-range', 'half-damage', 'move-limit', 'sense', 'size-change', 'keyword',
])

/** What one clause applies, or undefined when it is nothing to put on a creature; `level` picks `byLevel` values. */
export function clauseEffect(c: Clause, printed: string, level?: number): ClauseEffect | undefined {
  switch (c.kind) {
    case 'condition': {
      const escape = c.escapeDc !== undefined ? `escape DC ${c.escapeDc}` : undefined
      return { kind: 'condition', label: CONDITION_NAMES.get(c.condition) ?? cap(c.condition.replace(/-/g, ' ')), apply: {
        conditionId: c.condition, duration: applyDuration(c.duration) ?? { type: 'indefinite' },
        ...(CONDITION_NAMES.has(c.condition) ? {} : { customName: cap(c.condition.replace(/-/g, ' ')) }),
        ...(escape ? { customDescription: escape } : {}),
      } }
    }
    case 'ongoing-damage': {
      const types = damageTypes(c.types, c.typeChoice)
      const amount = atLevel(c.amount, c.byLevel, level)
      return { kind: 'condition', label: `Ongoing ${amount}${types ? ' ' + types : ''}`, apply: {
        conditionId: 'ongoing-damage', value: amount, duration: applyDuration(c.duration) ?? { type: 'save-ends' },
        ...(types ? { customDescription: types } : {}),
      } }
    }
    case 'grants-ca': {
      if (c.to !== 'all' && c.to !== 'source' && c.to !== 'source-allies') return undefined
      return { kind: 'condition', label: 'Grants CA', apply: { conditionId: 'combat-advantage', grantsCATo: c.to, duration: applyDuration(c.duration) ?? { type: 'indefinite' } } }
    }
    case 'regeneration': {
      const value = atLevel(c.value, c.byLevel, level)
      return { kind: 'condition', label: `Regeneration ${value}`, apply: { conditionId: 'regenerating', value, duration: applyDuration(c.duration) ?? { type: 'encounter' } } }
    }
    case 'disease':
      return { kind: 'disease', label: c.disease, disease: c.disease, ...(c.diseaseId ? { diseaseId: c.diseaseId } : {}), ...(c.stage !== undefined ? { stage: c.stage } : {}) }
    default: {
      if (!NAMED_EFFECT_KINDS.has(c.kind)) return undefined
      const duration = applyDuration((c as { duration?: Duration }).duration)
      if (!duration) return undefined
      const label = effectLabel(c, printed, level)
      return { kind: 'condition', label, apply: { conditionId: 'custom', customName: label, duration } }
    }
  }
}

/** The applicable clauses of a line, in print order, each with its save group; `level` picks `byLevel` values. */
export function lineEffects(line: Line, level?: number): ClauseSpan[] {
  const out: ClauseSpan[] = []
  // A choice's options are each a scope of their own: their save groups don't reach outside the option.
  const scope = (clauses: readonly (Clause | OptionClause)[], id: string) => {
    const spans: ClauseSpan[] = []
    clauses.forEach((c, i) => {
      if (c.kind === 'choice') return c.options.forEach((option, j) => scope(option, `${id}${i}.${j}/`))
      if (!c.at) return
      const effect = clauseEffect(c, line.text.slice(c.at[0], c.at[1]), level)
      if (!effect) return
      const saveGroup = (c as { saveGroup?: string }).saveGroup
      spans.push({
        at: c.at, effect, group: [effect], who: list((c as { who?: Who | Who[] }).who),
        ...(saveGroup ? { saveGroup: id + saveGroup } : {}),
        ...(c.if ? { if: list(c.if) } : {}), ...(c.unless ? { unless: list(c.unless) } : {}), ...(c.optional ? { optional: true as const } : {}),
      })
    })
    for (const s of spans) if (s.saveGroup) s.group = spans.filter(o => o.saveGroup === s.saveGroup).map(o => o.effect)
    out.push(...spans)
  }
  scope(line.clauses, '')
  return out.sort((a, b) => a.at[0] - b.at[0])
}

/** Every clause's span, applicable or not ('unparsed' included: text the cleaner read and left as text). */
export function coveredRanges(line: Line): [number, number][] {
  return line.clauses.filter(c => c.at).map(c => c.at)
}

/** The parts of a line's text no clause covers, as [start, end) ranges with something besides spacing and punctuation. */
export function uncoveredRanges(line: Line): [number, number][] {
  const covered = coveredRanges(line).slice().sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let pos = 0
  for (const [s, e] of covered) {
    if (s > pos) out.push([pos, s])
    pos = Math.max(pos, e)
  }
  if (pos < line.text.length) out.push([pos, line.text.length])
  return out.filter(([s, e]) => /\w/.test(line.text.slice(s, e)))
}
