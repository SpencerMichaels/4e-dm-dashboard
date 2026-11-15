// Encounter-time changes to a kit monster: functional/class templates (DMG p.175), a monster theme
// (DMG2), level adjustment (DMG p.174), and minion. Each change is recorded for the stat block's
// attribution ("+2 from Battle Champion"). Pure: returns a new monster.

import { DAMAGE_TYPES, monsterXp } from '@kit'
import type { Ability, Aura, Clause, Line, Monster, MonsterTemplate, MonsterTheme, Power, Rank, Skill, TemplatePrereq, Trait } from '@kit'
import { rebaseClauses } from '../authoring/clause-rebase'

/** A numeric field change, named by the stat block field it shows on ("ac", "defenses.reflex", "skills.stealth"). */
export interface FieldDiff { field: string; before: number; after: number; source: string; sourceIndex: number }
/** Theme changes use source index -1, level adjustment -2, templates their position. */
export interface Attribution {
  diffs: FieldDiff[]
  /** What a template or theme added or set, by kit path: "role", "rank", "regeneration", "keywords/undead", "senses/darkvision", "immune/necrotic", "resist/fire", "vulnerable/radiant", "traits/2", "powers/5". */
  sources: Record<string, { name: string; index: number }>
  /** Per power index: the level adjustment applied to its attack and damage. */
  levelAdjust: Record<number, { attackDelta: number; damageDelta: number; source: string }>
}

export interface EncounterAdjustments {
  templates?: MonsterTemplate[]
  theme?: { theme: MonsterTheme; attack: string; utility: string; skillChoice?: number }
  levelAdjust?: number
  minion?: boolean
}

export interface Adjusted { monster: Monster; attribution: Attribution }

export function adjustMonster(base: Monster, o: EncounterAdjustments): Adjusted {
  const m = structuredClone(base)
  const attribution: Attribution = { diffs: [], sources: {}, levelAdjust: {} }
  ;(o.templates ?? []).forEach((t, i) => applyTemplate(m, t, i, attribution))
  if (o.theme) applyTheme(m, o.theme, attribution)
  if (o.levelAdjust) applyLevelAdjust(m, o.levelAdjust, attribution)
  if (o.minion) { m.rank = 'minion'; m.hp = 1; m.xp = monsterXp(m.level, 'minion') }
  return { monster: m, attribution }
}

const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: 'dex', arcana: 'int', athletics: 'str', bluff: 'cha', diplomacy: 'cha', dungeoneering: 'wis', endurance: 'con',
  heal: 'wis', history: 'int', insight: 'wis', intimidate: 'cha', nature: 'wis', perception: 'wis', religion: 'int',
  stealth: 'dex', streetwise: 'cha', thievery: 'dex',
}
const modifier = (score: number | undefined) => Math.floor(((score ?? 10) - 10) / 2)
const tierOf = (level: number) => level <= 10 ? 'heroic' : level <= 20 ? 'paragon' : 'epic'

