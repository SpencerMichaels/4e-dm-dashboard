import type { CombatState, CombatantState, CombatPhase, AppliedEffect, PlayerCombatState, PlayerCombatantState, PlayerTurnItem, CombatNotification, TurnPhase } from '@common/types'
import type { AppliedCondition, SystemPlugin, TurnPrompt } from '@common/types'
import { generateId } from '@common/utils/id'
import { resolveHpDescriptor } from '@common/utils/hp'
import { rollD6, rollD20 } from '@common/utils/dice'

let combatState: CombatState | null = null

export function getCombatState(): CombatState | null {
  return combatState
}

export function initCombat(encounterId?: string): CombatState {
  combatState = {
    encounterId,
    round: 0,
    phase: 'initiative-entry',
    turnIndex: 0,
    initiativeOrder: [],
    combatants: {},
    delayedIds: [],
    turnPhase: 'active',
    turnItems: [],
    stepperIndex: -1,
    playerExpandConditions: true,
  }
  return combatState
}

export function addCombatant(combatant: Omit<CombatantState, 'conditions' | 'effects' | 'tempHp' | 'usedPowers' | 'usedReaction'> & { tempHp?: number }): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.combatants[combatant.id] = {
    ...combatant,
    tempHp: combatant.tempHp ?? 0,
    conditions: [],
    effects: [],
    usedPowers: {},
    usedReaction: false,
    usedActionPoints: 0,
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
  const allIds = Object.keys(combatState.combatants)
  const withInit = allIds.filter(id => combatState!.combatants[id].initiative != null)
  withInit.sort((a, b) => (combatState!.combatants[b].initiative ?? 0) - (combatState!.combatants[a].initiative ?? 0))
  combatState.initiativeOrder = withInit
  return combatState
}

export function setInitiativeFocus(combatantId: string | null): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.activeInitiativeId = combatantId ?? undefined
  return combatState
}

export function setPlayerExpandConditions(value: boolean): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.playerExpandConditions = value
  return combatState
}

export function startCombat(): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.phase = 'active'
  combatState.round = 1
  combatState.turnIndex = 0
  combatState.turnPhase = 'active'
  return combatState
}

export function usePower(combatantId: string, powerIndex: number): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  c.usedPowers[powerIndex] = (c.usedPowers[powerIndex] ?? 0) + 1
  return combatState
}

export function unusePower(combatantId: string, powerIndex: number): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  const current = c.usedPowers[powerIndex] ?? 0
  if (current <= 1) delete c.usedPowers[powerIndex]
  else c.usedPowers[powerIndex] = current - 1
  return combatState
}

function shouldSkip(combatantId: string): boolean {
  if (!combatState) return false
  const c = combatState.combatants[combatantId]
  return c != null && c.hp <= 0
}

// ──────────────────────────────────────────────────
// Turn Phase State Machine
// ──────────────────────────────────────────────────

// Queued save/recharge results — applied when phase finishes
let pendingResults: { combatantId: string; conditionId?: string; powerIndex?: number; success: boolean }[] = []

function applyPendingResults(): void {
  if (!combatState) return
  for (const r of pendingResults) {
    if (r.success) {
      if (r.conditionId) removeCondition(r.combatantId, r.conditionId)
      else if (r.powerIndex != null) unusePower(r.combatantId, r.powerIndex)
    }
  }
  pendingResults = []
}

function isActionable(item: PlayerTurnItem): boolean {
  return item.kind === 'ongoing-damage' || item.kind === 'save' || item.kind === 'recharge'
}

function findFirstActionable(items: PlayerTurnItem[], phase: 'start' | 'end'): number {
  return items.findIndex(i => i.phase === phase && isActionable(i) && !i.result)
}

function findNextActionable(items: PlayerTurnItem[], afterIndex: number, phase: 'start' | 'end'): number {
  const idx = items.findIndex((i, n) => n > afterIndex && i.phase === phase && isActionable(i) && !i.result)
  return idx >= 0 ? idx : -1
}

// ── Item Builders ──

function saveLabel(condName: string, saveBonus: number): string {
  const bonusStr = saveBonus > 0 ? ` +${saveBonus}` : saveBonus < 0 ? ` ${saveBonus}` : ''
  return `Save${bonusStr} vs ${condName}`
}

