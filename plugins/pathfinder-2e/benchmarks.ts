// PF2e Creature Building Benchmarks (Gamemastery Guide)
// Each table maps creature level to values per tier.

export type Tier = 'extreme' | 'high' | 'moderate' | 'low' | 'terrible'
export type TierNoTerrible = 'extreme' | 'high' | 'moderate' | 'low'
export type TierNoExtreme = 'high' | 'moderate' | 'low'

interface BenchmarkTable<T extends string = Tier> {
  [level: number]: Record<T, number>
}

// Perception
export const perception: BenchmarkTable = {
  [-1]: { extreme: 9, high: 6, moderate: 3, low: 1, terrible: 0 },
  0:    { extreme: 10, high: 7, moderate: 4, low: 2, terrible: 0 },
  1:    { extreme: 11, high: 8, moderate: 5, low: 3, terrible: 1 },
  2:    { extreme: 13, high: 10, moderate: 7, low: 5, terrible: 2 },
  3:    { extreme: 14, high: 11, moderate: 8, low: 6, terrible: 3 },
  4:    { extreme: 15, high: 12, moderate: 9, low: 7, terrible: 4 },
  5:    { extreme: 17, high: 14, moderate: 11, low: 8, terrible: 5 },
  6:    { extreme: 18, high: 15, moderate: 12, low: 9, terrible: 6 },
  7:    { extreme: 20, high: 17, moderate: 13, low: 10, terrible: 7 },
  8:    { extreme: 21, high: 18, moderate: 14, low: 11, terrible: 8 },
  9:    { extreme: 23, high: 19, moderate: 15, low: 12, terrible: 9 },
  10:   { extreme: 24, high: 20, moderate: 16, low: 13, terrible: 10 },
  11:   { extreme: 26, high: 22, moderate: 18, low: 14, terrible: 11 },
  12:   { extreme: 27, high: 23, moderate: 19, low: 15, terrible: 12 },
  13:   { extreme: 29, high: 25, moderate: 20, low: 16, terrible: 13 },
  14:   { extreme: 30, high: 26, moderate: 21, low: 17, terrible: 14 },
  15:   { extreme: 32, high: 28, moderate: 23, low: 18, terrible: 15 },
  16:   { extreme: 33, high: 29, moderate: 24, low: 19, terrible: 16 },
  17:   { extreme: 35, high: 30, moderate: 25, low: 20, terrible: 17 },
  18:   { extreme: 36, high: 31, moderate: 26, low: 21, terrible: 18 },
  19:   { extreme: 38, high: 33, moderate: 27, low: 22, terrible: 19 },
  20:   { extreme: 39, high: 34, moderate: 28, low: 23, terrible: 20 },
  21:   { extreme: 41, high: 36, moderate: 30, low: 25, terrible: 21 },
  22:   { extreme: 43, high: 37, moderate: 31, low: 26, terrible: 22 },
  23:   { extreme: 44, high: 38, moderate: 32, low: 27, terrible: 23 },
  24:   { extreme: 46, high: 40, moderate: 34, low: 28, terrible: 24 },
}

