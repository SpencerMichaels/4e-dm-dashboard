// DMG math bands for monsters: attack bonus, AC, other defenses, HP, damage
// and XP against the creature-builder benchmarks (src/common/rules/benchmarks.ts)
// and the kit's monsterXp. Outliers are flagged for review, never rejected:
// published monsters deviate on purpose often enough.

import { monsterXp, type Monster } from '@kit'
import * as bench from '../../../src/common/rules/benchmarks'

export interface Flag {
  rule: 'xp' | 'hp' | 'ac' | 'defense' | 'attack' | 'damage' | 'unknown'
  path: string
  message: string
}

/** Tolerances: how far a value may sit from the benchmark before it is flagged. */
export const TOLERANCE = {
  attack: 3,
  ac: 3,
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

const HP_RANK: Record<string, number> = { standard: 1, elite: 2, solo: 4 }

export function checkMonsterBands(m: Monster): Flag[] {
  const flags: Flag[] = []
  // The creature-builder benchmarks stop at level 30; the XP table goes to 40.
  const level = Math.min(Math.max(m.level, 1), 30)

  const xp = monsterXp(m.level, m.rank)
  if (m.xp !== xp) flags.push({ rule: 'xp', path: '$.xp', message: `XP ${m.xp}, expected ${xp} for level ${m.level} ${m.rank}` })

  if (m.rank === 'minion') {
    if (m.hp !== 1) flags.push({ rule: 'hp', path: '$.hp', message: `minion HP ${m.hp}, expected 1` })
  } else if (m.role) {
    const expected = bench.hp[level][m.role] * HP_RANK[m.rank]
    if (Math.abs(m.hp - expected) > expected * TOLERANCE.hp) {
      flags.push({ rule: 'hp', path: '$.hp', message: `HP ${m.hp}, benchmark ${expected} (level ${level} ${m.role} ${m.rank}, ±${TOLERANCE.hp * 100}%)` })
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
    const dmg = a.hit?.clauses.find(c => c.kind === 'damage')
    if (!dmg || dmg.kind !== 'damage') return
    const avg = diceAverage(dmg.dice)
    if (avg === undefined) return
    if (avg < low || avg > high) {
      flags.push({ rule: 'damage', path: `${path}.hit`, message: `${p.name}: ${dmg.dice} (avg ${avg}) outside ${low.toFixed(1)}-${high.toFixed(1)} for level ${level}` })
    }
  }))
  return flags
}

/**
 * Fields set to 'unknown' because the print gives no value (Attack.vs,
 * Power.usage), in any entry kind: flagged so they land in review.
 */
export function checkUnknowns(entry: unknown): Flag[] {
  const flags: Flag[] = []
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return }
    if (typeof v !== 'object' || v === null) return
    const o = v as Record<string, unknown>
    if (o.vs === 'unknown' && 'bonus' in o) flags.push({ rule: 'unknown', path: `${path}.vs`, message: 'attack defense not printed (vs "unknown")' })
    if (o.usage === 'unknown' && Array.isArray(o.attacks)) flags.push({ rule: 'unknown', path: `${path}.usage`, message: `${String(o.name)}: usage not printed ("unknown")` })
    for (const [k, x] of Object.entries(o)) if (k !== 'provenance') walk(x, `${path}.${k}`)
  }
  walk(entry, '$')
  return flags
}