function buildEndOfTurnPreview(combatant: CombatantState | null, plugin?: SystemPlugin): PlayerTurnItem[] {
  if (!combatant) return []
  const items: PlayerTurnItem[] = []
  const saveBonus = ((combatant.statBlock as any)?.savingThrowBonus as number) ?? 0
  const saveEnds = combatant.conditions.filter(co =>
    (co.duration?.type === 'save-ends' || co.duration?.type === 'unlimited') && co.conditionId !== 'dying'
  )
  for (const cond of saveEnds) {
    let condName = cond.customName ?? cond.conditionId
    const isOngoing = cond.conditionId.startsWith('ongoing-damage')
    if (isOngoing) {
      const dmgType = cond.customDescription ? ` ${cond.customDescription}` : ''
      condName = `ongoing ${cond.value ?? ''}${dmgType} damage`
    } else {
      const def = plugin?.conditions.find(d => d.id === cond.conditionId)
      if (def) condName = def.name
    }
    items.push({
      id: `save-${cond.conditionId}`, phase: 'end', kind: 'save',
      label: saveLabel(condName, saveBonus), conditionId: cond.conditionId,
      damageType: isOngoing ? cond.customDescription : undefined,
    })
  }
  return items
}

function buildOngoingDamageItems(combatant: CombatantState): PlayerTurnItem[] {
  const items: PlayerTurnItem[] = []
  const resistances = Array.isArray((combatant.statBlock as any)?.resistances) ? (combatant.statBlock as any).resistances as { type: string; value?: number }[] : []
  const immunities = Array.isArray((combatant.statBlock as any)?.immunities) ? (combatant.statBlock as any).immunities as { type: string }[] : []
  const vulnerabilities = Array.isArray((combatant.statBlock as any)?.weaknesses) ? (combatant.statBlock as any).weaknesses as { type: string; value?: number }[] : []

  for (const cond of combatant.conditions.filter(c => c.conditionId.startsWith('ongoing-damage') && c.value)) {
    const rawDmg = cond.value ?? 0
    const dmgType = cond.customDescription?.trim().toLowerCase() ?? ''
    const dmgTypes = dmgType.includes(' and ') ? dmgType.split(/\s+and\s+/) : [dmgType]
    const matchesType = (rType: string) => dmgTypes.some(t => t && (rType === t || rType.includes(t)))

    let immune = false
    if (dmgType) { for (const imm of immunities) { if (matchesType(imm.type.toLowerCase())) { immune = true; break } } }
    let resistAmount = 0
    if (dmgType && !immune) { for (const r of resistances) { if (matchesType(r.type.toLowerCase())) resistAmount = Math.max(resistAmount, r.value ?? 0) } }
    let vulnAmount = 0
    if (dmgType && !immune) { for (const v of vulnerabilities) { if (matchesType(v.type.toLowerCase())) vulnAmount = Math.max(vulnAmount, v.value ?? 0) } }

    const actualDmg = immune ? 0 : Math.max(0, rawDmg - resistAmount + vulnAmount)
    const notes: string[] = []
    if (immune) notes.push('immune')
    else { if (resistAmount > 0) notes.push(`resist ${resistAmount}`); if (vulnAmount > 0) notes.push(`vulnerable ${vulnAmount}`) }
    const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : ''
    const dmgTypeLabel = cond.customDescription?.trim() ?? ''

    items.push({
      id: `dmg-${cond.conditionId}`, phase: 'start', kind: 'ongoing-damage',
      label: `Take ${actualDmg} ongoing${dmgTypeLabel ? ' ' + dmgTypeLabel : ''} damage${noteStr}`,
      conditionId: cond.conditionId, damageType: cond.customDescription, value: actualDmg,
    })
  }
  return items
}

