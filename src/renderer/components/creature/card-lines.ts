// A power card's body as keyed lines, in book order (the kit's POWER_LINE_ORDER). From a kit Power
// each line keeps its kit Line (its effect clauses drive click-to-apply), and each attack after the
// first is a group of its own, headed by its attack row. Entries without kit content (editor previews,
// item and template viewers) go through the kit's groupLines, with damage parts folded into Hit.
// Keys name a line within its card: "a0.hit", "a1.miss", "a0.fs0" (a failed save), "effect", "x0".

import type { Attack, Line, Power } from '@kit'
import { groupLines, sustainLine } from '@kit'
import { rangeText } from '@common/authoring/legacy'
import type { PowerCardEntry } from './PowerCardView'

export interface KeyedLine {
  key: string
  /** Bold label before the text; empty for unlabelled text (traits, auras). */
  label: string
  text: string
  /** The kit line, when the card was drawn from kit content. */
  line?: Line
  /** The entry's damage parts lead this line (a Hit line of an entry with structured damage). */
  damage?: true
}

/** An attack after the first: its own header row ("Secondary Attack", when it happens) and attack row. */
export interface SubAttack {
  label: string
  after?: Attack['after']
  rangeType: string
  rangeValue: string
  target: string
  bonus: string
  vs: string
}

export interface CardGroup { attack?: SubAttack; lines: KeyedLine[] }

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
const ORDINAL: Record<number, string> = { 1: 'First', 2: 'Second', 3: 'Third' }
const failedSaveLabel = (n: number | 'each') => `${n === 'each' ? 'Each' : ORDINAL[n] ?? `${n}th`} Failed Saving Throw`
export const attackBonusText = (a: Attack) => a.bonus.kind === 'fixed' ? (a.bonus.value >= 0 ? `+${a.bonus.value}` : String(a.bonus.value))
  : a.bonus.kind === 'level' ? `level + ${a.bonus.plus}` : a.bonus.text
const defenseText = (vs: Attack['vs']) => vs === 'ac' ? 'AC' : vs === 'unknown' ? '?' : cap(vs)

function attackLines(a: Attack, i: number): KeyedLine[] {
  const out: KeyedLine[] = []
  const add = (key: string, label: string, line: Line | undefined) => { if (line?.text.trim()) out.push({ key: `a${i}.${key}`, label, text: line.text, line }) }
  add('hit', 'Hit', a.hit)
  add('critical', 'Critical', a.critical)
  add('miss', 'Miss', a.miss)
  add('aftereffect', 'Aftereffect', a.aftereffect)
  ;(a.failedSaves ?? []).forEach((f, j) => add(`fs${j}`, failedSaveLabel(f.n), f.line))
  return out
}

/** A kit power's lines, grouped: requirement; trigger (with its effect when there is no attack); the
 * first attack's outcome; each later attack; the effect; the sustain; Special; other printed lines. */
export function kitCardGroups(p: Power): CardGroup[] {
  const groups: CardGroup[] = []
  const push = (g: CardGroup) => { if (g.lines.length || g.attack) groups.push(g) }
  const one = (key: string, label: string, line: Line | undefined): KeyedLine[] => line?.text.trim() ? [{ key, label, text: line.text, line }] : []
  const triggered = !!p.trigger && !p.attacks.length
  push({ lines: one('requirement', 'Requirement', p.requirement) })
  push({ lines: [...one('trigger', 'Trigger', p.trigger), ...(triggered ? one('effect', 'Effect', p.effect) : [])] })
  p.attacks.forEach((a, i) => {
    if (i === 0) return push({ lines: attackLines(a, 0) })
    push({
      attack: { label: a.name ?? `${cap(a.label)} Attack`, ...(a.after ? { after: a.after } : {}), rangeType: a.range.kind, rangeValue: rangeText(a.range), target: a.target, bonus: attackBonusText(a), vs: defenseText(a.vs) },
      lines: attackLines(a, i),
    })
  })
  if (!triggered) push({ lines: one('effect', 'Effect', p.effect) })
  if (p.sustain) {
    const label = sustainLine(p.sustain.action).label
    push({ lines: p.sustain.line?.text.trim() ? [{ key: 'sustain', label, text: p.sustain.line.text, line: p.sustain.line }] : [{ key: 'sustain', label, text: '' }] })
  }
  push({ lines: one('special', 'Special', p.special) })
  push({ lines: (p.extraLines ?? []).flatMap((x, j) => one(`x${j}`, cap(x.label), x.line)) })
  return groups
}

/** An entry without kit content, through the kit's groupLines; damage parts lead the Hit line. */
export function legacyCardGroups(e: PowerCardEntry, attack: boolean, hasDamage: boolean): { groups: CardGroup[]; basic?: 'melee' | 'ranged' } {
  const { groups, basic } = groupLines({ ...e, attack })
  const keyed: CardGroup[] = groups.map((g, gi) => ({ lines: g.map((l, li) => ({
    key: l.field === 'effect' ? 'effect' : l.field ? `a0.${l.field}` : `l${gi}.${li}`, label: l.label, text: l.text,
    ...(hasDamage && l.field === 'hit' ? { damage: true as const } : {}),
  })) }))
  // Damage with no Hit text is a Hit line of its own, where the attack's outcome goes.
  if (hasDamage && !keyed.some(g => g.lines.some(l => l.damage))) {
    const at = keyed.findIndex(g => g.lines.some(l => /^(Critical|Miss|Aftereffect)$/.test(l.label)))
    const line: KeyedLine = { key: 'a0.hit', label: 'Hit', text: '', damage: true }
    if (at >= 0) keyed[at]!.lines.unshift(line)
    else { const effect = keyed.findIndex(g => g.lines.some(l => l.key === 'effect')); keyed.splice(effect >= 0 ? effect : keyed.length, 0, { lines: [line] }) }
  }
  return { groups: keyed, ...(basic ? { basic } : {}) }
}
