// Kit Power <-> the native power editor's PowerEntry (creature/PowerEntryEditor). Shared by the
// creature adapter and every kit-native statblock editor that lists powers.

import { DAMAGE_TYPES } from '@kit'
import type { Power, Line, Range } from '@kit'
import { powerToLegacy } from './legacy'

export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const clone = <T,>(v: T): T => structuredClone(v)
export const textLine = (text: string, previous?: Line): Line => ({ ...previous, text, clauses: previous?.clauses ?? [] })

/** Sets an optional Line, removing it when the native editor cleared the text. */
function setLine(target: any, key: string, text: unknown) {
  const s = String(text ?? '')
  if (!s.trim()) delete target[key]
  else target[key] = textLine(s, target[key])
}

// "2d6 + 4 fire damage" at the start of hit prose becomes a native damage part.
const DAMAGE_PREFIX = new RegExp(`^(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?|\\d+)\\s+(?:(${DAMAGE_TYPES.join('|')})\\s+)?damage\\b`, 'i')

/** Splits recognized leading damage from hit prose. The exact original text is kept for recombination. */
export function splitHitDamage(text: string) {
  const match = text.match(DAMAGE_PREFIX)
  if (!match) return undefined
  const rest = text.slice(match[0].length).match(/^([.,;]?\s*)([\s\S]*)$/)!
  return {
    damage: [{ expr: match[1], type: (match[2] ?? '').toLowerCase(), ongoing: false }],
    damageText: match[0], join: rest[1], hit: rest[2],
  }
}

function formatDamage(parts: { expr: string; type?: string; ongoing?: boolean }[]) {
  return (parts ?? []).filter(p => String(p.expr ?? '').trim()).map((p, i) => {
    const text = `${p.ongoing ? 'ongoing ' : ''}${String(p.expr).trim()}${p.type ? ' ' + p.type : ''} damage${p.ongoing ? ' (save ends)' : ''}`
    return i === 0 ? text : `${p.ongoing ? ' and ' : ' plus '}${text}`
  }).join('')
}

/** Recombines native damage parts with the remaining hit prose. Unchanged damage keeps its original wording. */
function composeHit(before: any, after: any) {
  const damage = equal(before.damage ?? [], after.damage ?? []) ? (after._damageText ?? formatDamage(after.damage)) : formatDamage(after.damage)
  const hit = String(after.hit ?? '').trim()
  if (!damage) return hit
  const sep: string = after._hitJoin ?? '.'
  return damage + (hit ? (sep.trim() ? sep.trim() + ' ' : ' ') + hit : sep.trimEnd())
}

function parseRange(kind: string, raw: string, notes: string): Range {
  const m = raw.match(/^\s*(\d+)?\s*(?:within\s+(\d+))?\s*([\s\S]*)$/i)!
  const note = [m[3].trim(), notes.trim()].filter(Boolean).join('; ')
  return {
    kind: (kind || 'personal') as Range['kind'],
    ...(m[1] ? { [kind === 'melee' ? 'reach' : 'size']: Number(m[1]) } : {}),
    ...(m[2] ? { within: Number(m[2]) } : {}),
    ...(note ? { note } : {}),
  }
}

/** Editor casing for a projected entry, with recognized leading hit damage split into native damage parts. */
export function toEditorEntry(e: any): any {
  const entry = { ...e, defense: e.defense === 'ac' ? 'AC' : e.defense ? e.defense[0].toUpperCase() + e.defense.slice(1) : '' }
  const split = e.entryType === 'action' && entry.hit ? splitHitDamage(entry.hit) : undefined
  return split ? { ...entry, damage: split.damage, hit: split.hit, _damageText: split.damageText, _hitJoin: split.join } : entry
}

/** A kit power as a native editor entry. */
export const powerToEntry = (p: Power) => toEditorEntry(powerToLegacy(p))

/**
 * Applies the fields that changed between two editor entries to the original kit power.
 * Everything the editor cannot show (secondary attacks, clauses, failed saves, theme fields) is kept.
 */
export function entryToPower(original: Power | undefined, before: any, after: any): Power {
  const p: Power = clone(original ?? { name: '', action: 'standard', usage: 'at-will', keywords: [], attacks: [] })
  const changed = (key: string) => !equal(before[key], after[key])
  for (const [legacy, kit] of [['name', 'name'], ['actionType', 'action'], ['usage', 'usage'], ['keywords', 'keywords']] as const) if (changed(legacy)) (p as any)[kit] = after[legacy]
  if (changed('usage') || changed('rechargeCondition')) {
    if (p.usage !== 'recharge') delete p.recharge
    else { const s = String(after.rechargeCondition ?? '').trim(); const n = Number(s.match(/^[2-6]/)?.[0]); p.recharge = n ? { kind: 'roll', min: n as 2 } : /first bloodied/i.test(s) ? { kind: 'bloodied' } : { kind: 'text', text: s } }
  }
  for (const key of ['effect', 'trigger', 'requirement', 'special'] as const) if (changed(key)) setLine(p, key, after[key])
  const attackKeys = ['attackBonus', 'rangeType', 'rangeValue', 'attackNotes', 'target', 'defense', 'damage', 'hit', 'miss', 'critical', 'aftereffect']
  if (!attackKeys.some(changed)) return p
  // The native × control clears every attack field; it removes only the primary attack, not secondary mechanics.
  const cleared = (e: any) => e.attackBonus == null && !e.target && !e.rangeValue && !e.rangeType
  if (cleared(after) && !cleared(before)) {
    if (p.attacks.length) {
      p.attacks.shift()
      if (p.attacks[0]) { p.attacks[0].label = 'primary'; delete p.attacks[0].after }
    } else delete p.range
    return p
  }
  const rangeChanged = changed('rangeType') || changed('rangeValue') || changed('attackNotes')
  if (!p.attacks.length && after.attackBonus == null) {
    // No attack roll: only the power's own range is representable.
    if (rangeChanged) p.range = parseRange(after.rangeType, String(after.rangeValue ?? ''), String(after.attackNotes ?? ''))
    return p
  }
  const a: any = p.attacks[0] ?? { label: 'primary', range: { kind: 'melee', reach: 1 }, target: '', bonus: { kind: 'fixed', value: 0 }, vs: 'ac' }
  // A formula or level-based bonus projects as null; it changes only when the DM types a number.
  if (changed('attackBonus') && after.attackBonus != null) a.bonus = { kind: 'fixed', value: Number(after.attackBonus) }
  if (changed('target')) a.target = after.target
  if (changed('defense')) a.vs = String(after.defense).toLowerCase()
  if (rangeChanged) a.range = parseRange(after.rangeType, String(after.rangeValue ?? ''), String(after.attackNotes ?? ''))
  if (changed('hit') || changed('damage')) setLine(a, 'hit', composeHit(before, after))
  for (const key of ['miss', 'critical', 'aftereffect'] as const) if (changed(key)) setLine(a, key, after[key])
  if (!p.attacks.length) delete p.range
  p.attacks[0] = a
  return p
}

