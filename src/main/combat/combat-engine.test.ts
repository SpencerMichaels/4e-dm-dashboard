import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppliedCondition, CombatantState } from '@common/types'

// The 4e plugin pulls in its compendium module, which imports Electron.
vi.mock('electron', () => ({ app: { getAppPath: () => '' } }))

type Engine = typeof import('./combat-engine')
type Plugin = typeof import('../../../plugins/dnd-4e/index').default

let E: Engine
let P: Plugin

// The engine keeps module-level state (combat + queued save results), so each
// test gets a fresh module instance.
beforeEach(async () => {
  vi.resetModules()
  E = await import('./combat-engine')
  P = (await import('../../../plugins/dnd-4e/index')).default
})

type CombatantInput = Parameters<Engine['addCombatant']>[0]

function monster(id: string, overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id, name: id, isPC: false, hp: 40, maxHp: 40, usedActionPoints: 0, ...overrides }
}

function pc(id: string, overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id, name: id, isPC: true, hp: 30, maxHp: 30, usedActionPoints: 0, ...overrides }
}

/** Start combat with combatants acting in the given order (first acts first). */
function start(...combatants: CombatantInput[]) {
  E.initCombat()
  combatants.forEach((c, i) => {
    E.addCombatant(c)
    E.setInitiative(c.id, 100 - i)
  })
  return E.startCombat()
}

function get(id: string): CombatantState {
  return E.getCombatState()!.combatants[id]
}

function currentId(): string {
  const s = E.getCombatState()!
  return s.initiativeOrder[s.turnIndex]
}

function condIds(id: string): string[] {
  return get(id).conditions.map(c => c.conditionId)
}

function cond(conditionId: string, extra: Partial<AppliedCondition> = {}): AppliedCondition {
  return { conditionId, duration: { type: 'indefinite' }, ...extra }
}

/** End the current turn, resolving every stepper item with the given outcome. */
function endTurnResolving(success: boolean) {
  E.endTurn(P)
  const s = E.getCombatState()!
  while (s.turnPhase === 'end-of-turn') E.resolveItem(s.stepperIndex, success, P)
  if (s.turnPhase === 'end-of-turn-done') E.commitAndAdvance(P)
}

describe('initiative and turn order', () => {
  it('sorts by initiative, highest first', () => {
    E.initCombat()
    E.addCombatant(monster('a'))
    E.addCombatant(monster('b'))
    E.addCombatant(monster('c'))
    E.setInitiative('a', 5)
    E.setInitiative('b', 20)
    E.setInitiative('c', 12)
    expect(E.getCombatState()!.initiativeOrder).toEqual(['b', 'c', 'a'])
  })

  it('starts at round 1 with the first combatant active', () => {
    const s = start(monster('a'), monster('b'))
    expect(s.round).toBe(1)
    expect(currentId()).toBe('a')
  })

  it('advances turns and increments the round after the last combatant', () => {
    start(monster('a'), monster('b'))
    E.endTurn(P)
    expect(currentId()).toBe('b')
    E.endTurn(P)
    expect(currentId()).toBe('a')
    expect(E.getCombatState()!.round).toBe(2)
  })

  it('skips monsters at 0 HP but not PCs at 0 HP', () => {
    start(monster('a'), monster('dead', { hp: 0 }), pc('down', { hp: 0 }))
    E.endTurn(P)
    expect(currentId()).toBe('down')
  })

  it('delay removes a combatant from the order; undelay reinserts it before a target', () => {
    start(monster('a'), monster('b'), monster('c'))
    E.delayCombatant('a')
    expect(E.getCombatState()!.initiativeOrder).toEqual(['b', 'c'])
    expect(currentId()).toBe('b')
    E.undelayCombatant('a', 'c')
    expect(E.getCombatState()!.initiativeOrder).toEqual(['b', 'a', 'c'])
    expect(currentId()).toBe('a')
  })
})

describe('surprise round', () => {
  it('surprised combatants skip round 0 and lose Surprised at round 1', () => {
    E.initCombat()
    E.addCombatant(monster('ambusher'))
    E.addCombatant(pc('victim'))
    E.setInitiative('victim', 20)
    E.setInitiative('ambusher', 10)
    E.setSurprise(true, ['ambusher'])
    const s = E.startCombat()
    expect(s.round).toBe(0)
    expect(currentId()).toBe('ambusher')
    expect(condIds('victim')).toEqual(expect.arrayContaining(['surprised', 'combat-advantage']))

    E.endTurn(P)
    expect(s.round).toBe(1)
    expect(currentId()).toBe('victim')
    expect(condIds('victim')).not.toContain('surprised')
    expect(condIds('victim')).not.toContain('combat-advantage')
  })
})

