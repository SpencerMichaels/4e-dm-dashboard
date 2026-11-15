// A stat block entry (trait, aura, or power in the viewer's shape) as the card PowerCardView renders.
// Shared by the creature viewer, the combat panels, and reaction tiles.

import { normalizeStringArray } from '@common/utils/arrays'
import type { PowerCardEntry } from './PowerCardView'

const USES_KEYWORD = /^\d+\/encounter$/i
const LIMITED_AT_WILL = /^at-will\s*\(\d+\/\w+\)$/i

/** `hideUsageKeywords` drops "2/Encounter"-style keywords, which the usage already shows (compact reaction tiles). */
export function toPowerCardEntry(p: any, opts: { hideUsageKeywords?: boolean } = {}): PowerCardEntry {
  let kw = normalizeStringArray(p.keywords)
  const isTrait = p.entryType === 'trait' || p.entryType === 'aura'
  let usage = isTrait ? p.entryType : (p.usage || 'at-will')
  // "N/Encounter" in the keywords, or uses per encounter, make an encounter power.
  if (!isTrait && (p.encounterUses || kw.some(k => USES_KEYWORD.test(String(k).trim())))) usage = 'encounter'
  if (opts.hideUsageKeywords) kw = kw.filter(k => !USES_KEYWORD.test(k.trim()) && !LIMITED_AT_WILL.test(k.trim()))
  const recharge = usage === 'recharge' && p.rechargeCondition ? String(p.rechargeCondition) : undefined
  return {
    name: p.name,
    usage,
    actionType: isTrait ? undefined : p.actionType,
    rechargeValue: recharge ? (parseInt(recharge) || undefined) : undefined,
    rechargeCondition: recharge && isNaN(parseInt(recharge)) ? recharge : undefined,
    keywords: kw.length ? kw : undefined,
    rangeType: p.range ?? p.rangeType,
    rangeValue: p.rangeValue,
    target: isTrait ? undefined : p.target,
    attackBonus: isTrait ? undefined : (p.attackBonus ?? null),
    defense: isTrait ? undefined : p.defense,
    damage: isTrait ? undefined : p.damage,
    hit: isTrait ? undefined : p.hit,
    ...(p._hitJoin !== undefined && !isTrait ? { hitJoin: p._hitJoin } : {}),
    critical: isTrait ? undefined : p.critical,
    secondary: isTrait ? undefined : p.secondary,
    aftereffect: isTrait ? undefined : p.aftereffect,
    miss: isTrait ? undefined : p.miss,
    effect: p.effect,
    trigger: p.trigger,
    requirement: p.requirement,
    sustain: p.sustain,
    special: p.special,
    text: p.text,
    levelScaling: p.levelScaling,
    // Kit content (kit-view's `_kit`): a power's card is drawn from it; a trait's or aura's line carries its clauses.
    ...(p._kit ? (isTrait ? { kitLine: p._kit.text } : { kit: p._kit }) : {}),
    ...(p.encounterUses > 1 ? { encounterUses: p.encounterUses } : {}),
    ...(p.basicAttack ? { basic: p.basicAttack } : {}),
    // Encounter level adjustment, shown on the attack and damage numbers.
    ...(p._levelAdjust ? { _levelAdjust: p._levelAdjust } : {}),
  } as PowerCardEntry
}
