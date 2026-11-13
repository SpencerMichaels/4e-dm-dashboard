// Span validation: every clause's `at` lies inside its Line.text, and the
// spanned text plausibly states the clause (its keyword or number is there).
// This is a plausibility check, not a parser: each kind needs one of its
// usual words in any inflection ("grabs", "is grabbed"; "pushes", "pushed").
// It also checks clause `if` / `unless` fragments (exact printed words of the
// line, outside the clause's own span). The brief's quote rules
// (tools/content/agent/prompt.md) describe these checks for agents; keep the
// two in step.

import type { Clause, Line } from '@kit'
import type { Issue } from './shape'

/** Words that state each condition, in any inflection or common phrasing. */
const CONDITION_WORDS: Record<string, RegExp> = {
  'blinded': /\bblind/i,
  'dazed': /\bdaz(e|ed|es|ing)\b/i,
  'deafened': /\bdeaf/i,
  'dominated': /\bdominat/i,
  'dying': /\bdying\b|\b0 hit points/i,
  'grabbed': /\bgrab/i,
  'helpless': /\bhelpless/i,
  'immobilized': /\bimmobili[sz]/i,
  'invisible': /\binvisib/i,
  'marked': /\bmark(s|ed|ing)?\b/i,
  'petrified': /\bpetrif/i,
  'prone': /\bprone\b/i,
  'removed-from-play': /\bremoved? from play/i,
  'restrained': /\brestrain/i,
  'slowed': /\bslow(s|ed)?\b/i,
  'stunned': /\bstun(s|ned|ning)?\b/i,
  'surprised': /\bsurpris/i,
  // "falls asleep" is unconscious in 4e (the wake rule is an `until` duration).
  'unconscious': /\bunconscious|\basleep\b|\bsleep(s|ing)?\b/i,
  'weakened': /\bweaken/i,
}

const MOVE_WORDS: Record<string, RegExp> = {
  push: /\bpush/i, pull: /\bpull/i, slide: /\bslid(e|es|ing)?\b/i,
  shift: /\bshift/i, teleport: /\bteleport/i, swap: /\b(swap|switch|trade)/i,
  fly: /\bfl(y|ies|ying|ew|own)\b/i, move: /\b(mov(e|es|ed|ing)|walk|jump|climb)/i,
}

const STATUS_WORDS: Record<string, RegExp> = {
  insubstantial: /\binsubstantial/i,
  phasing: /\bphas(e|es|ing)\b/i,
  'no-provoke': /\bprovok/i,
}

const SENSE_WORDS: Record<string, RegExp> = {
  'darkvision': /\bdarkvision/i, 'low-light-vision': /\blow-light vision/i, 'blindsight': /\bblindsight/i,
  'tremorsense': /\btremorsense/i, 'truesight': /\btruesight/i, 'all-around-vision': /\ball-around vision/i,
  'see-invisible': /\bsee(s|ing)? invisib/i,
}

const RESTRICTION_WORDS: Record<string, RegExp> = {
  encounter: /\bencounter/i, daily: /\bdaily/i, attack: /\battack/i, all: /\b(power|attack|action)/i,
}

const ABILITY_NAMES: Record<string, string> = {
  str: 'strength', con: 'constitution', dex: 'dexterity', int: 'intelligence', wis: 'wisdom', cha: 'charisma',
}

/** The words a check modifier stat needs ("skill:athletics": "athletics"), or undefined for other stats. */
function checkStatWords(stat: string): RegExp | undefined {
  if (stat.startsWith('skill:')) return new RegExp(`\\b${stat.slice(6)}`, 'i')
  if (stat.startsWith('ability:')) return new RegExp(`\\b${ABILITY_NAMES[stat.slice(8)] ?? stat.slice(8)}`, 'i')
  if (stat === 'skill-checks') return /\bskill/i
  if (stat === 'ability-checks') return /\bability check/i
  return undefined
}

