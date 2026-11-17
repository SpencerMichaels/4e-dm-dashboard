import { ROLES, RANKS, monsterXp, type Item, type Monster, type Role, type Rank } from '@kit'
import * as bench from '../rules/benchmarks'
import { Checker, monsterShape, itemShape, trapShape, diseaseShape, templateShape, themeShape, challengeShape } from './shape'
import { checkSpans } from './spans'
import { checkItemBands, checkMonsterBands } from './bands'
import { MAGIC_ITEM_VALUE } from '../rules/items'
import { resolveQuotes } from './quotes'
import type { Content, ContentKind, Validation, SearchEntry, SearchQuery } from './types'

/** The monster math drafts are checked against (sources in rules/benchmarks.ts). */
export const POLICY = bench.MONSTER_MATH
/** Monster numbers from the latest published rules. With ability scores, HP uses the creature's Con and initiative its Dex. */
export function benchmarks(level: number, role: Role, rank: Rank = 'standard', abilities?: { con?: number; dex?: number }) {
  if (!Number.isInteger(level) || level < 1 || level > 30) throw new Error('Monster math covers levels 1–30')
  if (!ROLES.includes(role) || !RANKS.includes(rank)) throw new Error('Unknown role or rank')
  return {
    policy: POLICY, level, role, rank,
    assumptions: `Published monster formulas (DMG pp. 184–185 with the 2010 errata used since Monster Manual 3, DMG2 p. 133, RC p. 126): HP uses Con ${abilities?.con ?? '14 (assumed)'}, initiative uses Dex ${abilities?.dex ?? '10 (assumed)'}; NAD baseline level + 12. Bands are guidance, not a balance guarantee.`,
    hp: bench.monsterHp(level, role, rank, abilities?.con),
    ac: bench.ac[level][role], otherDefense: level + 12, initiative: bench.initiativeFor(level, role, abilities?.dex),
    attackVsAC: bench.attackVsAC[level][role], attackVsOther: bench.attackVsOther[level][role],
    normalDamage: bench.normalDamageDice[level], limitedDamage: bench.limitedDamageDice[level],
    minionDamage: rank === 'minion' ? bench.minionDamage[level] : undefined,
    damageNote: rank === 'minion' ? 'Minions deal the flat minionDamage (brute column for brutes; artillery 25% less on multitarget and melee attacks).' : 'Damage tiers: low = several targets, medium = one target, high = brute (+25%). Limited damage is +25% (up to +50% is within the rules). Ranged or area attacks may add 1 or 2 to accuracy. Review riders separately.',
    dc: bench.dcTable[level], xp: monsterXp(level, rank),
    savingThrowBonus: bench.rankAdjustments(rank).savingThrows,
    actionPoints: bench.rankAdjustments(rank).actionPoints,
  }
}

export function scaffold(kind: ContentKind, name: string, level = 1, role: Role = 'skirmisher', rank: Rank = 'standard'): Content {
  const b = benchmarks(level, role, rank, { con: 14, dex: 14 })
  const base = { id: 'draft', name, level, sources: [], provenance: { origin: 'human' as const, at: '1970-01-01T00:00:00.000Z' } }
  if (!name?.trim()) throw new Error('A name is required')
  if (kind === 'monster') return {
    ...base, role, rank, size: 'medium', origin: 'natural', type: 'humanoid', keywords: [], xp: b.xp,
    hp: b.hp, initiative: b.initiative, perception: Math.floor(level / 2), senses: [], speed: { walk: 6 },
    defenses: { ac: b.ac, fortitude: b.otherDefense, reflex: b.otherDefense, will: b.otherDefense },
    savingThrowBonus: b.savingThrowBonus, actionPoints: b.actionPoints,
    immune: [], resist: [], vulnerable: [], abilities: { str: 14, con: 14, dex: 14, int: 14, wis: 14, cha: 14 },
    skills: {}, alignment: 'unaligned', languages: '', equipment: '', traits: [], auras: [], powers: [], description: '',
  }
  if (kind === 'item') return { ...base, category: 'item', rarity: null, levels: MAGIC_ITEM_VALUE[level] ? [{ level, price: MAGIC_ITEM_VALUE[level] }] : [], properties: [], powers: [], flavor: '', description: [] }
  if (kind === 'trap') return { ...base, kind: 'trap', role: 'obstacle', rank: 'standard', xp: monsterXp(level, 'standard'), detect: [], immune: [], resist: [], traits: [], auras: [], powers: [], countermeasures: [], flavor: '', description: '' }
  if (kind === 'disease') return { ...base, endurance: { improveDc: b.dc.hard, maintainDc: b.dc.moderate }, stages: [{ stage: 0, line: { text: 'Cured.', clauses: [] } }], flavor: '' }
  // A new skill challenge follows the party's level (level null) until the DM fixes one.
  if (kind === 'challenge') return { ...base, level: null, complexity: 1, setup: '', primarySkills: [], secondarySkills: [], success: '', failure: '', flavor: '' }
  // Templates and themes have no level.
  const { level: _level, ...unleveled } = base
  if (kind === 'template') return { ...unleveled, kind: 'functional', role: 'any', rankChange: 'up', prerequisite: { text: '' }, senses: [], defenses: {}, hpPerLevel: 8, savingThrows: 2, actionPoints: 1, immune: [], resist: [], vulnerable: [], traits: [], auras: [], powers: [], description: '' }
  if (kind === 'theme') return { ...unleveled, description: '', powers: [] }
  throw new Error('Unknown content kind')
}