describe('turn-bound durations', () => {
  it('EONT condition expires at the end of the carrier\'s own turn', () => {
    start(monster('a'), monster('b'))
    E.addCondition('a', cond('dazed', { duration: { type: 'eont' } }), P)
    E.endTurn(P)
    expect(condIds('a')).not.toContain('dazed')
  })

  it('EONT condition pinned to its source expires at the end of the source\'s turn', () => {
    start(monster('a'), monster('b'), monster('c'))
    // a dazes c until the end of a's next turn
    E.addCondition('c', cond('dazed', { sourceId: 'a', duration: { type: 'eont', expiresOnId: 'a' } }), P)
    E.endTurn(P) // a ends -> expires now (applied during a's turn)
    expect(condIds('c')).not.toContain('dazed')
  })

  it('EONT condition pinned to another source survives the carrier\'s own turn', () => {
    start(monster('a'), monster('b'), monster('c'))
    E.addCondition('b', cond('slowed', { sourceId: 'c', duration: { type: 'eont', expiresOnId: 'c' } }), P)
    E.endTurn(P) // a
    E.endTurn(P) // b (carrier) — still slowed
    expect(condIds('b')).toContain('slowed')
    E.endTurn(P) // c (source)
    expect(condIds('b')).not.toContain('slowed')
  })

  it('SONT condition expires at the start of the carrier\'s turn', () => {
    start(monster('a'), monster('b'))
    E.addCondition('b', cond('weakened', { duration: { type: 'sont' } }), P)
    expect(condIds('b')).toContain('weakened')
    E.endTurn(P) // b's turn starts
    expect(condIds('b')).not.toContain('weakened')
    expect(E.getCombatState()!.turnItems.some(i => i.kind === 'sont-expire')).toBe(true)
  })
})

describe('saving throws', () => {
  it('save-ends condition prompts a save; success removes it on commit', () => {
    start(monster('a'), monster('b'))
    E.addCondition('a', cond('stunned', { duration: { type: 'save-ends' } }), P)
    E.endTurn(P)
    const s = E.getCombatState()!
    expect(s.turnPhase).toBe('end-of-turn')
    const save = s.turnItems[s.stepperIndex]
    expect(save.kind).toBe('save')
    expect(save.label).toBe('Save vs Stunned')

    E.resolveItem(s.stepperIndex, true, P)
    expect(s.turnPhase).toBe('end-of-turn-done')
    expect(condIds('a')).toContain('stunned') // queued until commit
    E.commitAndAdvance(P)
    expect(condIds('a')).not.toContain('stunned')
    expect(currentId()).toBe('b')
  })

  it('failed save keeps the condition', () => {
    start(monster('a'), monster('b'))
    E.addCondition('a', cond('stunned', { duration: { type: 'save-ends' } }), P)
    endTurnResolving(false)
    expect(condIds('a')).toContain('stunned')
  })

  it('includes the stat block saving throw bonus in the label', () => {
    start(monster('a', { statBlock: { savingThrowBonus: 2 } }), monster('b'))
    E.addCondition('a', cond('slowed', { duration: { type: 'save-ends' } }), P)
    E.endTurn(P)
    const s = E.getCombatState()!
    expect(s.turnItems[s.stepperIndex].label).toBe('Save +2 vs Slowed')
  })

  it('conditions sharing a save group get one save that removes all of them', () => {
    start(monster('a'), monster('b'))
    E.addCondition('a', cond('dazed', { saveGroup: 'g1', duration: { type: 'save-ends' } }), P)
    E.addCondition('a', cond('weakened', { saveGroup: 'g1', duration: { type: 'save-ends' } }), P)
    E.endTurn(P)
    const saves = E.getCombatState()!.turnItems.filter(i => i.kind === 'save')
    expect(saves).toHaveLength(1)
    expect(saves[0].label).toBe('Save vs Dazed and Weakened')
    E.resolveItem(E.getCombatState()!.stepperIndex, true, P)
    E.commitAndAdvance(P)
    expect(condIds('a')).not.toContain('dazed')
    expect(condIds('a')).not.toContain('weakened')
  })

  it('previews end-of-turn saves while the turn is active', () => {
    start(monster('a'), monster('b'))
    E.addCondition('a', cond('immobilized', { duration: { type: 'save-ends' } }), P)
    E.refreshEndOfTurnPreview(P)
    const preview = E.getCombatState()!.turnItems.filter(i => i.phase === 'end')
    expect(preview.map(i => i.label)).toEqual(['Save vs Immobilized'])
  })
})

