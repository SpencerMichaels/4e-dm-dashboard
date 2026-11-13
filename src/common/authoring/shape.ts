// Shape validation for kit content entries: required fields, types, and
// membership in the kit's closed vocabularies. Hand-written so the rules stay
// readable next to src/schema.ts in the kit.

import {
  ABILITIES, ACTION_TYPES, CONDITION_IDS, CREATURE_TYPES, DAMAGE_TYPES, DEFENSES, ORIGINS, RANGE_KINDS,
  RANKS, ROLES, SENSE_KINDS, SIZES, SKILLS, STATUS_IDS, USAGES, isOneOf,
} from '@kit'

export interface Issue {
  path: string
  message: string
}

/** Collects issues while walking an entry. */
export class Checker {
  readonly issues: Issue[] = []

  fail(path: string, message: string): void { this.issues.push({ path, message }) }

  obj(v: unknown, path: string): v is Record<string, unknown> {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return true
    this.fail(path, 'expected an object')
    return false
  }
  str(v: unknown, path: string, opts: { nonEmpty?: boolean } = {}): v is string {
    if (typeof v !== 'string') { this.fail(path, 'expected a string'); return false }
    if (opts.nonEmpty && !v.trim()) { this.fail(path, 'expected a non-empty string'); return false }
    return true
  }
  int(v: unknown, path: string, opts: { min?: number; max?: number } = {}): v is number {
    if (typeof v !== 'number' || !Number.isInteger(v)) { this.fail(path, 'expected an integer'); return false }
    if (opts.min !== undefined && v < opts.min) this.fail(path, `expected >= ${opts.min}, got ${v}`)
    if (opts.max !== undefined && v > opts.max) this.fail(path, `expected <= ${opts.max}, got ${v}`)
    return true
  }
  num(v: unknown, path: string, opts: { min?: number } = {}): v is number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.fail(path, 'expected a number'); return false }
    if (opts.min !== undefined && v < opts.min) this.fail(path, `expected >= ${opts.min}, got ${v}`)
    return true
  }
  arr(v: unknown, path: string): v is unknown[] {
    if (Array.isArray(v)) return true
    this.fail(path, 'expected an array')
    return false
  }
  oneOf(list: readonly string[], v: unknown, path: string, opts: { nullable?: boolean } = {}): void {
    if (opts.nullable && v === null) return
    if (!isOneOf(list, v)) this.fail(path, `"${String(v)}" is not one of ${list.join(', ')}`)
  }
  optional(o: Record<string, unknown>, key: string, path: string, check: (v: unknown, p: string) => void): void {
    if (o[key] !== undefined) check(o[key], `${path}.${key}`)
  }
  /** No keys outside the schema (catches typos and leftovers from agent output). */
  keys(o: Record<string, unknown>, allowed: string[], path: string): void {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.fail(`${path}.${k}`, 'unknown field')
  }
}

// ── Shared pieces ──

function duration(c: Checker, d: unknown, path: string): void {
  if (!c.obj(d, path)) return
  const kinds = ['save-ends', 'turn-end', 'turn-start', 'encounter', 'sustain', 'instant', 'indefinite', 'while-in-aura', 'this-power', 'permanent', 'until']
  c.oneOf(kinds, d.kind, `${path}.kind`)
  c.keys(d, d.kind === 'turn-end' || d.kind === 'turn-start' ? ['kind', 'whose', 'next'] : d.kind === 'sustain' ? ['kind', 'action'] : d.kind === 'until' ? ['kind', 'text'] : ['kind'], path)
  if (d.kind === 'until') c.str(d.text, `${path}.text`, { nonEmpty: true })
  if (d.kind === 'turn-end' || d.kind === 'turn-start') {
    c.oneOf(['source', 'target'], d.whose, `${path}.whose`)
    if (typeof d.next !== 'boolean') c.fail(`${path}.next`, 'expected a boolean')
  }
  if (d.kind === 'sustain') c.oneOf(ACTION_TYPES, d.action, `${path}.action`)
}

const WHO = ['target', 'self', 'each-target', 'ally', 'enemies-in-area', 'creatures-in-area', 'allies-in-area', 'rider', 'mount', 'other']
const MOD_STATS = [
  'attack', 'ac', 'fortitude', 'reflex', 'will', 'defenses', 'speed', 'saving-throws', 'death-saves', 'damage', 'initiative', 'forced-movement', 'recharge', 'escape', 'roll',
  ...SKILLS.map(s => `skill:${s}`), 'skill-checks', ...ABILITIES.map(a => `ability:${a}`), 'ability-checks',
]

function damageTypes(c: Checker, v: unknown, path: string): void {
  if (!c.arr(v, path)) return
  v.forEach((t, i) => c.oneOf(DAMAGE_TYPES, t, `${path}[${i}]`))
}

/** Fields each clause kind may have besides `at`, `if`, `unless`, `optional` and `kind`. */
const CLAUSE_FIELDS: Record<string, string[]> = {
  'damage': ['dice', 'types', 'typeChoice', 'who', 'extra', 'critical', 'by', 'per', 'duration', 'saveGroup'],
  'damage-formula': ['text', 'types'],
  'half-damage': ['who', 'duration', 'saveGroup'],
  'no-damage': ['who', 'duration', 'saveGroup'],
  'ongoing-damage': ['amount', 'types', 'typeChoice', 'who', 'duration', 'saveGroup', 'saveModifier', 'increase'],
  'condition': ['condition', 'who', 'duration', 'saveGroup', 'escapeDc', 'saveModifier', 'observer'],
  'grants-ca': ['to', 'who', 'duration', 'saveGroup'],
  'forced-move': ['move', 'squares', 'squaresText', 'who'],
  'move': ['move', 'squares', 'squaresText', 'who'],
  'modifier': ['stat', 'value', 'who', 'duration', 'saveGroup', 'per'],
  'resistance': ['type', 'typeChoice', 'value', 'who', 'duration', 'saveGroup'],
  'vulnerability': ['type', 'typeChoice', 'value', 'who', 'duration', 'saveGroup'],
  'heal': ['amount', 'who', 'perTarget', 'per', 'spendSurge'],
  'temp-hp': ['amount', 'who', 'per'],
  'regeneration': ['value', 'who', 'duration', 'saveGroup'],
  'revive': ['hp'],
  'use-power': ['power', 'times', 'who'],
  'recharge-power': ['power', 'others', 'roll', 'who'],
  'lose-healing-surge': ['count', 'who'],
  'concealment': ['total', 'who', 'duration', 'saveGroup', 'observer'],
  'zone': ['duration', 'blocksLineOfSight'],
  'saving-throw': ['bonus', 'who'],
  'summon': ['creature', 'count'],
  'redirect-attack': ['who'],
  'crit-range': ['min', 'who', 'duration', 'saveGroup'],
  'power-restriction': ['what', 'powers', 'who', 'duration', 'saveGroup'],
  'status': ['status', 'who', 'duration', 'saveGroup'],
  'opportunity-reach': ['who'],
  'difficult-terrain': ['who', 'duration', 'saveGroup'],
  'charge': ['who'],
  'disease': ['disease', 'diseaseId', 'stage', 'who'],
  'reroll': ['what', 'keep', 'who'],
  'action-point': ['amount', 'who'],
  'sense': ['sense', 'range', 'who', 'duration', 'saveGroup'],
  'speed': ['mode', 'value', 'change', 'hover', 'who', 'duration', 'saveGroup'],
  'choice': ['options', 'chooser', 'rolls'],
  'automatic': ['what', 'who', 'duration', 'saveGroup'],
  'lose-resistance': ['types', 'value', 'what', 'who', 'duration', 'saveGroup'],
  'immunity': ['to', 'who', 'duration', 'saveGroup'],
  'end-effect': ['conditions', 'who'],
  'extra-action': ['action', 'who'],
  'drop-to-zero': ['who'],
  'move-limit': ['limit', 'squares', 'who', 'duration', 'saveGroup'],
  'swallow': ['who', 'duration', 'escapeDc'],
  'share-damage': ['part', 'transfer', 'who', 'duration'],
  'aura-size': ['aura', 'value', 'change', 'duration'],
  'size-change': ['size', 'reach', 'who', 'duration', 'saveGroup'],
  'unparsed': ['text'],
}

