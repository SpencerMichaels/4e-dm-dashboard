// D&D 4e treasure budgets, two ways the books give them:
//   DMG  Dungeon Master's Guide (2008) ch. 7: per party level, ten treasure parcels, four magic items
//        (party level + 4 down to + 1) and six monetary parcels (pp. 126-129), adjusted for a party
//        other than five characters (p. 125). Potions in a parcel count at their market price (p. 126).
//   RC   Rules Compendium (2010) Appendix 2: about ten treasures per level, each rolled on the Treasure
//        by Party Level table, a d20 per line, +2 per character over five, -2 per character under
//        (pp. 298-302). It does not print a gp total per level.
// Currency (RC): 10 sp = 1 gp (p. 263), 1 pp = 100 gp (p. 295), 1 astral diamond = 10,000 gp (p. 296).
// Only the numbers are here; the parcels' alternative wordings (gems, art objects, potions) are book
// text and stay in the books.

import type { Treasure, TreasureMode, TreasureSlot } from '../types/treasure'
import { MAGIC_ITEM_VALUE } from './items'

export const MODE_LABELS: Record<TreasureMode, string> = { dmg: 'DMG parcels', rc: 'RC rolls', free: 'Free' }

/** The party size the parcels assume (DMG p. 125). */
export const BASE_PARTY_SIZE = 5

// ─── DMG parcels ───

/** Parcels 5-10 in gp for each party level (DMG pp. 126-129); each level's six add up to its printed total. */
export const DMG_MONEY_PARCELS: Record<number, number[]> = {
  1: [200, 180, 120, 120, 60, 40], 2: [290, 260, 170, 170, 90, 60], 3: [380, 340, 225, 225, 110, 75],
  4: [470, 420, 280, 280, 140, 90], 5: [550, 500, 340, 340, 160, 110], 6: [1000, 900, 600, 600, 300, 200],
  7: [1500, 1300, 850, 850, 400, 300], 8: [1900, 1700, 1100, 1100, 600, 400], 9: [2400, 2100, 1400, 1400, 700, 400],
  10: [2800, 2500, 1700, 1700, 800, 500], 11: [5000, 4000, 3000, 3000, 2000, 1000], 12: [7200, 7000, 4400, 4400, 2000, 1000],
  13: [9500, 8500, 5700, 5700, 2800, 1800], 14: [12000, 10000, 7000, 7000, 4000, 2000], 15: [14000, 12000, 8500, 8500, 5000, 2000],
  16: [25000, 22000, 15000, 15000, 8000, 5000], 17: [36000, 33000, 22000, 22000, 11000, 6000], 18: [48000, 42000, 29000, 29000, 15000, 7000],
  19: [60000, 52000, 35000, 35000, 18000, 10000], 20: [70000, 61000, 42000, 42000, 21000, 14000],
  // Epic parcels are printed in pp.
  ...Object.fromEntries(Object.entries({
    21: [1250, 1120, 750, 750, 380, 250], 22: [1800, 1600, 1100, 1100, 550, 350], 23: [2400, 2100, 1400, 1400, 700, 500],
    24: [3000, 2500, 1750, 1750, 900, 600], 25: [3500, 3200, 2000, 2000, 1000, 800], 26: [6250, 5600, 3750, 3750, 1900, 1250],
    27: [9000, 8000, 5500, 5500, 2800, 1700], 28: [12000, 10000, 7200, 7200, 3600, 2500], 29: [15000, 13000, 8750, 8750, 4500, 2500],
    30: [17500, 15000, 10000, 10000, 6000, 4000],
  }).map(([l, pp]) => [l, pp.map(v => v * 100)])),
}

/** The "Total Monetary Treasure" each level prints, in gp (DMG pp. 126-129). */
export const DMG_MONEY_TOTAL: Record<number, number> = {
  1: 720, 2: 1040, 3: 1355, 4: 1680, 5: 2000, 6: 3600, 7: 5200, 8: 6800, 9: 8400, 10: 10000,
  11: 18000, 12: 26000, 13: 34000, 14: 42000, 15: 50000, 16: 90000, 17: 130000, 18: 170000, 19: 210000, 20: 250000,
  21: 450000, 22: 650000, 23: 850000, 24: 1050000, 25: 1250000, 26: 2250000, 27: 3250000, 28: 4250000, 29: 5250000, 30: 6250000,
}