describe('ongoing damage', () => {
  function ongoing(value: number, type: string, duration: AppliedCondition['duration'] = { type: 'save-ends' }) {
    return cond('ongoing-damage', { value, customDescription: type, duration })
  }

  it('gets a unique id and ticks at the start of the carrier\'s turn', () => {
    start(monster('a'), monster('b'))
    E.addCondition('b', ongoing(5, 'fire'), P)
    expect(condIds('b')[0]).toMatch(/^ongoing-damage-/)

    E.endTurn(P) // b's turn starts
    const s = E.getCombatState()!
    expect(s.turnPhase).toBe('start-of-turn')
    const tick = s.turnItems[s.stepperIndex]
    expect(tick.kind).toBe('ongoing-damage')
    expect(tick.label).toBe('Take 5 ongoing fire damage')
    E.resolveItem(s.stepperIndex, true, P)
    expect(get('b').hp).toBe(35)
  })

  it('applies resistance, vulnerability, and immunity', () => {
    const cases: [Record<string, unknown>, number, string][] = [
      [{ resistances: [{ type: 'fire', value: 3 }] }, 2, ' (resist 3)'],
      [{ weaknesses: [{ type: 'fire', value: 5 }] }, 10, ' (vulnerable 5)'],
      [{ immunities: [{ type: 'fire' }] }, 0, ' (immune)'],
    ]
    for (const [statBlock, expected, note] of cases) {
      start(monster('a'), monster('b', { statBlock }))
      E.addCondition('b', ongoing(5, 'fire'), P)
      E.endTurn(P)
      const items = E.getCombatState()!.turnItems.filter(i => i.kind === 'ongoing-damage')
      expect(items[0].value).toBe(expected)
      expect(items[0].label).toBe(`Take ${expected} ongoing fire damage${note}`)
    }
  })

  it('prompts a save against save-ends ongoing damage', () => {
    start(monster('a'), monster('b'))
    E.addCondition('a', ongoing(5, 'poison'), P)
    E.endTurn(P)
    const s = E.getCombatState()!
    expect(s.turnItems[s.stepperIndex].label).toBe('Save vs ongoing 5 poison damage')
  })
})

describe('regeneration', () => {
  it('heals automatically at the start of turn when below max HP', () => {
    start(monster('a'), monster('troll', { hp: 20, statBlock: { regeneration: { value: 10 } } }))
    E.endTurn(P)
    expect(get('troll').hp).toBe(30)
    expect(condIds('troll')).toContain('regenerating')
  })

  it('does nothing at max HP', () => {
    start(monster('a'), monster('troll', { statBlock: { regeneration: { value: 10 } } }))
    E.endTurn(P)
    expect(get('troll').hp).toBe(40)
    expect(condIds('troll')).not.toContain('regenerating')
  })

  it('is suppressed for one turn after taking an inhibiting damage type', () => {
    start(monster('a'), monster('troll', { statBlock: { regeneration: { value: 10, inhibitDamageTypes: ['fire'] } } }))
    E.damageCombatant('troll', 15, true, { damageType: 'fire' })
    E.endTurn(P)
    expect(get('troll').hp).toBe(25)
    E.endTurn(P) // troll's turn ends
    E.endTurn(P) // a ends -> troll starts again, regen works
    expect(get('troll').hp).toBe(35)
  })

  it('nets against ongoing damage', () => {
    start(monster('a'), monster('troll', { hp: 20, statBlock: { regeneration: { value: 10 } } }))
    E.addCondition('troll', cond('ongoing-damage', { value: 4, customDescription: 'acid', duration: { type: 'save-ends' } }), P)
    E.endTurn(P)
    expect(get('troll').hp).toBe(26)
    const item = E.getCombatState()!.turnItems.find(i => i.id === 'regen-net')
    expect(item?.label).toBe('Regeneration 10 − 4 ongoing = heal 6')
  })

  it('revives a creature with both regeneration and revival at 0 HP', () => {
    start(monster('a'), monster('troll', { hp: 0, statBlock: { regeneration: { value: 10 }, revival: { hp: 10, abilityName: 'Troll Healing' } } }))
    E.endTurn(P)
    expect(currentId()).toBe('troll')
    expect(get('troll').hp).toBe(10)
  })
})

describe('recharge powers', () => {
  const statBlock = { actions: [{ name: 'Fire Breath', usage: 'recharge', rechargeCondition: '5' }] }

  it('prompts a recharge roll at the start of turn for a used recharge power', () => {
    start(monster('dragon', { statBlock }), monster('b'))
    E.usePower('dragon', 0)
    E.endTurn(P) // dragon ends
    E.endTurn(P) // b ends -> dragon starts
    const s = E.getCombatState()!
    expect(s.turnPhase).toBe('start-of-turn')
    const item = s.turnItems[s.stepperIndex]
    expect(item.kind).toBe('recharge')
    expect(item.label).toBe('Recharge Fire Breath (5+)')
    expect(item.dc).toBe(5)
  })

  it('a successful recharge frees the power; a failed one keeps it used', () => {
    for (const success of [true, false]) {
      start(monster('dragon', { statBlock }), monster('b'))
      E.usePower('dragon', 0)
      E.endTurn(P)
      E.endTurn(P)
      E.resolveItem(E.getCombatState()!.stepperIndex, success, P)
      E.finishStartOfTurn(P)
      expect(get('dragon').usedPowers[0]).toBe(success ? undefined : 1)
    }
  })
})