const RESTRICTIONS = [
  'encounter', 'daily', 'attack', 'all', 'standard', 'move', 'minor', 'immediate', 'opportunity', 'shift', 'teleport', 'charge', 'fly', 'non-basic', 'non-at-will', 'named',
]
const REROLL_WHAT = ['attack', 'save', 'damage', 'check']
const SPEED_MODES = ['walk', 'fly', 'climb', 'swim', 'burrow', 'teleport', 'overland-flight']

/** typeChoice: two or more damage types, with `types` empty (or resistance type 'choice'). */
function typeChoice(c: Checker, cl: Record<string, unknown>, path: string): void {
  if (cl.typeChoice === undefined) return
  const p = `${path}.typeChoice`
  if (!c.arr(cl.typeChoice, p)) return
  if (cl.typeChoice.length < 2) c.fail(p, 'expected two or more types to choose from')
  cl.typeChoice.forEach((t, i) => c.oneOf(DAMAGE_TYPES, t, `${p}[${i}]`))
  if (Array.isArray(cl.types) && cl.types.length > 0) c.fail(`${path}.types`, 'expected [] with typeChoice')
}

export function clause(c: Checker, cl: unknown, path: string, inChoice = false): void {
  if (!c.obj(cl, path)) return
  if (inChoice && cl.kind === 'choice') { c.fail(`${path}.kind`, 'a choice option cannot hold another choice'); return }
  if (!Array.isArray(cl.at) || cl.at.length !== 2 || !cl.at.every(n => Number.isInteger(n))) c.fail(`${path}.at`, 'expected [start, end] integers')
  // if / unless: one printed fragment or a non-empty list of them (spans.ts checks the words).
  const fragments = (v: unknown, p: string) => {
    if (!Array.isArray(v)) { c.str(v, p, { nonEmpty: true }); return }
    if (v.length === 0) c.fail(p, 'expected at least one fragment')
    v.forEach((f, i) => c.str(f, `${p}[${i}]`, { nonEmpty: true }))
  }
  c.optional(cl, 'if', path, fragments)
  c.optional(cl, 'unless', path, fragments)
  if (cl.optional !== undefined && cl.optional !== true) c.fail(`${path}.optional`, 'expected true or absent')
  const fields = CLAUSE_FIELDS[String(cl.kind)]
  if (!fields) { c.fail(`${path}.kind`, `unknown clause kind "${String(cl.kind)}"`); return }
  c.keys(cl, ['at', 'if', 'unless', 'optional', 'kind', ...fields], path)
  // who: one Who, or a non-empty list of distinct ones (one effect on several subjects).
  const who = (k = 'who') => {
    const p = `${path}.${k}`, v = cl[k]
    if (!Array.isArray(v)) { c.oneOf(WHO, v, p); return }
    if (v.length === 0) c.fail(p, 'expected at least one Who')
    if (new Set(v).size !== v.length) c.fail(p, 'expected distinct values')
    v.forEach((w, i) => c.oneOf(WHO, w, `${p}[${i}]`))
  }
  // observer: the one creature for whom it holds ("treats the dragon as invisible": observer target).
  const observer = () => { if (cl.observer !== undefined) c.oneOf(WHO, cl.observer, `${path}.observer`) }
  // per: the printed scaling words ("for each creature in the burst"; spans.ts checks they are printed).
  c.optional(cl, 'per', path, (v, p) => c.str(v, p, { nonEmpty: true }))
  const dur = () => duration(c, cl.duration, `${path}.duration`)
  const flag = (k: string) => { if (cl[k] !== undefined && cl[k] !== true) c.fail(`${path}.${k}`, 'expected true or absent') }
  /** A non-empty list of non-empty strings. */
  const names = (k: string) => {
    if (!c.arr(cl[k], `${path}.${k}`)) return
    if (cl[k].length === 0) c.fail(`${path}.${k}`, 'expected at least one name')
    cl[k].forEach((x, i) => c.str(x, `${path}.${k}[${i}]`, { nonEmpty: true }))
  }
  /** heal / temp-hp amount: a whole number, a dice amount ("1d10", "2d6+3"), or one of `words`. */
  const amount = (words: string[]) => {
    if (typeof cl.amount === 'string' && (words.includes(cl.amount) || /^\d+d\d+(\s*[+-]\s*\d+)?$/.test(cl.amount))) return
    if (typeof cl.amount === 'string') c.fail(`${path}.amount`, `expected a number, dice ("1d10") or one of ${words.join(', ')}`)
    else c.int(cl.amount, `${path}.amount`, { min: 0 })
  }
  c.optional(cl, 'saveGroup', path, (v, p) => c.str(v, p, { nonEmpty: true }))
  // saveModifier: the printed modifier to the saving throw against it ("-2 penalty to the saving throw": -2).
  c.optional(cl, 'saveModifier', path, (v, p) => { if (c.int(v, p) && v === 0) c.fail(p, 'expected a non-zero modifier') })
  switch (cl.kind) {
    case 'damage':
      c.str(cl.dice, `${path}.dice`, { nonEmpty: true }); damageTypes(c, cl.types, `${path}.types`); typeChoice(c, cl, path); who(); flag('extra'); flag('critical')
      if (cl.by !== undefined) who('by')
      if (cl.duration !== undefined) dur()
      break
    case 'damage-formula': c.str(cl.text, `${path}.text`, { nonEmpty: true }); damageTypes(c, cl.types, `${path}.types`); break
    case 'half-damage':
    case 'no-damage': if (cl.who !== undefined) who(); if (cl.duration !== undefined) dur(); break
    case 'ongoing-damage':
      c.int(cl.amount, `${path}.amount`, { min: 1 }); damageTypes(c, cl.types, `${path}.types`); typeChoice(c, cl, path); who(); dur(); flag('increase'); break
    case 'condition':
      c.oneOf(CONDITION_IDS, cl.condition, `${path}.condition`); who(); dur()
      c.optional(cl, 'escapeDc', path, (v, p) => c.int(v, p, { min: 1 }))
      if (cl.escapeDc !== undefined && cl.condition !== 'grabbed') c.fail(`${path}.escapeDc`, 'escapeDc only on a grabbed condition')
      observer()
      break
    case 'grants-ca': c.oneOf(['all', 'source', 'source-allies', 'rider', 'mount', 'ally'], cl.to, `${path}.to`); who(); dur(); break
    case 'forced-move':
    case 'move':
      c.oneOf(cl.kind === 'move' ? ['shift', 'teleport', 'swap', 'fly', 'move'] : ['push', 'pull', 'slide'], cl.move, `${path}.move`); who()
      // squares, or squaresText for a printed distance that is not a number (a forced move needs one of them).
      c.optional(cl, 'squares', path, (v, p) => c.int(v, p, { min: 0 }))
      c.optional(cl, 'squaresText', path, (v, p) => c.str(v, p, { nonEmpty: true }))
      if (cl.squares !== undefined && cl.squaresText !== undefined) c.fail(`${path}.squaresText`, 'expected squares or squaresText, not both')
      if (cl.kind === 'forced-move' && cl.squares === undefined && cl.squaresText === undefined) c.fail(`${path}.squares`, 'expected squares, or squaresText for a distance that is not a number')
      break
    case 'modifier':
      if (Array.isArray(cl.stat)) {
        if (cl.stat.length === 0) c.fail(`${path}.stat`, 'expected at least one stat')
        cl.stat.forEach((s, i) => c.oneOf(MOD_STATS, s, `${path}.stat[${i}]`))
      } else c.oneOf(MOD_STATS, cl.stat, `${path}.stat`)
      // value: a whole number, or dice ("1d6", "-1d6").
      if (typeof cl.value === 'string') { if (!/^-?\d+d\d+(\s*[+-]\s*\d+)?$/.test(cl.value)) c.fail(`${path}.value`, 'expected a number or dice ("1d6", "-1d6")') }
      else c.int(cl.value, `${path}.value`)
      who(); dur(); break
    case 'resistance':
    case 'vulnerability':
      if (cl.type === 'choice') { if (cl.typeChoice === undefined) c.fail(`${path}.typeChoice`, 'type "choice" needs typeChoice') }
      else if (cl.typeChoice !== undefined) c.fail(`${path}.type`, 'expected "choice" with typeChoice')
      else if (cl.type !== 'all') c.oneOf(DAMAGE_TYPES, cl.type, `${path}.type`)
      typeChoice(c, cl, path)
      c.int(cl.value, `${path}.value`); who(); dur(); break
    case 'heal':
      amount(['surge-value', 'half-surge-value', 'damage-dealt', 'half-damage-dealt'])
      flag('perTarget'); flag('spendSurge'); who(); break
    case 'temp-hp': amount(['surge-value']); who(); break
    case 'regeneration': c.int(cl.value, `${path}.value`, { min: 0 }); who(); dur(); break
    case 'revive': c.int(cl.hp, `${path}.hp`, { min: 0 }); break
    case 'use-power': c.str(cl.power, `${path}.power`, { nonEmpty: true }); c.optional(cl, 'times', path, (v, p) => c.int(v, p, { min: 1 })); who(); break
    case 'recharge-power':
      c.str(cl.power, `${path}.power`, { nonEmpty: true }); flag('roll')
      if (cl.others !== undefined) names('others')
      if (cl.who !== undefined) who()
      break
    case 'lose-healing-surge': c.int(cl.count, `${path}.count`, { min: 1 }); who(); break
    case 'concealment': flag('total'); who(); dur(); observer(); break
    case 'zone': dur(); flag('blocksLineOfSight'); break
    case 'saving-throw': c.optional(cl, 'bonus', path, (v, p) => c.int(v, p)); who(); break
    case 'summon': c.str(cl.creature, `${path}.creature`, { nonEmpty: true }); c.optional(cl, 'count', path, (v, p) => c.int(v, p, { min: 1 })); break
    case 'redirect-attack': who(); break
    case 'crit-range': c.int(cl.min, `${path}.min`, { min: 2, max: 20 }); who(); dur(); break
    case 'power-restriction':
      if (Array.isArray(cl.what)) {
        if (cl.what.length === 0) c.fail(`${path}.what`, 'expected at least one value')
        cl.what.forEach((s, i) => c.oneOf(RESTRICTIONS, s, `${path}.what[${i}]`))
      } else c.oneOf(RESTRICTIONS, cl.what, `${path}.what`)
      // 'named' lists the printed power names in `powers`.
      if ((Array.isArray(cl.what) ? cl.what : [cl.what]).includes('named')) names('powers')
      else if (cl.powers !== undefined) c.fail(`${path}.powers`, 'powers only with what "named"')
      who(); dur(); break
    case 'status': c.oneOf(STATUS_IDS, cl.status, `${path}.status`); who(); dur(); break
    case 'opportunity-reach': who(); break
    case 'difficult-terrain': if (cl.who !== undefined) who(); dur(); break
    case 'charge': who(); break
    case 'disease':
      c.str(cl.disease, `${path}.disease`, { nonEmpty: true }); who()
      c.optional(cl, 'diseaseId', path, (v, p) => c.str(v, p, { nonEmpty: true }))
      c.optional(cl, 'stage', path, (v, p) => c.int(v, p, { min: 0 }))
      break
    case 'reroll':
      if (Array.isArray(cl.what)) {
        if (cl.what.length === 0) c.fail(`${path}.what`, 'expected at least one value')
        cl.what.forEach((s, i) => c.oneOf(REROLL_WHAT, s, `${path}.what[${i}]`))
      } else c.oneOf(REROLL_WHAT, cl.what, `${path}.what`)
      who()
      c.optional(cl, 'keep', path, (v, p) => c.oneOf(['new', 'higher', 'lower'], v, p))
      break
    case 'action-point': c.int(cl.amount, `${path}.amount`, { min: 1 }); who(); break
    case 'sense':
      c.oneOf([...SENSE_KINDS, 'see-invisible', 'sight-limit'], cl.sense, `${path}.sense`); who(); dur()
      c.optional(cl, 'range', path, (v, p) => c.int(v, p, { min: 1 }))
      break
    case 'speed':
      // A mode gained or set (value), or changed (change); neither when the print gives no number.
      c.oneOf(SPEED_MODES, cl.mode, `${path}.mode`); who(); dur(); flag('hover')
      c.optional(cl, 'value', path, (v, p) => c.int(v, p, { min: 0 }))
      c.optional(cl, 'change', path, (v, p) => { if (c.int(v, p) && v === 0) c.fail(p, 'expected a non-zero change') })
      if (cl.value !== undefined && cl.change !== undefined) c.fail(`${path}.change`, 'expected value or change, not both')
      break
    case 'choice': {
      // Two or more options, each a non-empty list of clauses (never another choice).
      c.optional(cl, 'chooser', path, (v, p) => c.oneOf(['self', 'target', 'roll'], v, p))
      const p = `${path}.options`
      if (!c.arr(cl.options, p)) break
      // rolls: the printed die results, one per option ("1-3", "4-5", "6"), only with chooser 'roll'.
      if (cl.rolls !== undefined) {
        names('rolls')
        if (cl.chooser !== 'roll') c.fail(`${path}.rolls`, 'rolls only with chooser "roll"')
        else if (Array.isArray(cl.rolls) && cl.rolls.length !== cl.options.length) c.fail(`${path}.rolls`, `expected one roll result per option (${cl.options.length})`)
      }
      if (cl.options.length < 2) c.fail(p, 'expected two or more options')
      cl.options.forEach((opt, i) => {
        if (!c.arr(opt, `${p}[${i}]`)) return
        if (opt.length === 0) c.fail(`${p}[${i}]`, 'expected at least one clause')
        opt.forEach((x, j) => clause(c, x, `${p}[${i}][${j}]`, true))
      })
      break
    }
    case 'automatic': c.oneOf(['hit', 'miss', 'critical', 'save'], cl.what, `${path}.what`); who(); dur(); break
    case 'lose-resistance':
      if (c.arr(cl.types, `${path}.types`)) {
        if (cl.types.length === 0) c.fail(`${path}.types`, 'expected at least one type')
        cl.types.forEach((t, i) => c.oneOf([...DAMAGE_TYPES, 'all'], t, `${path}.types[${i}]`))
      }
      c.optional(cl, 'value', path, (v, p) => c.int(v, p, { min: 1 }))
      c.optional(cl, 'what', path, (v, p) => list(c, v, p, (x, q) => c.oneOf(['resistance', 'vulnerability', 'immunity'], x, q)))
      who(); dur(); break
    case 'immunity': names('to'); who(); dur(); break
    case 'end-effect':
      c.optional(cl, 'conditions', path, (v, p) => list(c, v, p, (x, q) => c.oneOf(CONDITION_IDS, x, q)))
      who(); break
    case 'extra-action': c.oneOf(ACTION_TYPES, cl.action, `${path}.action`); who(); break
    case 'drop-to-zero': who(); break
    case 'move-limit':
      c.oneOf(['away', 'closer', 'leave', 'stop', 'within'], cl.limit, `${path}.limit`); who(); dur()
      c.optional(cl, 'squares', path, (v, p) => c.int(v, p, { min: 0 }))
      if (cl.limit === 'within' && cl.squares === undefined) c.fail(`${path}.squares`, 'limit "within" needs squares')
      break
    case 'swallow': who(); dur(); c.optional(cl, 'escapeDc', path, (v, p) => c.int(v, p, { min: 1 })); break
    case 'share-damage':
      c.oneOf(['all', 'half', 'rest'], cl.part, `${path}.part`); who(); flag('transfer')
      if (cl.duration !== undefined) dur()
      break
    case 'aura-size':
      c.optional(cl, 'aura', path, (v, p) => c.str(v, p, { nonEmpty: true })); dur()
      c.optional(cl, 'value', path, (v, p) => c.int(v, p, { min: 0 }))
      c.optional(cl, 'change', path, (v, p) => { if (c.int(v, p) && v === 0) c.fail(p, 'expected a non-zero change') })
      if ((cl.value === undefined) === (cl.change === undefined)) c.fail(`${path}.value`, 'expected value or change')
      break
    case 'size-change':
      c.optional(cl, 'size', path, (v, p) => c.oneOf(SIZES, v, p))
      c.optional(cl, 'reach', path, (v, p) => c.int(v, p, { min: 0 }))
      if (cl.size === undefined && cl.reach === undefined) c.fail(`${path}.size`, 'expected size or reach')
      who(); dur(); break
    case 'unparsed': c.str(cl.text, `${path}.text`, { nonEmpty: true }); break
  }
}

