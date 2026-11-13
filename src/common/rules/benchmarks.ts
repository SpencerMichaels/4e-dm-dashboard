// D&D 4e monster math, from the latest published rule for each number. Later books
// supersede earlier ones, like errata, so each table carries the newest source that
// prints it; there are no parallel policies. Sources (books in 4eBooks/):
//   DMG    Dungeon Master's Guide (2008) ch. 10, pp. 184-185: role statistics, damage by level,
//          elite and solo creation.
//   DMG2   Dungeon Master's Guide 2 (2009) p. 133, "Creating Monsters" (adopting Monster
//          Manual 2): elites and solos get no defense bonus, solo HP is x4 at every level,
//          minion damage by level.
//   RC     Rules Compendium (2010) p. 126: Difficulty Class by Level.
//   UPD    "4e Updates - Complete" (WotC Rules Update 08/2012, in 4eBooks/4ECollectedErrataFAQ.zip),
//          page 46 of 140, DMG pp. 184-185 errata: the damage table that Monster Manual 3 and
//          later books use, the new attack bonuses, and elite HP without the extra Constitution.
// Monster Manual 3 and Monster Vault print no creation tables of their own.
//
// Role is the primary axis for AC, HP, and attack bonus. Other defenses (Fort/Ref/Will) are
// level + 12 as a baseline, adjusted by ability score pairs. Damage uses quality tiers
// (low/medium/high) independent of role.

/** Identifies these rules in drafts and tool output; bump it when a table here changes. */
export const MONSTER_MATH = 'published-rules-v2'

import type { CreatureBuilderStatDef } from '../types/system-plugin'

type Role = 'skirmisher' | 'brute' | 'soldier' | 'lurker' | 'controller' | 'artillery'

const roles: Role[] = ['skirmisher', 'brute', 'soldier', 'lurker', 'controller', 'artillery']

// Monster Statistics by Role (DMG p. 184; attack bonuses from UPD p. 46: level + 5 vs. AC and
// level + 3 vs. other defenses for every role, +1 or 2 for ranged or area attacks)
const roleOffsets: Record<Role, {
  initBonus: number
  hpPerLevel: number
  hpBase: number
  acOffset: number
  atkVsAC: number
  atkVsOther: number
}> = {
  skirmisher:  { initBonus: 2, hpPerLevel: 8,  hpBase: 8,  acOffset: 14, atkVsAC: 5, atkVsOther: 3 },
  brute:       { initBonus: 0, hpPerLevel: 10, hpBase: 10, acOffset: 12, atkVsAC: 5, atkVsOther: 3 },
  soldier:     { initBonus: 2, hpPerLevel: 8,  hpBase: 8,  acOffset: 16, atkVsAC: 5, atkVsOther: 3 },
  lurker:      { initBonus: 4, hpPerLevel: 6,  hpBase: 6,  acOffset: 14, atkVsAC: 5, atkVsOther: 3 },
  controller:  { initBonus: 0, hpPerLevel: 8,  hpBase: 8,  acOffset: 14, atkVsAC: 5, atkVsOther: 3 },
  artillery:   { initBonus: 0, hpPerLevel: 6,  hpBase: 6,  acOffset: 12, atkVsAC: 5, atkVsOther: 3 },
}

function buildRoleTable(fn: (level: number, role: Role) => number): { [level: number]: Record<string, number> } {
  const table: { [level: number]: Record<string, number> } = {}
  for (let lvl = 1; lvl <= 30; lvl++) {
    const row: Record<string, number> = {}
    for (const role of roles) {
      row[role] = fn(lvl, role)
    }
    table[lvl] = row
  }
  return table
}

// Role-based stat tables
export const ac = buildRoleTable((lvl, role) => lvl + roleOffsets[role].acOffset)
export const attackVsAC = buildRoleTable((lvl, role) => lvl + roleOffsets[role].atkVsAC)
export const attackVsOther = buildRoleTable((lvl, role) => lvl + roleOffsets[role].atkVsOther)
/** Standard-rank HP (DMG p.184): role base + Constitution score + role HP per level. */
export function standardHp(level: number, role: Role, con = 14): number {
  return roleOffsets[role].hpBase + con + level * roleOffsets[role].hpPerLevel
}
/**
 * Initiative (DMG p.184): Dexterity modifier with half level, plus the role bonus
 * (lurker 4, skirmisher and soldier 2). About 93% of published monsters of every
 * role and rank follow it exactly.
 */
