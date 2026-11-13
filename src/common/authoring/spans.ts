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
  fly: /\bfl(y|ies|ying|ew|own)\b/i, move: /\b(mov(e|es|ed|ing)|walk|jump|climb|burrow|swim)/i,
}

const STATUS_WORDS: Record<string, RegExp> = {
  insubstantial: /\binsubstantial/i,
  phasing: /\bphas(e|es|ing)\b/i,
  'no-provoke': /\bprovok/i,
  'no-concealment': /\bconceal|\binvisib/i,
  'no-regain-hp': /\bregain|\bheal/i,
  'no-healing-surges': /\bsurge/i,
  'ignore-difficult-terrain': /\bdifficult terrain/i,
}

const SENSE_WORDS: Record<string, RegExp> = {
  'darkvision': /\bdarkvision/i, 'low-light-vision': /\blow-light vision/i, 'blindsight': /\bblindsight/i,
  'tremorsense': /\btremorsense/i, 'truesight': /\btruesight/i, 'all-around-vision': /\ball-around vision/i,
  'see-invisible': /\bsee(s|ing)? invisib/i,
}

const RESTRICTION_WORDS: Record<string, RegExp> = {
  encounter: /\bencounter/i, daily: /\bdaily/i, attack: /\battack/i, all: /\b(power|attack|action)/i,
  standard: /\bstandard/i, move: /\bmove/i, minor: /\bminor/i, immediate: /\bimmediate/i, opportunity: /\bopportunit/i,
  shift: /\bshift/i, teleport: /\bteleport/i, charge: /\bcharg/i,
}

const AUTOMATIC_WORDS: Record<string, RegExp> = { hit: /\bhit/i, critical: /\bcrit/i, save: /\bsav(e|es|ing)\b|\bsucceed/i }

const ABILITY_NAMES: Record<string, string> = {
  str: 'strength', con: 'constitution', dex: 'dexterity', int: 'intelligence', wis: 'wisdom', cha: 'charisma',
}

/** The words a check modifier stat needs ("skill:athletics": "athletics"), or undefined for other stats. */
function checkStatWords(stat: string): RegExp | undefined {
  if (stat.startsWith('skill:')) return new RegExp(`\\b${stat.slice(6)}`, 'i')
  if (stat.startsWith('ability:')) return new RegExp(`\\b${ABILITY_NAMES[stat.slice(8)] ?? stat.slice(8)}`, 'i')
  if (stat === 'skill-checks') return /\bskill/i
  if (stat === 'ability-checks') return /\bability check/i
  if (stat === 'initiative') return /\binitiative/i
  // "moves 1 square fewer than the effect specifies", "reduces any forced movement by 1 square"
  if (stat === 'forced-movement') return /\bfewer\b|\bless\b|\bforced\b|\breduc/i
  if (stat === 'recharge') return /\brecharg/i
  return undefined
}