function buildSaveItems(actions: unknown[], combatantId: string): PlayerTurnItem[] {
  if (!combatState) return []
  const items: PlayerTurnItem[] = []
  const combatant = combatState.combatants[combatantId]
  const saveBonus = ((combatant?.statBlock as any)?.savingThrowBonus as number) ?? 0
  for (const action of actions) {
    const a = action as any
    if (a.type !== 'prompt') continue
    const prompt = a as TurnPrompt
    if (!prompt.description.toLowerCase().startsWith('save vs ')) continue
    const condName = prompt.description.replace(/^Save vs\s+/i, '').replace(/\s*\(DC\s+\d+\)\s*$/i, '')
    const saveChoice = prompt.choices.find((c: any) => c.action.startsWith('remove-condition:'))
    const condId = saveChoice ? saveChoice.action.split(':')[1] : undefined
    const cond = combatant?.conditions.find(co => co.conditionId === condId)
    const isOngoing = condId?.startsWith('ongoing-damage')
    items.push({
      id: `save-${condId ?? items.length}`, phase: 'end', kind: 'save',
      label: saveLabel(condName, saveBonus), conditionId: condId,
      damageType: isOngoing ? cond?.customDescription : undefined,
    })
  }
  return items
}

function buildRechargeItems(actions: unknown[]): PlayerTurnItem[] {
  const items: PlayerTurnItem[] = []
  for (const action of actions) {
    const a = action as any
    if (a.type !== 'prompt') continue
    const prompt = a as TurnPrompt
    if (!prompt.description.toLowerCase().startsWith('recharge ')) continue
    const thresholdMatch = prompt.description.match(/\((\d)\+?\)/)
    const threshold = thresholdMatch ? parseInt(thresholdMatch[1]) : 6
    const powerName = prompt.description.replace(/^Recharge\s+/i, '').replace(/\s*\(\d\+?\)\s*$/, '')
    const rechargeChoice = prompt.choices.find((c: any) => c.action.startsWith('recharge-power:'))
    const powerIdx = rechargeChoice ? parseInt(rechargeChoice.action.split(':')[1]) : undefined
    items.push({
      id: `rch-${powerIdx ?? items.length}`, phase: 'start', kind: 'recharge',
      label: `Recharge ${powerName} (${threshold}+)`, dc: threshold,
    })
  }
  return items
}

// ── Main Turn Functions ──

/**
 * DM pressed Space — end the current creature's turn.
 * Runs EONT expiry, builds save items, enters stepper or advances.
 */
export function endTurn(plugin?: SystemPlugin): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState || combatState.phase !== 'active') throw new Error('Combat not active')
  if (combatState.turnPhase !== 'active') return { state: combatState, notifications: [] }

  const notifications: CombatNotification[] = []
  const endItems: PlayerTurnItem[] = []
  const currentId = combatState.initiativeOrder[combatState.turnIndex]

  if (currentId) {
    const combatant = combatState.combatants[currentId]
    if (combatant) {
      // Collect EONT expirations
      for (const c of Object.values(combatState.combatants)) {
        for (const cond of c.conditions) {
          if (cond.duration?.type === 'eont') {
            const expiresOn = cond.duration.expiresOnId ?? c.id
            if (expiresOn !== currentId) continue
            if (!cond.duration.remaining || cond.duration.remaining <= 0) {
              const condDef = plugin?.conditions.find(d => d.id === cond.conditionId)
              const name = cond.customName ?? condDef?.name ?? cond.conditionId
              endItems.push({ id: `eont-${cond.conditionId}`, phase: 'end', kind: 'eont-expire', label: `${name} ends`, conditionId: cond.conditionId })
            }
          }
        }
      }

      // Remove EONT + round-based conditions
      for (const c of Object.values(combatState.combatants)) {
        c.conditions = c.conditions.filter(cond => {
          if (cond.duration?.type === 'eont') {
            const expiresOn = cond.duration.expiresOnId ?? c.id
            if (expiresOn !== currentId) return true
            if (cond.duration.remaining != null && cond.duration.remaining > 0) { cond.duration.remaining--; return true }
            return false
          }
          if (cond.duration?.type === 'rounds' && cond.duration.remaining != null) { cond.duration.remaining--; return cond.duration.remaining > 0 }
          return true
        })
      }

      // Plugin end-of-turn hooks → save items
      const endActions: unknown[] = []
      if (plugin?.turnHooks?.onTurnEnd) endActions.push(...plugin.turnHooks.onTurnEnd(combatant))
      endItems.push(...buildSaveItems(endActions, currentId))
    }
  }

  // If there are saves, enter stepper
  const first = findFirstActionable(endItems, 'end')
  if (first >= 0) {
    combatState.turnPhase = 'end-of-turn'
    combatState.turnItems = endItems
    combatState.stepperIndex = first
    return { state: combatState, notifications }
  }

  // No saves — advance immediately
  return commitAndAdvance(plugin, notifications)
}

