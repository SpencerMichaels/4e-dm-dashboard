import type { CombatState, CombatantState, CombatPhase, AppliedEffect, PlayerCombatState, PlayerCombatantState } from '@common/types'
import type { AppliedCondition, SystemPlugin } from '@common/types'
import { generateId } from '@common/utils/id'
import { resolveHpDescriptor } from '@common/utils/hp'

let combatState: CombatState | null = null

export function getCombatState(): CombatState | null {
  return combatState
}

export function startCombat(encounterId?: string): CombatState {
  combatState = {
    encounterId,
    round: 0,
    phase: 'initiative-entry',
    turnIndex: 0,
    initiativeOrder: [],
    combatants: {},
    delayedIds: [],
  }
  return combatState
}

export function addCombatant(combatant: Omit<CombatantState, 'conditions' | 'effects' | 'tempHp'> & { tempHp?: number }): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.combatants[combatant.id] = {
    ...combatant,
    tempHp: combatant.tempHp ?? 0,
    conditions: [],
    effects: [],
  }
  return combatState
}

export function removeCombatant(combatantId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  delete combatState.combatants[combatantId]
  combatState.initiativeOrder = combatState.initiativeOrder.filter(id => id !== combatantId)
  combatState.delayedIds = combatState.delayedIds.filter(id => id !== combatantId)
  return combatState
}

export function setInitiative(combatantId: string, initiative: number): CombatState {
  if (!combatState) throw new Error('No active combat')
  const combatant = combatState.combatants[combatantId]
  if (!combatant) throw new Error(`Combatant ${combatantId} not found`)
  combatant.initiative = initiative

  // Re-sort initiative order (descending)
  const allIds = Object.keys(combatState.combatants)
  const withInit = allIds.filter(id => combatState!.combatants[id].initiative != null)
  withInit.sort((a, b) => (combatState!.combatants[b].initiative ?? 0) - (combatState!.combatants[a].initiative ?? 0))
  combatState.initiativeOrder = withInit

  return combatState
}

export function beginCombat(): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.phase = 'active'
  combatState.round = 1
  combatState.turnIndex = 0
  return combatState
}

export function nextTurn(plugin?: SystemPlugin): { state: CombatState; turnActions: unknown[] } {
  if (!combatState || combatState.phase !== 'active') throw new Error('Combat not active')

  const actions: unknown[] = []

  // End-of-turn hooks for current combatant
  const currentId = combatState.initiativeOrder[combatState.turnIndex]
  if (currentId && plugin?.turnHooks?.onTurnEnd) {
    const combatant = combatState.combatants[currentId]
    if (combatant) {
      actions.push(...plugin.turnHooks.onTurnEnd(currentId, combatant.conditions))
    }
  }

  // Advance
  combatState.turnIndex++

  // Skip delayed combatants
  while (
    combatState.turnIndex < combatState.initiativeOrder.length &&
    combatState.delayedIds.includes(combatState.initiativeOrder[combatState.turnIndex])
  ) {
    combatState.turnIndex++
  }

  // New round
  if (combatState.turnIndex >= combatState.initiativeOrder.length) {
    combatState.round++
    combatState.turnIndex = 0

    // Decrement round-based effects
    decrementRoundEffects()

    // Skip delayed at start of round too
    while (
      combatState.turnIndex < combatState.initiativeOrder.length &&
      combatState.delayedIds.includes(combatState.initiativeOrder[combatState.turnIndex])
    ) {
      combatState.turnIndex++
    }
  }

  // Start-of-turn hooks for new combatant
  const newCurrentId = combatState.initiativeOrder[combatState.turnIndex]
  if (newCurrentId && plugin?.turnHooks?.onTurnStart) {
    const combatant = combatState.combatants[newCurrentId]
    if (combatant) {
      actions.push(...plugin.turnHooks.onTurnStart(newCurrentId, combatant.conditions))
    }
  }

  return { state: combatState, turnActions: actions }
}

export function prevTurn(): CombatState {
  if (!combatState || combatState.phase !== 'active') throw new Error('Combat not active')

  combatState.turnIndex--

  // Skip delayed
  while (
    combatState.turnIndex >= 0 &&
    combatState.delayedIds.includes(combatState.initiativeOrder[combatState.turnIndex])
  ) {
    combatState.turnIndex--
  }

  if (combatState.turnIndex < 0) {
    if (combatState.round > 1) {
      combatState.round--
      combatState.turnIndex = combatState.initiativeOrder.length - 1
      while (
        combatState.turnIndex >= 0 &&
        combatState.delayedIds.includes(combatState.initiativeOrder[combatState.turnIndex])
      ) {
        combatState.turnIndex--
      }
    } else {
      combatState.turnIndex = 0
    }
  }

  return combatState
}

