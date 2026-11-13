// Parsed monster (html-parser output with `printed`) -> kit Monster.

import {
  ABILITIES, CREATURE_TYPES, ORIGINS, ROLES, SENSE_KINDS, SIZES, SKILLS, DAMAGE_TYPES, isOneOf,
  type Ability, type Attack, type Aura, type DamageType, type Monster, type Power, type Rank,
  type Sense, type Skill, type Speed, type Trait,
} from '@kit'
import {
  Notes, compact, damageModifier, extractAltBonus, failedSaveN, hitLine, labelText, line, normText, optLine, parseAttackLine, parseSources,
  provenanceFor, sortedRecord, splitRangePrefix, toActionType, toDefense, toRange, toRecharge, toUsage, type ConvertContext,
} from './common'

/**
 * Body labels that map to Power/Attack fields. Failed-saving-throw lines go
 * to Attack.failedSaves; any other label becomes one of Power.extraLines.
 */
const KNOWN_LABELS = new Set([
  'attack', 'hit', 'miss', 'effect', 'trigger', 'sustain', 'secondary', 'secondary hit', 'secondary miss',
  'aftereffect', 'requirement', 'special', 'body',
])

export function convertMonster(id: string, parsed: any, ctx: ConvertContext): Monster {
  const notes = new Notes()
  const sb = parsed.statBlock
  const warnings: string[] = sb._importWarnings ?? parsed._importWarnings ?? []
  for (const w of warnings) notes.add(`parser warning: ${w}`)

  const rank: Rank = sb.isMinion ? 'minion' : sb.monsterModifier === 'elite' ? 'elite' : sb.monsterModifier === 'solo' ? 'solo' : 'standard'
  const size = String(sb.size ?? '').toLowerCase()
  const origin = String(sb.origin ?? '').toLowerCase()
  const type = String(sb.creatureType ?? '').toLowerCase().replace(/\s+/g, '-')
  if (sb.creatureType && !isOneOf(CREATURE_TYPES, type)) notes.add(`creature type "${sb.creatureType}" is not a kit CreatureType`)
  if (sb.origin && !isOneOf(ORIGINS, origin)) notes.add(`origin "${sb.origin}" is not a kit Origin`)

  const abilities = {} as Record<Ability, number>
  for (const a of ABILITIES) {
    const v = sb.abilities?.[a]
    abilities[a] = typeof v === 'number' ? v : 0
    if (typeof v !== 'number') notes.add(`no ${a} score in source`)
  }

  const skills: Partial<Record<Skill, number>> = {}
  for (const [k, v] of Object.entries(sb.skills ?? {})) {
    if (isOneOf(SKILLS, k)) skills[k] = v as number
    else notes.add(`skill "${k} +${v}" is not a kit Skill`)
  }

  const traits: Trait[] = []
  const auras: Aura[] = []
  const powers: Power[] = []
  for (const a of sb.actions ?? []) {
    if (a.entryType === 'aura') auras.push(convertAura(a))
    else if (a.entryType === 'trait') traits.push(convertTrait(a))
    else powers.push(convertPower(a, notes))
  }

  const regen = sb.regeneration
  const regenTrait = (sb.actions ?? []).find((a: any) => a.entryType === 'trait' && /^regeneration/i.test(a.name))
  const regenText = sb.printed?.regeneration ?? regenTrait?.printed?.text ?? ''

  const monster: Monster = {
    id,
    name: parsed.name,
    level: sb.level,
    role: isOneOf(ROLES, sb.role) ? sb.role : null,
    rank,
    leader: sb.leader ? true : undefined,
    size: isOneOf(SIZES, size) ? size : 'medium',
    origin: isOneOf(ORIGINS, origin) ? origin : null,
    type: isOneOf(CREATURE_TYPES, type) ? type : null,
    keywords: (sb.subtypes ?? []).map((s: string) => s.toLowerCase()),
    xp: sb.xp,
    hp: rank === 'minion' ? 1 : parsed.hp,
    initiative: sb.initiative,
    perception: sb.perception,
    senses: parseSenses(sb.senses ?? '', notes),
    speed: convertSpeed(sb),
    defenses: { ac: sb.ac, fortitude: sb.defenses?.fortitude, reflex: sb.defenses?.reflex, will: sb.defenses?.will },
    savingThrowBonus: sb.savingThrowBonus ?? 0,
    actionPoints: sb.actionPoints ?? 0,
    immune: (sb.immunities ?? []).map((i: any) => ({ type: String(i.type).toLowerCase() })),
    resist: (sb.resistances ?? []).map((r: any) => damageModifier(r.type, r.value, r.note)),
    vulnerable: (sb.weaknesses ?? []).map((r: any) => damageModifier(r.type, r.value, r.note)),
    regeneration: regen ? {
      value: regen.value,
      suppressedBy: (regen.inhibitDamageTypes ?? []).filter((t: string) => isOneOf(DAMAGE_TYPES, t)) as DamageType[],
      text: normText(regenText),
    } : undefined,
    abilities,
    skills: sortedRecord(skills as Record<string, number>) as Partial<Record<Skill, number>>,
    skillNotes: sb.skillNotes?.length ? sb.skillNotes : undefined,
    alignment: sb.alignment ?? '',
    languages: sb.languages ?? '',
    equipment: sb.equipment ?? '',
    traits,
    auras,
    powers,
    description: sb.description ?? '',
    sources: parseSources(sb.source ?? '', notes),
    provenance: undefined as never,
  }
  if (rank === 'minion' && parsed.hp !== 1) notes.add(`minion printed HP ${parsed.hp}`)
  monster.provenance = provenanceFor(ctx, notes)
  return compact(monster)
}

