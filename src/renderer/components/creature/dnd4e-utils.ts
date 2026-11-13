/** Shared constants and utilities for the D&D 4e plugin */

import { XP_BY_LEVEL } from '@kit'

export const USAGE_COLORS: Record<string, string> = {
  'at-will': '#4a7a5a', 'At-Will': '#4a7a5a',
  'encounter': '#7a4a4a', 'Encounter': '#7a4a4a',
  'recharge': '#6a6a72', 'Recharge': '#6a6a72',
  'daily': '#5a5a7a', 'Daily': '#5a5a7a',
  'consumable': '#6a6a72', 'Consumable': '#6a6a72',
  'trait': '#7a6f5e', 'aura': '#7a6f5e',
}

export const DND4E_ACTION_TYPES: Record<string, string> = {
  'standard': 'standard action', 'move': 'move action', 'minor': 'minor action',
  'free': 'free action', 'immediate-interrupt': 'immediate interrupt',
  'immediate-reaction': 'immediate reaction', 'opportunity': 'opportunity action', 'no-action': 'no action',
}

// XP by level (DMG p.56), from the shared 4e-kit vocabulary
export { XP_BY_LEVEL }
const XP_MULT: Record<string, number> = { elite: 2, solo: 5 }
export function xpForCreature(level: number, modifier?: string): number {
  const base = XP_BY_LEVEL[level] ?? XP_BY_LEVEL[30]
  return Math.round(base * (XP_MULT[modifier || ''] ?? 1))
}

export const sign = (n: number) => n >= 0 ? `+${n}` : `${n}`

// Encounter budget & difficulty (DMG Ch.4)
export function encounterBudget(partySize: number, partyLevel: number): number {
  return partySize * (XP_BY_LEVEL[partyLevel] ?? XP_BY_LEVEL[1])
}

/** Find the encounter level: the level L where partySize × XP_BY_LEVEL[L] is closest to totalXP */
export function encounterLevel(totalXP: number, partySize: number): number {
  if (totalXP <= 0 || partySize <= 0) return 0
  const perPC = totalXP / partySize
  let closest = 1
  let closestDiff = Infinity
  for (let lvl = 1; lvl <= 40; lvl++) {
    const xp = XP_BY_LEVEL[lvl]
    if (!xp) break
    const diff = Math.abs(xp - perPC)
    if (diff < closestDiff) { closestDiff = diff; closest = lvl }
  }
  return closest
}

export interface DifficultyInfo {
  encounterLevel: number
  label: string
  color: string
}

// DMG p.56: Easy = 1-2 below, Standard = at level or +1, Hard = +2 to +4
const DIFFICULTY_TIERS: { maxDelta: number; label: string; color: string }[] = [
  { maxDelta: -3, label: 'Trivial', color: '#888' },
  { maxDelta: -1, label: 'Easy', color: '#4a7a5a' },
  { maxDelta: 1, label: 'Standard', color: '#4a6a8a' },
  { maxDelta: 4, label: 'Hard', color: '#b8860b' },
  { maxDelta: Infinity, label: 'Deadly', color: '#7b241c' },
]

export function encounterDifficulty(totalXP: number, partySize: number, partyLevel: number): DifficultyInfo {
  const encLevel = encounterLevel(totalXP, partySize)
  const delta = encLevel - partyLevel
  const tier = DIFFICULTY_TIERS.find(t => delta <= t.maxDelta) ?? DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1]
  return { encounterLevel: encLevel, label: tier.label, color: tier.color }
}

/** Get XP thresholds for difficulty bar zones */
export function difficultyThresholds(partySize: number, partyLevel: number): { label: string; color: string; xp: number }[] {
  const xp = (lvl: number) => partySize * (XP_BY_LEVEL[Math.max(1, Math.min(30, lvl))] ?? XP_BY_LEVEL[1])
  return [
    { label: 'Trivial', color: '#888', xp: xp(partyLevel - 2) },
    { label: 'Easy', color: '#4a7a5a', xp: xp(partyLevel) },
    { label: 'Standard', color: '#4a6a8a', xp: xp(partyLevel + 2) },
    { label: 'Hard', color: '#b8860b', xp: xp(partyLevel + 5) },
    { label: 'Deadly', color: '#7b241c', xp: xp(partyLevel + 7) },
  ]
}

// Encounter templates (DMG p.58)
export interface EncounterSlot {
  role: string
  count: number
  altRole?: string    // alternative role that can fill this slot
  modifier?: string   // e.g. 'solo' for Dragon's Den
  levelOffset: number // creature level relative to encounter level (0 = same, +2 = 2 above)
}