export function lineShape(c: Checker, l: unknown, path: string): void {
  if (!c.obj(l, path)) return
  c.keys(l, ['text', 'clauses'], path)
  c.str(l.text, `${path}.text`)
  if (c.arr(l.clauses, `${path}.clauses`)) l.clauses.forEach((cl, i) => clause(c, cl, `${path}.clauses[${i}]`))
}

function optLine(c: Checker, o: Record<string, unknown>, key: string, path: string): void {
  c.optional(o, key, path, (v, p) => lineShape(c, v, p))
}

/** sources: SourceRef[], at least one (the primary source). */
function sources(c: Checker, v: unknown, path: string): void {
  if (!c.arr(v, path)) return
  if (v.length === 0) c.fail(path, 'expected at least one source')
  v.forEach((s, i) => {
    const p = `${path}[${i}]`
    if (!c.obj(s, p)) return
    c.keys(s, ['book', 'page'], p)
    c.str(s.book, `${p}.book`)
    c.optional(s, 'page', p, (x, q) => { if (typeof x === 'string') c.str(x, q, { nonEmpty: true }); else c.int(x, q, { min: 0 }) })
  })
}

function provenance(c: Checker, p: unknown, path: string): void {
  if (!c.obj(p, path)) return
  c.keys(p, ['origin', 'by', 'at', 'confidence', 'reviewed', 'notes'], path)
  c.oneOf(['parser', 'agent', 'human'], p.origin, `${path}.origin`)
  c.optional(p, 'by', path, (v, q) => c.str(v, q))
  if (c.str(p.at, `${path}.at`) && !/^\d{4}-\d{2}-\d{2}/.test(p.at)) c.fail(`${path}.at`, 'expected an ISO date')
  c.optional(p, 'confidence', path, (v, q) => c.oneOf(['high', 'low'], v, q))
  if (p.reviewed !== undefined && p.reviewed !== true) c.fail(`${path}.reviewed`, 'expected true or absent')
  c.optional(p, 'notes', path, (v, q) => { if (c.arr(v, q)) v.forEach((n, i) => c.str(n, `${q}[${i}]`)) })
}

