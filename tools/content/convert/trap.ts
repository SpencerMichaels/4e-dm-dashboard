// Parsed trap (trap-parser output) -> kit Trap.

import { SKILLS, isOneOf, type Attack, type Power, type Trait, type Trap } from '@kit'
import type { ParsedTrap, TrapAction } from '../trap-parser'
import {
  Notes, compact, damageModifier, failedSaveN, hitLine, line, normText, optLine, parseAttackLine, parseSources,
  provenanceFor, toActionType, toRecharge, toUsage, type ConvertContext,
} from './common'

const KIND_MAP: Record<string, Trap['kind']> = {
  'trap': 'trap', 'hazard': 'hazard', 'terrain': 'terrain', 'at-will terrain': 'terrain',
  'single-use terrain': 'terrain', 'object': 'object', 'area': 'area', 'special': 'special',
}

/** "Arcana", "Arcana or Religion", "Arcana (trained only)": a detect/knowledge section, not a trait. */
export function isSkillHeading(name: string): boolean {
  const words = normText(name).toLowerCase().replace(/\s*\(trained only\)$/, '').split(/\s*(?:,|\bor\b|\band\b)\s*/).filter(Boolean)
  return words.length > 0 && words.every(w => isOneOf(SKILLS, w))
}

/**
 * "✦ DC 21: The character notices ..." / "Perception DC 19" / "Arcana or Perception DC 15".
 * "automatic" / "no check" -> dc null (no check needed).
 */
export function parseDetect(text: string, defaultSkill: string, notes: Notes): Trap['detect'] {
  const out: Trap['detect'] = []
  for (const raw of text.split(/✦|\n/).map(s => normText(s)).filter(s => s && s !== '-')) {
    const m = raw.match(/^(?:([A-Z][A-Za-z]+(?:,? (?:or|and) [A-Z][A-Za-z]+|, [A-Z][A-Za-z]+)*)\s+)?DC\s+(\d+)\s*:?\s*(.*)$/)
    if (m) out.push({ skill: m[1] ?? defaultSkill, dc: parseInt(m[2]), text: m[3] ?? '' })
    else if (/^automatic\.?$/i.test(raw) || /no check/i.test(raw)) out.push({ skill: defaultSkill, dc: null, text: raw })
    else notes.add(`${defaultSkill} text not parsed: ${raw}`)
  }
  return out
}

/** "False Disintegrate (illusion)": keywords printed in the name. */
function nameAndKeywords(raw: string): { name: string; keywords: string[] } {
  const m = normText(raw).match(/^(.*?)\s*\(([^()]+)\)$/)
  return m
    ? { name: m[1], keywords: m[2].split(',').map(k => k.trim().toLowerCase()).filter(Boolean) }
    : { name: normText(raw), keywords: [] }
}