export interface EncounterTemplate {
  name: string
  slots: EncounterSlot[]
}

// DMG p.58-59: templates with level offsets relative to encounter level.
// Standard-difficulty variant of each template.
export const ENCOUNTER_TEMPLATES: EncounterTemplate[] = [
  { name: 'Battlefield Control', slots: [
    { role: 'controller', count: 1, levelOffset: 1 },
    { role: 'skirmisher', count: 6, levelOffset: -2 },
  ]},
  { name: 'Commander and Troops', slots: [
    { role: 'controller', count: 1, altRole: 'soldier', levelOffset: 3 },
    { role: 'brute', count: 5, altRole: 'soldier', levelOffset: -2 },
  ]},
  { name: 'Double Line', slots: [
    { role: 'brute', count: 3, altRole: 'soldier', levelOffset: 0 },
    { role: 'artillery', count: 2, altRole: 'controller', levelOffset: 0 },
  ]},
  { name: "Dragon's Den", slots: [
    { role: '', count: 1, modifier: 'solo', levelOffset: 0 },
  ]},
  { name: 'Wolf Pack', slots: [
    { role: 'skirmisher', count: 5, levelOffset: 0 },
  ]},
]

// Encounter difficulty options for template level calculation
export const DIFFICULTY_OPTIONS = [
  { value: -2, label: 'Easy (PL−2)' },
  { value: -1, label: 'Easy (PL−1)' },
  { value: 0, label: 'Standard (PL)' },
  { value: 1, label: 'Standard (PL+1)' },
  { value: 2, label: 'Hard (PL+2)' },
  { value: 3, label: 'Hard (PL+3)' },
  { value: 4, label: 'Hard (PL+4)' },
]

export interface DamagePart {
  expr: string
  type: string
  ongoing: boolean
  /** Ongoing damage that a save ends. */
  saveEnds?: boolean
}

export function normalizeDamage(damage: DamagePart[] | string | undefined): DamagePart[] {
  if (!damage) return []
  if (Array.isArray(damage)) return damage.filter(p => p.expr)
  if (typeof damage === 'string' && damage.trim()) return [{ expr: damage.trim(), type: '', ongoing: false }]
  return []
}

/** Extract level scaling from text. Handles two formats:
 *  1. "Level 11: 2d8 damage. Level 21: 3d8 damage."
 *  2. "Increase to 2d6 at 11th level and 3d6 at 21st level."
 */
export function extractLevelScaling(text: string): { cleaned: string; scaling: { level: number; text: string }[] } {
  const scaling: { level: number; text: string }[] = []

  // Format 1: "Level N: ..."
  const pattern1 = /\s*Level\s+(\d+)\s*:\s*/gi
  const matches1 = [...text.matchAll(pattern1)]
  if (matches1.length > 0) {
    const cleaned = text.substring(0, matches1[0].index).replace(/\.\s*$/, '').trim()
    for (let i = 0; i < matches1.length; i++) {
      const lvl = parseInt(matches1[i][1])
      const start = matches1[i].index! + matches1[i][0].length
      const end = i + 1 < matches1.length ? matches1[i + 1].index! : text.length
      const txt = text.substring(start, end).replace(/\.\s*$/, '').trim()
      if (txt) scaling.push({ level: lvl, text: txt })
    }
    return { cleaned, scaling }
  }

  // Format 2: "...Increase to X at 11th level and Y at 21st level"
  // Find where the scaling sentence starts
  const scalingStart = /(?:Increase|This (?:bonus|extra damage|extra|additional hit points|additional))\s/i
  const splitMatch = text.match(scalingStart)
  if (splitMatch && splitMatch.index != null) {
    const cleaned = text.substring(0, splitMatch.index).replace(/\.\s*$/, '').trim()
    // Extract all "X at Nth level" patterns
    const atLevel = /(.+?)\s+at\s+(\d+)(?:st|nd|rd|th)\s+level/gi
    const atMatches = [...text.matchAll(atLevel)]
    for (const m of atMatches) {
      let val = m[1].trim()
      // Strip leading connectors to get just the value
      val = val.replace(/^.*(?:to|and|,)\s+/i, '').trim()
      scaling.push({ level: parseInt(m[2]), text: val })
    }
    if (scaling.length > 0) return { cleaned, scaling }
  }

  return { cleaned: text, scaling: [] }
}