function range(c: Checker, r: unknown, path: string): void {
  if (!c.obj(r, path)) return
  c.oneOf(RANGE_KINDS, r.kind, `${path}.kind`)
  for (const k of ['reach', 'size', 'within']) c.optional(r, k, path, (v, p) => c.int(v, p, { min: 0 }))
  c.optional(r, 'note', path, (v, p) => c.str(v, p))
}

function attack(c: Checker, a: unknown, path: string): void {
  if (!c.obj(a, path)) return
  c.keys(a, ['label', 'name', 'after', 'range', 'target', 'bonus', 'vs', 'altBonus', 'hit', 'miss', 'critical', 'aftereffect', 'failedSaves'], path)
  c.oneOf(['primary', 'secondary', 'tertiary'], a.label, `${path}.label`)
  c.optional(a, 'name', path, (v, p) => c.str(v, p, { nonEmpty: true }))
  c.optional(a, 'after', path, (v, p) => c.oneOf(['hit', 'miss', 'always'], v, p))
  range(c, a.range, `${path}.range`)
  c.str(a.target, `${path}.target`)
  if (c.obj(a.bonus, `${path}.bonus`)) {
    const b = a.bonus
    if (b.kind === 'fixed') c.int(b.value, `${path}.bonus.value`)
    else if (b.kind === 'level') c.int(b.plus, `${path}.bonus.plus`)
    else if (b.kind === 'formula') c.str(b.text, `${path}.bonus.text`, { nonEmpty: true })
    else c.fail(`${path}.bonus.kind`, `unknown bonus kind "${String(b.kind)}"`)
  }
  c.oneOf([...DEFENSES, 'any', 'unknown'], a.vs, `${path}.vs`)
  c.optional(a, 'altBonus', path, (v, q) => list(c, v, q, (x, p) => {
    if (!c.obj(x, p)) return
    c.keys(x, ['value', 'if', 'vs'], p)
    c.int(x.value, `${p}.value`)
    c.str(x.if, `${p}.if`, { nonEmpty: true })
    c.optional(x, 'vs', p, (d, r) => c.oneOf(DEFENSES, d, r))
  }))
  for (const k of ['hit', 'miss', 'critical', 'aftereffect']) optLine(c, a, k, path)
  c.optional(a, 'failedSaves', path, (v, q) => list(c, v, q, (f, p) => {
    if (!c.obj(f, p)) return
    c.keys(f, ['n', 'line'], p)
    if (f.n !== 'each') c.int(f.n, `${p}.n`, { min: 1 })
    lineShape(c, f.line, `${p}.line`)
  }))
}