const clampLevel = (level: number) => Math.min(30, Math.max(1, Math.round(level)))

/** Item parcel n (1-4) is a magic item of level + 5 - n, at most 30 (DMG pp. 126-129). */
const parcelItemLevel = (level: number, n: number) => Math.min(30, level + 5 - n)

/**
 * The DMG's parcels for a party level and size, as slots. Parties of 6-8 add item parcels and
 * parties of 1-4 drop the parcels DMG p. 125 names; it prints nothing past 8, so larger parties
 * get the 8-character list.
 */
export function dmgSlots(partyLevel: number, partySize: number): TreasureSlot[] {
  const level = clampLevel(partyLevel)
  const size = Math.min(8, Math.max(1, Math.round(partySize)))
  const removed: Record<number, number[]> = { 1: [1, 2, 4, 5], 2: [1, 2, 4], 3: [2, 4], 4: [3] }
  const added: Record<number, number[]> = { 6: [2], 7: [2, 1], 8: [3, 2, 1] }
  const drop = removed[size] ?? []
  const slots: TreasureSlot[] = []
  for (let n = 1; n <= 4; n++) {
    if (drop.includes(n)) continue
    // Level 30's parcel 1 is two level 30 items (DMG p. 129).
    const count = level === 30 && n === 1 ? 2 : 1
    for (let i = 0; i < count; i++) {
      slots.push({ key: `dmg:${n}${count > 1 ? String.fromCharCode(97 + i) : ''}`, kind: 'item', itemLevel: parcelItemLevel(level, n), label: `Parcel ${n}` })
    }
  }
  ;(added[size] ?? []).forEach((plus, i) =>
    slots.push({ key: `dmg:+${i + 1}`, kind: 'item', itemLevel: Math.min(30, level + plus), label: `Extra parcel ${i + 1}` }))
  DMG_MONEY_PARCELS[level].forEach((gp, i) => {
    const n = i + 5
    if (!drop.includes(n)) slots.push({ key: `dmg:${n}`, kind: 'money', gp, label: `Parcel ${n}` })
  })
  return slots
}

// ─── RC Treasure by Party Level ───

