// D&D 4e Monster Creation Benchmarks (DMG Chapter 10, pp.184-185 + p.42)
//
// 4e uses Role as the primary axis for AC, HP, attack bonus.
// Other defenses (Fort/Ref/Will) = Level + 12 as baseline, then adjusted by
// ability score pairs. Primary ability pair gets +1 to its defense.
// Damage uses quality tiers (low/medium/high) independent of role.

import type { CreatureBuilderStatDef } from '../types/system-plugin'

type Role = 'skirmisher' | 'brute' | 'soldier' | 'lurker' | 'controller' | 'artillery'

const roles: Role[] = ['skirmisher', 'brute', 'soldier', 'lurker', 'controller', 'artillery']

// Monster Statistics by Role (DMG p.184)
const roleOffsets: Record<Role, {
  initBonus: number
  hpPerLevel: number
  hpBase: number
  acOffset: number
  atkVsAC: number
  atkVsOther: number
}> = {
  skirmisher:  { initBonus: 2, hpPerLevel: 8,  hpBase: 8,  acOffset: 14, atkVsAC: 5, atkVsOther: 3 },
  brute:       { initBonus: 0, hpPerLevel: 10, hpBase: 10, acOffset: 12, atkVsAC: 3, atkVsOther: 1 },
  soldier:     { initBonus: 2, hpPerLevel: 8,  hpBase: 8,  acOffset: 16, atkVsAC: 7, atkVsOther: 5 },
  lurker:      { initBonus: 4, hpPerLevel: 6,  hpBase: 6,  acOffset: 14, atkVsAC: 5, atkVsOther: 3 },
  controller:  { initBonus: 0, hpPerLevel: 8,  hpBase: 8,  acOffset: 14, atkVsAC: 5, atkVsOther: 4 },
  artillery:   { initBonus: 0, hpPerLevel: 6,  hpBase: 6,  acOffset: 12, atkVsAC: 7, atkVsOther: 5 },
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
export const hp = buildRoleTable((lvl, role) => roleOffsets[role].hpBase + 14 + lvl * roleOffsets[role].hpPerLevel) // assumes Con 14
export const initiative = buildRoleTable((lvl, role) => Math.floor(lvl / 2) + roleOffsets[role].initBonus)

// Damage by Level (DMG p.185) — quality tiers, NOT role-based
function buildBandTable(bands: [number, number, Record<string, string>][]): { [level: number]: Record<string, string> } {
  const table: { [level: number]: Record<string, string> } = {}
  for (const [minLvl, maxLvl, values] of bands) {
    for (let lvl = minLvl; lvl <= maxLvl; lvl++) {
      table[lvl] = values
    }
  }
  return table
}

export const normalDamageDice = buildBandTable([
  [1,  3,  { low: '1d6+3',  medium: '1d10+3', high: '2d6+3' }],
  [4,  6,  { low: '1d6+4',  medium: '1d10+4', high: '2d8+4' }],
  [7,  9,  { low: '1d8+5',  medium: '2d6+5',  high: '2d8+5' }],
  [10, 12, { low: '1d8+5',  medium: '2d6+5',  high: '3d6+5' }],
  [13, 15, { low: '1d10+6', medium: '2d8+6',  high: '3d6+6' }],
  [16, 18, { low: '1d10+7', medium: '2d8+7',  high: '3d8+7' }],
  [19, 21, { low: '2d6+7',  medium: '3d6+8',  high: '3d8+7' }],
  [22, 24, { low: '2d6+8',  medium: '3d6+8',  high: '4d6+8' }],
  [25, 27, { low: '2d8+9',  medium: '3d8+9',  high: '4d6+9' }],
  [28, 30, { low: '2d8+10', medium: '3d8+10', high: '4d8+10' }],
])

export const limitedDamageDice = buildBandTable([
  [1,  3,  { low: '3d6+3',  medium: '2d10+3', high: '3d8+3' }],
  [4,  6,  { low: '3d6+4',  medium: '3d8+4',  high: '3d10+4' }],
  [7,  9,  { low: '3d8+5',  medium: '3d10+5', high: '4d8+5' }],
  [10, 12, { low: '3d8+5',  medium: '4d8+5',  high: '4d10+5' }],
  [13, 15, { low: '3d10+6', medium: '4d8+6',  high: '4d10+6' }],
  [16, 18, { low: '3d10+6', medium: '4d10+7', high: '4d12+7' }],
  [19, 21, { low: '4d8+7',  medium: '4d10+7', high: '4d12+7' }],
  [22, 24, { low: '4d8+8',  medium: '4d12+8', high: '5d10+8' }],
  [25, 27, { low: '4d10+9', medium: '5d10+9', high: '5d12+9' }],
  [28, 30, { low: '4d10+9', medium: '5d10+9', high: '5d12+9' }],
])

// DC by Level (DMG p.42)
function buildBandNumTable(bands: [number, number, Record<string, number>][]): { [level: number]: Record<string, number> } {
  const table: { [level: number]: Record<string, number> } = {}
  for (const [minLvl, maxLvl, values] of bands) {
    for (let lvl = minLvl; lvl <= maxLvl; lvl++) {
      table[lvl] = values
    }
  }
  return table
}

export const dcTable = buildBandNumTable([
  [1,  3,  { easy: 10, moderate: 15, hard: 20 }],
  [4,  6,  { easy: 13, moderate: 17, hard: 21 }],
  [7,  9,  { easy: 15, moderate: 19, hard: 23 }],
  [10, 12, { easy: 17, moderate: 21, hard: 25 }],
  [13, 15, { easy: 18, moderate: 22, hard: 26 }],
  [16, 18, { easy: 20, moderate: 24, hard: 28 }],
  [19, 21, { easy: 22, moderate: 26, hard: 30 }],
  [22, 24, { easy: 23, moderate: 27, hard: 31 }],
  [25, 27, { easy: 24, moderate: 28, hard: 32 }],
  [28, 30, { easy: 25, moderate: 29, hard: 33 }],
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