export function convertTrap(id: string, t: ParsedTrap, ctx: ConvertContext): Trap {
  const notes = new Notes()
  const kindKey = (t.trapType ?? '').toLowerCase()
  const kind = KIND_MAP[kindKey]
  if (!kind) notes.add(`trap type "${t.trapType}" is not a kit Trap kind; using trap`)
  if (kindKey.includes('single-use') || kindKey.includes('at-will')) notes.add(`trap type: ${t.trapType}`)
  const rank: Trap['rank'] = t.modifier === 'Elite' ? 'elite' : t.modifier === 'Solo' ? 'solo' : 'standard'

  const detect = parseDetect(t.perception ?? '', 'Perception', notes)
  const traits: Trait[] = []
  // Skill sections are detect/knowledge checks; anything else printed as a
  // section of its own ("Special", "Portal Effects") is a trait.
  for (const s of t.additionalSkills ?? []) {
    if (isSkillHeading(s.skill)) detect.push(...parseDetect(s.text, s.skill, notes))
    else if (normText(s.text)) traits.push({ name: normText(s.skill), keywords: [], text: line(s.text) })
  }

  const powers: Power[] = []
  for (const a of t.actions ?? []) {
    if (/^traits?$/i.test(a.action ?? '')) {
      const body = a.text ?? a.effect ?? ''
      if (isSkillHeading(a.name)) { detect.push(...parseDetect(body, normText(a.name), notes)); continue }
      const { name, keywords } = nameAndKeywords(a.name)
      if (/^aura \d+$/i.test(a.usage ?? '')) notes.add(`trait "${name}": ${a.usage} (Trait has no aura range)`)
      else if (a.usage) notes.add(`trait "${name}": usage "${a.usage}"`)
      traits.push({ name: name || 'Trait', keywords, text: line(body) })
      continue
    }
    powers.push(convertTrapAction(a, notes))
  }

  const defenses: Trap['defenses'] = {}
  if (t.ac && /^\d+$/.test(t.ac)) defenses.ac = parseInt(t.ac)
  for (const m of (t.defenses ?? '').matchAll(/(Fortitude|Reflex|Will)\s+(\d+)/g)) {
    defenses[m[1].toLowerCase() as 'fortitude' | 'reflex' | 'will'] = parseInt(m[2])
  }

  const resist: Trap['resist'] = []
  for (const part of (t.resist ?? '').split(/,|;/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s+(.+)$/)
    resist.push(m ? { type: m[2].toLowerCase(), value: parseInt(m[1]) } : damageModifier(part))
  }

  const initiative = t.initiative && /^[+-]?\d+$/.test(t.initiative) ? parseInt(t.initiative) : undefined
  // "15 per square", "1; a missed attack never damages a minion": the leading
  // number when there is one, and the printed text.
  const hpRaw = normText(t.hp ?? '')
  const hpNumeric = /^\d+$/.test(hpRaw)
  const hpLead = hpRaw.match(/^(\d+)\b/)
  const hp = hpLead ? parseInt(hpLead[1]) : undefined
  const hpText = hpRaw && !hpNumeric ? hpRaw : undefined
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
    hp: hp && hp > 0 ? hp : undefined,
    hpText,
    defenses: Object.keys(defenses).length > 0 ? defenses : undefined,
    immune: (t.immune ?? '').split(/,|;/).map(s => s.trim().toLowerCase()).filter(Boolean).map(type => ({ type })),
    resist,
    trigger: optLine(t.trigger),
    traits,
    powers,
    countermeasures: (t.countermeasures ?? []).map(c => line(c)),
    flavor: t.flavor ?? '',
    description: t.description ?? '',
    sources: parseSources(t.source ?? '', notes),
    provenance: undefined as never,
  }
  trap.provenance = provenanceFor(ctx, notes)
  return compact(trap)
}

function convertTrapAction(a: TrapAction, notes: Notes): Power {
  const { name, keywords } = nameAndKeywords(a.name)
  const usageRaw = a.usage ?? ''
  const usage = toUsage(usageRaw)
  if (usageRaw && !usage) notes.add(`power "${name}": usage "${usageRaw}"`)
  const action = toActionType(a.action)
  if (a.action && !action) notes.add(`power "${name}": action "${a.action}" is not a kit ActionType`)

  const attacks: Attack[] = []
  if (a.attack) {
    const parsed = parseAttackLine(a.attack)
    if (parsed) attacks.push(compact({ label: 'primary', ...parsed, hit: a.hit ? hitLine(a.hit, []) : undefined, miss: optLine(a.miss) } as Attack))
    else notes.add(`power "${name}": attack line not parsed: ${normText(a.attack)}`)
  }
  const unplacedHit = attacks.length === 0 && (a.hit || a.miss)
  if (unplacedHit) notes.add(`power "${name}": hit/miss without a parsed attack: ${normText([a.hit, a.miss].filter(Boolean).join(' | '))}`)

  // Failed saves and aftereffects belong to the attack; other labels are extra lines.
  const extraLines: NonNullable<Power['extraLines']> = []
  const atk = attacks[0]
  for (const x of a.extra ?? []) {
    if (!normText(x.text)) continue
    const n = failedSaveN(x.label)
    if (n !== undefined && atk) (atk.failedSaves ??= []).push({ n, line: line(x.text) })
    else if (/^aftereffect$/i.test(x.label) && atk && !atk.aftereffect) atk.aftereffect = line(x.text)
    else extraLines.push({ label: normText(x.label), line: line(x.text) })
  }
  // Unlabeled text is the effect when there is no Effect line.
  const effect = a.effect || a.text
  if (a.effect && a.text) notes.add(`power "${name}": unlabeled text: ${normText(a.text)}`)

  return compact({
    name: name || 'Attack',
    action: action ?? 'standard',
    usage: usage ?? 'at-will',
    recharge: usage === 'recharge' ? toRecharge(usageRaw.replace(/^recharge\s*/i, '')) ?? { kind: 'text', text: '' } : undefined,
    keywords,
    trigger: optLine(a.trigger),
    requirement: optLine(a.requirement),
    attacks,
    effect: optLine(effect),
    sustain: a.sustain ? { action: 'minor', line: line(a.sustain) } : undefined,
    extraLines: extraLines.length > 0 ? extraLines : undefined,
  } as Power)
}
