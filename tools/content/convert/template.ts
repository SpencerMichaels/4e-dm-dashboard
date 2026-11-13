// App monster templates and themes (src/renderer/components/creature/
// monster-templates.ts, monster-themes.ts) -> kit MonsterTemplate / MonsterTheme.

import {
  DAMAGE_TYPES, ORIGINS, ROLES, SENSE_KINDS, isOneOf,
  type Attack, type Aura, type Clause, type CreatureType, type DamageType, type MonsterTemplate,
  type MonsterTheme, type Power, type Rank, type Role, type TemplatePrereq, type ThemePower, type Trait, type Usage,
} from '@kit'
import type {
  MonsterTemplate as AppTemplate, TemplatePower,
} from '../../../src/renderer/components/creature/monster-templates'
import type { MonsterTheme as AppTheme, ThemePower as AppThemePower } from '../../../src/renderer/components/creature/monster-themes'
import { parseSkillModifications } from '../../../src/renderer/components/creature/monster-themes'
import {
  Notes, compact, kebab, line, normText, optLine, provenanceFor, toActionType, toDefense, toRange, toRecharge,
  type ConvertContext,
} from './common'

// ── prereqCheck -> TemplatePrereq ──
// prereqCheck is code, so it is read by behavior: evaluate it over a grid of
// synthetic stat blocks and pick the simplest TemplatePrereq with the same
// truth table. A check no candidate reproduces is left out and reported.

const GRID_TYPES = ['humanoid', 'beast', 'magical beast', 'animate']
const GRID_LEVELS = [1, 10, 11, 30]
const GRID_SUBTYPES = [[], ['undead'], ['undead', 'zombie'], ['swarm'], ['devil'], ['dragon'], ['reptile'], ['demon']]
const GRID_RANKS: { monsterModifier: string; isMinion: boolean }[] = [
  { monsterModifier: '', isMinion: false }, { monsterModifier: 'elite', isMinion: false },
  { monsterModifier: 'solo', isMinion: false }, { monsterModifier: '', isMinion: true },
]
const GRID = GRID_TYPES.flatMap(creatureType => GRID_LEVELS.flatMap(level => GRID_SUBTYPES.flatMap(subtypes =>
  GRID_RANKS.map(r => ({ creatureType, level, subtypes, ...r })))))
type GridBlock = (typeof GRID)[number]

function rankOf(sb: GridBlock): Rank {
  return sb.isMinion ? 'minion' : sb.monsterModifier === 'elite' ? 'elite' : sb.monsterModifier === 'solo' ? 'solo' : 'standard'
}

function evalPrereq(p: TemplatePrereq, sb: GridBlock): boolean {
  switch (p.kind) {
    case 'min-level': return sb.level >= p.level
    case 'keyword': return p.any.some(k => sb.subtypes.includes(k))
    case 'origin': return false
    case 'type': return p.any.includes(sb.creatureType.replace(' ', '-') as CreatureType)
    case 'rank': return p.any.includes(rankOf(sb))
    case 'all': return p.of.every(q => evalPrereq(q, sb))
    case 'any-of': return p.of.some(q => evalPrereq(q, sb))
    case 'not': return !evalPrereq(p.of, sb)
  }
}

