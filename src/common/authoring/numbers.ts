import type { Monster } from '@kit'
import type { Change, Draft, NumberRecipe } from './types'
import { benchmarks } from './core'
import { overlaps } from './patch'

/** Numeric choices are explicit house authoring conventions, never automatic balance trades. */
export function suggestNumbers(d: Pick<Draft, 'kind' | 'revision' | 'content' | 'nodes' | 'overrides' | 'recipe'>, recipe: NumberRecipe = d.recipe ?? {}) {
  if (d.kind !== 'monster') throw new Error('Monster number bands do not apply to items, traps, or diseases')
  const m = d.content as Monster
  if (!m.role) throw new Error('Choose a role first')
  const b = benchmarks(m.level, m.role, m.rank, m.abilities)
  const number = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Recipe adjustments must be finite numbers')
    return value
  }
  const multiplier = number(recipe.hpMultiplier, 1)
  if (multiplier <= 0) throw new Error('HP multiplier must be positive')
  const changes: Change[] = [], protectedFields: string[] = []
  const propose = (path: string, value: unknown) => {
    if (d.overrides.some(p => overlaps(p, path))) protectedFields.push(path)
    else changes.push({ path, value })
  }
  propose('/content/hp', m.rank === 'minion' ? 1 : Math.max(1, Math.round(b.hp * multiplier)))
  propose('/content/xp', b.xp)
  propose('/content/savingThrowBonus', b.savingThrowBonus)
  propose('/content/actionPoints', b.actionPoints)
  propose('/content/initiative', b.initiative + number(recipe.initiativeOffset, 0))
  for (const defense of ['ac', 'fortitude', 'reflex', 'will'] as const) propose(`/content/defenses/${defense}`, (defense === 'ac' ? b.ac : b.otherDefense) + number(recipe.defenseOffsets?.[defense], 0))
  if (recipe.speed !== undefined) propose('/content/speed/walk', number(recipe.speed, 6))
  const damageGuidance: { target: string; dice?: string; note: string }[] = []
  for (const [node, choice] of Object.entries(recipe.powers ?? {})) {
    const index = d.nodes.powers.indexOf(node)
    if (index < 0) throw new Error(`Power no longer exists: ${node}`)
    m.powers[index].attacks.forEach((attack, i) => {
      const target = `/content/powers/@${node}/attacks/${i}`
      if (attack.vs === 'any') throw new Error('Choose a specific defense before calculating accuracy')
      propose(`${target}/bonus`, { kind: 'fixed', value: (attack.vs === 'ac' ? b.attackVsAC : b.attackVsOther) + number(choice.accuracy, 0) })
      if (choice.damageBand) {
        if (!['low', 'medium', 'high'].includes(choice.damageBand)) throw new Error('Unknown damage band')
        damageGuidance.push(m.rank === 'minion'
          ? { target, dice: String(b.minionDamage![m.role === 'brute' ? 'brute' : 'standard']), note: 'Minions deal flat damage (DMG2 p. 133), whatever the band; artillery minions deal 25% less on multitarget and melee attacks.' }
          : { target, dice: (choice.limited ? b.limitedDamage : b.normalDamage)[choice.damageBand], note: 'Rewrite hit prose and damage clauses together; riders and multiple attacks need a separate balance review.' })
      }
    })
  }
  return { policy: b.policy, revision: d.revision, recipe, changes, protectedFields, damageGuidance, assumptions: b.assumptions }
}
