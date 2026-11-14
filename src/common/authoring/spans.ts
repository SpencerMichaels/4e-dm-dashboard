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
  // "removed from play", "banished", "disappears", "removed from the battle grid".
  'removed-from-play': /\bremoved? from (play|the battle)|\bbanish|\bdisappear/i,
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
  fly: /\bfl(y|ies|ying|ew|own)\b/i, move: /\b(mov(e|es|ed|ing)|walk|jump|leap|climb|burrow|swim)/i,
}

const STATUS_WORDS: Record<string, RegExp> = {
  insubstantial: /\binsubstantial/i,
  phasing: /\bphas(e|es|ing)\b/i,
  'no-provoke': /\bprovok/i,
  'no-concealment': /\bconceal|\binvisib/i,
  'no-regain-hp': /\bregain|\bheal/i,
  'no-healing-surges': /\bsurge/i,
  'ignore-difficult-terrain': /\bdifficult terrain/i,
  'no-stand': /\bstand/i,
  'ignore-cover': /\bcover/i,
  'ignore-concealment': /\bconceal/i,
  'no-flank': /\bflank/i,
  'move-through': /\bthrough\b|\benter/i,
  // "pulls the grabbed creature with it", "grabbed creatures move with it".
  'carry-grabbed': /\bpull|\bdrag|\bcarr(y|ies)|\bwith (it|him|her|them)\b|\balong\b/i,
  'no-temp-hp': /\btemporary/i,
}

const SENSE_WORDS: Record<string, RegExp> = {
  'darkvision': /\bdarkvision/i, 'low-light-vision': /\blow-light vision/i, 'blindsight': /\bblindsight/i,
  'tremorsense': /\btremorsense/i, 'truesight': /\btruesight/i, 'all-around-vision': /\ball-around vision/i,
  'see-invisible': /\bsee(s|ing)? invisib/i,
  'sight-limit': /\bsee|\bsight/i,
}

const RESTRICTION_WORDS: Record<string, RegExp> = {
  encounter: /\bencounter/i, daily: /\bdaily/i, attack: /\battack/i, all: /\b(power|attack|action)/i,
  standard: /\bstandard/i, move: /\bmove/i, minor: /\bminor/i, immediate: /\bimmediate/i, opportunity: /\bopportunit/i,
  shift: /\bshift/i, teleport: /\bteleport/i, charge: /\bcharg/i, fly: /\bfl(y|ies|ying|ight)\b/i,
  // "can make only basic attacks", "can use only at-will powers"
  basic: /\bbasic/i, 'non-basic': /\bbasic/i, 'non-at-will': /\bat-will/i,
}

/** The words of a damage amount that is not dice (a "half-" amount also needs "half"). */
const DAMAGE_AMOUNT_WORDS: Record<string, RegExp> = { 'surge-value': /\bsurge/i, 'bloodied-value': /\bbloodied/i, 'damage-dealt': /\bdamage/i }

const AUTOMATIC_WORDS: Record<string, RegExp> = { hit: /\bhit/i, miss: /\bmiss/i, critical: /\bcrit/i, save: /\bsav(e|es|ing)\b|\bsucceed/i }

const ABILITY_NAMES: Record<string, string> = {
  str: 'strength', con: 'constitution', dex: 'dexterity', int: 'intelligence', wis: 'wisdom', cha: 'charisma',
}