const POWER_KEYS = ['name', 'action', 'usage', 'recharge', 'usesPerEncounter', 'usesPerRound', 'basic', 'keywords', 'trigger', 'requirement',
  'range', 'attacks', 'effect', 'sustain', 'special', 'levelSteps', 'extraLines']

export function power(c: Checker, p: unknown, path: string, extraKeys: string[] = []): void {
  if (!c.obj(p, path)) return
  c.keys(p, [...POWER_KEYS, ...extraKeys], path)
  c.str(p.name, `${path}.name`, { nonEmpty: true })
  c.oneOf(ACTION_TYPES, p.action, `${path}.action`)
  c.oneOf([...USAGES, 'unknown'], p.usage, `${path}.usage`)
  if (p.usage === 'recharge') {
    if (c.obj(p.recharge, `${path}.recharge`)) {
      const r = p.recharge
      if (r.kind === 'roll') { if (![2, 3, 4, 5, 6].includes(r.min as number)) c.fail(`${path}.recharge.min`, 'expected 2-6') }
      else if (r.kind === 'text') c.str(r.text, `${path}.recharge.text`, { nonEmpty: true })
      else if (r.kind !== 'bloodied') c.fail(`${path}.recharge.kind`, `unknown recharge kind "${String(r.kind)}"`)
    }
  } else if (p.recharge !== undefined) c.fail(`${path}.recharge`, 'recharge without usage "recharge"')
  c.optional(p, 'usesPerEncounter', path, (v, q) => c.int(v, q, { min: 1 }))
  c.optional(p, 'usesPerRound', path, (v, q) => c.int(v, q, { min: 1 }))
  c.optional(p, 'basic', path, (v, q) => c.oneOf(['melee', 'ranged'], v, q))
  if (c.arr(p.keywords, `${path}.keywords`)) p.keywords.forEach((k, i) => c.str(k, `${path}.keywords[${i}]`, { nonEmpty: true }))
  optLine(c, p, 'trigger', path)
  optLine(c, p, 'requirement', path)
  c.optional(p, 'range', path, (v, q) => range(c, v, q))
  if (c.arr(p.attacks, `${path}.attacks`)) p.attacks.forEach((a, i) => attack(c, a, `${path}.attacks[${i}]`))
  optLine(c, p, 'effect', path)
  c.optional(p, 'sustain', path, (v, q) => {
    if (!c.obj(v, q)) return
    c.keys(v, ['action', 'line'], q)
    c.oneOf(ACTION_TYPES, v.action, `${q}.action`)
    optLine(c, v, 'line', q)
  })
  optLine(c, p, 'special', path)
  c.optional(p, 'levelSteps', path, (v, q) => levelSteps(c, v, q))
  c.optional(p, 'extraLines', path, (v, q) => list(c, v, q, (x, r) => {
    if (!c.obj(x, r)) return
    c.keys(x, ['label', 'line'], r)
    c.str(x.label, `${r}.label`, { nonEmpty: true })
    lineShape(c, x.line, `${r}.line`)
  }))
}

/** { level, text }[]: power levelSteps and item propertyLevelSteps. */
function levelSteps(c: Checker, v: unknown, path: string): void {
  list(c, v, path, (s, p) => {
    if (!c.obj(s, p)) return
    c.keys(s, ['level', 'text'], p)
    c.int(s.level, `${p}.level`, { min: 1 })
    c.str(s.text, `${p}.text`)
  })
}

function trait(c: Checker, t: unknown, path: string, aura = false): void {
  if (!c.obj(t, path)) return
  c.keys(t, aura ? ['name', 'keywords', 'text', 'range', 'rangeText', 'rangeIf'] : ['name', 'keywords', 'text'], path)
  c.str(t.name, `${path}.name`, { nonEmpty: true })
  if (c.arr(t.keywords, `${path}.keywords`)) t.keywords.forEach((k, i) => c.str(k, `${path}.keywords[${i}]`))
  lineShape(c, t.text, `${path}.text`)
  if (!aura) return
  // range: the printed size; rangeText when it is not a number ("aura sight").
  if (t.range === undefined) {
    if (t.rangeText === undefined) c.fail(`${path}.range`, 'expected range, or rangeText for a size that is not a number')
    else c.str(t.rangeText, `${path}.rangeText`, { nonEmpty: true })
  } else {
    c.int(t.range, `${path}.range`, { min: 0 })
    c.optional(t, 'rangeText', path, () => c.fail(`${path}.rangeText`, 'rangeText only when the size is not a number'))
  }
  // rangeIf: printed alternative sizes ("aura 2, or 3 while bloodied"), `if` as printed words.
  c.optional(t, 'rangeIf', path, (v, q) => list(c, v, q, (x, p) => {
    if (!c.obj(x, p)) return
    c.keys(x, ['value', 'if'], p)
    c.int(x.value, `${p}.value`, { min: 0 })
    if (Array.isArray(x.if)) {
      if (x.if.length === 0) c.fail(`${p}.if`, 'expected at least one fragment')
      x.if.forEach((f, i) => c.str(f, `${p}.if[${i}]`, { nonEmpty: true }))
    } else c.str(x.if, `${p}.if`, { nonEmpty: true })
  }))
}