// AC (no terrible tier)
export const ac: BenchmarkTable<TierNoTerrible> = {
  [-1]: { extreme: 18, high: 15, moderate: 14, low: 12 },
  0:    { extreme: 19, high: 16, moderate: 15, low: 13 },
  1:    { extreme: 20, high: 17, moderate: 16, low: 14 },
  2:    { extreme: 22, high: 19, moderate: 18, low: 16 },
  3:    { extreme: 23, high: 20, moderate: 19, low: 17 },
  4:    { extreme: 25, high: 22, moderate: 21, low: 19 },
  5:    { extreme: 26, high: 23, moderate: 22, low: 20 },
  6:    { extreme: 28, high: 25, moderate: 24, low: 22 },
  7:    { extreme: 29, high: 26, moderate: 25, low: 23 },
  8:    { extreme: 31, high: 28, moderate: 27, low: 25 },
  9:    { extreme: 32, high: 29, moderate: 28, low: 26 },
  10:   { extreme: 34, high: 31, moderate: 30, low: 28 },
  11:   { extreme: 35, high: 32, moderate: 31, low: 29 },
  12:   { extreme: 37, high: 34, moderate: 33, low: 31 },
  13:   { extreme: 38, high: 35, moderate: 34, low: 32 },
  14:   { extreme: 40, high: 37, moderate: 36, low: 34 },
  15:   { extreme: 41, high: 38, moderate: 37, low: 35 },
  16:   { extreme: 43, high: 40, moderate: 39, low: 37 },
  17:   { extreme: 44, high: 41, moderate: 40, low: 38 },
  18:   { extreme: 46, high: 43, moderate: 42, low: 40 },
  19:   { extreme: 47, high: 44, moderate: 43, low: 41 },
  20:   { extreme: 49, high: 46, moderate: 45, low: 43 },
  21:   { extreme: 50, high: 47, moderate: 46, low: 44 },
  22:   { extreme: 52, high: 49, moderate: 48, low: 46 },
  23:   { extreme: 53, high: 50, moderate: 49, low: 47 },
  24:   { extreme: 55, high: 52, moderate: 51, low: 49 },
}

// Saving throws (Fort, Ref, Will — each independent)
export const saves: BenchmarkTable = {
  [-1]: { extreme: 9, high: 6, moderate: 4, low: 2, terrible: 0 },
  0:    { extreme: 10, high: 7, moderate: 5, low: 3, terrible: 1 },
  1:    { extreme: 11, high: 8, moderate: 6, low: 4, terrible: 2 },
  2:    { extreme: 12, high: 9, moderate: 7, low: 5, terrible: 3 },
  3:    { extreme: 14, high: 11, moderate: 9, low: 6, terrible: 4 },
  4:    { extreme: 15, high: 12, moderate: 10, low: 7, terrible: 5 },
  5:    { extreme: 17, high: 14, moderate: 11, low: 8, terrible: 6 },
  6:    { extreme: 18, high: 15, moderate: 12, low: 9, terrible: 7 },
  7:    { extreme: 19, high: 16, moderate: 13, low: 10, terrible: 8 },
  8:    { extreme: 20, high: 17, moderate: 14, low: 11, terrible: 9 },
  9:    { extreme: 22, high: 18, moderate: 15, low: 12, terrible: 10 },
  10:   { extreme: 23, high: 19, moderate: 16, low: 13, terrible: 11 },
  11:   { extreme: 24, high: 21, moderate: 18, low: 14, terrible: 12 },
  12:   { extreme: 26, high: 22, moderate: 19, low: 15, terrible: 13 },
  13:   { extreme: 27, high: 23, moderate: 20, low: 16, terrible: 14 },
  14:   { extreme: 29, high: 25, moderate: 21, low: 17, terrible: 15 },
  15:   { extreme: 30, high: 26, moderate: 22, low: 18, terrible: 16 },
  16:   { extreme: 32, high: 28, moderate: 24, low: 19, terrible: 17 },
  17:   { extreme: 33, high: 29, moderate: 25, low: 20, terrible: 18 },
  18:   { extreme: 35, high: 30, moderate: 26, low: 21, terrible: 19 },
  19:   { extreme: 36, high: 31, moderate: 27, low: 22, terrible: 20 },
  20:   { extreme: 38, high: 33, moderate: 29, low: 23, terrible: 21 },
  21:   { extreme: 39, high: 34, moderate: 30, low: 24, terrible: 22 },
  22:   { extreme: 41, high: 36, moderate: 32, low: 26, terrible: 23 },
  23:   { extreme: 42, high: 37, moderate: 33, low: 27, terrible: 24 },
  24:   { extreme: 44, high: 39, moderate: 35, low: 28, terrible: 25 },
}

