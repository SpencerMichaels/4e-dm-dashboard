// Kit MonsterTemplate / MonsterTheme -> the app types the encounter editor's template list, theme
// picker, and template viewer display (applying them happens on kit monsters, in
// src/common/rules/adjust-monster.ts). The inverse of tools/content/convert/template.ts; a round-trip
// test checks it against every published entry.

import type { Aura, MonsterTemplate as KitTemplate, MonsterTheme as KitTheme, Power, Range, Trait } from '@kit'
import type { MonsterTemplate, TemplatePower } from './monster-templates'
import type { MonsterTheme, ThemePower } from './monster-themes'

const ACTION_WORDS: Record<string, string> = {
  standard: 'standard', move: 'move', minor: 'minor', free: 'free', 'immediate-interrupt': 'immediate interrupt',
  'immediate-reaction': 'immediate reaction', opportunity: 'opportunity', 'no-action': 'no action',
}
const USAGE_WORDS: Record<string, string> = { 'at-will': 'at will', encounter: 'encounter', daily: 'daily', consumable: 'consumable' }
const DEFENSE_WORDS: Record<string, string> = { ac: 'AC', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' }
const SENSE_WORDS: Record<string, string> = {
  darkvision: 'Darkvision', 'low-light-vision': 'Low-light vision', blindsight: 'Blindsight', tremorsense: 'Tremorsense',
  truesight: 'Truesight', 'all-around-vision': 'All-around vision',
}

const rangeValue = (r: Range) => [r.reach ?? r.size, r.within !== undefined ? `within ${r.within}` : '', r.note].filter(v => v !== undefined && v !== '').join(' ')
const keywords = (k: string[]) => k.length ? k.map(w => w[0].toUpperCase() + w.slice(1)).join(', ') : undefined

/** "minor; recharge 5-6", "standard; at will", with any requirement kept separately. */
function actionString(p: Power): string {
  const usage = p.usage === 'recharge'
    ? `recharge ${p.recharge?.kind === 'roll' ? (p.recharge.min === 6 ? '6' : `${p.recharge.min}-6`) : p.recharge?.kind === 'bloodied' ? 'when first bloodied' : p.recharge?.kind === 'text' ? p.recharge.text : ''}`.trim()
    : USAGE_WORDS[p.usage] ?? p.usage
  return [ACTION_WORDS[p.action] ?? p.action, usage].filter(Boolean).join('; ')
}

function powerToTemplatePower(p: Power): TemplatePower {
  const a = p.attacks[0]
  const out: TemplatePower = { name: p.name, action: actionString(p), keywords: keywords(p.keywords), description: p.effect?.text ?? '', entryType: 'action' }
  if (p.trigger) out.trigger = p.trigger.text
  if (p.requirement) out.requirement = p.requirement.text
  if (a) {
    Object.assign(out, {
      rangeType: a.range.kind, rangeValue: rangeValue(a.range), target: a.target,
      attackBonus: a.bonus.kind === 'level' ? `level + ${a.bonus.plus}` : a.bonus.kind === 'formula' ? a.bonus.text : String(a.bonus.value),
      defense: DEFENSE_WORDS[a.vs] ?? a.vs,
    })
    // The kit hit line already joins the template's damage and hit text.
    if (a.hit) out.hit = a.hit.text.replace(/\.$/, '')
    if (a.miss) out.miss = a.miss.text
    if (a.critical) out.critical = a.critical.text
  } else if (p.range) Object.assign(out, { rangeType: p.range.kind, rangeValue: rangeValue(p.range) })
  return out
}

const traitToTemplatePower = (t: Trait): TemplatePower => ({ name: t.name, keywords: keywords(t.keywords), description: t.text.text, entryType: 'trait' })
const auraToTemplatePower = (a: Aura): TemplatePower => ({ name: a.name, keywords: keywords(a.keywords), description: a.text.text, entryType: 'aura', auraRange: a.range })

export function kitTemplateToApp(t: KitTemplate): MonsterTemplate {
  const resist = t.resist[0]
  const vulnerable = t.vulnerable[0]
  return {
    name: t.name,
    source: t.sources[0]?.book || undefined,
    description: t.description || undefined,
    role: t.role,
    leader: t.leader ? true : undefined,
    prerequisite: t.prerequisite.text,
    keyword: t.keyword,
    senses: t.senses.length ? t.senses.map(s => `${SENSE_WORDS[s.kind] ?? s.kind}${s.range !== undefined ? ' ' + s.range : ''}`) : undefined,
    defenses: { ...t.defenses },
    immunities: t.immune.length ? t.immune.map(i => i.type) : undefined,
    resistPerTier: resist ? { type: resist.type, ...resist.byTier } : undefined,
    vulnerable: vulnerable ? { type: vulnerable.type, value: vulnerable.value ?? 0 } : undefined,
    hpPerLevel: t.hpPerLevel,
    savingThrows: t.savingThrows,
    actionPoints: t.actionPoints,
    regeneration: t.regeneration?.value,
    regenerationNote: t.regeneration?.note,
    powers: [...t.traits.map(traitToTemplatePower), ...t.auras.map(auraToTemplatePower), ...t.powers.map(powerToTemplatePower)],
  }
}

export function kitThemeToApp(t: KitTheme): MonsterTheme {
  return {
    name: t.name,
    source: t.sources[0]?.book ?? '',
    description: t.description,
    originChange: t.originChange ? `origin becomes ${t.originChange}` : undefined,
    skills: t.skills ? { always: t.skills.always, choices: t.skills.choices, bonus: t.skills.bonus } : undefined,
    powers: t.powers.map((p): ThemePower => ({
      ...themeMenuEntry(p),
      category: p.category,
      recommendedFor: p.recommendedText ?? p.recommendedFor?.join(', '),
      flavorText: p.flavor,
    })),
  }
}

/** Theme traits and auras are kit no-action powers (an aura's effect starts "Aura N; "); give them back their entry type. */
function themeMenuEntry(p: Power): TemplatePower {
  if (p.action !== 'no-action' || p.attacks.length || p.trigger) return powerToTemplatePower(p)
  const text = p.effect?.text ?? ''
  const aura = text.match(/^Aura (\d+); ([\s\S]*)$/)
  return aura
    ? { name: p.name, keywords: keywords(p.keywords), description: aura[2], entryType: 'aura', auraRange: Number(aura[1]) }
    : { name: p.name, keywords: keywords(p.keywords), description: text, entryType: 'trait' }
}