function prereqCandidates(): TemplatePrereq[] {
  const typeSets: CreatureType[][] = []
  const base: CreatureType[] = ['humanoid', 'beast', 'magical-beast']
  for (let mask = 1; mask < 8; mask++) typeSets.push(base.filter((_, i) => mask & (1 << i)))
  const prims: TemplatePrereq[][] = [
    [],
    ...typeSets.map(any => [{ kind: 'type', any } as TemplatePrereq]),
  ]
  const keywords = ['undead', 'zombie', 'swarm', 'dragon', 'reptile', 'devil', 'demon']
  const keywordParts: (TemplatePrereq | undefined)[] = [
    undefined,
    ...keywords.map(k => ({ kind: 'keyword', any: [k] }) as TemplatePrereq),
    ...keywords.map(k => ({ kind: 'not', of: { kind: 'keyword', any: [k] } }) as TemplatePrereq),
  ]
  const out: TemplatePrereq[] = []
  for (const typePart of prims) {
    for (const lvl of [undefined, 11]) {
      for (const kw of keywordParts) {
        for (const rank of [undefined, 'solo' as const]) {
          const parts: TemplatePrereq[] = [...typePart]
          if (lvl) parts.push({ kind: 'min-level', level: lvl })
          if (rank) parts.push({ kind: 'rank', any: [rank] })
          if (kw) parts.push(kw)
          if (parts.length === 0) continue
          out.push(parts.length === 1 ? parts[0] : { kind: 'all', of: parts })
        }
      }
    }
  }
  // Fewest primitives first, so the simplest match wins.
  const size = (p: TemplatePrereq): number => p.kind === 'all' ? p.of.length : 1
  return out.sort((a, b) => size(a) - size(b))
}

const CANDIDATES = prereqCandidates()

export function prereqFromCheck(check: ((sb: any) => boolean) | undefined): TemplatePrereq | undefined | null {
  if (!check) return undefined
  const truth = GRID.map(sb => !!check({ ...sb }))
  for (const c of CANDIDATES) {
    if (GRID.every((sb, i) => evalPrereq(c, sb) === truth[i])) return c
  }
  return null
}

// ── Powers ──

const USAGE_WORDS: Record<string, Usage> = { 'at will': 'at-will', 'at-will': 'at-will', 'encounter': 'encounter', 'daily': 'daily' }

/** "minor 1/round; at will" / "standard; usable only while bloodied; encounter" / "immediate interrupt; recharge 6" */
function parseActionString(action: string): { action?: string; usage: Usage; recharge?: string; requirement: string[] } {
  const segs = action.split(';').map(s => s.trim()).filter(Boolean)
  const out: { action?: string; usage: Usage; recharge?: string; requirement: string[] } = { usage: 'at-will', requirement: [] }
  segs.forEach((seg, i) => {
    const lower = seg.toLowerCase()
    if (i === 0) {
      const m = lower.match(/^(standard|move|minor|free|immediate interrupt|immediate reaction|opportunity|no action)\b\s*(.*)$/)
      if (m) {
        out.action = m[1]
        if (m[2]) out.requirement.push(m[2])
        return
      }
    }
    if (USAGE_WORDS[lower]) out.usage = USAGE_WORDS[lower]
    else if (lower.startsWith('recharge')) { out.usage = 'recharge'; out.recharge = seg.replace(/^recharge\s*/i, '') }
    else out.requirement.push(seg)
  })
  return out
}

/** Template damage string ("2d6 + Strength modifier necrotic", "1d6 fire") -> hit line text and clause. */
function templateHit(p: TemplatePower): { text: string; clauses: Clause[] } | undefined {
  if (!p.damage && !p.hit) return undefined
  const damageText = p.damage ? `${normText(p.damage)} damage` : ''
  const hitText = p.hit ? normText(p.hit) : ''
  const text = [damageText, hitText].filter(Boolean).join(', and ').replace(/\.?$/, '.')
  const clauses: Clause[] = []
  if (p.damage) {
    const words = normText(p.damage).split(' ')
    const typeWords: string[] = []
    while (words.length > 1 && isOneOf(DAMAGE_TYPES, words[words.length - 1])) typeWords.unshift(words.pop()!)
    const expr = words.join(' ')
    const types = typeWords as DamageType[]
    const at: [number, number] = [0, damageText.length]
    if (/^\d+d\d+(?:\s*\+\s*\d+)?$/.test(expr)) clauses.push({ at, kind: 'damage', dice: expr.replace(/\s+/g, ''), types, who: 'target' })
    else if (/modifier/i.test(expr)) clauses.push({ at, kind: 'damage-formula', text: expr, types })
  }
  return { text, clauses }
}