export function delayCombatant(combatantId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  if (!combatState.delayedIds.includes(combatantId)) {
    combatState.delayedIds.push(combatantId)
  }
  // If delaying the current combatant, advance turn
  const currentId = combatState.initiativeOrder[combatState.turnIndex]
  if (currentId === combatantId) {
    // Simple advance without hooks
    combatState.turnIndex++
    while (
      combatState.turnIndex < combatState.initiativeOrder.length &&
      combatState.delayedIds.includes(combatState.initiativeOrder[combatState.turnIndex])
    ) {
      combatState.turnIndex++
    }
    if (combatState.turnIndex >= combatState.initiativeOrder.length) {
      combatState.round++
      combatState.turnIndex = 0
      decrementRoundEffects()
    }
  }
  return combatState
}

export function undelayCombatant(combatantId: string, afterCombatantId?: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.delayedIds = combatState.delayedIds.filter(id => id !== combatantId)

  if (afterCombatantId) {
    // Re-insert after specified combatant in initiative order
    const order = combatState.initiativeOrder.filter(id => id !== combatantId)
    const insertIdx = order.indexOf(afterCombatantId)
    if (insertIdx >= 0) {
      order.splice(insertIdx + 1, 0, combatantId)
      combatState.initiativeOrder = order
    }
  }

  return combatState
}

export function damageCombatant(combatantId: string, amount: number): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)

  let remaining = amount

  // Temp HP absorbs first
  if (c.tempHp > 0) {
    const absorbed = Math.min(c.tempHp, remaining)
    c.tempHp -= absorbed
    remaining -= absorbed
  }

  c.hp = Math.max(0, c.hp - remaining)
  return combatState
}

export function healCombatant(combatantId: string, amount: number): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  c.hp = Math.min(c.maxHp, c.hp + amount)
  return combatState
}

export function addCondition(combatantId: string, condition: AppliedCondition): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)

  // Replace if same conditionId exists
  c.conditions = c.conditions.filter(cond => cond.conditionId !== condition.conditionId)
  c.conditions.push(condition)
  return combatState
}

export function removeCondition(combatantId: string, conditionId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  c.conditions = c.conditions.filter(cond => cond.conditionId !== conditionId)
  return combatState
}

export function addEffect(combatantId: string, effect: Omit<AppliedEffect, 'id'>): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  c.effects.push({ ...effect, id: generateId() })
  return combatState
}

export function removeEffect(combatantId: string, effectId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  c.effects = c.effects.filter(e => e.id !== effectId)
  return combatState
}

export function updateCombatant(combatantId: string, updates: Partial<CombatantState>): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  Object.assign(c, updates)
  return combatState
}

export function endCombat(): void {
  combatState = null
}

function decrementRoundEffects(): void {
  if (!combatState) return
  for (const combatant of Object.values(combatState.combatants)) {
    combatant.effects = combatant.effects.filter(e => {
      if (e.remainingRounds != null) {
        e.remainingRounds--
        return e.remainingRounds > 0
      }
      return true
    })
  }
}

// Create player-safe version of combat state
export function toPlayerCombatState(state: CombatState, plugin?: SystemPlugin): PlayerCombatState {
  const combatants: Record<string, PlayerCombatantState> = {}
  const descriptors = plugin?.hpDescriptors ?? []

  for (const [id, c] of Object.entries(state.combatants)) {
    const { label, color } = c.isPC
      ? { label: `${c.hp}/${c.maxHp}`, color: '#0a0' }  // PCs see real HP
      : resolveHpDescriptor(c.hp, c.maxHp, descriptors)

    combatants[id] = {
      id: c.id,
      name: c.name,
      isPC: c.isPC,
      initiative: c.initiative,
      hpDescriptor: label,
      hpColor: color,
      conditions: c.conditions.map(cond => {
        const def = plugin?.conditions.find(d => d.id === cond.conditionId)
        return { name: def?.name ?? cond.conditionId, value: cond.value }
      }),
      effects: c.effects.map(e => ({ name: e.name })),
      miniIndicator: c.miniIndicator,
      imageId: c.imageId,
    }
  }

  return {
    round: state.round,
    phase: state.phase,
    turnIndex: state.turnIndex,
    initiativeOrder: state.initiativeOrder,
    combatants,
  }
}
