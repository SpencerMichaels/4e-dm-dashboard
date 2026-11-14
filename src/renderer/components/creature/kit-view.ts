// A kit monster as the creature viewer's stat block, with encounter attribution (what templates, a
// theme, or level adjustment changed) in the fields the viewer colors and annotates. Used by the
// encounter editor's preview and by combat until the viewer reads kit content directly.

import type { Monster } from '@kit'
import type { Creature } from '@common/types'
import type { Attribution } from '@common/rules/adjust-monster'
import { monsterToCreature } from '@common/authoring/legacy'

type Source = { name: string; index: number }

/** Template-added items carry their source; theme additions (index -1) are marked as theme. */
const stamp = (item: object, s: Source | undefined) => !s ? item
  : s.index === -1 ? { ...item, _themeSource: s.name }
  : { ...item, _templateSource: s.name, _templateSourceIndex: s.index }

export function kitStatBlock(m: Monster, attribution?: Attribution): Record<string, any> {
  const sb = monsterToCreature(m).statBlock as Record<string, any>
  if (m.rank === 'minion') sb.isMinion = true
  if (m.hp === 0 && m.hpText) sb.noHitPoints = true
  if (!attribution) return sb
  const src = attribution.sources
  sb._templateDiffs = attribution.diffs
  if (src.role) sb._roleTemplateSource = src.role
  if (src.rank) sb._modifierTemplateSource = src.rank
  if (src.regeneration) sb._regenerationTemplateSource = src.regeneration
  sb.subtypes = m.keywords.map(k => src[`keywords/${k}`] ? stamp({ name: k }, src[`keywords/${k}`]) : k)
  sb.senses = m.senses.map((s, i) => src[`senses/${s.kind}`] ? stamp({ name: sb.senses[i] }, src[`senses/${s.kind}`]) : sb.senses[i])
  sb.immunities = m.immune.map(x => stamp({ ...x }, src[`immune/${x.type}`]))
  sb.resistances = m.resist.map(x => stamp({ ...x }, src[`resist/${x.type}`]))
  sb.weaknesses = m.vulnerable.map(x => stamp({ ...x }, src[`vulnerable/${x.type}`]))
  // Actions list traits, then auras, then powers (monsterToCreature's order).
  const offset = { traits: 0, auras: m.traits.length, powers: m.traits.length + m.auras.length }
  sb.actions = (sb.actions as object[]).map((a, i) => {
    const group = i < offset.auras ? 'traits' : i < offset.powers ? 'auras' : 'powers'
    const n = i - offset[group]
    const out = stamp(a, src[`${group}/${n}`]) as Record<string, unknown>
    if (group === 'powers' && attribution.levelAdjust[n]) out._levelAdjust = attribution.levelAdjust[n]
    return out
  })
  return sb
}

/** The viewer's creature for an encounter or combat stat block. */
export function kitViewCreature(m: Monster, attribution: Attribution | undefined, extra: Partial<Creature> = {}): Creature {
  return { id: m.id, name: m.name, hp: m.hp, maxHp: m.hp, createdAt: '', updatedAt: '', statBlock: kitStatBlock(m, attribution), ...extra }
}
