// DMG math bands for monsters: attack bonus, AC, other defenses, HP, damage
// and XP against the creature-builder benchmarks (src/common/rules/benchmarks.ts)
// and the kit's monsterXp. Outliers are flagged for review, never rejected:
// published monsters deviate on purpose often enough.

import { monsterXp, type Item, type Monster } from '@kit'
import * as bench from '../rules/benchmarks'
import { MAGIC_ITEM_VALUE, enhancementForLevel, hasEnhancement, priceFollowsTable } from '../rules/items'

export interface Flag {
  rule: 'xp' | 'hp' | 'initiative' | 'ac' | 'defense' | 'attack' | 'damage' | 'unknown' | 'price' | 'enhancement'
  path: string
  message: string
}

/** Tolerances: how far a value may sit from the benchmark before it is flagged. */
export const TOLERANCE = {
  attack: 3,
  ac: 3,
  /** Published monsters match the formula about 93% of the time; the rest sit within 2. */
  initiative: 2,
  defense: 4,
  /** HP within this fraction of the benchmark. */
  hp: 0.3,
  /** Damage average between low x min and limited-high x max. */
  damageMin: 0.6,
  damageMax: 1.25,
}

/** Average of "2d6+5" / "3d8 + 10" / "15"; undefined for anything else. */
export function diceAverage(expr: string): number | undefined {
  const m = expr.replace(/\s+/g, '').match(/^(?:(\d+)d(\d+))?([+-]\d+)?$|^(\d+)$/)
  if (!m) return undefined
  if (m[4]) return parseInt(m[4])
  if (!m[1] && !m[3]) return undefined
  const dice = m[1] ? parseInt(m[1]) * (parseInt(m[2]) + 1) / 2 : 0
  return dice + (m[3] ? parseInt(m[3]) : 0)
}

export function checkMonsterBands(m: Monster, recipe?: { hpMultiplier?: number }): Flag[] {
  const flags: Flag[] = []
  // The creature-builder benchmarks stop at level 30; the XP table goes to 40.
  const level = Math.min(Math.max(m.level, 1), 30)

  const xp = monsterXp(m.level, m.rank)
  // Companion and NPC blocks with a class role print no XP.
  if (m.xp !== xp && !(m.classRole && m.xp === 0)) flags.push({ rule: 'xp', path: '$.xp', message: `XP ${m.xp}, expected ${xp} for level ${m.level} ${m.rank}` })

  if (m.rank === 'minion') {
    if (m.hp !== 1) flags.push({ rule: 'hp', path: '$.hp', message: `minion HP ${m.hp}, expected 1` })
  } else if (m.role) {
    // A recorded multiplier (insubstantial creatures commonly use about 0.7) moves the benchmark, not the tolerance.
    const multiplier = recipe?.hpMultiplier && recipe.hpMultiplier > 0 ? recipe.hpMultiplier : 1
    const expected = Math.round(bench.monsterHp(level, m.role, m.rank, m.abilities?.con) * multiplier)
    if (Math.abs(m.hp - expected) > expected * TOLERANCE.hp) {
      const basis = `level ${level} ${m.role} ${m.rank}, Con ${m.abilities?.con ?? 14}${multiplier !== 1 ? `, ×${+multiplier.toFixed(2)} recipe` : ''}`
      flags.push({ rule: 'hp', path: '$.hp', message: `HP ${m.hp}, benchmark ${expected} (${basis}, ±${TOLERANCE.hp * 100}%)` })
    }
  }

  if (m.role && m.abilities?.dex != null) {
    const init = bench.initiativeFor(level, m.role, m.abilities.dex)
    if (Math.abs(m.initiative - init) > TOLERANCE.initiative) {
      flags.push({ rule: 'initiative', path: '$.initiative', message: `initiative +${m.initiative}, benchmark +${init} (Dex modifier with half level, plus the ${m.role} bonus; ±${TOLERANCE.initiative})` })
    }
  }

  if (m.role) {
    const ac = bench.ac[level][m.role]
    if (Math.abs(m.defenses.ac - ac) > TOLERANCE.ac) flags.push({ rule: 'ac', path: '$.defenses.ac', message: `AC ${m.defenses.ac}, benchmark ${ac} (±${TOLERANCE.ac})` })
  }
  for (const d of ['fortitude', 'reflex', 'will'] as const) {
    const expected = level + 12
    if (Math.abs(m.defenses[d] - expected) > TOLERANCE.defense) {
      flags.push({ rule: 'defense', path: `$.defenses.${d}`, message: `${d} ${m.defenses[d]}, benchmark ${expected} (level + 12, ±${TOLERANCE.defense})` })
    }
  }

  const normal = bench.normalDamageDice[level]
  const limited = bench.limitedDamageDice[level]
  const low = diceAverage(normal.low)! * TOLERANCE.damageMin
  const high = diceAverage(limited.high)! * TOLERANCE.damageMax
  m.powers.forEach((p, pi) => p.attacks.forEach((a, ai) => {
    const path = `$.powers[${pi}].attacks[${ai}]`
    if (a.bonus.kind === 'fixed' && m.role && a.vs !== 'unknown') {
      const expected = a.vs === 'ac' ? bench.attackVsAC[level][m.role] : bench.attackVsOther[level][m.role]
      if (Math.abs(a.bonus.value - expected) > TOLERANCE.attack) {
        flags.push({ rule: 'attack', path: `${path}.bonus`, message: `${p.name}: +${a.bonus.value} vs ${a.vs}, benchmark +${expected} (±${TOLERANCE.attack})` })
      }
    }
    // Minions deal fixed damage on a separate scale; secondary attacks are often small riders.
    if (m.rank === 'minion' || a.label !== 'primary') return
    // The hit's unconditional damage on a hit: every plain part ("1d6 + 4 plus 1d8 fire"), not
    // conditional, extra, critical, lingering or per-turn parts (riders a band does not cover).
    const parts = (a.hit?.clauses ?? []).filter(c => c.kind === 'damage' && c.dice && !c.if && !c.unless && !c.extra && !c.critical && !c.by
      && (!c.duration || c.duration.kind === 'instant'))
    const avgs = parts.map(c => c.kind === 'damage' ? diceAverage(c.dice ?? '') : undefined)
    if (parts.length === 0 || avgs.some(x => x === undefined)) return
    const avg = avgs.reduce((s, x) => s! + x!, 0)!
    const dice = parts.map(c => c.kind === 'damage' ? c.dice : '').join(' + ')
    if (avg < low || avg > high) {
      flags.push({ rule: 'damage', path: `${path}.hit`, message: `${p.name}: ${dice} (avg ${avg}) outside ${low.toFixed(1)}-${high.toFixed(1)} for level ${level}` })
    }
  }))
  return flags
}