/**
 * Resolve a single stepper item.
 * Ongoing damage: applied immediately. Saves/recharges: queued.
 */
export function resolveItem(index: number, success: boolean): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState) throw new Error('No active combat')
  const notifications: CombatNotification[] = []
  const item = combatState.turnItems[index]
  if (!item) return { state: combatState, notifications }

  const currentId = combatState.initiativeOrder[combatState.turnIndex]

  if (item.kind === 'ongoing-damage') {
    if (item.value && item.value > 0 && currentId) {
      const result = damageCombatant(currentId, item.value)
      notifications.push(...result.notifications)
    }
  } else if (item.kind === 'save') {
    pendingResults.push({ combatantId: currentId ?? '', conditionId: item.conditionId, success })
  } else if (item.kind === 'recharge') {
    const powerIdx = parseInt(item.id.replace('rch-', ''))
    pendingResults.push({ combatantId: currentId ?? '', powerIndex: isNaN(powerIdx) ? undefined : powerIdx, success })
  }

  // Mark result
  item.result = success ? 'success' : 'fail'

  // Advance stepper — only consider items in the current phase
  const phase = combatState.turnPhase === 'start-of-turn' ? 'start' : 'end'
  combatState.stepperIndex = findNextActionable(combatState.turnItems, index, phase)

  // Auto-transition: end-of-turn → end-of-turn-done when all resolved
  if (combatState.stepperIndex === -1 && combatState.turnPhase === 'end-of-turn') {
    combatState.turnPhase = 'end-of-turn-done'
  }

  return { state: combatState, notifications }
}

/**
 * Apply queued results, advance turn pointer, run start-of-turn.
 */
export function commitAndAdvance(plugin?: SystemPlugin, extraNotifications?: CombatNotification[]): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState) throw new Error('No active combat')
  const notifications = extraNotifications ? [...extraNotifications] : []

  applyPendingResults()

  // Advance turn pointer
  combatState.turnIndex++
  while (combatState.turnIndex < combatState.initiativeOrder.length && shouldSkip(combatState.initiativeOrder[combatState.turnIndex])) combatState.turnIndex++

  if (combatState.turnIndex >= combatState.initiativeOrder.length) {
    if (combatState.delayedIds.length > 0) {
      const delayed = combatState.delayedIds.map(id => ({ id, init: combatState!.combatants[id]?.initiative ?? 0 })).sort((a, b) => b.init - a.init)
      const forcedId = delayed[0].id
      combatState.delayedIds = combatState.delayedIds.filter(id => id !== forcedId)
      combatState.initiativeOrder.push(forcedId)
      combatState.turnIndex = combatState.initiativeOrder.length - 1
    } else {
      combatState.round++
      combatState.turnIndex = 0
      decrementRoundEffects()
    }
    while (combatState.turnIndex < combatState.initiativeOrder.length && shouldSkip(combatState.initiativeOrder[combatState.turnIndex])) combatState.turnIndex++
  }

  // Start-of-turn for new combatant
  const startItems: PlayerTurnItem[] = []
  const newId = combatState.initiativeOrder[combatState.turnIndex]
  if (newId) {
    const combatant = combatState.combatants[newId]
    if (combatant) {
      // Collect SONT expirations
      for (const c of Object.values(combatState.combatants)) {
        for (const cond of c.conditions) {
          if (cond.duration?.type === 'sont') {
            const expiresOn = cond.duration.expiresOnId ?? c.id
            if (expiresOn !== newId) continue
            if (!cond.duration.remaining || cond.duration.remaining <= 0) {
              const condDef = plugin?.conditions.find(d => d.id === cond.conditionId)
              const name = cond.customName ?? condDef?.name ?? cond.conditionId
              startItems.push({ id: `sont-${cond.conditionId}`, phase: 'start', kind: 'sont-expire', label: `${name} ends`, conditionId: cond.conditionId })
            }
          }
        }
      }

      // Remove SONT conditions
      for (const c of Object.values(combatState.combatants)) {
        c.conditions = c.conditions.filter(cond => {
          if (cond.duration?.type === 'sont') {
            const expiresOn = cond.duration.expiresOnId ?? c.id
            if (expiresOn !== newId) return true
            if (cond.duration.remaining != null && cond.duration.remaining > 0) { cond.duration.remaining--; return true }
            return false
          }
          return true
        })
      }

      combatant.usedReaction = false

      // Ongoing damage + recharges
      startItems.push(...buildOngoingDamageItems(combatant))
      const startActions: unknown[] = []
      if (plugin?.turnHooks?.onTurnStart) startActions.push(...plugin.turnHooks.onTurnStart(combatant))
      startItems.push(...buildRechargeItems(startActions))

      // If actionable start items, enter stepper
      const first = findFirstActionable(startItems, 'start')
      if (first >= 0) {
        combatState.turnPhase = 'start-of-turn'
        combatState.turnItems = [...startItems, ...buildEndOfTurnPreview(combatant, plugin)]
        combatState.stepperIndex = first
        return { state: combatState, notifications }
      }
    }
  }

  // No start items — turn is active
  const newCombatant = newId ? combatState.combatants[newId] : null
  combatState.turnPhase = 'active'
  combatState.turnItems = [...startItems, ...buildEndOfTurnPreview(newCombatant, plugin)]
  combatState.stepperIndex = -1
  return { state: combatState, notifications }
}