// HP (no extreme or terrible tier)
export const hp: BenchmarkTable<TierNoExtreme> = {
  [-1]: { high: 9, moderate: 7, low: 5 },
  0:    { high: 17, moderate: 14, low: 11 },
  1:    { high: 26, moderate: 21, low: 16 },
  2:    { high: 40, moderate: 32, low: 25 },
  3:    { high: 54, moderate: 43, low: 34 },
  4:    { high: 72, moderate: 58, low: 46 },
  5:    { high: 90, moderate: 72, low: 58 },
  6:    { high: 105, moderate: 84, low: 67 },
  7:    { high: 120, moderate: 96, low: 77 },
  8:    { high: 135, moderate: 108, low: 86 },
  9:    { high: 155, moderate: 124, low: 99 },
  10:   { high: 170, moderate: 136, low: 109 },
  11:   { high: 190, moderate: 152, low: 122 },
  12:   { high: 210, moderate: 168, low: 134 },
  13:   { high: 230, moderate: 184, low: 147 },
  14:   { high: 255, moderate: 204, low: 163 },
  15:   { high: 275, moderate: 220, low: 176 },
  16:   { high: 300, moderate: 240, low: 192 },
  17:   { high: 325, moderate: 260, low: 208 },
  18:   { high: 350, moderate: 280, low: 224 },
  19:   { high: 375, moderate: 300, low: 240 },
  20:   { high: 400, moderate: 320, low: 256 },
  21:   { high: 430, moderate: 344, low: 275 },
  22:   { high: 460, moderate: 368, low: 294 },
  23:   { high: 490, moderate: 392, low: 314 },
  24:   { high: 520, moderate: 416, low: 333 },
}

// Strike attack bonus (no terrible tier)
export const strikeAttack: BenchmarkTable<TierNoTerrible> = {
  [-1]: { extreme: 10, high: 8, moderate: 6, low: 4 },
  0:    { extreme: 10, high: 8, moderate: 6, low: 4 },
  1:    { extreme: 11, high: 9, moderate: 7, low: 5 },
  2:    { extreme: 13, high: 11, moderate: 9, low: 7 },
  3:    { extreme: 14, high: 12, moderate: 10, low: 8 },
  4:    { extreme: 16, high: 14, moderate: 12, low: 9 },
  5:    { extreme: 17, high: 15, moderate: 13, low: 10 },
  6:    { extreme: 19, high: 17, moderate: 14, low: 11 },
  7:    { extreme: 20, high: 18, moderate: 15, low: 12 },
  8:    { extreme: 22, high: 19, moderate: 16, low: 13 },
  9:    { extreme: 23, high: 20, moderate: 17, low: 14 },
  10:   { extreme: 25, high: 22, moderate: 19, low: 15 },
  11:   { extreme: 27, high: 23, moderate: 20, low: 16 },
  12:   { extreme: 28, high: 24, moderate: 21, low: 17 },
  13:   { extreme: 29, high: 25, moderate: 22, low: 18 },
  14:   { extreme: 31, high: 27, moderate: 23, low: 19 },
  15:   { extreme: 32, high: 28, moderate: 24, low: 20 },
  16:   { extreme: 34, high: 30, moderate: 26, low: 21 },
  17:   { extreme: 35, high: 31, moderate: 27, low: 22 },
  18:   { extreme: 37, high: 33, moderate: 28, low: 23 },
  19:   { extreme: 38, high: 34, moderate: 29, low: 24 },
  20:   { extreme: 40, high: 36, moderate: 31, low: 25 },
  21:   { extreme: 41, high: 37, moderate: 32, low: 26 },
  22:   { extreme: 43, high: 39, moderate: 34, low: 28 },
  23:   { extreme: 44, high: 40, moderate: 35, low: 29 },
  24:   { extreme: 46, high: 42, moderate: 37, low: 30 },
}