const NUMBER_WORDS =['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

function compactDice(s: string): string {
  return s.replace(/\s+/g, '').replace(/−/g, '-').toLowerCase()
}

/** The dice expression or flat number as a whole: "10" is not in "2d8+10" or "1d10", "2d8+1" not in "2d8+10". */
function hasDice(span: string, dice: string): boolean {
  const d = compactDice(dice).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!\\d|\\dd|\\d[+-])${d}(?!\\d|d\\d|[+-]\\d)`).test(compactDice(span))
}

/**
 * Why the spanned text does not support the clause, or undefined when it does.
 * `after` is the rest of the line after the span: a damage type may be the
 * trailing type word the print shares ("2d6 + 5 or 3d6 + 5 fire damage").
 */
export function spanProblem(clause: Clause, span: string, after = ''): string | undefined {
  const s = span.toLowerCase()
  const has = (re: RegExp | string) => typeof re === 'string' ? s.includes(re) : re.test(span)
  /** The number as digits, or spelled out ("two squares"). */
  const numIn = (n: number, text: string) => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(text) || (n >= 0 && n <= 10 && new RegExp(`\\b${NUMBER_WORDS[n]}\\b`, 'i').test(text))
  const num = (n: number) => numIn(n, span)
  const hasType = (t: string) => has(t) || after.toLowerCase().includes(t)
  const anyType = (types: string[] | undefined) => !types || types.some(hasType) || has(/one of|choice|choose|chosen/i)
  switch (clause.kind) {
    case 'damage':
      // The dice (or flat number) only, not the word "damage": in "2d8+10 plus
      // 2d6 lightning damage" the word belongs to the second part, so the first
      // quote is "2d8+10" (untyped). Inline crits ("(crit 2d8 + 11)") need "crit".
      if (!hasDice(span, clause.dice)) return `dice "${clause.dice}" not in span`
      if (clause.critical && !has('crit')) return 'no "crit" in span'
      for (const t of clause.types) if (!hasType(t)) return `type "${t}" not in span or the words after it`
      return anyType(clause.typeChoice) ? undefined : 'none of the typeChoice types in span'
    case 'damage-formula':
      return has('damage') || compactDice(span).includes(compactDice(clause.text)) ? undefined : 'formula not in span'
    case 'half-damage': return has(/\bhal(f|ved?|ves|ving)\b/i) ? undefined : 'no "half" or "halved" in span'
    case 'ongoing-damage':
      if (!has('ongoing')) return 'no "ongoing" in span'
      if (!num(clause.amount)) return `amount ${clause.amount} not in span`
      return anyType(clause.typeChoice) ? undefined : 'none of the typeChoice types in span'
    case 'condition': {
      const re = CONDITION_WORDS[clause.condition] ?? new RegExp(clause.condition.replace(/ed$/, ''), 'i')
      if (!re.test(span)) return `condition "${clause.condition}" not in span (any form of the word will do: "grabs", "is knocked prone")`
      if (clause.escapeDc === undefined) return undefined
      // "escape DC 21" or "escapes (DC 21)", in the quote or later in its sentence
      // (a DC printed after other clauses: "... and grabs it. ... (escape DC 25).").
      const sentence = span + after.split(/(?<=[.!?])\s/)[0]
      return /escape/i.test(sentence) && numIn(clause.escapeDc, sentence) ? undefined : `no "escape DC ${clause.escapeDc}" in the span or the rest of its sentence`
    }
    case 'grants-ca': return has('combat advantage') ? undefined : 'no "combat advantage" in span'
    case 'forced-move':
      if (!has(MOVE_WORDS[clause.move] ?? clause.move)) return `no "${clause.move}" in span`
      return num(clause.squares) || clause.squares === 1 ? undefined : `${clause.squares} squares not in span`
    case 'move': return has(MOVE_WORDS[clause.move] ?? clause.move) ? undefined : `no "${clause.move}" in span`
    case 'modifier': {
      if (!num(Math.abs(clause.value))) return `value ${clause.value} not in span`
      // A check stat names its skill or ability in the quote or the rest of its sentence.
      const sentence = span + after.split(/(?<=[.!?;])\s/)[0]
      for (const stat of Array.isArray(clause.stat) ? clause.stat : [clause.stat]) {
        const re = checkStatWords(stat)
        if (re && !re.test(sentence)) return `no "${re.source.replace(/\\b/g, '')}" for stat "${stat}" in the span or the rest of its sentence`
      }
      return undefined
    }
    case 'resistance': return has('resist') ? undefined : 'no "resist" in span'
    case 'vulnerability': return has('vulnerab') ? undefined : 'no "vulnerable" in span'
    case 'heal': return has(/regain|heal|hit points|healing surge/i) ? undefined : 'no healing words in span ("regains", "hit points")'
    case 'temp-hp': return has('temporary') ? undefined : 'no "temporary" in span'
    case 'regeneration': return has('regenerat') || has('regain') ? undefined : 'no "regeneration" in span'
    case 'revive': return num(clause.hp) ? undefined : `hp ${clause.hp} not in span`
    case 'use-power': return has(clause.power.toLowerCase()) || has(/\battack|\buses?\b|\bmakes?\b/i) ? undefined : `power "${clause.power}" not in span`
    case 'recharge-power': return has('recharge') ? undefined : 'no "recharge" in span'
    case 'lose-healing-surge': return has('surge') ? undefined : 'no "healing surge" in span'
    case 'concealment':
      if (!has(/conceal/i)) return 'no "concealment" in span'
      return !clause.total || has('total') ? undefined : 'no "total" in span'
    case 'zone': return has(/\b(zone|cloud|wall)/i) ? undefined : 'no "zone" in span'
    case 'saving-throw':
      if (!has(/\bsav(e|es|ing)\b/i)) return 'no "saving throw" in span'
      return clause.bonus === undefined || num(Math.abs(clause.bonus)) ? undefined : `bonus ${clause.bonus} not in span`
    case 'summon': {
      const words = clause.creature.toLowerCase().split(/\W+/).filter(w => w.length > 2)
      return words.some(w => s.includes(w.replace(/s$/, ''))) || has(/summon|appear|conjure|create/i) ? undefined : `creature "${clause.creature}" not in span`
    }
    case 'redirect-attack':
      return has(/\binstead\b|redirect|becomes the target|\btargets? (it|him|her|the \w+)\b/i) ? undefined : 'no "instead" or "redirect" in span'
    case 'crit-range':
      if (!has('crit')) return 'no "critical" in span'
      return num(clause.min) ? undefined : `${clause.min} not in span`
    case 'power-restriction': {
      if (!has(/\b(can[’']t|can ?not|cannot|unable|no longer|may not|doesn[’']t|does not)\b/i)) return 'no "can\'t" or "cannot" in span'
      const what = Array.isArray(clause.what) ? clause.what : [clause.what]
      const missing = what.find(w => !has(RESTRICTION_WORDS[w] ?? w))
      return missing ? `no "${missing}" in span` : undefined
    }
    case 'status': return has(STATUS_WORDS[clause.status] ?? clause.status) ? undefined : `no "${clause.status}" in span`
    case 'opportunity-reach': return has('opportunit') ? undefined : 'no "opportunity" in span'
    case 'difficult-terrain': return has('difficult terrain') ? undefined : 'no "difficult terrain" in span'
    case 'charge': return has(/\bcharg/i) ? undefined : 'no "charge" in span'
    case 'disease': {
      // The printed name ("contracts level 6 mummy rot": disease "mummy rot"), and the stage.
      const name = clause.disease.replace(/\s+/g, ' ').trim().toLowerCase()
      if (!s.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").includes(name.replace(/[‘’]/g, "'"))) return `disease "${clause.disease}" not in span`
      return clause.stage === undefined || (has('stage') && num(clause.stage)) ? undefined : `no "stage ${clause.stage}" in span`
    }
    case 'reroll': return has(/\bre-?roll|\broll(s|ing)?\b[^.;]{0,30}?\bagain/i) ? undefined : 'no "reroll" in span'
    case 'action-point':
      if (!has(/\baction points?\b/i)) return 'no "action point" in span'
      return num(clause.amount) || (clause.amount === 1 && has(/\ban action point/i)) ? undefined : `amount ${clause.amount} not in span`
    case 'sense': {
      // The sense name ("tremorsense", "low-light vision") or "see(s) invisible", and the range when given.
      if (!has(SENSE_WORDS[clause.sense] ?? clause.sense)) return clause.sense === 'see-invisible' ? 'no "see invisible" in span' : `no "${clause.sense}" in span`
      return clause.range === undefined || num(clause.range) ? undefined : `range ${clause.range} not in span`
    }
    // The options' own spans are checked by checkLineSpans.
    case 'choice': return has(/\b(or|either)\b/i) ? undefined : 'no "or" or "either" in span'
    case 'unparsed':
      return span.replace(/\s+/g, ' ').trim() === clause.text.replace(/\s+/g, ' ').trim() ? undefined : 'unparsed text differs from span'
  }
}

/** Length-preserving fold for matching (as in agent/quotes.ts): case, curly quotes, dashes. */
function fold(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[−–—]/g, '-')
}

/**
 * Every occurrence [start, end) of a printed fragment in the line text. Matching
 * ignores case, quote-mark and dash kinds, and spacing around + and - (dice:
 * "2d6+5" or "2d6 + 5"), as for clause quotes.
 */
export function findFragment(text: string, fragment: string): [number, number][] {
  const f = fold(fragment).trim()
  if (!f) return []
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const source = f.split(/\s*([+-])\s*/).map((part, i) => i % 2 ? `\\s*\\${part}\\s*` : escape(part)).join('')
  const out: [number, number][] = []
  for (const m of fold(text).matchAll(new RegExp(source, 'g'))) if (m[0].length > 0) out.push([m.index!, m.index! + m[0].length])
  return out
}

const ELLIPSIS = /…|\.\.\./

/**
 * Problems with the clause's `if` and `unless` fragments: each must be an exact
 * printed fragment of the line, outside the clause's own span [a, b). A split
 * condition is a list of fragments, never one string joined with " ... "; an
 * inverted condition is `unless`, never a "not:" prefix.
 */
export function fragmentProblems(cl: Clause, text: string, a: number, b: number): string[] {
  const out: string[] = []
  for (const key of ['if', 'unless'] as const) {
    const value = (cl as unknown as Record<string, unknown>)[key]
    if (value === undefined) continue
    for (const f of Array.isArray(value) ? value : [value]) {
      if (typeof f !== 'string' || !f.trim()) continue // the shape check reports it
      if (/^\s*not\s*:/i.test(f)) {
        out.push(`${key} "${f}": no "not:" prefix; put the printed condition under which the clause does not apply in "unless"`)
        continue
      }
      const found = findFragment(text, f)
      if (found.length === 0) {
        out.push(ELLIPSIS.test(f)
          ? `${key} "${f}": do not join fragments with " ... "; give a list of exact printed fragments, ${key}: ["...", "..."]`
          : `${key} "${f}" is not in the line text (copy the printed words exactly)`)
        continue
      }
      if (found.every(([s, e]) => s < b && e > a)) {
        const hint = key === 'if' && /\bcan\b/i.test(f) ? ' (an option is "optional": true, never if)' : ''
        out.push(`${key} "${f}" overlaps the clause's own quote "${text.substring(a, b)}": the quote holds the effect, the condition goes only in ${key}${hint}`)
      }
    }
  }
  return out
}