/** Headings, bullets, numbered lists, bold or links: Markdown that a plain-text description would show literally. Not "* ": printed descriptions use it for footnotes. */
const MARKDOWN = /^#{1,6} |^\s*[-+] |^\s*\d+\. |\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\)/m

/** `recipe` lets the HP band honor a recorded hpMultiplier (a deliberate, explained HP choice). */
export function validate(kind: ContentKind, content: unknown, recipe?: { hpMultiplier?: number }): Validation {
  const c = new Checker()
  const shape = ({ monster: monsterShape, item: itemShape, trap: trapShape, disease: diseaseShape, template: templateShape, theme: themeShape, challenge: challengeShape } as Record<string, (c: Checker, v: unknown) => void>)[kind]
  if (!shape) return { errors: [{ path: '$', message: 'Unknown content kind' }], flags: [] }
  shape(c, content)
  // Original homebrew has no publication. Keep the batch parser's stricter source requirement.
  const original = (content as any)?.provenance?.origin !== 'parser' && Array.isArray((content as any)?.sources) && (content as any).sources.length === 0
  const errors = [...c.issues.filter(e => !(original && e.path === '$.sources' && e.message === 'expected at least one source')), ...checkSpans(content)]
  const supported = (content as Monster)?.level >= 1 && (content as Monster)?.level <= 30
  const flags = errors.length ? [] : kind === 'monster' && supported ? checkMonsterBands(content as Monster, recipe) : kind === 'item' ? checkItemBands(content as Item) : []
  if (kind === 'monster' && !errors.length && !supported) {
    flags.push({ rule: 'hp', path: '$.level', message: 'Outside levels 1–30; benchmark comparisons are unsupported.' })
  }
  // Descriptions are plain text, like every published one: Markdown would show as literal marks.
  const description = (content as { description?: unknown })?.description
  if (typeof description === 'string' && MARKDOWN.test(description)) flags.push({ rule: 'text', path: '$.description', message: 'The description is plain text (no Markdown): write paragraphs separated by blank lines, without headings, bullets or bold.' })
  return { errors, flags }
}

/** Agents may supply quoted clauses. Resolve them before runtime validation. */
export function normalizeContent<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T
  const issues = resolveQuotes(copy)
  if (issues.length) throw new Error(JSON.stringify(issues))
  return copy
}

export function search(entries: SearchEntry[], query: SearchQuery) {
  const words = (query.text ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const results: { key: string; kind: ContentKind; name: string; level: number; source: string; target: string; text: string; score: number }[] = []
  for (const e of entries) {
    const c = e.content as any
    if (query.kind && e.kind !== query.kind || query.level !== undefined && c.level !== query.level || query.role && c.role !== query.role) continue
    const nodes = [{ name: c.name, value: c, target: 'entry' }, ...['powers', 'traits', 'auras'].flatMap(group => (c[group] ?? []).map((value: any, i: number) => ({ name: value.name, value, target: `${group}/${i}` })))]
    for (const n of nodes) {
      const text = JSON.stringify(n.value)
      if (query.clause && !text.includes(`"kind":"${query.clause}"`)) continue
      if (query.condition && !text.includes(`"condition":"${query.condition}"`)) continue
      const lower = text.toLowerCase()
      const matches = words.filter(w => lower.includes(w))
      if (words.length && !matches.length) continue
      const score = matches.length * 10 + (n.target !== 'entry' ? 2 : 0) + words.filter(w => n.name.toLowerCase().includes(w)).length
      results.push({ key: e.key, kind: e.kind, name: `${c.name}${n.target === 'entry' ? '' : ' — ' + n.name}`, level: c.level, source: e.source, target: n.target, text: text.slice(0, 1800), score })
    }
  }
  return results.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, Math.max(1, Math.min(query.limit ?? 20, 100)))
}