function list<T>(c: Checker, v: unknown, path: string, each: (item: unknown, p: string) => T): void {
  if (c.arr(v, path)) v.forEach((x, i) => each(x, `${path}[${i}]`))
}

/** DamageModifier[]: a type with a value, or with neither value nor text when the type says it all, or text-only. */
function damageModifiers(c: Checker, v: unknown, path: string): void {
  list(c, v, path, (x, p) => {
    if (!c.obj(x, p)) return
    c.keys(x, ['type', 'value', 'text', 'note'], p)
    c.str(x.type, `${p}.type`, { nonEmpty: true })
    c.optional(x, 'value', p, (n, q) => c.int(n, q, { min: 0 }))
    c.optional(x, 'text', p, (n, q) => c.str(n, q, { nonEmpty: true }))
    c.optional(x, 'note', p, (n, q) => c.str(n, q))
  })
}

function speed(c: Checker, s: unknown, path: string): void {
  if (!c.obj(s, path)) return
  c.keys(s, ['walk', 'fly', 'overlandFlight', 'climb', 'swim', 'burrow', 'teleport', 'notes'], path)
  c.int(s.walk, `${path}.walk`, { min: 0 })
  for (const k of ['fly', 'overlandFlight', 'climb', 'swim', 'burrow', 'teleport']) c.optional(s, k, path, (v, p) => c.int(v, p, { min: 0 }))
  c.optional(s, 'notes', path, (v, p) => c.str(v, p))
}

// ── Entry types ──

export function monsterShape(c: Checker, m: unknown): void {
  const path = '$'
  if (!c.obj(m, path)) return
  /** { value, if } (plus `extra` keys): a printed alternative value and its condition, as printed words. */
  const conditionalValue = (x: unknown, p: string, extra: string[] = []): x is Record<string, unknown> => {
    if (!c.obj(x, p)) return false
    c.keys(x, [...extra, 'value', 'if'], p)
    c.int(x.value, `${p}.value`, { min: 0 })
    if (Array.isArray(x.if)) {
      if (x.if.length === 0) c.fail(`${p}.if`, 'expected at least one fragment')
      x.if.forEach((f, i) => c.str(f, `${p}.if[${i}]`, { nonEmpty: true }))
    } else c.str(x.if, `${p}.if`, { nonEmpty: true })
    return true
  }
  c.keys(m, ['id', 'name', 'level', 'role', 'rank', 'leader', 'size', 'origin', 'type', 'keywords', 'xp', 'hp', 'hpText', 'hpIf', 'initiative',
    'perception', 'senses', 'speed', 'defenses', 'defensesIf', 'savingThrowBonus', 'savingThrowNotes', 'actionPoints', 'immune', 'resist', 'vulnerable',
    'regeneration', 'abilities', 'skills', 'skillNotes', 'alignment', 'languages', 'equipment', 'traits', 'auras', 'powers', 'description',
    'sources', 'provenance'], path)
  c.str(m.id, '$.id', { nonEmpty: true })
  c.str(m.name, '$.name', { nonEmpty: true })
  c.int(m.level, '$.level', { min: 0, max: 40 })
  c.oneOf(ROLES, m.role, '$.role', { nullable: true })
  c.oneOf(RANKS, m.rank, '$.rank')
  if (m.leader !== undefined && m.leader !== true) c.fail('$.leader', 'expected true or absent')
  c.oneOf(SIZES, m.size, '$.size')
  c.oneOf(ORIGINS, m.origin, '$.origin', { nullable: true })
  c.oneOf(CREATURE_TYPES, m.type, '$.type', { nullable: true })
  list(c, m.keywords, '$.keywords', (k, p) => c.str(k, p, { nonEmpty: true }))
  c.int(m.xp, '$.xp', { min: 0 })
  // hp 0 only with hpText ("infinite hit points").
  c.int(m.hp, '$.hp', { min: m.hpText === undefined ? 1 : 0 })
  c.optional(m, 'hpText', '$', (v, p) => c.str(v, p, { nonEmpty: true }))
  c.optional(m, 'hpIf', '$', (v, q) => list(c, v, q, (x, p) => conditionalValue(x, p)))
  c.int(m.initiative, '$.initiative')
  c.int(m.perception, '$.perception')
  list(c, m.senses, '$.senses', (s, p) => {
    if (!c.obj(s, p)) return
    c.oneOf(SENSE_KINDS, s.kind, `${p}.kind`)
    c.optional(s, 'range', p, (v, q) => c.int(v, q, { min: 0 }))
  })
  speed(c, m.speed, '$.speed')
  if (c.obj(m.defenses, '$.defenses')) for (const d of DEFENSES) c.int(m.defenses[d], `$.defenses.${d}`, { min: 0 })
  // defensesIf: printed conditional values ("Fortitude 23 (25 while bloodied)"); `if` is the printed words.
  c.optional(m, 'defensesIf', '$', (v, q) => list(c, v, q, (x, p) => {
    if (conditionalValue(x, p, ['defense'])) c.oneOf(DEFENSES, x.defense, `${p}.defense`)
  }))
  c.int(m.savingThrowBonus, '$.savingThrowBonus', { min: 0 })
  c.optional(m, 'savingThrowNotes', '$', (v, p) => list(c, v, p, (n, q) => c.str(n, q, { nonEmpty: true })))
  c.int(m.actionPoints, '$.actionPoints', { min: 0 })
  list(c, m.immune, '$.immune', (x, p) => {
    if (!c.obj(x, p)) return
    c.keys(x, ['type', 'note'], p)
    c.str(x.type, `${p}.type`, { nonEmpty: true })
    c.optional(x, 'note', p, (v, q) => c.str(v, q, { nonEmpty: true }))
  })
  damageModifiers(c, m.resist, '$.resist')
  damageModifiers(c, m.vulnerable, '$.vulnerable')
  c.optional(m, 'regeneration', '$', (r, p) => {
    if (!c.obj(r, p)) return
    c.int(r.value, `${p}.value`, { min: 0 })
    damageTypes(c, r.suppressedBy, `${p}.suppressedBy`)
    c.optional(r, 'suppressedText', p, (v, q) => c.str(v, q, { nonEmpty: true }))
    c.str(r.text, `${p}.text`)
  })
  if (c.obj(m.abilities, '$.abilities')) for (const a of ABILITIES) c.int(m.abilities[a], `$.abilities.${a}`, { min: 1 })
  if (c.obj(m.skills, '$.skills')) {
    for (const [k, v] of Object.entries(m.skills)) { c.oneOf(SKILLS, k, `$.skills.${k}`); c.int(v, `$.skills.${k}`) }
  }
  c.optional(m, 'skillNotes', '$', (v, p) => list(c, v, p, (n, q) => c.str(n, q, { nonEmpty: true })))
  for (const k of ['alignment', 'languages', 'equipment', 'description']) c.str(m[k], `$.${k}`)
  list(c, m.traits, '$.traits', (t, p) => trait(c, t, p))
  list(c, m.auras, '$.auras', (t, p) => trait(c, t, p, true))
  list(c, m.powers, '$.powers', (x, p) => power(c, x, p))
  sources(c, m.sources, '$.sources')
  provenance(c, m.provenance, '$.provenance')
}