/**
 * All start-of-turn items resolved — creature's turn is now active.
 */
export function finishStartOfTurn(plugin?: SystemPlugin): CombatState {
  if (!combatState) throw new Error('No active combat')
  applyPendingResults()
  combatState.turnPhase = 'active'
  combatState.stepperIndex = -1
  const curId = combatState.initiativeOrder[combatState.turnIndex]
  const cur = curId ? combatState.combatants[curId] : null
  combatState.turnItems = [...combatState.turnItems.filter(i => i.phase === 'start'), ...buildEndOfTurnPreview(cur, plugin)]
  return combatState
}

// ──────────────────────────────────────────────────
// Combat Actions (unchanged)
// ──────────────────────────────────────────────────

export function delayCombatant(combatantId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  if (!combatState.delayedIds.includes(combatantId)) combatState.delayedIds.push(combatantId)
  const idx = combatState.initiativeOrder.indexOf(combatantId)
  if (idx >= 0) {
    combatState.initiativeOrder = combatState.initiativeOrder.filter(id => id !== combatantId)
    if (idx < combatState.turnIndex) combatState.turnIndex--
  }
  while (combatState.turnIndex < combatState.initiativeOrder.length && shouldSkip(combatState.initiativeOrder[combatState.turnIndex])) combatState.turnIndex++
  return combatState
}

export function undelayCombatant(combatantId: string, beforeCombatantId?: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.delayedIds = combatState.delayedIds.filter(id => id !== combatantId)
  if (beforeCombatantId) {
    const order = combatState.initiativeOrder.filter(id => id !== combatantId)
    const currentCombatant = combatState.initiativeOrder[combatState.turnIndex]
    const insertIdx = order.indexOf(beforeCombatantId)
    if (insertIdx >= 0) {
      order.splice(insertIdx, 0, combatantId)
      combatState.initiativeOrder = order
      combatState.turnIndex = insertIdx
    } else {
      combatState.initiativeOrder = order
      combatState.turnIndex = currentCombatant ? order.indexOf(currentCombatant) : combatState.turnIndex
    }
  }
  return combatState
}

