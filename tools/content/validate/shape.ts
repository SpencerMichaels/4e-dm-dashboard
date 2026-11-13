// Shape validation for kit content entries: required fields, types, and
// membership in the kit's closed vocabularies. Hand-written so the rules stay
// readable next to src/schema.ts in the kit.

import {
  ABILITIES, ACTION_TYPES, CONDITION_IDS, CREATURE_TYPES, DAMAGE_TYPES, DEFENSES, ORIGINS, RANGE_KINDS,
  RANKS, ROLES, SENSE_KINDS, SIZES, SKILLS, USAGES, isOneOf,
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
  const kinds = ['save-ends', 'turn-end', 'turn-start', 'encounter', 'sustain', 'instant', 'indefinite', 'while-in-aura', 'permanent']
  c.oneOf(kinds, d.kind, `${path}.kind`)
  if (d.kind === 'turn-end' || d.kind === 'turn-start') {
    c.oneOf(['source', 'target'], d.whose, `${path}.whose`)
    if (typeof d.next !== 'boolean') c.fail(`${path}.next`, 'expected a boolean')
  }
  if (d.kind === 'sustain') c.oneOf(ACTION_TYPES, d.action, `${path}.action`)
}

const WHO = ['target', 'self', 'each-target', 'ally', 'enemies-in-area', 'creatures-in-area', 'allies-in-area', 'other']
const MOD_STATS = ['attack', 'ac', 'fortitude', 'reflex', 'will', 'defenses', 'speed', 'saving-throws', 'damage']

function damageTypes(c: Checker, v: unknown, path: string): void {
  if (!c.arr(v, path)) return
  v.forEach((t, i) => c.oneOf(DAMAGE_TYPES, t, `${path}[${i}]`))
}

/** Fields each clause kind may have besides `at`, `if` and `kind`. */
const CLAUSE_FIELDS: Record<string, string[]> = {
  'damage': ['dice', 'types', 'who', 'extra', 'critical'],
  'damage-formula': ['text', 'types'],
  'half-damage': [],
  'ongoing-damage': ['amount', 'types', 'who', 'duration', 'saveGroup'],
  'condition': ['condition', 'who', 'duration', 'saveGroup'],
  'grants-ca': ['to', 'who', 'duration', 'saveGroup'],
  'forced-move': ['move', 'squares', 'who'],
  'move': ['move', 'squares', 'who'],
  'modifier': ['stat', 'value', 'who', 'duration', 'saveGroup'],
  'resistance': ['type', 'value', 'who', 'duration', 'saveGroup'],
  'vulnerability': ['type', 'value', 'who', 'duration', 'saveGroup'],
  'heal': ['amount', 'who'],
  'temp-hp': ['amount', 'who'],
  'regeneration': ['value', 'who', 'duration'],
  'revive': ['hp'],
  'use-power': ['power', 'times', 'who'],
  'recharge-power': ['power'],
  'lose-healing-surge': ['count', 'who'],
  'concealment': ['total', 'who', 'duration'],
  'zone': ['duration'],
  'saving-throw': ['bonus', 'who'],
  'summon': ['creature', 'count'],
  'unparsed': ['text'],
}

