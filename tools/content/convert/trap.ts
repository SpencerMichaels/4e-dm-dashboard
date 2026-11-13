// Parsed trap (trap-parser output) -> kit Trap.

import type { Attack, Power, Trap } from '@kit'
import type { ParsedTrap, TrapAction } from '../trap-parser'
import {
  Notes, compact, line, normText, optLine, parseAttackLine, parseSource, provenanceFor,
  toActionType, toRecharge, toUsage, type ConvertContext,
} from './common'

const KIND_MAP: Record<string, Trap['kind']> = {
  'trap': 'trap', 'hazard': 'hazard', 'terrain': 'terrain', 'at-will terrain': 'terrain',
  'single-use terrain': 'terrain', 'object': 'object',
}

/** "✦ DC 21: The character notices ..." / "Perception DC 19" / "Arcana or Perception DC 15". */
export function parseDetect(text: string, defaultSkill: string, notes: Notes): Trap['detect'] {
  const out: Trap['detect'] = []
  for (const raw of text.split(/✦|\n/).map(s => normText(s)).filter(s => s && s !== '-')) {
    const m = raw.match(/^(?:([A-Z][A-Za-z]+(?:,? (?:or|and) [A-Z][A-Za-z]+|, [A-Z][A-Za-z]+)*)\s+)?DC\s+(\d+)\s*:?\s*(.*)$/)
    if (m) out.push({ skill: m[1] ?? defaultSkill, dc: parseInt(m[2]), text: m[3] ?? '' })
    else if (/^automatic$/i.test(raw) || /no check/i.test(raw)) out.push({ skill: defaultSkill, dc: 0, text: raw })
    else notes.add(`${defaultSkill} text not parsed: ${raw}`)
  }
  return out
}

export function convertTrap(id: string, t: ParsedTrap, ctx: ConvertContext): Trap {
  const notes = new Notes()
  const kindKey = (t.trapType ?? '').toLowerCase()
  const kind = KIND_MAP[kindKey]
  if (!kind) notes.add(`trap type "${t.trapType}" is not a kit Trap kind; using trap`)
  if (kindKey.includes('single-use') || kindKey.includes('at-will')) notes.add(`trap type: ${t.trapType}`)
  const rank: Trap['rank'] = t.modifier === 'Elite' ? 'elite' : t.modifier === 'Solo' ? 'solo' : 'standard'

  const detect = [
    ...parseDetect(t.perception ?? '', 'Perception', notes),
    ...(t.additionalSkills ?? []).flatMap(s => parseDetect(s.text, s.skill, notes)),
  ]

  const defenses: Trap['defenses'] = {}
  if (t.ac && /^\d+$/.test(t.ac)) defenses.ac = parseInt(t.ac)
  for (const m of (t.defenses ?? '').matchAll(/(Fortitude|Reflex|Will)\s+(\d+)/g)) {
    defenses[m[1].toLowerCase() as 'fortitude' | 'reflex' | 'will'] = parseInt(m[2])
  }

  const resist: Trap['resist'] = []
  for (const part of (t.resist ?? '').split(/,|;/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s+(.+)$/)
    if (m) resist.push({ type: m[2].toLowerCase(), value: parseInt(m[1]) })
    else notes.add(`resist "${part}" not parsed`)
  }

  const initiative = t.initiative && /^[+-]?\d+$/.test(t.initiative) ? parseInt(t.initiative) : undefined
  const hp = t.hp && /^\d+$/.test(t.hp) ? parseInt(t.hp) : undefined
  if (t.hp && hp === undefined) notes.add(`hp "${t.hp}" is not numeric`)
  if (t.attack) notes.add(`attack text: ${normText(t.attack)}`)

  const trap: Trap = {
    id,
    name: t.name,
    kind: kind ?? 'trap',
    level: t.level,
    role: (t.role ?? '').toLowerCase(),
    rank,
    xp: t.xp,
    detect,
    initiative,
    hp,
    defenses: Object.keys(defenses).length > 0 ? defenses : undefined,
    immune: (t.immune ?? '').split(/,|;/).map(s => s.trim().toLowerCase()).filter(Boolean).map(type => ({ type })),
    resist,
    trigger: optLine(t.trigger),
    powers: (t.actions ?? []).map(a => convertTrapAction(a, notes)),
    countermeasures: (t.countermeasures ?? []).map(c => line(c)),
    flavor: t.flavor ?? '',
    description: t.description ?? '',
    source: parseSource(t.source ?? '', notes),
    provenance: undefined as never,
  }
  trap.provenance = provenanceFor(ctx, notes)
  return compact(trap)
}

function convertTrapAction(a: TrapAction, notes: Notes): Power {
  // "False Disintegrate (illusion)": keywords are printed in the name.
  const kwMatch = normText(a.name).match(/^(.*?)\s*\(([^()]+)\)$/)
  const name = kwMatch ? kwMatch[1] : normText(a.name)
  const keywords = kwMatch ? kwMatch[2].split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : []
  const usageRaw = a.usage ?? ''
  const usage = toUsage(usageRaw)
  if (usageRaw && !usage) notes.add(`power "${name}": usage "${usageRaw}"`)
  const action = toActionType(a.action)
  if (a.action && !action) notes.add(`power "${name}": action "${a.action}" is not a kit ActionType`)

  const attacks: Attack[] = []
  if (a.attack) {
    const parsed = parseAttackLine(a.attack)
    if (parsed) attacks.push(compact({ label: 'primary', ...parsed, hit: optLine(a.hit), miss: optLine(a.miss) } as Attack))
    else notes.add(`power "${name}": attack line not parsed: ${normText(a.attack)}`)
  }
  const unplacedHit = attacks.length === 0 && (a.hit || a.miss)
  if (unplacedHit) notes.add(`power "${name}": hit/miss without a parsed attack: ${normText([a.hit, a.miss].filter(Boolean).join(' | '))}`)

  return compact({
    name,
    action: action ?? 'standard',
    usage: usage ?? 'at-will',
    recharge: usage === 'recharge' ? toRecharge(usageRaw.replace(/^recharge\s*/i, '')) ?? { kind: 'text', text: '' } : undefined,
    keywords,
    trigger: optLine(a.trigger),
    requirement: optLine(a.requirement),
    attacks,
    effect: optLine(a.effect),
    sustain: a.sustain ? { action: 'minor', line: line(a.sustain) } : undefined,
  } as Power)
}