describe('dying and death saves', () => {
  it('dying applies unconscious and prone', () => {
    start(pc('hero'), monster('b'))
    E.addCondition('hero', cond('dying'), P)
    expect(condIds('hero')).toEqual(expect.arrayContaining(['dying', 'unconscious', 'prone']))
  })

  it('three failed death saves kill the PC', () => {
    start(pc('hero'), monster('b'))
    E.addCondition('hero', cond('dying'), P)
    for (let i = 0; i < 3; i++) {
      E.endTurn(P)
      const s = E.getCombatState()!
      expect(s.turnItems[s.stepperIndex].kind).toBe('death-save')
      E.resolveDeathSave(s.stepperIndex, 'fail')
      E.commitAndAdvance(P)
      E.endTurn(P) // b
    }
    expect(get('hero').dead).toBe(true)
    expect(get('hero').deathSaveFailures).toBe(3)
  })

  it('a successful death save removes dying and unconscious but leaves prone', () => {
    start(pc('hero'), monster('b'))
    E.addCondition('hero', cond('dying'), P)
    E.endTurn(P)
    E.resolveDeathSave(E.getCombatState()!.stepperIndex, 'success')
    E.commitAndAdvance(P)
    expect(condIds('hero')).not.toContain('dying')
    expect(condIds('hero')).not.toContain('unconscious')
    expect(condIds('hero')).toContain('prone')
  })
})

describe('damage and healing', () => {
  it('temporary HP absorbs damage first', () => {
    start(pc('hero', { tempHp: 5 }))
    E.damageCombatant('hero', 8)
    expect(get('hero').tempHp).toBe(0)
    expect(get('hero').hp).toBe(27)
  })

  it('monsters become bloodied at half HP and lose it when healed above', () => {
    start(monster('m'))
    E.damageCombatant('m', 20)
    expect(condIds('m')).toContain('bloodied')
    E.healCombatant('m', 1)
    expect(condIds('m')).not.toContain('bloodied')
  })

  it('PCs are never auto-bloodied', () => {
    start(pc('hero'))
    E.damageCombatant('hero', 20)
    expect(condIds('hero')).not.toContain('bloodied')
  })

  it('minions take no damage on a miss', () => {
    start(monster('minion', { hp: 1, maxHp: 1, statBlock: { isMinion: true } }))
    E.damageCombatant('minion', 5, false)
    expect(get('minion').hp).toBe(1)
  })

  it('healing cannot exceed max HP', () => {
    start(pc('hero', { hp: 25 }))
    E.healCombatant('hero', 100)
    expect(get('hero').hp).toBe(30)
  })
})

describe('linked conditions', () => {
  it('grabbed implies immobilized; removing grabbed removes only the implied one', () => {
    start(monster('a'), monster('b'))
    E.addCondition('b', cond('grabbed'), P)
    expect(condIds('b')).toEqual(['grabbed', 'immobilized'])
    E.removeCondition('b', 'grabbed')
    expect(condIds('b')).toEqual([])

    E.addCondition('b', cond('immobilized'), P)
    E.addCondition('b', cond('grabbed'), P)
    E.removeCondition('b', 'grabbed')
    expect(condIds('b')).toEqual(['immobilized'])
  })
})

describe('player-visible state', () => {
  it('omits hidden creatures, hides monsters during initiative entry, and uses HP descriptors', () => {
    E.initCombat()
    E.addCombatant(pc('hero'))
    E.addCombatant(monster('m', { hp: 15 }))
    E.addCombatant(monster('lurker', { hidden: true }))
    for (const id of ['hero', 'm', 'lurker']) E.setInitiative(id, 10)

    let view = E.toPlayerCombatState(E.getCombatState()!, P)
    expect(Object.keys(view.combatants)).toEqual(['hero'])

    E.startCombat()
    view = E.toPlayerCombatState(E.getCombatState()!, P)
    expect(Object.keys(view.combatants).sort()).toEqual(['hero', 'm'])
    expect(view.combatants.m.hpDescriptor).toBe('Bloodied')
    expect(view.combatants.hero.hpDescriptor).toBe('')
  })
})