export function checkLineSpans(l: Line, path: string): Issue[] {
  const issues: Issue[] = []
  if (!l || typeof l.text !== 'string' || !Array.isArray(l.clauses)) return issues
  const check = (cl: Clause, p: string, lo: number, hi: number) => {
    const [a, b] = Array.isArray(cl?.at) ? cl.at : [NaN, NaN]
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= lo && a <= b && b <= hi)) {
      issues.push({ path: p, message: lo === 0 && hi === l.text.length
        ? `span [${a}, ${b}) outside text (length ${l.text.length})`
        : `span [${a}, ${b}) outside its choice's span [${lo}, ${hi})` })
      return
    }
    const problem = spanProblem(cl, l.text.substring(a, b), l.text.substring(b))
    if (problem) issues.push({ path: p, message: `${cl.kind}: ${problem} ("${l.text.substring(a, b)}")` })
    for (const message of fragmentProblems(cl, l.text, a, b)) issues.push({ path: p, message })
    // A choice's option clauses lie inside its span and do not overlap each other.
    if (cl.kind === 'choice' && Array.isArray(cl.options)) {
      const seen: [number, number, string][] = []
      cl.options.forEach((opt, i) => {
        if (!Array.isArray(opt)) return
        opt.forEach((x, j) => {
          const q = `${p}.options[${i}][${j}]`
          check(x as Clause, q, a, b)
          const at = (x as Clause)?.at
          if (!Array.isArray(at)) return
          const clash = seen.find(([s, e]) => at[0] < e && at[1] > s)
          if (clash) issues.push({ path: q, message: `option quote "${l.text.substring(at[0], at[1])}" overlaps another option's quote "${l.text.substring(clash[0], clash[1])}"` })
          seen.push([at[0], at[1], q])
        })
      })
    }
  }
  l.clauses.forEach((cl, i) => check(cl, `${path}.clauses[${i}]`, 0, l.text.length))
  return issues
}

/** Walk any entry and check every Line (an object with string `text` and array `clauses`). */
export function checkSpans(entry: unknown): Issue[] {
  const issues: Issue[] = []
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return }
    if (typeof v !== 'object' || v === null) return
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string' && Array.isArray(o.clauses)) { issues.push(...checkLineSpans(o as unknown as Line, path)); return }
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`)
  }
  walk(entry, '$')
  return issues
}