function convertTemplatePower(p: TemplatePower, notes: Notes): { power?: Power; trait?: Trait; aura?: Aura } {
  const keywords = (p.keywords ?? '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
  if (p.entryType === 'aura') return { aura: { name: p.name, keywords, text: line(p.description), range: p.auraRange ?? 1 } }
  if (!p.action && !p.attackBonus) return { trait: { name: p.name, keywords, text: line(p.description) } }

  const act = parseActionString(p.action ?? 'standard')
  const action = toActionType(act.action) ?? 'standard'
  const attacks: Attack[] = []
  if (p.attackBonus) {
    const lvl = p.attackBonus.match(/^level\s*\+\s*(\d+)$/i)
    const vs = toDefense(p.defense)
    if (!vs) notes.add(`power "${p.name}": defense "${p.defense}" is not a kit Defense`)
    const hit = templateHit(p)
    if (hit) notes.add(`power "${p.name}": hit line composed from the template's damage and hit fields`)
    attacks.push(compact({
      label: 'primary',
      range: toRange(p.rangeType ?? 'melee', p.rangeValue ?? ''),
      target: p.target ?? '',
      bonus: lvl ? { kind: 'level', plus: parseInt(lvl[1]) } : { kind: 'formula', text: p.attackBonus },
      vs: vs ?? 'unknown',
      hit: hit ? { text: hit.text, clauses: hit.clauses } : undefined,
      miss: optLine(p.miss),
      critical: optLine(p.critical),
    } as Attack))
  }
  const requirement = [...act.requirement, p.requirement].filter(Boolean).join('; ')
  return {
    power: compact({
      name: p.name,
      action,
      usage: act.usage,
      recharge: act.usage === 'recharge' ? toRecharge(act.recharge) ?? { kind: 'text', text: '' } : undefined,
      keywords,
      trigger: optLine(p.trigger),
      requirement: optLine(requirement),
      attacks,
      effect: optLine(p.description),
    } as Power),
  }
}

// ── Templates ──

const SENSE_MAP: Record<string, string> = {
  'darkvision': 'darkvision', 'low-light vision': 'low-light-vision', 'blindsight': 'blindsight',
  'tremorsense': 'tremorsense', 'truesight': 'truesight', 'all-around vision': 'all-around-vision',
}

export function convertTemplate(t: AppTemplate, ctx: ConvertContext): MonsterTemplate {
  const notes = new Notes()
  const traits: Trait[] = []
  const auras: Aura[] = []
  const powers: Power[] = []
  for (const p of t.powers) {
    const r = convertTemplatePower(p, notes)
    if (r.power) powers.push(r.power)
    if (r.trait) traits.push(r.trait)
    if (r.aura) auras.push(r.aura)
  }
  const check = prereqFromCheck(t.prereqCheck)
  if (check === null) notes.add(`prereqCheck has no TemplatePrereq equivalent (prerequisite: "${t.prerequisite}")`)
  const senses = (t.senses ?? []).flatMap(s => {
    const m = s.toLowerCase().match(/^([a-z -]+?)\s*(\d+)?$/)
    const kind = m ? SENSE_MAP[m[1].trim()] : undefined
    if (!kind || !isOneOf(SENSE_KINDS, kind)) { notes.add(`sense "${s}" is not a kit SenseKind`); return [] }
    return [compact({ kind, range: m![2] ? parseInt(m![2]) : undefined })]
  })
  if (!isOneOf(ROLES, t.role) && t.role !== 'any') notes.add(`role "${t.role}" is not a kit Role`)
  const tpl: MonsterTemplate = {
    id: kebab(t.name),
    name: t.name,
    kind: 'functional',
    role: t.role as Role | 'any',
    // Templates that need a solo (Elite Dragon) tone it down to elite.
    rankChange: /^solo\b/i.test(t.prerequisite) ? 'down' : 'up',
    leader: t.leader ? true : undefined,
    prerequisite: compact({ text: t.prerequisite, check: check ?? undefined }),
    keyword: t.keyword,
    senses,
    defenses: { ...t.defenses },
    hpPerLevel: t.hpPerLevel,
    savingThrows: t.savingThrows,
    actionPoints: t.actionPoints,
    immune: (t.immunities ?? []).map(type => ({ type: type.toLowerCase() })),
    resist: t.resistPerTier ? [{ type: t.resistPerTier.type, byTier: { heroic: t.resistPerTier.heroic, paragon: t.resistPerTier.paragon, epic: t.resistPerTier.epic } }] : [],
    vulnerable: t.vulnerable ? [{ type: t.vulnerable.type, value: t.vulnerable.value }] : [],
    regeneration: t.regeneration ? compact({ value: t.regeneration, note: t.regenerationNote }) : undefined,
    traits,
    auras,
    powers,
    description: t.description ?? '',
    sources: [{ book: t.source ?? '' }],
    provenance: undefined as never,
  }
  tpl.provenance = provenanceFor(ctx, notes)
  return compact(tpl)
}

// ── Themes ──

const ROLE_WORDS: Record<string, Role> = {
  artillery: 'artillery', brutes: 'brute', brute: 'brute', controllers: 'controller', controller: 'controller',
  lurkers: 'lurker', lurker: 'lurker', skirmishers: 'skirmisher', skirmisher: 'skirmisher', soldiers: 'soldier', soldier: 'soldier',
}

export function convertTheme(t: AppTheme, ctx: ConvertContext): MonsterTheme {
  const notes = new Notes()
  const powers: ThemePower[] = []
  for (const p of t.powers as AppThemePower[]) {
    const r = convertTemplatePower(p, notes)
    // Theme traits and auras are still menu entries: keep them as no-action powers.
    const base: Power = r.power ?? {
      name: p.name, action: 'no-action', usage: 'at-will', keywords: (r.trait ?? r.aura)!.keywords, attacks: [],
      effect: r.aura ? line(`Aura ${r.aura.range}; ${r.aura.text.text}`) : r.trait!.text,
    }
    if (!r.power) notes.add(`power "${p.name}": ${r.aura ? 'aura' : 'trait'} stored as a no-action power`)
    const words = (p.recommendedFor ?? '').toLowerCase().split(/[,\s]+/)
    const roles = [...new Set(words.map(w => ROLE_WORDS[w]).filter(Boolean))]
    const other = (p.recommendedFor ?? '').split(',').map(s => s.trim()).filter(s => s && !ROLE_WORDS[s.toLowerCase()])
    // The printed recommendation is kept when it says more than the roles ("leaders", "any role").
    const recommendedText = other.length > 0 ? normText(p.recommendedFor ?? '') : undefined
    powers.push(compact({ ...base, category: p.category, recommendedFor: roles.length > 0 ? roles : undefined, recommendedText, flavor: p.flavorText }))
  }
  const originWord = (t.originChange ?? '').toLowerCase().match(/origin becomes (\w+)/)?.[1]
  if (t.originChange && !isOneOf(ORIGINS, originWord)) notes.add(`origin change "${t.originChange}" not parsed`)
  const skills = t.skillModifications ? parseSkillModifications(t.skillModifications) : undefined
  if (t.skillModifications) notes.add(`skill modifications: ${t.skillModifications}`)
  const theme: MonsterTheme = {
    id: kebab(t.name),
    name: t.name,
    description: t.description,
    originChange: isOneOf(ORIGINS, originWord) ? originWord : undefined,
    skills: skills && (skills.always.length > 0 || skills.choices?.length) ? compact({ always: skills.always, choices: skills.choices, bonus: skills.bonus }) : undefined,
    powers,
    sources: [{ book: t.source }],
    provenance: undefined as never,
  }
  theme.provenance = provenanceFor(ctx, notes)
  return compact(theme)
}