const SENSE_MAP: Record<string, string> = {
  'darkvision': 'darkvision', 'low-light vision': 'low-light-vision', 'blindsight': 'blindsight',
  'tremorsense': 'tremorsense', 'truesight': 'truesight', 'all-around vision': 'all-around-vision',
}

function parseSenses(text: string, notes: Notes): Sense[] {
  const senses: Sense[] = []
  for (const part of text.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.toLowerCase().match(/^([a-z -]+?)\s*(\d+)?$/)
    const kind = m ? SENSE_MAP[m[1].trim()] : undefined
    if (kind && isOneOf(SENSE_KINDS, kind)) senses.push(compact({ kind, range: m![2] ? parseInt(m![2]) : undefined }))
    else notes.add(`sense "${part}" is not a kit SenseKind`)
  }
  return senses
}

function convertSpeed(sb: any): Speed {
  const s = sb.speeds ?? {}
  const extra: string[] = []
  for (const [k, v] of Object.entries(s)) {
    if (!['fly', 'swim', 'climb', 'burrow', 'teleport', 'overland_flight'].includes(k)) extra.push(`${k.replace(/_/g, ' ')} ${v}`)
  }
  const notes = [...extra, sb.speedNotes].filter(Boolean).join('; ')
  return compact({
    walk: sb.speed ?? 0,
    fly: s.fly, overlandFlight: s.overland_flight, climb: s.climb, swim: s.swim, burrow: s.burrow, teleport: s.teleport,
    notes: notes || undefined,
  })
}

function lowerKeywords(kws: unknown): string[] {
  return Array.isArray(kws) ? kws.map(k => String(k).toLowerCase()) : []
}

function convertTrait(a: any): Trait {
  return { name: a.name, keywords: lowerKeywords(a.keywords), text: line(a.printed?.text ?? a.effect ?? '') }
}

function convertAura(a: any): Aura {
  return { name: a.name, keywords: lowerKeywords(a.keywords), text: line(a.printed?.text ?? a.effect ?? ''), range: a.auraRange ?? 1 }
}