// Strike damage (average, no terrible tier)
export const strikeDamage: BenchmarkTable<TierNoTerrible> = {
  [-1]: { extreme: 10, high: 7, moderate: 5, low: 3 },
  0:    { extreme: 11, high: 8, moderate: 6, low: 4 },
  1:    { extreme: 14, high: 10, moderate: 7, low: 5 },
  2:    { extreme: 18, high: 13, moderate: 10, low: 7 },
  3:    { extreme: 22, high: 16, moderate: 12, low: 8 },
  4:    { extreme: 25, high: 18, moderate: 13, low: 10 },
  5:    { extreme: 28, high: 20, moderate: 15, low: 11 },
  6:    { extreme: 31, high: 22, moderate: 17, low: 12 },
  7:    { extreme: 34, high: 24, moderate: 18, low: 13 },
  8:    { extreme: 37, high: 27, moderate: 20, low: 15 },
  9:    { extreme: 41, high: 29, moderate: 22, low: 16 },
  10:   { extreme: 44, high: 31, moderate: 24, low: 17 },
  11:   { extreme: 47, high: 34, moderate: 25, low: 18 },
  12:   { extreme: 51, high: 36, moderate: 27, low: 20 },
  13:   { extreme: 54, high: 38, moderate: 29, low: 21 },
  14:   { extreme: 58, high: 41, moderate: 31, low: 23 },
  15:   { extreme: 61, high: 43, moderate: 33, low: 24 },
  16:   { extreme: 65, high: 46, moderate: 35, low: 26 },
  17:   { extreme: 69, high: 49, moderate: 37, low: 27 },
  18:   { extreme: 73, high: 52, moderate: 39, low: 29 },
  19:   { extreme: 77, high: 55, moderate: 41, low: 30 },
  20:   { extreme: 81, high: 58, moderate: 44, low: 32 },
  21:   { extreme: 85, high: 61, moderate: 46, low: 34 },
  22:   { extreme: 89, high: 63, moderate: 48, low: 35 },
  23:   { extreme: 93, high: 66, moderate: 50, low: 37 },
  24:   { extreme: 97, high: 69, moderate: 52, low: 38 },
}

// Spell/Ability DC (extreme/high/moderate)
export type TierDC = 'extreme' | 'high' | 'moderate'

export const spellDC: BenchmarkTable<TierDC> = {
  [-1]: { extreme: 19, high: 16, moderate: 13 },
  0:    { extreme: 19, high: 16, moderate: 13 },
  1:    { extreme: 20, high: 17, moderate: 14 },
  2:    { extreme: 22, high: 18, moderate: 15 },
  3:    { extreme: 23, high: 20, moderate: 17 },
  4:    { extreme: 25, high: 21, moderate: 18 },
  5:    { extreme: 26, high: 22, moderate: 19 },
  6:    { extreme: 27, high: 24, moderate: 21 },
  7:    { extreme: 29, high: 25, moderate: 22 },
  8:    { extreme: 30, high: 26, moderate: 23 },
  9:    { extreme: 32, high: 28, moderate: 25 },
  10:   { extreme: 33, high: 29, moderate: 26 },
  11:   { extreme: 34, high: 30, moderate: 27 },
  12:   { extreme: 36, high: 32, moderate: 29 },
  13:   { extreme: 37, high: 33, moderate: 30 },
  14:   { extreme: 39, high: 34, moderate: 31 },
  15:   { extreme: 40, high: 36, moderate: 33 },
  16:   { extreme: 41, high: 37, moderate: 34 },
  17:   { extreme: 43, high: 38, moderate: 35 },
  18:   { extreme: 44, high: 40, moderate: 37 },
  19:   { extreme: 46, high: 41, moderate: 38 },
  20:   { extreme: 47, high: 42, moderate: 39 },
  21:   { extreme: 48, high: 44, moderate: 41 },
  22:   { extreme: 50, high: 45, moderate: 42 },
  23:   { extreme: 51, high: 46, moderate: 43 },
  24:   { extreme: 52, high: 48, moderate: 45 },
}