export function clause(c: Checker, cl: unknown, path: string): void {
  if (!c.obj(cl, path)) return
  if (!Array.isArray(cl.at) || cl.at.length !== 2 || !cl.at.every(n => Number.isInteger(n))) c.fail(`${path}.at`, 'expected [start, end] integers')
  c.optional(cl, 'if', path, (v, p) => c.str(v, p))
  const fields = CLAUSE_FIELDS[String(cl.kind)]
  if (!fields) { c.fail(`${path}.kind`, `unknown clause kind "${String(cl.kind)}"`); return }
  c.keys(cl, ['at', 'if', 'kind', ...fields], path)
  const who = () => c.oneOf(WHO, cl.who, `${path}.who`)
  const dur = () => duration(c, cl.duration, `${path}.duration`)
  const flag = (k: string) => { if (cl[k] !== undefined && cl[k] !== true) c.fail(`${path}.${k}`, 'expected true or absent') }
  c.optional(cl, 'saveGroup', path, (v, p) => c.str(v, p, { nonEmpty: true }))
  switch (cl.kind) {
    case 'damage':
      c.str(cl.dice, `${path}.dice`, { nonEmpty: true }); damageTypes(c, cl.types, `${path}.types`); who(); flag('extra'); flag('critical'); break
    case 'damage-formula': c.str(cl.text, `${path}.text`, { nonEmpty: true }); damageTypes(c, cl.types, `${path}.types`); break
    case 'half-damage': break
    case 'ongoing-damage': c.int(cl.amount, `${path}.amount`, { min: 1 }); damageTypes(c, cl.types, `${path}.types`); who(); dur(); break
    case 'condition': c.oneOf(CONDITION_IDS, cl.condition, `${path}.condition`); who(); dur(); break
    case 'grants-ca': c.oneOf(['all', 'source', 'source-allies'], cl.to, `${path}.to`); who(); dur(); break
    case 'forced-move': c.oneOf(['push', 'pull', 'slide'], cl.move, `${path}.move`); c.int(cl.squares, `${path}.squares`, { min: 0 }); who(); break
    case 'move': c.oneOf(['shift', 'teleport', 'swap'], cl.move, `${path}.move`); c.optional(cl, 'squares', path, (v, p) => c.int(v, p, { min: 0 })); who(); break
    case 'modifier':
      if (Array.isArray(cl.stat)) {
        if (cl.stat.length === 0) c.fail(`${path}.stat`, 'expected at least one stat')
        cl.stat.forEach((s, i) => c.oneOf(MOD_STATS, s, `${path}.stat[${i}]`))
      } else c.oneOf(MOD_STATS, cl.stat, `${path}.stat`)
      c.int(cl.value, `${path}.value`); who(); dur(); break
    case 'resistance':
    case 'vulnerability':
      if (cl.type !== 'all') c.oneOf(DAMAGE_TYPES, cl.type, `${path}.type`)
      c.int(cl.value, `${path}.value`); who(); dur(); break
    case 'heal':
      if (!(cl.amount === 'surge-value' || cl.amount === 'half-surge-value')) c.int(cl.amount, `${path}.amount`, { min: 0 })
      who(); break
    case 'temp-hp': c.int(cl.amount, `${path}.amount`, { min: 0 }); who(); break
    case 'regeneration': c.int(cl.value, `${path}.value`, { min: 0 }); who(); dur(); break
    case 'revive': c.int(cl.hp, `${path}.hp`, { min: 0 }); break
    case 'use-power': c.str(cl.power, `${path}.power`, { nonEmpty: true }); c.optional(cl, 'times', path, (v, p) => c.int(v, p, { min: 1 })); who(); break
    case 'recharge-power': c.str(cl.power, `${path}.power`, { nonEmpty: true }); break
    case 'lose-healing-surge': c.int(cl.count, `${path}.count`, { min: 1 }); who(); break
    case 'concealment': flag('total'); who(); dur(); break
    case 'zone': dur(); break
    case 'saving-throw': c.optional(cl, 'bonus', path, (v, p) => c.int(v, p)); who(); break
    case 'summon': c.str(cl.creature, `${path}.creature`, { nonEmpty: true }); c.optional(cl, 'count', path, (v, p) => c.int(v, p, { min: 1 })); break
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
  c.keys(a, ['label', 'after', 'range', 'target', 'bonus', 'vs', 'hit', 'miss', 'critical', 'aftereffect', 'failedSaves'], path)
  c.oneOf(['primary', 'secondary', 'tertiary'], a.label, `${path}.label`)
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
  c.oneOf([...DEFENSES, 'any'], a.vs, `${path}.vs`)
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
  c.oneOf(USAGES, p.usage, `${path}.usage`)
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
    c.oneOf(ACTION_TYPES, v.action, `${q}.action`)
    lineShape(c, v.line, `${q}.line`)
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
  c.keys(t, aura ? ['name', 'keywords', 'text', 'range'] : ['name', 'keywords', 'text'], path)
  c.str(t.name, `${path}.name`, { nonEmpty: true })
  if (c.arr(t.keywords, `${path}.keywords`)) t.keywords.forEach((k, i) => c.str(k, `${path}.keywords[${i}]`))
  lineShape(c, t.text, `${path}.text`)
  if (aura) c.int(t.range, `${path}.range`, { min: 0 })
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

// ── Entry types ──

export function monsterShape(c: Checker, m: unknown): void {
  const path = '$'
  if (!c.obj(m, path)) return
  c.keys(m, ['id', 'name', 'level', 'role', 'rank', 'leader', 'size', 'origin', 'type', 'keywords', 'xp', 'hp', 'initiative',
    'perception', 'senses', 'speed', 'defenses', 'savingThrowBonus', 'actionPoints', 'immune', 'resist', 'vulnerable',
    'regeneration', 'abilities', 'skills', 'alignment', 'languages', 'equipment', 'traits', 'auras', 'powers', 'description',
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
  c.int(m.hp, '$.hp', { min: 1 })
  c.int(m.initiative, '$.initiative')
  c.int(m.perception, '$.perception')
  list(c, m.senses, '$.senses', (s, p) => {
    if (!c.obj(s, p)) return
    c.oneOf(SENSE_KINDS, s.kind, `${p}.kind`)
    c.optional(s, 'range', p, (v, q) => c.int(v, q, { min: 0 }))
  })
  if (c.obj(m.speed, '$.speed')) {
    c.int(m.speed.walk, '$.speed.walk', { min: 0 })
    for (const k of ['fly', 'overlandFlight', 'climb', 'swim', 'burrow', 'teleport']) c.optional(m.speed, k, '$.speed', (v, p) => c.int(v, p, { min: 0 }))
    c.optional(m.speed, 'notes', '$.speed', (v, p) => c.str(v, p))
  }
  if (c.obj(m.defenses, '$.defenses')) for (const d of DEFENSES) c.int(m.defenses[d], `$.defenses.${d}`, { min: 0 })
  c.int(m.savingThrowBonus, '$.savingThrowBonus', { min: 0 })
  c.int(m.actionPoints, '$.actionPoints', { min: 0 })
  list(c, m.immune, '$.immune', (x, p) => { if (c.obj(x, p)) c.str(x.type, `${p}.type`, { nonEmpty: true }) })
  damageModifiers(c, m.resist, '$.resist')
  damageModifiers(c, m.vulnerable, '$.vulnerable')
  c.optional(m, 'regeneration', '$', (r, p) => {
    if (!c.obj(r, p)) return
    c.int(r.value, `${p}.value`, { min: 0 })
    damageTypes(c, r.suppressedBy, `${p}.suppressedBy`)
    c.str(r.text, `${p}.text`)
  })
  if (c.obj(m.abilities, '$.abilities')) for (const a of ABILITIES) c.int(m.abilities[a], `$.abilities.${a}`, { min: 1 })
  if (c.obj(m.skills, '$.skills')) {
    for (const [k, v] of Object.entries(m.skills)) { c.oneOf(SKILLS, k, `$.skills.${k}`); c.int(v, `$.skills.${k}`) }
  }
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
  c.keys(t, ['id', 'name', 'kind', 'usage', 'level', 'role', 'rank', 'xp', 'detect', 'initiative', 'hp', 'hpText', 'defenses', 'immune',
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