/** The words of each speed clause mode ("gains a fly speed of 12", "fly 8 (hover)"). */
const SPEED_WORDS: Record<string, RegExp> = {
  walk: /\b(speed|walk)/i, fly: /\bfl(y|ies|ying|ight)\b/i, climb: /\bclimb/i, swim: /\bswim/i,
  burrow: /\bburrow/i, teleport: /\bteleport/i, 'overland-flight': /\boverland flight/i,
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

/** The span with the rest of its sentence on both sides (a parenthesis does not end a sentence). */
function sentenceOf(span: string, before: string, after: string): string {
  return (before.split(/(?<=[.;!?])\s/).pop() ?? '') + span + (after.split(/(?<=[.;!?])\s/)[0] ?? '')
}

/**
 * Why the spanned text does not support the clause, or undefined when it does.
 * `after` is the rest of the line after the span: a damage type may be the
 * trailing type word the print shares ("2d6 + 5 or 3d6 + 5 fire damage").
 * `before` is the line before the span: a resistance quote may continue a list
 * that "resist" opens earlier in its sentence ("resist 10 necrotic, 10 fire").
 */
export function spanProblem(clause: Clause, span: string, after = '', before = ''): string | undefined {
  const s = span.toLowerCase()
  const has = (re: RegExp | string) => typeof re === 'string' ? s.includes(re) : re.test(span)
  /** The number as digits, or spelled out ("two squares"). */
  const numIn = (n: number, text: string) => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(text) || (n >= 0 && n <= 10 && new RegExp(`\\b${NUMBER_WORDS[n]}\\b`, 'i').test(text))
  const num = (n: number) => numIn(n, span)
  const hasType = (t: string) => has(t) || after.toLowerCase().includes(t)
  /** A dice amount (heal, temp-hp) is in the span. */
  const diceAmount = (amount: unknown) => typeof amount === 'string' && /\dd\d/.test(amount) && !hasDice(span, amount) ? `dice "${amount}" not in span` : undefined
  const anyType = (types: string[] | undefined) => !types || types.some(hasType) || has(/one of|choice|choose|chosen/i)
  /** The quote continues a comma list that `word` opens earlier in the sentence ("resist 10 necrotic, 10 fire"). */
  const continuesList = (word: RegExp) => {
    const sentence = before.split(/(?<=[.;!?])\s/).pop() ?? ''
    return word.test(sentence) && /(,\s*|,?\s+(and|or)\s+)$/i.test(sentence)
  }
  // saveModifier: "(save ends, with a -2 penalty to the saving throw)", in the quote or later in its sentence.
  const saveModifier = (clause as { saveModifier?: number }).saveModifier
  if (typeof saveModifier === 'number') {
    const sentence = span + after.split(/(?<=[.!?])\s/)[0]
    // The older "(save at -2 ends)" wording also states it.
    const older = new RegExp(`\\bsave at [-–−+]?${Math.abs(saveModifier)} ends`, 'i').test(sentence)
    if (!older && (!/saving throw/i.test(sentence) || !new RegExp(`(?<!\\d)${Math.abs(saveModifier)}\\s+(penalty|bonus)`, 'i').test(sentence))) {
      return `no "${Math.abs(saveModifier)} ${saveModifier < 0 ? 'penalty' : 'bonus'} to the saving throw" for saveModifier in the span or the rest of its sentence`
    }
  }
  switch (clause.kind) {
    case 'damage':
      // The dice (or flat number) only, not the word "damage": in "2d8+10 plus
      // 2d6 lightning damage" the word belongs to the second part, so the first
      // quote is "2d8+10" (untyped). Inline crits ("(crit 2d8 + 11)") need "crit".
      if (!hasDice(span, clause.dice)) return `dice "${clause.dice}" not in span`
      // "crit" in the quote or its sentence: "(crit 4d8+23 damage plus 8 thunder damage)" (both
      // parts), "If the titan scores a critical hit, the damage is 4d8 + 39".
      if (clause.critical && !has('crit') && !/crit/i.test(sentenceOf(span, before, after))) return 'no "crit" in span or its sentence'
      for (const t of clause.types) if (!hasType(t)) return `type "${t}" not in span or the words after it`
      return anyType(clause.typeChoice) ? undefined : 'none of the typeChoice types in span'
    case 'damage-formula':
      return has('damage') || compactDice(span).includes(compactDice(clause.text)) ? undefined : 'formula not in span'
    case 'half-damage': return has(/\bhal(f|ved?|ves|ving)\b/i) ? undefined : 'no "half" or "halved" in span'
    case 'ongoing-damage':
      // An increase ("If the target is already taking ongoing fire damage, that damage
      // increases by 5"): "increase" in the quote, "ongoing" in the quote or earlier in its sentence.
      if (clause.increase) {
        if (!has(/\bincreas/i)) return 'no "increases" in span'
        if (!has('ongoing') && !/ongoing/i.test(sentenceOf('', before, ''))) return 'no "ongoing" in span or earlier in its sentence'
      } else if (!has('ongoing')) return 'no "ongoing" in span'
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
    case 'resistance': return has('resist') || continuesList(/\bresist/i) ? undefined : 'no "resist" in span (or earlier in its comma list)'
    case 'vulnerability': return has('vulnerab') || continuesList(/\bvulnerab/i) ? undefined : 'no "vulnerable" in span (or earlier in its comma list)'
    case 'heal':
      if (!has(/regain|heal|hit points|healing surge/i)) return 'no healing words in span ("regains", "hit points")'
      return diceAmount(clause.amount)
    case 'temp-hp': return has('temporary') ? diceAmount(clause.amount) : 'no "temporary" in span'
    case 'regeneration': return has('regenerat') || has('regain') ? undefined : 'no "regeneration" in span'
    case 'revive': return num(clause.hp) ? undefined : `hp ${clause.hp} not in span`
    case 'use-power': return has(clause.power.toLowerCase()) || has(/\battack|\buses?\b|\bmakes?\b/i) ? undefined : `power "${clause.power}" not in span`
    case 'recharge-power': return has(/recharg|\bregains? the use\b/i) ? undefined : 'no "recharge" or "regains the use" in span'
    case 'lose-healing-surge': return has('surge') ? undefined : 'no "healing surge" in span'
    // "lightly obscured" is concealment, "heavily obscured" total concealment.
    case 'concealment':
      if (!has(/conceal|obscur/i)) return 'no "concealment" or "obscured" in span'
      return !clause.total || has(/total|heavily/i) ? undefined : 'no "total" or "heavily" in span'
    // The area word: "creates a zone", "an area of swirling sand", "a wall of fire".
    case 'zone':
      if (!has(/\b(zone|cloud|wall|area|field|region)/i)) return 'no "zone", "area", "cloud", "wall", "field" or "region" in span'
      return !clause.blocksLineOfSight || /line of sight/i.test(span + after) ? undefined : 'no "line of sight" in span or the rest of the line'
    case 'saving-throw':
      if (!has(/\bsav(e|es|ing)\b/i)) return 'no "saving throw" in span'
      return clause.bonus === undefined || num(Math.abs(clause.bonus)) ? undefined : `bonus ${clause.bonus} not in span`
    case 'summon': {
      const words = clause.creature.toLowerCase().split(/\W+/).filter(w => w.length > 2)
      return words.some(w => s.includes(w.replace(/s$/, ''))) || has(/summon|appear|conjure|create/i) ? undefined : `creature "${clause.creature}" not in span`
    }
    case 'redirect-attack':
      // Also "changes the attack's target to ...", "must make the attack against ...", "targets a creature of the devil's choice".
      return has(/\binstead\b|redirect|becomes the target|\btargets? (it|him|her|the \w+|a creature)\b|\bchang\w* [^.;]{0,40}\btarget|\bmake the attack against/i) ? undefined : 'no "instead" or "redirect" in span'
    case 'crit-range':
      if (!has('crit')) return 'no "critical" in span'
      return num(clause.min) ? undefined : `${clause.min} not in span`
    case 'power-restriction': {
      if (!has(/\b(can[’']t|can ?not|cannot|unable|no longer|may not|doesn[’']t|does not)\b/i)) return 'no "can\'t" or "cannot" in span'
      const what = Array.isArray(clause.what) ? clause.what : [clause.what]
      const missing = what.find(w => w !== 'named' && !has(RESTRICTION_WORDS[w] ?? w))
      if (missing) return `no "${missing}" in span`
      // 'named': each printed power name ("cannot use its shadow cloak power").
      const name = what.includes('named') ? (clause.powers ?? []).find(p => !s.includes(p.toLowerCase())) : undefined
      return name ? `power "${name}" not in span` : undefined
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
    // Also "must make a second attack roll", "make two attack rolls and use the lower", "roll twice".
    case 'reroll': return has(/\bre-?roll|\broll(s|ing)?\b[^.;]{0,30}?\bagain|\b(second|new|another) (attack roll|saving throw|roll)|\btwo (attack rolls|saving throws)|\broll(s|ing)? (saving throws |attack rolls )?twice/i) ? undefined : 'no "reroll" in span'
    case 'action-point':
      if (!has(/\baction points?\b/i)) return 'no "action point" in span'
      return num(clause.amount) || (clause.amount === 1 && has(/\ban? (spent )?action point/i)) ? undefined : `amount ${clause.amount} not in span`
    case 'sense': {
      // The sense name ("tremorsense", "low-light vision") or "see(s) invisible", and the range when given.
      if (!has(SENSE_WORDS[clause.sense] ?? clause.sense)) return clause.sense === 'see-invisible' ? 'no "see invisible" in span' : `no "${clause.sense}" in span`
      return clause.range === undefined || num(clause.range) ? undefined : `range ${clause.range} not in span`
    }
    case 'speed': {
      if (!has(SPEED_WORDS[clause.mode] ?? clause.mode)) return `no "${clause.mode}" in span`
      for (const n of [clause.value, clause.change]) if (n !== undefined && !num(Math.abs(n))) return `${Math.abs(n)} not in span`
      return !clause.hover || has('hover') ? undefined : 'no "hover" in span'
    }
    // The options' own spans are checked by checkLineSpans.
    case 'choice': return has(/\b(or|either)\b/i) ? undefined : 'no "or" or "either" in span'
    case 'automatic':
      if (!has(/\bautomatic/i)) return 'no "automatically" in span'
      return has(AUTOMATIC_WORDS[clause.what] ?? clause.what) ? undefined : `no "${clause.what}" in span`
    case 'lose-resistance':
      if (!has(/\bresist/i)) return 'no "resist" in span'
      return clause.value === undefined || num(clause.value) ? undefined : `value ${clause.value} not in span`
    case 'immunity': return has(/\bimmun/i) ? undefined : 'no "immune" in span'
    case 'end-effect': return has(/\bend(s|ed|ing)?\b|\bno longer\b|\bremov|\brid of\b/i) ? undefined : 'no "ends", "no longer" or "removes" in span'
    case 'extra-action': {
      // The action's name: "move action", "standard action", "immediate reaction".
      const word = clause.action === 'no-action' ? 'action' : clause.action.split('-').pop()!
      return has(new RegExp(`\\b${word}`, 'i')) ? undefined : `no "${word}" in span`
    }
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
 * inverted condition is `unless`, never a "not:" prefix. A fragment may also
 * come from `name`, the owning trait's, aura's or power's printed name.
 */
export function fragmentProblems(cl: Clause, text: string, a: number, b: number, name = ''): string[] {
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
      // A condition printed in the owning trait's or aura's name ("Billowing Winds (while bloodied)").
      if (found.length === 0 && name && findFragment(name, f).length > 0) continue
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

export function checkLineSpans(l: Line, path: string, name = ''): Issue[] {
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
    const problem = spanProblem(cl, l.text.substring(a, b), l.text.substring(b), l.text.substring(0, a))
    if (problem) issues.push({ path: p, message: `${cl.kind}: ${problem} ("${l.text.substring(a, b)}")` })
    for (const message of fragmentProblems(cl, l.text, a, b, name)) issues.push({ path: p, message })
    // per: printed scaling words of the line ("for each creature in the burst"), in or after the quote.
    const per = (cl as { per?: unknown }).per
    if (typeof per === 'string' && per.trim()) {
      if (!/\b(each|per|every)\b/i.test(per)) issues.push({ path: p, message: `per "${per}": expected the printed "for each ..." words` })
      else if (findFragment(l.text, per).length === 0) issues.push({ path: p, message: `per "${per}" is not in the line text (copy the printed words exactly)` })
    }
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
  // name: the nearest enclosing trait, aura or power name (if/unless fragments may come from it).
  const walk = (v: unknown, path: string, name: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, name)); return }
    if (typeof v !== 'object' || v === null) return
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string' && Array.isArray(o.clauses)) { issues.push(...checkLineSpans(o as unknown as Line, path, name)); return }
    const own = path !== '$' && typeof o.name === 'string' ? o.name : name
    for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`, own)
  }
  walk(entry, '$', '')
  return issues
}