export function initiativeFor(level: number, role: Role, dex = 10): number {
  return Math.floor((dex - 10) / 2) + Math.floor(level / 2) + roleOffsets[role].initBonus
}
export type Rank = 'standard' | 'elite' | 'solo' | 'minion'
/**
 * HP for a rank. Elite: twice the standard monster's HP (DMG p. 185 as corrected by UPD p. 46,
 * which removed "plus twice its Constitution score"; published elites match it exactly). Solo: four times (DMG2 p. 133 replaced the DMG's x5 from level 11).
 * Minion: 1 (DMG2 p. 133).
 */
export function monsterHp(level: number, role: Role, rank: Rank = 'standard', con = 14): number {
  if (rank === 'minion') return 1
  return standardHp(level, role, con) * { standard: 1, elite: 2, solo: 4 }[rank]
}
/**
 * Rank adjustments besides HP. Elites and solos get no defense bonus (DMG2 p. 133, replacing
 * the DMG's +2 to up to three defenses); saving throws and action points are DMG p. 185.
 */
export function rankAdjustments(rank: Rank): { defenses: number; savingThrows: number; actionPoints: number } {
  return { defenses: 0, savingThrows: rank === 'elite' ? 2 : rank === 'solo' ? 5 : 0, actionPoints: rank === 'elite' ? 1 : rank === 'solo' ? 2 : 0 }
}

// Tables for the creature builder's tier tooltips: Con 14, Dex 10. Use the functions above when ability scores are known.
export const hp = buildRoleTable((lvl, role) => standardHp(lvl, role))
export const initiative = buildRoleTable((lvl, role) => initiativeFor(lvl, role))

// Damage by Level (UPD p. 46, replacing DMG p. 185), by monster level. The errata prints two
// columns: an effect that hurts one creature at a time, and one that harms several. Brutes deal
// 25 percent more; limited powers (encounter or recharge) 25 to 50 percent more.
//   low = several targets, medium = one target (both printed), high = brute (+25%).
// The +25% expressions keep the printed dice and raise the modifier to the higher average.
const DAMAGE_BY_LEVEL: [single: string, multi: string][] = [
  ['1d8+4', '1d6+3'], ['1d8+5', '1d6+4'], ['1d8+6', '1d6+5'], ['2d6+5', '1d8+5'], ['2d6+6', '1d8+6'],
  ['2d6+7', '1d8+6'], ['2d8+6', '2d6+4'], ['2d8+7', '2d6+5'], ['2d8+8', '2d6+6'], ['2d8+9', '2d6+6'],
  ['3d6+9', '2d6+7'], ['3d6+10', '2d8+6'], ['3d6+11', '2d8+7'], ['3d6+12', '2d8+7'], ['3d6+13', '2d8+8'],
  ['3d8+11', '3d6+8'], ['3d8+12', '3d6+9'], ['3d8+13', '3d6+9'], ['3d8+14', '3d6+10'], ['3d8+15', '3d6+11'],
  ['4d6+15', '3d8+9'], ['4d6+16', '3d8+9'], ['4d6+17', '3d8+10'], ['4d6+18', '3d8+11'], ['4d6+19', '3d8+12'],
  ['4d8+16', '4d6+11'], ['4d8+17', '4d6+12'], ['4d8+18', '4d6+13'], ['4d8+19', '4d6+14'], ['4d8+20', '4d6+15'],
]

/** "2d8+6" scaled to `factor` times its average, keeping the dice: "2d8+9" for 1.25. */
export function scaleDamage(expr: string, factor: number): string {
  const m = expr.match(/^(\d+)d(\d+)\+(\d+)$/)
  if (!m) throw new Error(`Not a damage expression: ${expr}`)
  const dice = Number(m[1]) * (Number(m[2]) + 1) / 2
  return `${m[1]}d${m[2]}+${Math.round((dice + Number(m[3])) * factor - dice)}`
}

/** At-will damage by level: low (several targets), medium (one target), high (brute). */
export const normalDamageDice: { [level: number]: Record<string, string> } = Object.fromEntries(
  DAMAGE_BY_LEVEL.map(([single, multi], i) => [i + 1, { low: multi, medium: single, high: scaleDamage(single, 1.25) }]))

/** Encounter and recharge damage: the same tiers 25 percent higher, the low end of UPD's 25-50%. */
export const LIMITED_FACTOR = { min: 1.25, max: 1.5 }
export const limitedDamageDice: { [level: number]: Record<string, string> } = Object.fromEntries(
  Object.entries(normalDamageDice).map(([level, row]) => [level, Object.fromEntries(Object.entries(row).map(([tier, expr]) => [tier, scaleDamage(expr, LIMITED_FACTOR.min)]))]))

