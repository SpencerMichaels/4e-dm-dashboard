import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { AppliedCondition, AppliedEffect, Encounter } from '@common/types'
import * as engine from '../combat/combat-engine'
import { getPlugin } from '../plugins/plugin-loader'
import { getActiveCampaignId, getEntity } from '../data/campaign-store'
import { broadcastToAll, broadcastToPlayer, getPlayerWindow, createPlayerWindow } from '../windows'
import { setCurrentScene } from './system-handlers'

let activeSystemId: string | null = null

export function setActiveSystemId(systemId: string): void {
  activeSystemId = systemId
}

function getActivePlugin() {
  return activeSystemId ? getPlugin(activeSystemId) : undefined
}

function handlePostResolve(): void {
  const state = engine.getCombatState()
  if (state?.turnPhase === 'end-of-turn-done') {
    broadcastCombatState()
    engine.commitAndAdvance(getActivePlugin())
    broadcastCombatState()
  } else if (state?.turnPhase === 'start-of-turn' && state.stepperIndex === -1) {
    broadcastCombatState()
    engine.finishStartOfTurn(getActivePlugin())
    broadcastCombatState()
  } else {
    broadcastCombatState()
  }
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
  ipcMain.handle(CMD.COMBAT_INIT, async (_e, encounterId?: string) => {
    const state = engine.initCombat(encounterId)

    // Resolve background image: encounter → location → none
    let backgroundImageId: string | undefined
    if (encounterId) {
      const encounter = await getEntity<Encounter>('encounter', encounterId)
      if (encounter?.backgroundImageId) {
        backgroundImageId = encounter.backgroundImageId
      }
    }

    // Set scene to combat mode with background
    const scene = { mode: 'combat' as const, backgroundImageId }
    setCurrentScene(scene)
    broadcastToAll(SYNC.SCENE_STATE, scene)

    // Broadcast combat state
    broadcastCombatState()

    // Open player window if not already open — PLAYER_READY handles re-broadcast on mount
    if (!getPlayerWindow()) {
      createPlayerWindow()
    }
    return state
  })

  ipcMain.handle(CMD.COMBAT_START, async () => {
    const state = engine.startCombat()
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_SET_INITIATIVE, async (_e, combatantId: string, initiative: number) => {
    const state = engine.setInitiative(combatantId, initiative)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_SET_INITIATIVE_FOCUS, async (_e, combatantId: string | null) => {
    const state = engine.setInitiativeFocus(combatantId)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_SET_PLAYER_EXPAND_CONDITIONS, async (_e, value: boolean) => {
    const state = engine.setPlayerExpandConditions(value)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_END_TURN, async () => {
    const plugin = getActivePlugin()
    const result = engine.endTurn(plugin)
    broadcastCombatState()
    return result
  })

  ipcMain.handle(CMD.COMBAT_RESOLVE_ITEM, async (_e, index: number, success: boolean) => {
    const result = engine.resolveItem(index, success)
    handlePostResolve()
    return result
  })

  ipcMain.handle(CMD.COMBAT_RESOLVE_DEATH_SAVE, async (_e, index: number, outcome: 'fail' | 'none' | 'success') => {
    const result = engine.resolveDeathSave(index, outcome)
    handlePostResolve()
    return result
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

  ipcMain.handle(CMD.COMBAT_DAMAGE, async (_e, combatantId: string, amount: number, wasHit: boolean = true) => {
    const { state, notifications } = engine.damageCombatant(combatantId, amount, wasHit)
    broadcastCombatState()
    return { state, notifications }
  })

  ipcMain.handle(CMD.COMBAT_HEAL, async (_e, combatantId: string, amount: number) => {
    const state = engine.healCombatant(combatantId, amount)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_ADD_CONDITION, async (_e, combatantId: string, condition: AppliedCondition) => {
    const state = engine.addCondition(combatantId, condition)
    engine.refreshEndOfTurnPreview(getActivePlugin())
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_REMOVE_CONDITION, async (_e, combatantId: string, conditionId: string) => {
    const state = engine.removeCondition(combatantId, conditionId)
    engine.refreshEndOfTurnPreview(getActivePlugin())
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


  ipcMain.handle(CMD.COMBAT_USE_POWER, async (_e, combatantId: string, powerIndex: number) => {
    const state = engine.usePower(combatantId, powerIndex)
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_UNUSE_POWER, async (_e, combatantId: string, powerIndex: number) => {
    const state = engine.unusePower(combatantId, powerIndex)
    broadcastCombatState()
    return state
  })

  // Player window signals it's ready — re-broadcast all state
  ipcMain.handle(CMD.PLAYER_READY, async () => {
    const { getCurrentScene } = await import('./system-handlers')
    broadcastToAll(SYNC.SCENE_STATE, getCurrentScene())
    broadcastCombatState()
  })

  ipcMain.handle(CMD.COMBAT_END, async () => {
    engine.endCombat()
    broadcastCombatState()
  })
}