// Spell attack bonus (extreme/high/moderate)
export const spellAttack: BenchmarkTable<TierDC> = {
  [-1]: { extreme: 11, high: 8, moderate: 5 },
  0:    { extreme: 11, high: 8, moderate: 5 },
  1:    { extreme: 12, high: 9, moderate: 6 },
  2:    { extreme: 14, high: 10, moderate: 7 },
  3:    { extreme: 15, high: 12, moderate: 9 },
  4:    { extreme: 17, high: 13, moderate: 10 },
  5:    { extreme: 18, high: 14, moderate: 11 },
  6:    { extreme: 19, high: 16, moderate: 13 },
  7:    { extreme: 21, high: 17, moderate: 14 },
  8:    { extreme: 22, high: 18, moderate: 15 },
  9:    { extreme: 24, high: 20, moderate: 17 },
  10:   { extreme: 25, high: 21, moderate: 18 },
  11:   { extreme: 26, high: 22, moderate: 19 },
  12:   { extreme: 28, high: 24, moderate: 21 },
  13:   { extreme: 29, high: 25, moderate: 22 },
  14:   { extreme: 31, high: 26, moderate: 23 },
  15:   { extreme: 32, high: 28, moderate: 25 },
  16:   { extreme: 33, high: 29, moderate: 26 },
  17:   { extreme: 35, high: 30, moderate: 27 },
  18:   { extreme: 36, high: 32, moderate: 29 },
  19:   { extreme: 38, high: 33, moderate: 30 },
  20:   { extreme: 39, high: 34, moderate: 31 },
  21:   { extreme: 40, high: 36, moderate: 33 },
  22:   { extreme: 42, high: 37, moderate: 34 },
  23:   { extreme: 43, high: 38, moderate: 35 },
  24:   { extreme: 44, high: 40, moderate: 37 },
}

// Resistance/weakness ranges by level
export const resistWeakRange: { [level: number]: { min: number; max: number } } = {
  [-1]: { min: 1, max: 1 },
  0:    { min: 1, max: 3 },
  1:    { min: 2, max: 3 },
  2:    { min: 2, max: 5 },
  3:    { min: 3, max: 6 },
  4:    { min: 4, max: 7 },
  5:    { min: 4, max: 8 },
  6:    { min: 5, max: 9 },
  7:    { min: 5, max: 10 },
  8:    { min: 6, max: 11 },
  9:    { min: 6, max: 12 },
  10:   { min: 7, max: 13 },
  11:   { min: 7, max: 14 },
  12:   { min: 8, max: 15 },
  13:   { min: 8, max: 16 },
  14:   { min: 9, max: 17 },
  15:   { min: 9, max: 18 },
  16:   { min: 10, max: 19 },
  17:   { min: 10, max: 19 },
  18:   { min: 10, max: 20 },
  19:   { min: 11, max: 21 },
  20:   { min: 11, max: 22 },
  21:   { min: 12, max: 23 },
  22:   { min: 12, max: 24 },
  23:   { min: 13, max: 25 },
  24:   { min: 13, max: 26 },
}