export function itemShape(c: Checker, it: unknown): void {
  if (!c.obj(it, '$')) return
  c.keys(it, ['id', 'name', 'category', 'level', 'rarity', 'tier', 'levels', 'slot', 'subtype', 'itemType', 'critical', 'properties',
    'propertyLevelSteps', 'special', 'requirement', 'weight', 'powers', 'weapon', 'armor', 'ritual', 'alchemical', 'itemSet', 'flavor', 'description', 'sources', 'provenance'], '$')
  c.str(it.id, '$.id', { nonEmpty: true })
  c.str(it.name, '$.name', { nonEmpty: true })
  c.oneOf(['item', 'weapon', 'armor', 'implement', 'ritual', 'alchemical', 'set'], it.category, '$.category')
  c.int(it.level, '$.level', { min: 0 })
  c.oneOf(['common', 'uncommon', 'rare'], it.rarity, '$.rarity', { nullable: true })
  c.optional(it, 'tier', '$', (v, p) => c.oneOf(['heroic', 'paragon', 'epic'], v, p))
  list(c, it.levels, '$.levels', (l, p) => {
    if (!c.obj(l, p)) return
    c.keys(l, ['level', 'enhancement', 'price', 'priceText'], p)
    c.int(l.level, `${p}.level`, { min: 0 })
    c.optional(l, 'enhancement', p, (v, q) => c.int(v, q))
    if (l.price !== null) c.num(l.price, `${p}.price`, { min: 0 })
    c.optional(l, 'priceText', p, (v, q) => c.str(v, q, { nonEmpty: true }))
  })
  c.optional(it, 'slot', '$', (v, p) => c.oneOf(['head', 'neck', 'arms', 'hands', 'waist', 'feet', 'ring', 'body', 'weapon',
    'implement', 'tattoo', 'wondrous', 'mount', 'ki-focus'], v, p))
  c.optional(it, 'subtype', '$', (v, p) => c.str(v, p, { nonEmpty: true }))
  c.optional(it, 'itemType', '$', (v, p) => c.str(v, p))
  optLine(c, it, 'critical', '$')
  list(c, it.properties, '$.properties', (l, p) => lineShape(c, l, p))
  c.optional(it, 'propertyLevelSteps', '$', (v, q) => levelSteps(c, v, q))
  optLine(c, it, 'special', '$')
  optLine(c, it, 'requirement', '$')
  c.optional(it, 'weight', '$', (v, p) => c.str(v, p, { nonEmpty: true }))
  c.optional(it, 'alchemical', '$', (a, p) => {
    if (!c.obj(a, p)) return
    c.keys(a, ['type', 'formulaCost'], p)
    for (const k of ['type', 'formulaCost']) c.optional(a, k, p, (v, q) => c.str(v, q, { nonEmpty: true }))
  })
  list(c, it.powers, '$.powers', (x, p) => power(c, x, p))
  c.optional(it, 'weapon', '$', (w, p) => {
    if (!c.obj(w, p)) return
    c.str(w.damage, `${p}.damage`); c.int(w.proficiency, `${p}.proficiency`, { min: 0 })
    list(c, w.groups, `${p}.groups`, (g, q) => c.str(g, q)); list(c, w.properties, `${p}.properties`, (g, q) => c.str(g, q))
    c.str(w.category, `${p}.category`)
  })
  c.optional(it, 'armor', '$', (a, p) => {
    if (!c.obj(a, p)) return
    c.keys(a, ['category', 'acBonus', 'check', 'speed', 'minEnhancement'], p)
    c.str(a.category, `${p}.category`)
    c.int(a.acBonus, `${p}.acBonus`, { min: 0 })
    for (const k of ['check', 'speed', 'minEnhancement']) c.optional(a, k, p, (v, q) => c.int(v, q))
  })
  c.optional(it, 'ritual', '$', (r, p) => {
    if (!c.obj(r, p)) return
    for (const k of ['keySkill', 'castTime', 'duration', 'componentCost', 'category']) c.str(r[k], `${p}.${k}`)
  })
  c.optional(it, 'itemSet', '$', (v, p) => c.str(v, p))
  c.str(it.flavor, '$.flavor')
  list(c, it.description, '$.description', (d, p) => {
    if (!c.obj(d, p)) return
    c.oneOf(['text', 'heading', 'table', 'properties', 'power'], d.type, `${p}.type`)
    if (d.type === 'power') power(c, d.power, `${p}.power`)
  })
  sources(c, it.sources, '$.sources')
  provenance(c, it.provenance, '$.provenance')
}

export function trapShape(c: Checker, t: unknown): void {
  if (!c.obj(t, '$')) return
  c.keys(t, ['id', 'name', 'kind', 'usage', 'level', 'role', 'rank', 'xp', 'detect', 'initiative', 'speed', 'hp', 'hpText', 'defenses', 'immune',
    'resist', 'trigger', 'traits', 'auras', 'powers', 'countermeasures', 'flavor', 'description', 'sources', 'provenance'], '$')
  c.str(t.id, '$.id', { nonEmpty: true })
  c.str(t.name, '$.name', { nonEmpty: true })
  c.oneOf(['trap', 'hazard', 'terrain', 'object', 'area', 'special'], t.kind, '$.kind')
  c.optional(t, 'usage', '$', (v, p) => c.oneOf(['at-will', 'single-use'], v, p))
  c.int(t.level, '$.level', { min: 0 })
  c.str(t.role, '$.role')
  c.oneOf(['standard', 'elite', 'solo'], t.rank, '$.rank')
  c.int(t.xp, '$.xp', { min: 0 })
  list(c, t.detect, '$.detect', (d, p) => {
    if (!c.obj(d, p)) return
    c.str(d.skill, `${p}.skill`)
    if (d.dc !== null) c.int(d.dc, `${p}.dc`, { min: 0 })
    c.str(d.text, `${p}.text`)
  })
  c.optional(t, 'initiative', '$', (v, p) => c.int(v, p))
  c.optional(t, 'speed', '$', (v, p) => speed(c, v, p))
  c.optional(t, 'hp', '$', (v, p) => c.int(v, p, { min: 1 }))
  c.optional(t, 'hpText', '$', (v, p) => c.str(v, p, { nonEmpty: true }))
  c.optional(t, 'defenses', '$', (d, p) => {
    if (!c.obj(d, p)) return
    for (const [k, v] of Object.entries(d)) { c.oneOf(DEFENSES, k, `${p}.${k}`); c.int(v, `${p}.${k}`) }
  })
  list(c, t.immune, '$.immune', (x, p) => { if (c.obj(x, p)) c.str(x.type, `${p}.type`) })
  damageModifiers(c, t.resist, '$.resist')
  optLine(c, t, 'trigger', '$')
  list(c, t.traits, '$.traits', (x, p) => trait(c, x, p))
  list(c, t.auras, '$.auras', (x, p) => trait(c, x, p, true))
  list(c, t.powers, '$.powers', (x, p) => power(c, x, p))
  list(c, t.countermeasures, '$.countermeasures', (l, p) => lineShape(c, l, p))
  c.str(t.flavor, '$.flavor'); c.str(t.description, '$.description')
  sources(c, t.sources, '$.sources')
  provenance(c, t.provenance, '$.provenance')
}