/** "level + 3", "one-half its level", "Strength modifier" in template and theme text, for this monster. */
function resolver(m: Monster): (l: Line) => Line {
  const rules: [RegExp, (...match: string[]) => string][] = [
    [/\blevel\s*\+\s*(\d+)\b/gi, (_, n) => String(m.level + parseInt(n!))],
    [/\bone-half (?:this creature's |the \w+'s )?level\b/gi, () => String(Math.floor(m.level / 2))],
    [/\bhalf (?:its|this creature's) level\b/gi, () => String(Math.floor(m.level / 2))],
    [/(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma) modifier/gi, (_, ab) => String(modifier(m.abilities[ab!.toLowerCase().slice(0, 3) as Ability]))],
  ]
  // One substitution at a time, so each drops only the clauses whose words it changed (a damage
  // clause quoting "level + 3"); the rest keep their spans.
  return (l: Line) => {
    let out = l
    for (const [re, value] of rules) {
      for (let at = 0, match: RegExpExecArray | null; (re.lastIndex = at, match = re.exec(out.text));) {
        const replaced = value(...match)
        out = retext(out, out.text.slice(0, match.index) + replaced + out.text.slice(match.index + match[0].length))
        at = match.index + replaced.length
      }
    }
    return out
  }
}

/** The line with new text: the clauses the change left alone stay, with their spans moved (one edit). */
function retext(l: Line, text: string): Line {
  if (text === l.text) return l
  const out = { text, clauses: structuredClone(l.clauses) }
  rebaseClauses(l.text, out)
  return out
}

/** The line from `start` on: clauses before it are dropped, the rest move back. */
function lineFrom(l: Line, start: number): Line {
  return { text: l.text.slice(start), clauses: structuredClone(l.clauses).filter(c => c.at[0] >= start).map(c => shiftClause(c, -start)) }
}
const shiftClause = (c: Clause, by: number): Clause => {
  const out = { ...c, at: [c.at[0] + by, c.at[1] + by] } as Clause
  if (out.kind === 'choice') out.options = out.options.map(o => o.map(x => ({ ...x, at: [x.at[0] + by, x.at[1] + by] })))
  return out
}

/** A template or theme power with its level-relative numbers resolved for this monster. */
function resolvePower(m: Monster, p: Power): Power {
  const resolve = resolver(m)
  const line = (l: Line | undefined) => l && resolve(l)
  const { category: _c, recommendedFor: _r, recommendedText: _t, flavor: _f, ...power } = p as Power & Record<string, unknown>
  const out = structuredClone(power) as Power
  out.attacks = out.attacks.map(a => ({
    ...a,
    bonus: a.bonus.kind === 'level' ? { kind: 'fixed', value: m.level + a.bonus.plus } : a.bonus,
    hit: line(a.hit), miss: line(a.miss), critical: line(a.critical), aftereffect: line(a.aftereffect),
  }))
  for (const key of ['effect', 'trigger', 'requirement', 'special'] as const) if (out[key]) out[key] = line(out[key])
  return JSON.parse(JSON.stringify(out))
}

const RANK_UP: Record<Rank, Rank> = { minion: 'standard', standard: 'elite', elite: 'solo', solo: 'solo' }
const RANK_DOWN: Record<Rank, Rank> = { minion: 'minion', standard: 'standard', elite: 'standard', solo: 'elite' }

function applyTemplate(m: Monster, t: MonsterTemplate, index: number, attr: Attribution) {
  const source = { name: t.name, index }
  const diff = (field: string, before: number, after: number) => { if (before !== after) attr.diffs.push({ field, before, after, source: t.name, sourceIndex: index }) }
  if (t.role !== 'any' && t.role !== m.role) { m.role = t.role; attr.sources.role = source }
  const rank = t.rankChange === 'up' ? RANK_UP[m.rank] : RANK_DOWN[m.rank]
  if (rank !== m.rank) { m.rank = rank; m.xp = monsterXp(m.level, rank); attr.sources.rank = source }
  if (t.leader) m.leader = true
  if (t.keyword && !m.keywords.includes(t.keyword.toLowerCase())) { m.keywords.push(t.keyword.toLowerCase()); attr.sources[`keywords/${t.keyword.toLowerCase()}`] = source }
  if (t.originChange && t.originChange !== m.origin) { m.origin = t.originChange; attr.sources.origin = source }
  for (const s of t.senses) if (!m.senses.some(x => x.kind === s.kind)) { m.senses.push({ ...s }); attr.sources[`senses/${s.kind}`] = source }
  for (const d of ['ac', 'fortitude', 'reflex', 'will'] as const) {
    const bonus = t.defenses[d]
    if (!bonus) continue
    const before = m.defenses[d]
    m.defenses[d] = before + bonus
    diff(d === 'ac' ? 'ac' : `defenses.${d}`, before, m.defenses[d])
  }
  // Hit points: per level plus the Constitution score.
  const hp = m.hp
  m.hp += t.hpPerLevel * m.level + (m.abilities.con || 10)
  diff('hp', hp, m.hp)
  const saves = m.savingThrowBonus
  m.savingThrowBonus = Math.max(saves, t.savingThrows, m.rank === 'solo' ? 5 : 0)
  diff('savingThrowBonus', saves, m.savingThrowBonus)
  const ap = m.actionPoints
  m.actionPoints += t.actionPoints
  diff('actionPoints', ap, m.actionPoints)
  for (const i of t.immune) if (!m.immune.some(x => x.type === i.type)) { m.immune.push({ type: i.type }); attr.sources[`immune/${i.type}`] = source }
  for (const r of t.resist) {
    const value = r.byTier[tierOf(m.level)]
    const existing = m.resist.find(x => x.type === r.type)
    if (existing) existing.value = Math.max(existing.value ?? 0, value)
    else m.resist.push({ type: r.type, value })
    attr.sources[`resist/${r.type}`] = source
  }
  for (const v of t.vulnerable) if (!m.vulnerable.some(x => x.type === v.type)) { m.vulnerable.push({ ...v }); attr.sources[`vulnerable/${v.type}`] = source }
  if (t.regeneration && t.regeneration.value > (m.regeneration?.value ?? 0)) {
    m.regeneration = { value: t.regeneration.value, suppressedBy: m.regeneration?.suppressedBy ?? [], text: t.regeneration.note ?? `Regeneration ${t.regeneration.value}` }
    attr.sources.regeneration = source
  }
  const resolve = resolver(m)
  for (const tr of t.traits) { attr.sources[`traits/${m.traits.length}`] = source; m.traits.push(resolveTrait(tr, resolve)) }
  for (const a of t.auras) { attr.sources[`auras/${m.auras.length}`] = source; m.auras.push(resolveTrait(a, resolve) as Aura) }
  for (const p of t.powers) { attr.sources[`powers/${m.powers.length}`] = source; m.powers.push(resolvePower(m, p)) }
}

function resolveTrait<T extends Trait>(t: T, resolve: (l: Line) => Line): T {
  return { ...structuredClone(t), text: structuredClone(resolve(t.text)) }
}

function applyTheme(m: Monster, o: NonNullable<EncounterAdjustments['theme']>, attr: Attribution) {
  const { theme } = o
  const source = { name: theme.name, index: -1 }
  if (theme.skills) {
    const chosen = theme.skills.choices?.length ? theme.skills.choices[Math.min(o.skillChoice ?? 0, theme.skills.choices.length - 1)] : []
    for (const name of [...theme.skills.always, ...chosen]) {
      const skill = name.toLowerCase() as Skill
      if (!(skill in SKILL_ABILITY)) continue
      // An unlisted skill starts from the untrained value: ability modifier plus half level.
      const before = m.skills[skill] ?? modifier(m.abilities[SKILL_ABILITY[skill]]) + Math.floor(m.level / 2)
      m.skills[skill] = before + theme.skills.bonus
      attr.diffs.push({ field: `skills.${skill}`, before, after: m.skills[skill]!, source: theme.name, sourceIndex: -1 })
    }
  }
  if (theme.originChange && theme.originChange !== m.origin) { m.origin = theme.originChange; attr.sources.origin = source }
  const resolve = resolver(m)
  for (const p of theme.powers.filter(p => p.name === o.attack || p.name === o.utility)) {
    // Theme traits and auras are printed as no-action powers; an aura's text starts "Aura N; ".
    const effect = p.effect ?? { text: '', clauses: [] }
    if (p.action === 'no-action' && !p.attacks.length && !p.trigger) {
      const aura = effect.text.match(/^Aura (\d+); /)
      if (aura) { attr.sources[`auras/${m.auras.length}`] = source; m.auras.push({ name: p.name, keywords: [...p.keywords], text: structuredClone(resolve(lineFrom(effect, aura[0].length))), range: Number(aura[1]) }) }
      else { attr.sources[`traits/${m.traits.length}`] = source; m.traits.push({ name: p.name, keywords: [...p.keywords], text: structuredClone(resolve(effect)) }) }
      continue
    }
    attr.sources[`powers/${m.powers.length}`] = source
    m.powers.push(resolvePower(m, p))
  }
}

const HP_PER_LEVEL: Record<string, number> = { brute: 10, skirmisher: 8, soldier: 8, controller: 8, lurker: 6, artillery: 6 }
const DAMAGE_PREFIX = new RegExp(`^(\\d+d\\d+)(?:\\s*([+-])\\s*(\\d+))?(?=\\s+(?:(?:${DAMAGE_TYPES.join('|')})\\s+)*damage\\b)`, 'i')

/** "2d6 + 4 fire damage" -> "2d6 + 5 fire damage". Text that doesn't start with dice damage is unchanged. */
export function adjustLeadingDamage(text: string, delta: number): string {
  const m = text.match(DAMAGE_PREFIX)
  if (!m || !delta) return text
  const flat = (m[2] === '-' ? -1 : 1) * Number(m[3] ?? 0) + delta
  const expr = flat === 0 ? m[1] : `${m[1]} ${flat > 0 ? '+' : '-'} ${Math.abs(flat)}`
  return expr + text.slice(m[0].length)
}

function applyLevelAdjust(m: Monster, delta: number, attr: Attribution) {
  const source = `Level ${delta > 0 ? '+' : ''}${delta}`
  const diff = (field: string, before: number, after: number) => attr.diffs.push({ field, before, after, source, sourceIndex: -2 })
  m.level += delta
  m.xp = monsterXp(m.level, m.rank)
  for (const d of ['ac', 'fortitude', 'reflex', 'will'] as const) {
    const before = m.defenses[d]
    m.defenses[d] = before + delta
    diff(d === 'ac' ? 'ac' : `defenses.${d}`, before, m.defenses[d])
  }
  const hp = m.hp
  m.hp = Math.max(1, hp + delta * (HP_PER_LEVEL[m.role ?? ''] ?? 8))
  diff('hp', hp, m.hp)
  // +1 attack per level, +1 damage per two levels.
  const damageDelta = Math.sign(delta) * Math.floor(Math.abs(delta) / 2)
  m.powers.forEach((p, i) => {
    let attack = false, damage = false
    for (const a of p.attacks) {
      if (a.bonus.kind === 'fixed') { a.bonus = { kind: 'fixed', value: a.bonus.value + delta }; attack = true }
      if (a.hit && damageDelta) {
        const text = adjustLeadingDamage(a.hit.text, damageDelta)
        if (text !== a.hit.text) { a.hit = retext(a.hit, text); damage = true }
      }
    }
    if (attack || damage) attr.levelAdjust[i] = { attackDelta: attack ? delta : 0, damageDelta: damage ? damageDelta : 0, source }
  })
}

/** Whether a template's prerequisite allows it on this monster; templates without a structured check always do. */
export function templateAllowed(m: Monster, t: MonsterTemplate): boolean {
  return !t.prerequisite.check || prereqMatches(t.prerequisite.check, m)
}

function prereqMatches(p: TemplatePrereq, m: Monster): boolean {
  switch (p.kind) {
    case 'min-level': return m.level >= p.level
    case 'keyword': return p.any.some(k => m.keywords.includes(k.toLowerCase()))
    case 'origin': return m.origin !== null && p.any.includes(m.origin)
    case 'type': return m.type !== null && p.any.includes(m.type)
    case 'rank': return p.any.includes(m.rank)
    case 'all': return p.of.every(q => prereqMatches(q, m))
    case 'any-of': return p.of.some(q => prereqMatches(q, m))
    case 'not': return !prereqMatches(p.of, m)
  }
}