function buildBandNumTable(bands: [number, number, Record<string, number>][]): { [level: number]: Record<string, number> } {
  const table: { [level: number]: Record<string, number> } = {}
  for (const [minLvl, maxLvl, values] of bands) {
    for (let lvl = minLvl; lvl <= maxLvl; lvl++) {
      table[lvl] = values
    }
  }
  return table
}

// Difficulty Class by Level (RC p. 126), from Essentials (2010). It supersedes the DMG p. 42 table and
// the July 2008 errata bands (5/10/15 at levels 1-3) that UPD still reprints.
const DC_BY_LEVEL: [number, number, number][] = [
  [8, 12, 19], [9, 13, 20], [9, 13, 21], [10, 14, 21], [10, 15, 22], [11, 15, 23], [11, 16, 23], [12, 16, 24], [12, 17, 25], [13, 18, 26],
  [13, 19, 27], [14, 20, 28], [14, 20, 29], [15, 21, 29], [15, 22, 30], [16, 22, 31], [16, 23, 31], [17, 23, 32], [17, 24, 33], [18, 25, 34],
  [19, 26, 35], [20, 27, 36], [20, 27, 37], [21, 28, 37], [21, 29, 38], [22, 29, 39], [22, 30, 39], [23, 30, 40], [23, 31, 41], [24, 32, 42],
]
export const dcTable: { [level: number]: Record<string, number> } = Object.fromEntries(
  DC_BY_LEVEL.map(([easy, moderate, hard], i) => [i + 1, { easy, moderate, hard }]))

// Minion Damage by Level (DMG2 p. 133): flat damage, about half a standard creature's.
// Brutes use the brute column; artillery minions deal 25% less on multitarget and melee attacks.
export const minionDamage = buildBandNumTable([
  [1,  3,  { standard: 4,  brute: 5 }],
  [4,  6,  { standard: 5,  brute: 6 }],
  [7,  9,  { standard: 6,  brute: 7 }],
  [10, 12, { standard: 8,  brute: 10 }],
  [13, 15, { standard: 9,  brute: 11 }],
  [16, 18, { standard: 10, brute: 12 }],
  [19, 21, { standard: 11, brute: 13 }],
  [22, 24, { standard: 13, brute: 16 }],
  [25, 27, { standard: 14, brute: 17 }],
  [28, 30, { standard: 15, brute: 18 }],
])

// Resistance/Vulnerability by tier (DMG templates, p.178)
// 4e uses a single static value per tier
export const resistWeakDefault: { [level: number]: number } = {}
for (let lvl = 1; lvl <= 10; lvl++) resistWeakDefault[lvl] = 5
for (let lvl = 11; lvl <= 20; lvl++) resistWeakDefault[lvl] = 10
for (let lvl = 21; lvl <= 30; lvl++) resistWeakDefault[lvl] = 15

// Defenses: Fort/Ref/Will are NOT role-based in 4e.
// Base = Level + 12. Adjusted by ability score pairs:
//   Str/Con → Fortitude, Dex/Int → Reflex, Wis/Cha → Will
//   For every 2 points above avg (13 + level/2), defense +1
// We don't pre-compute these since they depend on user-chosen ability scores.
// Instead, the builder shows the baseline and the user adjusts.

// Role-based stat definitions for the creature builder
// Stats shown as top-level rows in the creature builder (core defensive/HP stats)
export const statDefs: CreatureBuilderStatDef[] = [
  { key: 'ac', label: 'AC', tiers: [...roles], table: ac, statBlockKey: 'ac' },
  { key: 'hp', label: 'HP', tiers: [...roles], table: hp, statBlockKey: 'hp' },
  { key: 'initiative', label: 'Initiative', tiers: [...roles], table: initiative, statBlockKey: 'initiative' },
]

// XP by level and modifier (DMG p.56)
const xpStandard: Record<number, number> = {
  1:100,2:125,3:150,4:175,5:200,6:250,7:300,8:350,9:400,10:500,
  11:600,12:700,13:800,14:1000,15:1200,16:1400,17:1600,18:2000,19:2400,20:2800,
  21:3200,22:4150,23:5100,24:6050,25:7000,26:9000,27:11000,28:13000,29:15000,30:19000,
  31:23000,32:27000,33:31000,34:39000,35:47000,36:55000,37:63000,38:79000,39:95000,40:111000,
}
const xpMultipliers: Record<string, number> = { minion: 0.25, standard: 1, elite: 2, solo: 5 }

export function getXpForLevel(level: number, modifier?: string): number {
  const base = xpStandard[level] ?? xpStandard[30]
  const mult = xpMultipliers[modifier || 'standard'] ?? 1
  return Math.round(base * mult)
}

// attackVsAC, attackVsOther, dcTable are still exported but used inline on powers, not as top-level rows