// Each level's lines as printed (RC pp. 300-302), one roll per line: bands "<d20 range> <result>"
// separated by ";". Results: "<dice>x<mult> <coin>", "<count> gems <gp>", "<count> art <gp>",
// "[<count>] item <level>". The book's last band is open-ended upward ("11-20" at levels 21-23 too).
export const RC_TABLE: Record<number, string[]> = {
  1: ['11-14 2d6x100 sp; 15+ 2d6x10 gp', '18+ 1d2 gems 100', '20+ 1 art 250', '13+ item 1d4+1'],
  2: ['11-13 3d6x100 sp; 14+ 3d6x10 gp', '18+ 1d3 gems 100', '19+ 1 art 250', '13+ item 1d4+2'],
  3: ['11-12 3d8x100 sp; 13+ 3d8x10 gp', '17+ 1d3 gems 100', '19+ 1 art 250', '13+ item 1d4+3'],
  4: ['11 5d6x100 sp; 12+ 5d6x10 gp', '16+ 1d3 gems 100', '19+ 1d2 art 250', '13+ item 1d4+4'],
  5: ['11+ 4d8x10 gp', '16+ 1d4 gems 100', '19+ 1d3 art 250', '13+ item 1d4+5'],
  6: ['11+ 8d8x10 gp', '14-19 1d4 gems 100; 20+ 1 gems 500', '18+ 1d3 art 250', '13+ item 1d4+6'],
  7: ['11+ 2d4x100 gp', '14-19 1 gems 500; 20+ 1 gems 1000', '18+ 1d3 art 250', '13+ item 1d4+7'],
  8: ['11+ 2d6x100 gp', '13-19 1 gems 500; 20+ 1 gems 1000', '18-19 1d3 art 250; 20+ 1 art 1500', '13+ item 1d4+8'],
  9: ['11+ 2d8x100 gp', '13-19 1 gems 500; 20+ 1 gems 1000', '18-19 1d4 art 250; 20+ 1 art 1500', '13+ item 1d4+9'],
  10: ['11+ 2d10x100 gp', '13-19 1 gems 500; 20+ 1 gems 1000', '18-19 1 art 1500; 20+ 1 art 2500', '13+ item 1d4+10'],
  11: ['11+ 4d8x100 gp', '13-19 1 gems 1000; 20+ 1 gems 5000', '18-19 1 art 1500; 20+ 1 art 2500', '13+ item 1d4+11'],
  12: ['11+ 4d12x100 gp', '13-19 1d2 gems 1000; 20+ 1 gems 5000', '17-18 1d3 art 1500; 19+ 1 art 2500', '13+ item 1d4+12'],
  13: ['11+ 1d6x1000 gp', '13-19 1d3 gems 1000; 20+ 1 gems 5000', '17-19 1 art 2500; 20+ 1 art 7500', '13+ item 1d4+13'],
  14: ['11-19 1d8x1000 gp; 20+ 1d6x10 pp', '13-18 1d4 gems 1000; 19+ 1 gems 5000', '17-19 1d2 art 2500; 20+ 1 art 7500', '13+ item 1d4+14'],
  15: ['11-18 1d10x1000 gp; 19+ 1d8x10 pp', '13-17 1d4 gems 1000; 18+ 1 gems 5000', '17-18 1d2 art 2500; 19+ 1 art 7500', '13+ item 1d4+15'],
  16: ['11-17 2d8x1000 gp; 18+ 2d8x10 pp', '13+ 1d2 gems 5000', '17-18 1d6 art 1500; 19+ 1 art 7500', '13+ item 1d4+16'],
  17: ['11-16 4d6x1000 gp; 17+ 4d6x10 pp', '13+ 1d3 gems 5000', '17-19 1 art 7500; 20+ 1 art 15000', '13+ item 1d4+17'],
  18: ['11-14 4d8x1000 gp; 15+ 4d8x10 pp', '13+ 1d4 gems 5000', '17-19 1d3 art 7500; 20+ 1 art 15000', '13+ item 1d4+18'],
  19: ['11-12 4d10x1000 gp; 13+ 4d10x10 pp', '13+ 1d6 gems 5000', '17-19 1d3 art 7500; 20+ 1 art 15000', '13+ item 1d4+19'],
  20: ['11 4d12x1000 gp; 12+ 4d12x10 pp', '13+ 1d8 gems 5000', '17-19 1d3 art 7500; 20+ 1 art 15000', '13+ item 1d4+20'],
  21: ['11-20 1d8x100 pp', '13+ 2d6 gems 5000', '16-18 1d3 art 15000; 19+ 1 art 50000', '13+ item 1d4+21'],
  22: ['11-20 1d12x100 pp', '13+ 2d8 gems 5000', '16-18 1d6 art 15000; 19+ 1d2 art 50000', '13+ item 1d4+22'],
  23: ['11-20 2d8x100 pp', '13+ 2d8 gems 5000', '16-17 1d8 art 15000; 18+ 1d3 art 50000', '13+ item 1d4+23'],
  24: ['11-19 2d10x100 pp; 20+ 1d3x5 ad', '13+ 2d6 gems 5000', '16-17 1d10 art 15000; 18+ 1d6 art 50000', '13+ item 1d4+24'],
  25: ['11-19 2d12x100 pp; 20+ 1d4x5 ad', '13+ 2d4 gems 5000', '15-16 2d8 art 15000; 17+ 1d6 art 50000', '13+ item 1d4+25'],
  26: ['11-18 1d4x1000 pp; 19+ 1d6x5 ad', '13+ 2d6 gems 5000', '15-16 3d6 art 15000; 17+ 1d12 art 50000', '13+ item 1d4+26'],
  27: ['11-18 1d6x1000 pp; 19+ 2d6x5 ad', '13+ 2d8 gems 5000', '15-16 3d6 art 15000; 17+ 3d6 art 50000', '13+ item 1d3+27'],
  28: ['11-17 1d8x1000 pp; 18+ 2d8x5 ad', '13+ 3d6 art 50000', '13+ item 1d2+28'],
  29: ['11-17 1d10x1000 pp; 18+ 3d6x5 ad', '13+ 2d12 art 50000', '13+ item 30'],
  30: ['11-16 1d12x1000 pp; 17+ 2d12x5 ad', '13+ 4d6 art 50000', '13-18 item 30; 19+ 2 item 30'],
}