/** The words a check modifier stat needs ("skill:athletics": "athletics"), or undefined for other stats. */
function checkStatWords(stat: string): RegExp | undefined {
  if (stat.startsWith('skill:')) return new RegExp(`\\b${stat.slice(6)}`, 'i')
  if (stat.startsWith('ability:')) return new RegExp(`\\b${ABILITY_NAMES[stat.slice(8)] ?? stat.slice(8)}`, 'i')
  // Bare "checks" ("a -2 penalty to checks") is both skill and ability checks.
  if (stat === 'skill-checks') return /\bskill|\bchecks\b/i
  if (stat === 'ability-checks') return /\bability check|\bchecks\b/i
  if (stat === 'death-saves') return /\bdeath sav/i
  if (stat === 'escape') return /\bescap/i
  if (stat === 'roll') return /\broll/i
  if (stat === 'initiative') return /\binitiative/i
  // "moves 1 square fewer than the effect specifies", "reduces any forced movement by 1 square"
  if (stat === 'forced-movement') return /\bfewer\b|\bless\b|\bforced\b|\breduc|\bextra squares?\b/i
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
  /** A printed distance that is not a number ("to the edge of the burst") lies in the quote. */
  const squaresText = (t: string) => findFragment(span, t).length > 0 ? undefined : `squaresText "${t}" not in span`
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
      // An amount that is not dice ("half its bloodied value") needs its words.
      if (clause.amount !== undefined) {
        const word = DAMAGE_AMOUNT_WORDS[clause.amount.replace(/^half-/, '')]
        if (word && !has(word)) return `no "${word.source.replace(/\\b/g, '')}" in span for amount "${clause.amount}"`
        if (clause.amount.startsWith('half-') && !has(/\bhal(f|ved?)\b/i)) return `no "half" in span for amount "${clause.amount}"`
      } else if (!hasDice(span, clause.dice ?? '')) return `dice "${clause.dice}" not in span`
      // "crit" in the quote or its sentence: "(crit 4d8+23 damage plus 8 thunder damage)" (both
      // parts), "If the titan scores a critical hit, the damage is 4d8 + 39".
      if (clause.critical && !has('crit') && !/crit/i.test(sentenceOf(span, before, after))) return 'no "crit" in span or its sentence'
      for (const t of clause.types) if (!hasType(t)) return `type "${t}" not in span or the words after it`
      return anyType(clause.typeChoice) ? undefined : 'none of the typeChoice types in span'
    case 'damage-formula':
      return has('damage') || compactDice(span).includes(compactDice(clause.text)) ? undefined : 'formula not in span'
    case 'half-damage': return has(/\bhal(f|ved?|ves|ving)\b/i) ? undefined : 'no "half" or "halved" in span'
    case 'double-damage': return has(/\bdoubl|\btwice\b/i) ? undefined : 'no "double" or "twice" in span'
    case 'max-damage': return has(/\bmaxim/i) ? undefined : 'no "maximum" in span'
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
      if (clause.squaresText !== undefined) return squaresText(clause.squaresText)
      return clause.squares === undefined || num(clause.squares) || clause.squares === 1 ? undefined : `${clause.squares} squares not in span`
    case 'move':
      if (!has(MOVE_WORDS[clause.move] ?? clause.move)) return `no "${clause.move}" in span`
      return clause.squaresText === undefined ? undefined : squaresText(clause.squaresText)
    case 'modifier': {
      // A dice value ("adds 1d6 to the triggering roll"; "-1d6" for subtracts) has its dice in the quote.
      if (typeof clause.value === 'string') { if (!hasDice(span, clause.value.replace(/^-/, ''))) return `dice "${clause.value.replace(/^-/, '')}" not in span` }
      else if (!num(Math.abs(clause.value))) return `value ${clause.value} not in span`
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
      if (clause.spendSurge && !has('surge')) return 'no "healing surge" in span for spendSurge'
      return diceAmount(clause.amount)
    case 'temp-hp': return has('temporary') ? diceAmount(clause.amount) : 'no "temporary" in span'
    case 'regeneration': return has('regenerat') || has('regain') ? undefined : 'no "regeneration" in span'
    case 'revive': return num(clause.hp) ? undefined : `hp ${clause.hp} not in span`
    case 'use-power': return has(clause.power.toLowerCase()) || has(/\battack|\buses?\b|\bmakes?\b/i) ? undefined : `power "${clause.power}" not in span`
    case 'recharge-power': {
      if (!has(/recharg|\bregains? the use\b/i)) return 'no "recharge" or "regains the use" in span'
      // others: each further printed power name ("Raging storm and fist of the storm recharge").
      const other = (clause.others ?? []).find(o => !s.includes(o.toLowerCase()))
      return other === undefined ? undefined : `power "${other}" not in span`
    }
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
      return has(/\binstead\b|redirect|becomes the target|\btargets? (it|him|her|the \w+|a creature)\b|\bchang\w* [^.;]{0,40}\btarget|\bmake the attack against|\bbecomes the (triggering )?attack['’]s target|\battack['’]s target\b|\btargets? (another|a different) creature/i) ? undefined : 'no "instead" or "redirect" in span'
    case 'crit-range':
      if (!has('crit')) return 'no "critical" in span'
      // The roll may follow a condition later in the sentence ("against a prone target on a roll of 17-20").
      return num(clause.min) || numIn(clause.min, span + after.split(/(?<=[.!?;])\s/)[0]) ? undefined : `${clause.min} not in span or the rest of its sentence`
    case 'power-restriction': {
      // "only" for a positive restriction ("can make only basic attacks": non-basic).
      if (!has(/\b(can[’']t|can ?not|cannot|unable|no longer|may not|doesn[’']t|does not|only)\b/i)) return 'no "can\'t", "cannot" or "only" in span'
      const what = Array.isArray(clause.what) ? clause.what : [clause.what]
      const missing = what.find(w => w !== 'named' && !has(RESTRICTION_WORDS[w] ?? w))
      if (missing) return `no "${missing}" in span`
      // 'named': each printed power name ("cannot use its shadow cloak power").
      // except: each name left out ("cannot use any power except claw").
      const name = [...(what.includes('named') ? clause.powers ?? [] : []), ...clause.except ?? []].find(p => !s.includes(p.toLowerCase()))
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
    // Also "must make a second attack roll", "make two attack rolls and use the lower", "rolls the attack twice", "makes the saving throw again".
    case 'reroll': return has(/\bre-?roll|\b(roll|make)(s|ing)?\b[^.;]{0,30}?\b(again|twice)\b|\b(second|new|another) (attack roll|saving throw|roll)|\btwo (attack rolls|saving throws)/i) ? undefined : 'no "reroll" in span'
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
    // "or"/"either"; a die roll table (chooser 'roll': "roll a d6", each of `rolls` printed); "one of the following".
    case 'choice': {
      if (clause.chooser === 'roll') {
        if (!has(/\broll|\bd\d/i)) return 'no "roll" or die ("d6") in span'
        const r = (clause.rolls ?? []).find(x => findFragment(span, x).length === 0)
        return r === undefined ? undefined : `roll result "${r}" not in span`
      }
      return has(/\b(or|either)\b|\bone of the following/i) ? undefined : 'no "or", "either" or "one of the following" in span'
    }
    case 'automatic':
      // "is treated as a critical hit", "becomes a critical hit", "the attack instead hits", and a
      // plain "the attack misses" (its roll is `if`) need no "automatic".
      if (!has(/\bautomatic|\binstead\b/i) && !(clause.what === 'critical' && has(/\b(is|becomes?|treated as|counts as|considered( to be)?) a critical hit/i))
        && !(clause.what === 'miss' && has(/\bmiss(es)?\b/i))) return 'no "automatically" or "instead" in span'
      return has(AUTOMATIC_WORDS[clause.what] ?? clause.what) ? undefined : `no "${clause.what}" in span`
    case 'lose-resistance':
      // what: the resistance, vulnerability or immunity words ("loses vulnerability to radiant").
      for (const w of clause.what ?? ['resistance']) {
        const word = { resistance: 'resist', vulnerability: 'vulnerab', immunity: 'immun' }[w] ?? w
        if (!has(word)) return `no "${word}" in span`
      }
      return clause.value === undefined || num(clause.value) ? undefined : `value ${clause.value} not in span`
    // "cannot be knocked prone", "can't be marked" also state an immunity.
    case 'immunity': return has(/\bimmun|\bcan ?not be\b|\bcan[’']t be\b/i) ? undefined : 'no "immune" or "cannot be" in span'
    // "reappears in an unoccupied square" ends removed-from-play.
    case 'end-effect': return has(/\bend(s|ed|ing)?\b|\bno longer\b|\bremov|\brid of\b|\b(re)?appears?\b/i) ? undefined : 'no "end(s)", "no longer", "removes" or "reappears" in span'
    case 'extra-action': {
      // The action's name: "move action", "standard action", "immediate reaction".
      const word = clause.action === 'no-action' ? 'action' : clause.action.split('-').pop()!
      return has(new RegExp(`\\b${word}`, 'i')) ? undefined : `no "${word}" in span`
    }
    case 'no-damage': return has(/\bno damage|\bnegat|\bharmless|\bnot take (any )?damage|\bdoesn['’]t take (any )?damage/i) ? undefined : 'no "no damage" in span'
    case 'drop-to-zero': return has(/\b0 hit points|\bkill|\bdies\b|\bslain\b|\bdestroy/i) ? undefined : 'no "0 hit points" or "kill" in span'
    case 'move-limit': {
      const word = { away: /\baway\b/i, closer: /\bcloser|\btoward/i, leave: /\bleav|\bexit|\bout of\b/i, stop: /\bstop|\bends?\b/i, within: /\bmore than|\bfarther|\bwithin\b/i }[clause.limit]
      if (word && !has(word)) return `no "${word.source.replace(/\\b/g, '')}" in span for limit "${clause.limit}"`
      return clause.squares === undefined || num(clause.squares) ? undefined : `${clause.squares} squares not in span`
    }
    case 'swallow': {
      if (!has(/\bswallow|\bengulf|\babsorb|\binside\b|\bentomb/i)) return 'no "swallow", "engulf" or "absorb" in span'
      const sentence = span + after.split(/(?<=[.!?])\s/)[0]
      return clause.escapeDc === undefined || (/escape/i.test(sentence) && numIn(clause.escapeDc, sentence)) ? undefined : `no "escape DC ${clause.escapeDc}" in the span or the rest of its sentence`
    }
    case 'share-damage':
      if (!has(/\bdamage/i)) return 'no "damage" in span'
      if (clause.part === 'half' && !has(/\bhal(f|ved?)\b/i)) return 'no "half" in span'
      return clause.part === 'rest' && !has(/\brest\b|\bremain/i) ? 'no "rest" or "remaining" in span' : undefined
    case 'aura-size':
      if (!has(/\baura/i)) return 'no "aura" in span'
      for (const n of [clause.value, clause.change]) if (n !== undefined && !num(Math.abs(n))) return `${Math.abs(n)} not in span`
      return undefined
    case 'size-change':
      if (clause.size !== undefined && !has(new RegExp(`\\b${clause.size}`, 'i'))) return `size "${clause.size}" not in span`
      if (clause.reach !== undefined && !(has(/\breach/i) && num(clause.reach))) return `no "reach ${clause.reach}" in span`
      return undefined
    case 'set-hp': return has(/\bhit points?\b/i) && num(Math.abs(clause.hp)) ? undefined : `no "${clause.hp} hit point(s)" in span`
    case 'condition-swap': {
      // "it is dazed instead": the new condition and "instead" in the quote; each replaced one in its sentence.
      const word = (c: string) => CONDITION_WORDS[c] ?? new RegExp(c, 'i')
      if (!has(word(clause.to))) return `condition "${clause.to}" not in span`
      const sentence = sentenceOf(span, before, after)
      if (!/\binstead\b/i.test(sentence)) return 'no "instead" in span or its sentence'
      const from = (clause.from ?? []).find(c => !word(c).test(sentence))
      return from === undefined ? undefined : `condition "${from}" not in span or its sentence`
    }
    case 'move-zone':
      if (!has(/\bmov/i)) return 'no "move" in span'
      return clause.squares === undefined || num(clause.squares) ? undefined : `${clause.squares} squares not in span`
    case 'state': return findFragment(span, clause.name).length > 0 ? undefined : `state "${clause.name}" not in span`
    case 'reduced-healing':
      if (!has(/\bheal|\bregain|\bhit points\b/i)) return 'no "healing", "regains" or "hit points" in span'
      if (clause.half && !has(/\bhalf\b/i)) return 'no "half" in span'
      return clause.value === undefined || num(clause.value) ? undefined : `value ${clause.value} not in span`
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
 * printed fragment of the line, outside the clause's own span [a, b) (for a
 * forced move or move, also strictly inside it: "slides any enemy that ends its
 * turn in the aura 2 squares"). A split
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
      // A (forced) move's condition printed between its verb and its squares, with quoted words on
      // both sides ("slides any enemy that ends its turn in the aura 2 squares"), may lie inside.
      const inside = (s: number, e: number) => (cl.kind === 'forced-move' || cl.kind === 'move')
        && s > a && e < b && /\w/.test(text.substring(a, s)) && /\w/.test(text.substring(e, b))
      if (found.every(([s, e]) => s < b && e > a && !inside(s, e))) {
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
  const check = (cl: Clause, p: string, lo: number, hi: number, option = false) => {
    const [a, b] = Array.isArray(cl?.at) ? cl.at : [NaN, NaN]
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= lo && a <= b && b <= hi)) {
      issues.push({ path: p, message: lo === 0 && hi === l.text.length
        ? `span [${a}, ${b}) outside text (length ${l.text.length})`
        : `span [${a}, ${b}) outside its choice's span [${lo}, ${hi})` })
      return
    }
    let problem = spanProblem(cl, l.text.substring(a, b), l.text.substring(b), l.text.substring(0, a))
    // An option may share its kind's words with the choice's leading or trailing words ("recharges
    // cascade of fire or grasping tendrils", "fearsome roar or breath weapon recharges").
    if (problem && option && (spanProblem(cl, l.text.substring(lo, b), l.text.substring(b), l.text.substring(0, lo)) === undefined
      || spanProblem(cl, l.text.substring(a, hi), l.text.substring(hi), l.text.substring(0, a)) === undefined)) problem = undefined
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
          check(x as Clause, q, a, b, true)
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
