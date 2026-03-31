import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { AppliedCondition, AppliedEffect } from '@common/types'
import * as engine from '../combat/combat-engine'
import { getPlugin } from '../plugins/plugin-loader'
import { getActiveCampaignId } from '../data/campaign-store'
import { broadcastToAll, broadcastToPlayer } from '../windows'

let activeSystemId: string | null = null

export function setActiveSystemId(systemId: string): void {
  activeSystemId = systemId
}

function getActivePlugin() {
  return activeSystemId ? getPlugin(activeSystemId) : undefined
}

function broadcastCombatState(): void {
  const state = engine.getCombatState()
  if (!state) {
    broadcastToAll(SYNC.COMBAT_STATE, null)
    broadcastToPlayer(SYNC.PLAYER_STATE, null)
    return
  }

  broadcastToAll(SYNC.COMBAT_STATE, state)

  // Player gets stripped version
  const playerState = engine.toPlayerCombatState(state, getActivePlugin())
  broadcastToPlayer(SYNC.PLAYER_STATE, playerState)
}

export function registerCombatHandlers(): void {
  ipcMain.handle(CMD.COMBAT_START, async (_e, encounterId?: string) => {
    const state = engine.startCombat(encounterId)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_BEGIN, async () => {
    const state = engine.beginCombat()
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_SET_INITIATIVE, async (_e, combatantId: string, initiative: number) => {
    const state = engine.setInitiative(combatantId, initiative)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_NEXT_TURN, async () => {
    const { state, turnActions } = engine.nextTurn(getActivePlugin())
    broadcastCombatState()
    return { state, turnActions }
  })

  ipcMain.handle(CMD.COMBAT_PREV_TURN, async () => {
    const state = engine.prevTurn()
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_DELAY, async (_e, combatantId: string) => {
    const state = engine.delayCombatant(combatantId)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_UNDELAY, async (_e, combatantId: string, afterCombatantId?: string) => {
    const state = engine.undelayCombatant(combatantId, afterCombatantId)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_DAMAGE, async (_e, combatantId: string, amount: number) => {
    const state = engine.damageCombatant(combatantId, amount)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_HEAL, async (_e, combatantId: string, amount: number) => {
    const state = engine.healCombatant(combatantId, amount)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_ADD_CONDITION, async (_e, combatantId: string, condition: AppliedCondition) => {
    const state = engine.addCondition(combatantId, condition)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_REMOVE_CONDITION, async (_e, combatantId: string, conditionId: string) => {
    const state = engine.removeCondition(combatantId, conditionId)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_ADD_EFFECT, async (_e, combatantId: string, effect: Omit<AppliedEffect, 'id'>) => {
    const state = engine.addEffect(combatantId, effect)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_REMOVE_EFFECT, async (_e, combatantId: string, effectId: string) => {
    const state = engine.removeEffect(combatantId, effectId)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_ADD_COMBATANT, async (_e, combatant: any) => {
    const state = engine.addCombatant(combatant)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_REMOVE_COMBATANT, async (_e, combatantId: string) => {
    const state = engine.removeCombatant(combatantId)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_UPDATE_COMBATANT, async (_e, combatantId: string, updates: any) => {
    const state = engine.updateCombatant(combatantId, updates)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_END, async () => {
    engine.endCombat()
    broadcastCombatState()
  })
}