/** Value of one coin in gp. */
export const COIN_GP = { sp: 0.1, gp: 1, pp: 100, ad: 10000 } as const
type Coin = keyof typeof COIN_GP

/** Dice "NdM" or "NdM+K", or a plain number. */
interface Dice { n: number; sides: number; plus: number }

export type RcResult =
  | { kind: 'coins'; dice: Dice; mult: number; coin: Coin }
  | { kind: 'gems'; count: Dice; gp: number }
  | { kind: 'art'; count: Dice; gp: number }
  | { kind: 'item'; count: number; level: Dice }

export interface RcBand { min: number; max?: number; result: RcResult }

function parseDice(s: string): Dice {
  const m = /^(?:(\d+)d(\d+))?(?:\+?(\d+))?$/.exec(s)
  if (!m || (!m[1] && !m[3])) throw new Error(`Bad dice: ${s}`)
  return { n: Number(m[1] ?? 0), sides: Number(m[2] ?? 0), plus: Number(m[3] ?? 0) }
}

/** One table line's bands, lowest first. */
export function parseRcLine(line: string): RcBand[] {
  return line.split(';').map(part => {
    const m = /^(\d+)(?:-(\d+)|(\+))?\s+(.+)$/.exec(part.trim())
    if (!m) throw new Error(`Bad band: ${part}`)
    const min = Number(m[1])
    const max = m[3] ? undefined : Number(m[2] ?? m[1])
    const what = m[4]
    let result: RcResult
    let r: RegExpExecArray | null
    if ((r = /^(\S+)x(\d+) (sp|gp|pp|ad)$/.exec(what))) result = { kind: 'coins', dice: parseDice(r[1]), mult: Number(r[2]), coin: r[3] as Coin }
    else if ((r = /^(\S+) (gems|art) (\d+)$/.exec(what))) result = { kind: r[2] as 'gems' | 'art', count: parseDice(r[1]), gp: Number(r[3]) }
    else if ((r = /^(?:(\d+) )?item (\S+)$/.exec(what))) result = { kind: 'item', count: Number(r[1] ?? 1), level: parseDice(r[2]) }
    else throw new Error(`Bad result: ${what}`)
    return { min, max, result }
  })
}

/** A random integer in 1..sides; `rng` returns [0, 1). */
export type Rng = () => number
const die = (sides: number, rng: Rng) => Math.floor(rng() * sides) + 1
const rollDice = (d: Dice, rng: Rng) => { let t = d.plus; for (let i = 0; i < d.n; i++) t += die(d.sides, rng); return t }

/**
 * The band a d20 roll selects (RC p. 299): the modified roll picks the band; a natural 20 gives the
 * best band, or the lowest when the modified roll reaches none. The top band is open-ended.
 */
export function pickBand(bands: RcBand[], natural: number, modifier: number): RcBand | undefined {
  const total = natural + modifier
  if (natural === 20) return total >= bands[0].min ? bands[bands.length - 1] : bands[0]
  return bands.find((b, i) => total >= b.min && (i === bands.length - 1 || b.max == null || total <= b.max))
}

const gpText = (gp: number) => `${gp.toLocaleString('en-US')} gp`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Rolls one RC treasure for a party level and size: its monetary part as one money slot (with what was
 * rolled) and its magic item(s) as item slots with rarity from the unmodified roll (odd common, even
 * uncommon, natural 20 rare; RC p. 299). `n` numbers the treasure.
 */
export function rollRcTreasure(partyLevel: number, partySize: number, n: number, rng: Rng): TreasureSlot[] {
  const level = clampLevel(partyLevel)
  const modifier = (Math.round(partySize) - BASE_PARTY_SIZE) * 2
  const parts: string[] = []
  let gp = 0
  const slots: TreasureSlot[] = []
  for (const line of RC_TABLE[level]) {
    const natural = die(20, rng)
    const band = pickBand(parseRcLine(line), natural, modifier)
    if (!band) continue
    const r = band.result
    if (r.kind === 'coins') {
      const amount = rollDice(r.dice, rng) * r.mult
      gp += amount * COIN_GP[r.coin]
      parts.push(`${amount.toLocaleString('en-US')} ${r.coin}`)
    } else if (r.kind === 'gems' || r.kind === 'art') {
      const count = rollDice(r.count, rng)
      gp += count * r.gp
      parts.push(`${r.kind === 'gems' ? plural(count, 'gem', 'gems') : plural(count, 'art object', 'art objects')} worth ${gpText(r.gp)}`)
    } else {
      const rarity = natural === 20 ? 'rare' : natural % 2 ? 'common' : 'uncommon'
      for (let i = 0; i < r.count; i++) {
        slots.push({ key: `rc:${n}:item${i ? i + 1 : ''}`, kind: 'item', itemLevel: Math.min(30, rollDice(r.level, rng)), rarity, label: `Treasure ${n}` })
      }
    }
  }
  if (gp > 0) slots.unshift({ key: `rc:${n}:money`, kind: 'money', gp: Math.round(gp), label: `Treasure ${n}`, text: parts.join(', ') })
  return slots
}