/**
 * Fields set to 'unknown' because the print gives no value (Attack.vs,
 * Power.usage), in any entry kind: flagged so they land in review. Trap
 * powers almost never print a usage, so theirs is not flagged.
 */
export function checkUnknowns(entry: unknown, kind?: string): Flag[] {
  const flags: Flag[] = []
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return }
    if (typeof v !== 'object' || v === null) return
    const o = v as Record<string, unknown>
    if (o.vs === 'unknown' && 'bonus' in o) flags.push({ rule: 'unknown', path: `${path}.vs`, message: 'attack defense not printed (vs "unknown")' })
    if (o.usage === 'unknown' && Array.isArray(o.attacks) && kind !== 'traps') flags.push({ rule: 'unknown', path: `${path}.usage`, message: `${String(o.name)}: usage not printed ("unknown")` })
    for (const [k, x] of Object.entries(o)) if (k !== 'provenance') walk(x, `${path}.${k}`)
  }
  walk(entry, '$')
  return flags
}

/**
 * Item price and enhancement against the item tables (src/common/rules/items.ts). Published
 * items match them exactly (all but a few misprints), so any difference is flagged for review.
 */
export function checkItemBands(item: Item): Flag[] {
  const flags: Flag[] = []
  const priced = priceFollowsTable(item)
  item.levels.forEach((l, i) => {
    const path = `$.levels[${i}]`
    if (priced && typeof l.price === 'number' && MAGIC_ITEM_VALUE[l.level] !== undefined && l.price !== MAGIC_ITEM_VALUE[l.level]) {
      flags.push({ rule: 'price', path: `${path}.price`, message: `level ${l.level}: ${l.price} gp, table value ${MAGIC_ITEM_VALUE[l.level]} gp (PHB p. 223, RC p. 278)` })
    }
    if (l.enhancement !== undefined && l.enhancement !== enhancementForLevel(l.level)) {
      flags.push({ rule: 'enhancement', path: `${path}.enhancement`, message: `level ${l.level}: +${l.enhancement}, expected +${enhancementForLevel(l.level)} (PHB p. 225)` })
    } else if (l.enhancement === undefined && hasEnhancement(item.category, item.slot) && item.category !== 'item' && priced) {
      flags.push({ rule: 'enhancement', path: `${path}.enhancement`, message: `level ${l.level}: a magic ${item.category} normally has +${enhancementForLevel(l.level)} (PHB p. 225)` })
    }
  })
  return flags
}
