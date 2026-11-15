import type { Monster, Power, Range } from '@kit'
import type { Creature } from '../types/creature'

export function rangeText(r?: Range) {
  return r ? [r.reach ?? r.size, r.within ? `within ${r.within}` : '', r.note].filter(v => v !== undefined && v !== '').join(' ') : ''
}
/** "AC", "Fortitude": the printed defense names the legacy viewers and editors show. */
const defenseLabel = (vs: string) => vs === 'ac' ? 'AC' : vs ? vs[0].toUpperCase() + vs.slice(1) : ''

export function powerToLegacy(p: Power): Record<string, any> {
  const a = p.attacks[0]
  const extras: string[] = []
  for (const attack of p.attacks.slice(1)) {
    const bonus = attack.bonus.kind === 'fixed' ? `+${attack.bonus.value}` : attack.bonus.kind === 'formula' ? attack.bonus.text : `level + ${attack.bonus.plus}`
    extras.push(`${attack.label} attack (${attack.after ?? 'always'}): ${attack.range.kind} ${rangeText(attack.range)}; ${attack.target}; ${bonus} vs ${attack.vs}.`)
    for (const key of ['hit', 'miss', 'critical', 'aftereffect'] as const) if (attack[key]) extras.push(`${key}: ${attack[key]!.text}`)
    for (const f of attack.failedSaves ?? []) extras.push(`Failed save ${f.n}: ${f.line.text}`)
  }
  for (const f of a?.failedSaves ?? []) extras.push(`Failed save ${f.n}: ${f.line.text}`)
  for (const line of p.extraLines ?? []) extras.push(`${line.label}: ${line.line.text}`)
  if (p.usesPerEncounter) extras.push(`Uses per encounter: ${p.usesPerEncounter}`)
  if (p.usesPerRound) extras.push(`Uses per round: ${p.usesPerRound}`)
  if (p.basic) extras.push(`Basic ${p.basic} attack`)
  if (a && a.bonus.kind !== 'fixed') extras.push(`Attack bonus: ${a.bonus.kind === 'formula' ? a.bonus.text : `level + ${a.bonus.plus}`}`)
  return {
    name: p.name, entryType: 'action', actionType: p.action, usage: p.usage,
    rechargeCondition: p.recharge?.kind === 'roll' ? `${p.recharge.min}-6` : p.recharge?.kind === 'bloodied' ? 'when first bloodied' : p.recharge?.kind === 'text' ? p.recharge.text : undefined,
    keywords: p.keywords, rangeType: (a?.range ?? p.range)?.kind ?? '', rangeValue: rangeText(a?.range ?? p.range),
    target: a?.target ?? '', attackBonus: a?.bonus.kind === 'fixed' ? a.bonus.value : null, attackNotes: '',
    defense: a ? defenseLabel(a.vs) : '', damage: [], hit: a?.hit?.text ?? '', miss: a?.miss?.text ?? '', critical: a?.critical?.text,
    aftereffect: a?.aftereffect?.text, effect: p.effect?.text ?? '', trigger: p.trigger?.text ?? '', requirement: p.requirement?.text ?? '',
    special: p.special?.text ?? '',
    sustain: p.sustain ? `${p.sustain.action}: ${p.sustain.line?.text ?? ''}` : '', text: extras.join('\n'), levelScaling: p.levelSteps,
  }
}

/** An aura's printed size: "2", "sight", or "2 (3 while bloodied)". */
export function auraSize(a: { range?: number; rangeText?: string; rangeIf?: { value: number; if: string | string[] }[] }): string {
  const base = a.range !== undefined ? String(a.range) : a.rangeText ?? ''
  const alt = (a.rangeIf ?? []).map(r => `${r.value} ${([] as string[]).concat(r.if).join(' ')}`)
  return alt.length ? `${base} (${alt.join('; ')})` : base
}

/** "Fortitude 25 while bloodied": printed conditional defenses, for the stat block's notes. */
const conditionalDefenses = (m: Monster) => (m.defensesIf ?? []).map(d => `${d.defense === 'ac' ? 'AC' : d.defense[0].toUpperCase() + d.defense.slice(1)} ${d.value} ${([] as string[]).concat(d.if).join(' ')}`)

/** A kit monster in the creature viewer's and editor's (legacy-shaped) model; the kit content stays the source of truth. */
export function monsterToCreature(m: Monster, id = m.id, at = m.provenance.at): Creature {
  const { walk, notes, ...speeds } = m.speed
  return {
    id, name: m.name, hp: m.hp, maxHp: m.hp, createdAt: at, updatedAt: at,
    statBlock: {
      level: m.level, role: m.role, classRole: m.classRole, monsterModifier: m.rank === 'standard' ? '' : m.rank, leader: m.leader,
      size: m.size, origin: m.origin, creatureType: m.type, subtypes: m.keywords, xp: m.xp, hp: m.hp,
      hpText: m.hpText, hpIf: m.hpIf, healingSurges: m.healingSurges, surgeValue: m.surgeValue,
      initiative: m.initiative, perception: m.perception, senses: m.senses.map(s => `${s.kind.replace(/-vision$/, ' vision')}${s.range ? ' ' + s.range : ''}`),
      speed: walk, speeds, speedNotes: notes, ac: m.defenses.ac, defenses: m.defenses,
      savingThrowBonus: m.savingThrowBonus, actionPoints: m.actionPoints, immunities: m.immune,
      resistances: m.resist, weaknesses: m.vulnerable, abilities: m.abilities, skills: m.skills,
      alignment: m.alignment, languages: m.languages ? [m.languages] : [], equipment: m.equipment ? [m.equipment] : [],
      regeneration: m.regeneration ? { value: m.regeneration.value, inhibitDamageTypes: m.regeneration.suppressedBy } : undefined,
      actions: [
        ...m.traits.map(t => ({ name: t.name, entryType: 'trait', keywords: t.keywords, effect: t.text.text })),
        ...m.auras.map(t => ({ name: t.name, entryType: 'aura', keywords: t.keywords, auraRange: t.range, auraSize: auraSize(t), effect: t.text.text })),
        ...m.powers.map(powerToLegacy),
      ],
      description: [m.description, notes ? `Movement: ${notes}` : '', ...conditionalDefenses(m), ...(m.savingThrowNotes ?? []).map(n => `Saving throws: ${n}`), ...(m.skillNotes ?? []), m.regeneration?.text ?? '', ...[...m.resist, ...m.vulnerable].filter(x => x.text || x.note).map(x => `${x.type}: ${x.text ?? ''} ${x.note ?? ''}`)].filter(Boolean).join('\n'),
      source: m.sources.map(s => `${s.book}${s.page ? ', ' + s.page : ''}`).join('; '),
    },
  }
}