// Strike damage as dice expressions (Table 2-10)
export const strikeDamageDice: { [level: number]: Record<TierNoTerrible, string> } = {
  [-1]: { extreme: '1d6+1', high: '1d4+1', moderate: '1d4', low: '1d4' },
  0:    { extreme: '1d6+3', high: '1d6+2', moderate: '1d4+2', low: '1d4+1' },
  1:    { extreme: '1d8+4', high: '1d6+3', moderate: '1d6+2', low: '1d4+2' },
  2:    { extreme: '1d12+4', high: '1d10+4', moderate: '1d8+4', low: '1d6+3' },
  3:    { extreme: '1d12+8', high: '1d10+6', moderate: '1d8+6', low: '1d6+5' },
  4:    { extreme: '2d10+7', high: '2d8+5', moderate: '2d6+5', low: '2d4+4' },
  5:    { extreme: '2d12+7', high: '2d8+7', moderate: '2d6+6', low: '2d4+6' },
  6:    { extreme: '2d12+10', high: '2d8+9', moderate: '2d6+8', low: '2d4+7' },
  7:    { extreme: '2d12+12', high: '2d10+9', moderate: '2d8+8', low: '2d6+6' },
  8:    { extreme: '2d12+15', high: '2d10+11', moderate: '2d8+9', low: '2d6+8' },
  9:    { extreme: '2d12+17', high: '2d10+13', moderate: '2d8+11', low: '2d6+9' },
  10:   { extreme: '2d12+20', high: '2d12+13', moderate: '2d10+11', low: '2d6+10' },
  11:   { extreme: '2d12+22', high: '2d12+15', moderate: '2d10+12', low: '2d8+10' },
  12:   { extreme: '3d12+19', high: '3d10+14', moderate: '3d8+12', low: '3d6+10' },
  13:   { extreme: '3d12+21', high: '3d10+16', moderate: '3d8+14', low: '3d6+11' },
  14:   { extreme: '3d12+24', high: '3d10+18', moderate: '3d8+15', low: '3d6+13' },
  15:   { extreme: '3d12+26', high: '3d12+17', moderate: '3d10+14', low: '3d6+14' },
  16:   { extreme: '3d12+29', high: '3d12+18', moderate: '3d10+15', low: '3d6+15' },
  17:   { extreme: '3d12+31', high: '3d12+19', moderate: '3d10+16', low: '3d6+16' },
  18:   { extreme: '3d12+34', high: '3d12+20', moderate: '3d10+17', low: '3d6+17' },
  19:   { extreme: '4d12+29', high: '4d10+20', moderate: '4d8+17', low: '4d6+14' },
  20:   { extreme: '4d12+32', high: '4d10+22', moderate: '4d8+19', low: '4d6+15' },
  21:   { extreme: '4d12+34', high: '4d10+24', moderate: '4d8+20', low: '4d6+17' },
  22:   { extreme: '4d12+37', high: '4d10+26', moderate: '4d8+22', low: '4d6+18' },
  23:   { extreme: '4d12+39', high: '4d12+24', moderate: '4d10+20', low: '4d6+19' },
  24:   { extreme: '4d12+42', high: '4d12+26', moderate: '4d10+22', low: '4d6+21' },
}

// Lookup helper
export function lookup<T extends string>(
  table: { [level: number]: Record<T, number> },
  level: number,
  tier: T
): number | undefined {
  const row = table[level]
  return row?.[tier]
}

// All stat definitions for the builder UI
export interface StatDef {
  key: string
  label: string
  tiers: readonly string[]
  table: { [level: number]: Record<string, number> }
  statBlockKey: string        // where to write in the creature's statBlock
  statBlockPath?: string[]    // nested path e.g. ['saves', 'fort']
}

// Stats shown as top-level rows in the creature builder
export const statDefs: StatDef[] = [
  { key: 'perception', label: 'Perception', tiers: ['extreme', 'high', 'moderate', 'low', 'terrible'], table: perception, statBlockKey: 'perception' },
  { key: 'ac', label: 'AC', tiers: ['extreme', 'high', 'moderate', 'low'], table: ac, statBlockKey: 'ac' },
  { key: 'fort', label: 'Fortitude', tiers: ['extreme', 'high', 'moderate', 'low', 'terrible'], table: saves, statBlockKey: 'fort', statBlockPath: ['saves', 'fort'] },
  { key: 'ref', label: 'Reflex', tiers: ['extreme', 'high', 'moderate', 'low', 'terrible'], table: saves, statBlockKey: 'ref', statBlockPath: ['saves', 'ref'] },
  { key: 'will', label: 'Will', tiers: ['extreme', 'high', 'moderate', 'low', 'terrible'], table: saves, statBlockKey: 'will', statBlockPath: ['saves', 'will'] },
  { key: 'hp', label: 'HP', tiers: ['high', 'moderate', 'low'], table: hp, statBlockKey: 'hp' },
]

// strikeAttack, strikeDamage, spellDC, spellAttack are still exported as const above
// but NOT included in statDefs — they're only used as tier buttons on individual abilities