export function convertPower(a: any, notes: Notes): Power {
  const p: Record<string, string> = a.printed ?? {}
  const action = toActionType(a.actionType)
  if (!action) notes.add(`power "${a.name}": action type "${a.actionType}" unknown, using standard`)
  const usage = toUsage(a.usage) ?? 'at-will'

  const attacks: Attack[] = []
  const extraLines: NonNullable<Power['extraLines']> = []
  if (a.attackBonus != null) {
    const vs = toDefense(a.defense)
    if (!vs) notes.add(`power "${a.name}": attack vs "${a.defense}" is not a kit Defense`)
    const hitText = p.hit
    const primary: Attack = compact({
      label: 'primary',
      range: toRange(a.rangeType, a.rangeValue, a.attackNotes || undefined),
      target: a.target ?? '',
      bonus: { kind: 'fixed', value: a.attackBonus },
      vs: vs ?? 'unknown',
      hit: hitText ? hitLine(hitText, a.damage ?? []) : undefined,
      miss: optLine(p.miss),
      aftereffect: optLine(p.aftereffect),
    } as Attack)
    attacks.push(extractAltBonus(primary))
  }
  let secondary: Attack | undefined
  if (p.secondary) {
    const parsedAtk = parseAttackLine(p.secondary)
    if (parsedAtk) {
      const after = /secondary attack/i.test(p.hit ?? '') ? 'hit' : /secondary attack/i.test(p.miss ?? '') ? 'miss' : undefined
      secondary = compact({
        label: 'secondary', after, ...parsedAtk,
        hit: optLine(p['secondary hit']), miss: optLine(p['secondary miss']),
      } as Attack)
      attacks.push(secondary)
    }
  }

  // Lines with no field of their own, in printed order. Failed saving throws
  // follow the attack printed before them; an unparsed secondary attack keeps
  // its lines as labeled extra lines.
  let current: Attack | undefined = attacks[0]
  for (const [label, text] of Object.entries(p)) {
    if (label === 'secondary' && secondary) current = secondary
    const secondaryLine = label === 'secondary' || label === 'secondary hit' || label === 'secondary miss'
    if (KNOWN_LABELS.has(label) && !(secondaryLine && !secondary)) continue
    const n = failedSaveN(label)
    if (n !== undefined && current) {
      (current.failedSaves ??= []).push({ n, line: line(text) })
      continue
    }
    extraLines.push({ label: label === 'secondary' ? 'Secondary Attack' : labelText(label), line: line(text) })
  }

  // Old-format powers print everything in one paragraph ("body"); when no
  // attack was found, the whole paragraph is the effect. A power with no
  // attack prints its range at the start of the effect ("Close burst 5; ...").
  let effectText: string | undefined = p.effect ?? (attacks.length === 0 ? p.body : undefined)
  let range: Power['range']
  if (attacks.length === 0 && effectText) {
    const split = splitRangePrefix(effectText)
    if (split) { range = split.range; effectText = split.rest }
  }

  const sustainAction = toActionType(a.sustain)
  // A sustain printed only in the header or inside a line ("(sustain minor)"), with no Sustain line.
  const inlineSustain = p.sustain ? undefined : sustainAction ?? toActionType(Object.values(p).join(' ').match(/\(sustain (minor|move|standard)\)/i)?.[1])
  const trigger = p.trigger ?? a.trigger
  const power: Power = compact({
    name: a.name,
    action: action ?? 'standard',
    usage,
    recharge: usage === 'recharge' ? toRecharge(a.rechargeCondition) ?? { kind: 'text', text: '' } : undefined,
    usesPerEncounter: a.encounterUses,
    basic: a.basicAttack,
    keywords: lowerKeywords(a.keywords),
    trigger: optLine(trigger),
    requirement: optLine(p.requirement ?? a.requirement),
    range,
    attacks,
    effect: optLine(effectText),
    sustain: p.sustain ? { action: sustainAction ?? 'minor', line: line(p.sustain) } : inlineSustain ? { action: inlineSustain } : undefined,
    special: optLine(p.special),
    extraLines: extraLines.length > 0 ? extraLines : undefined,
  } as Power)
  if (usage === 'recharge' && !a.rechargeCondition) notes.add(`power "${a.name}": recharge with no condition`)
  return power
}