export function damageCombatant(combatantId: string, amount: number): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  const notifications: CombatNotification[] = []
  let remaining = amount
  if (c.tempHp > 0) { const absorbed = Math.min(c.tempHp, remaining); c.tempHp -= absorbed; remaining -= absorbed }
  c.hp = Math.max(0, c.hp - remaining)
  // Auto-bloodied management — only for monsters (PCs track their own HP, DM marks bloodied manually)
  if (!c.isPC) {
    const isBloodied = c.maxHp > 0 && c.hp <= c.maxHp / 2 && c.hp > 0
    const hasBloodied = c.conditions.some(cond => cond.conditionId === 'bloodied')
    if (isBloodied && !hasBloodied) {
      c.conditions.push({ conditionId: 'bloodied', duration: { type: 'indefinite' } })
      notifications.push({ type: 'bloodied', combatantId, message: `${c.name} is Bloodied!` })
    } else if (!isBloodied && hasBloodied) {
      c.conditions = c.conditions.filter(cond => cond.conditionId !== 'bloodied')
    }
  }
  if (c.hp <= 0) notifications.push({ type: 'death', combatantId, message: c.isPC ? `${c.name} is down!` : `${c.name} is defeated!` })
  return { state: combatState, notifications }
}

export function healCombatant(combatantId: string, amount: number): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  c.hp = Math.min(c.maxHp, c.hp + amount)
  // Auto-unbloodied — only for monsters
  if (!c.isPC && c.maxHp > 0 && c.hp > c.maxHp / 2) {
    c.conditions = c.conditions.filter(cond => cond.conditionId !== 'bloodied')
  }
  return combatState
}

export function addCondition(combatantId: string, condition: AppliedCondition): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  if (condition.conditionId === 'ongoing-damage') {
    c.conditions.push({ ...condition, conditionId: `ongoing-damage-${generateId()}` })
  } else {
    c.conditions = c.conditions.filter(cond => cond.conditionId !== condition.conditionId)
    c.conditions.push(condition)
  }
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
      if (e.remainingRounds != null) { e.remainingRounds--; return e.remainingRounds > 0 }
      return true
    })
  }
}

// ──────────────────────────────────────────────────
// Player State
// ──────────────────────────────────────────────────

export function toPlayerCombatState(state: CombatState, plugin?: SystemPlugin): PlayerCombatState {
  const combatants: Record<string, PlayerCombatantState> = {}
  const descriptors = plugin?.hpDescriptors ?? []

  for (const [id, c] of Object.entries(state.combatants)) {
    let label: string, color: string, hpPct: number
    if (c.isPC) {
      // PCs track their own HP — no descriptor shown
      label = ''
      color = '#888'
      hpPct = 100
    } else {
      const r = resolveHpDescriptor(c.hp, c.maxHp, descriptors)
      label = r.label
      color = r.color
      hpPct = c.maxHp > 0 ? Math.round((c.hp / c.maxHp) * 100) : 0
    }

    combatants[id] = {
      id: c.id, name: c.name, isPC: c.isPC, playerName: c.playerName, initiative: c.initiative,
      hpDescriptor: label,
      hpPct,
      hpColor: color,
      conditions: c.conditions.map(cond => {
        const def = plugin?.conditions.find(d => d.id === cond.conditionId)
        const expiresOnId = cond.duration?.expiresOnId
        return {
          conditionId: cond.conditionId,
          name: cond.customName ?? def?.name ?? cond.conditionId,
          value: cond.value,
          description: cond.customDescription ?? def?.description,
          customDescription: cond.customDescription,
          damageType: cond.conditionId.startsWith('ongoing-damage') ? cond.customDescription : undefined,
          durationType: cond.duration?.type,
          expiresOnName: expiresOnId ? state.combatants[expiresOnId]?.name : undefined,
        }
      }),
      effects: c.effects.map(e => ({ name: e.name })),
      miniIndicator: c.miniIndicator,
      imageId: c.imageId,
      tokenImageId: c.tokenImageId,
    }
  }

  return {
    round: state.round,
    phase: state.phase,
    turnIndex: state.turnIndex,
    initiativeOrder: state.initiativeOrder,
    combatants,
    activeInitiativeId: state.activeInitiativeId,
    turnPhase: state.turnPhase,
    turnItems: state.turnItems ?? [],
    stepperIndex: state.stepperIndex ?? -1,
    playerExpandConditions: state.playerExpandConditions ?? true,
  }
}