/** "Over the course of the eight to ten encounters ... they should acquire about ten treasures" (RC p. 298). */
export const RC_TREASURES_PER_LEVEL = 10

export function rollRcLevel(partyLevel: number, partySize: number, rng: Rng = Math.random): TreasureSlot[] {
  return Array.from({ length: RC_TREASURES_PER_LEVEL }, (_, i) => rollRcTreasure(partyLevel, partySize, i + 1, rng)).flat()
}

// ─── Budget ───

/** The slots of a level's plan: derived for DMG parcels, rolled for RC, none when free. */
export function planSlots(mode: TreasureMode, partyLevel: number, partySize: number, rolled?: TreasureSlot[]): TreasureSlot[] {
  if (mode === 'dmg') return dmgSlots(partyLevel, partySize)
  if (mode === 'rc') return rolled ?? []
  return []
}

/** What a level's budget asks for: magic item slots and a gp total. Free mode uses the DMG's numbers as a guide. */
export function treasureBudget(mode: TreasureMode, partyLevel: number, partySize: number, rolled?: TreasureSlot[]): { items: number; gp: number } {
  const slots = mode === 'free' ? dmgSlots(partyLevel, partySize) : planSlots(mode, partyLevel, partySize, rolled)
  return {
    items: slots.filter(s => s.kind === 'item').length,
    gp: slots.reduce((sum, s) => sum + (s.kind === 'money' ? s.gp ?? 0 : 0), 0),
  }
}

/** What an item treasure is, for the budget: a permanent magic item counts as an item; a consumable counts at its price (DMG p. 126). */
export interface ItemFacts { name: string; level: number; consumable: boolean; priceGp: number | null; rarity?: string }

/** A treasure's share of the budget: a permanent item, or its gp toward the monetary total. */
export function treasureShare(t: Treasure, item?: ItemFacts | null): { item: boolean; gp: number } {
  if (t.money) return { item: false, gp: t.money.gp }
  if (!item) return { item: false, gp: 0 }
  if (item.consumable) return { item: false, gp: item.priceGp ?? 0 }
  return { item: true, gp: 0 }
}

/** Where a treasure stands: found, placed (in a location or encounter), or only planned. */
export type TreasureStage = 'found' | 'placed' | 'planned'
export const treasureStage = (t: Treasure, placed: boolean): TreasureStage => t.found ? 'found' : placed ? 'placed' : 'planned'

export interface StageTally { found: number; placed: number; planned: number }
export interface TreasureTally { items: StageTally; gp: StageTally }

/** Items and gp of a level's treasures by stage. `placed` says whether a treasure's location or encounter exists. */
export function tallyTreasure(treasures: Treasure[], itemFacts: (t: Treasure) => ItemFacts | null | undefined, placed: (t: Treasure) => boolean): TreasureTally {
  const tally: TreasureTally = { items: { found: 0, placed: 0, planned: 0 }, gp: { found: 0, placed: 0, planned: 0 } }
  for (const t of treasures) {
    const share = treasureShare(t, itemFacts(t))
    const stage = treasureStage(t, placed(t))
    if (share.item) tally.items[stage]++
    tally.gp[stage] += share.gp
  }
  return tally
}

export const stageTotal = (s: StageTally) => s.found + s.placed + s.planned

/** The gp value of a permanent magic item of a level (PHB p. 223, RC p. 278). */
export const itemValue = (level: number) => MAGIC_ITEM_VALUE[clampLevel(level)]