/** A disease DC: a number, or { text } for level-relative DCs ("15 + encounter level", "Moderate DC"). */
function dc(c: Checker, v: unknown, path: string): void {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    c.keys(o, ['text'], path)
    c.str(o.text, `${path}.text`, { nonEmpty: true })
  } else c.int(v, path, { min: 1 })
}

export function diseaseShape(c: Checker, d: unknown): void {
  if (!c.obj(d, '$')) return
  c.keys(d, ['id', 'name', 'level', 'attack', 'endurance', 'check', 'stages', 'flavor', 'sources', 'provenance'], '$')
  c.str(d.id, '$.id', { nonEmpty: true })
  c.str(d.name, '$.name', { nonEmpty: true })
  c.int(d.level, '$.level', { min: 0 })
  c.optional(d, 'attack', '$', (a, p) => attack(c, a, p))
  if (c.obj(d.endurance, '$.endurance')) {
    c.keys(d.endurance, ['improveDc', 'maintainDc', 'worsenText'], '$.endurance')
    dc(c, d.endurance.improveDc, '$.endurance.improveDc')
    dc(c, d.endurance.maintainDc, '$.endurance.maintainDc')
    c.optional(d.endurance, 'worsenText', '$.endurance', (v, p) => c.str(v, p))
  }
  c.optional(d, 'check', '$', (v, p) => {
    if (!c.obj(v, p)) return
    c.keys(v, ['skill', 'text'], p)
    c.str(v.skill, `${p}.skill`)
    c.str(v.text, `${p}.text`, { nonEmpty: true })
  })
  list(c, d.stages, '$.stages', (s, p) => {
    if (!c.obj(s, p)) return
    c.int(s.stage, `${p}.stage`, { min: 0 })
    if (s.final !== undefined && s.final !== true) c.fail(`${p}.final`, 'expected true or absent')
    lineShape(c, s.line, `${p}.line`)
  })
  c.str(d.flavor, '$.flavor')
  sources(c, d.sources, '$.sources')
  provenance(c, d.provenance, '$.provenance')
}

function prereq(c: Checker, p: unknown, path: string): void {
  if (!c.obj(p, path)) return
  switch (p.kind) {
    case 'min-level': c.int(p.level, `${path}.level`, { min: 1 }); break
    case 'keyword': list(c, p.any, `${path}.any`, (k, q) => c.str(k, q, { nonEmpty: true })); break
    case 'origin': list(c, p.any, `${path}.any`, (k, q) => c.oneOf(ORIGINS, k, q)); break
    case 'type': list(c, p.any, `${path}.any`, (k, q) => c.oneOf(CREATURE_TYPES, k, q)); break
    case 'rank': list(c, p.any, `${path}.any`, (k, q) => c.oneOf(RANKS, k, q)); break
    case 'all':
    case 'any-of': list(c, p.of, `${path}.of`, (k, q) => prereq(c, k, q)); break
    case 'not': prereq(c, p.of, `${path}.of`); break
    default: c.fail(`${path}.kind`, `unknown prerequisite kind "${String(p.kind)}"`)
  }
}

export function templateShape(c: Checker, t: unknown): void {
  if (!c.obj(t, '$')) return
  c.keys(t, ['id', 'name', 'kind', 'role', 'rankChange', 'leader', 'prerequisite', 'keyword', 'originChange', 'senses', 'defenses',
    'hpPerLevel', 'hpNote', 'savingThrows', 'actionPoints', 'immune', 'resist', 'vulnerable', 'regeneration', 'traits', 'auras',
    'powers', 'description', 'sources', 'provenance'], '$')
  c.str(t.id, '$.id', { nonEmpty: true })
  c.str(t.name, '$.name', { nonEmpty: true })
  c.oneOf(['functional', 'class'], t.kind, '$.kind')
  c.oneOf([...ROLES, 'any'], t.role, '$.role')
  c.oneOf(['up', 'down'], t.rankChange, '$.rankChange')
  if (c.obj(t.prerequisite, '$.prerequisite')) {
    c.str(t.prerequisite.text, '$.prerequisite.text')
    c.optional(t.prerequisite, 'check', '$.prerequisite', (v, p) => prereq(c, v, p))
  }
  c.optional(t, 'originChange', '$', (v, p) => c.oneOf(ORIGINS, v, p))
  list(c, t.senses, '$.senses', (s, p) => { if (c.obj(s, p)) c.oneOf(SENSE_KINDS, s.kind, `${p}.kind`) })
  if (c.obj(t.defenses, '$.defenses')) for (const [k, v] of Object.entries(t.defenses)) { c.oneOf(DEFENSES, k, `$.defenses.${k}`); c.int(v, `$.defenses.${k}`) }
  c.int(t.hpPerLevel, '$.hpPerLevel', { min: 0 })
  c.int(t.savingThrows, '$.savingThrows', { min: 0 })
  c.int(t.actionPoints, '$.actionPoints', { min: 0 })
  damageModifiers(c, t.vulnerable, '$.vulnerable')
  list(c, t.traits, '$.traits', (x, p) => trait(c, x, p))
  list(c, t.auras, '$.auras', (x, p) => trait(c, x, p, true))
  list(c, t.powers, '$.powers', (x, p) => power(c, x, p))
  c.str(t.description, '$.description')
  sources(c, t.sources, '$.sources')
  provenance(c, t.provenance, '$.provenance')
}

export function themeShape(c: Checker, t: unknown): void {
  if (!c.obj(t, '$')) return
  c.keys(t, ['id', 'name', 'description', 'originChange', 'skills', 'powers', 'sources', 'provenance'], '$')
  c.str(t.id, '$.id', { nonEmpty: true })
  c.str(t.name, '$.name', { nonEmpty: true })
  c.str(t.description, '$.description')
  c.optional(t, 'originChange', '$', (v, p) => c.oneOf(ORIGINS, v, p))
  list(c, t.powers, '$.powers', (x, p) => {
    power(c, x, p, ['category', 'recommendedFor', 'recommendedText', 'flavor'])
    if (c.obj(x, p)) {
      c.oneOf(['attack', 'utility'], x.category, `${p}.category`)
      c.optional(x, 'recommendedFor', p, (v, q) => list(c, v, q, (r, s) => c.oneOf(ROLES, r, s)))
      c.optional(x, 'recommendedText', p, (v, q) => c.str(v, q, { nonEmpty: true }))
    }
  })
  sources(c, t.sources, '$.sources')
  provenance(c, t.provenance, '$.provenance')
}
