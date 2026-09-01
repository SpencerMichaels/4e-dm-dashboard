import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { AppliedCondition, AppliedEffect, Encounter, Location } from '@common/types'
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

/** Register an IPC handler that calls an engine function, broadcasts combat state, and returns the result. */
function withBroadcast<Args extends any[], R>(
  channel: string,
  handler: (...args: Args) => R,
): void {
  ipcMain.handle(channel, async (_e, ...args: any[]) => {
    const result = handler(...(args as unknown as Args))
    broadcastCombatState()
    return result
  })
}

export function registerCombatHandlers(): void {
  // --- Special handlers (custom logic beyond call-broadcast-return) ---

  ipcMain.handle(CMD.COMBAT_INIT, async (_e, encounterId?: string) => {
    const state = engine.initCombat(encounterId)

    // Resolve background image: encounter → linked location → none
    let backgroundImageId: string | undefined
    if (encounterId) {
      const encounter = await getEntity<Encounter>('encounter', encounterId)
      if (encounter?.backgroundImageId) {
        backgroundImageId = encounter.backgroundImageId
      } else if (encounter?.locationId) {
        const location = await getEntity<Location>('location', encounter.locationId)
        if (location?.sceneImageId) backgroundImageId = location.sceneImageId
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

  ipcMain.handle(CMD.COMBAT_END_TURN, async () => {
    const plugin = getActivePlugin()
    const result = engine.endTurn(plugin)
    broadcastCombatState()
    return result
  })

  ipcMain.handle(CMD.COMBAT_RESOLVE_ITEM, async (_e, index: number, success: boolean) => {
    const result = engine.resolveItem(index, success, getActivePlugin())
    handlePostResolve()
    return result
  })

  ipcMain.handle(CMD.COMBAT_RESOLVE_DEATH_SAVE, async (_e, index: number, outcome: 'fail' | 'none' | 'success') => {
    const result = engine.resolveDeathSave(index, outcome)
    handlePostResolve()
    return result
  })

  ipcMain.handle(CMD.COMBAT_DAMAGE, async (_e, combatantId: string, amount: number, wasHit: boolean = true, sourceId?: string) => {
    const { state, notifications } = engine.damageCombatant(combatantId, amount, wasHit, { sourceId })
    broadcastCombatState()
    return { state, notifications }
  })

  ipcMain.handle(CMD.COMBAT_ADD_CONDITION, async (_e, combatantId: string, condition: AppliedCondition) => {
    const state = engine.addCondition(combatantId, condition, getActivePlugin())
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

  ipcMain.handle(CMD.COMBAT_SET_SURPRISE, async (_e, enabled: boolean, actorIds?: string[]) => {
    engine.setSurprise(enabled, actorIds)
    broadcastCombatState()
  })

  // --- Standard handlers (engine call → broadcast → return) ---

  withBroadcast(CMD.COMBAT_START, () => engine.startCombat())
  withBroadcast(CMD.COMBAT_SET_INITIATIVE, (id: string, init: number) => engine.setInitiative(id, init))
  withBroadcast(CMD.COMBAT_SET_INITIATIVE_FOCUS, (id: string | null) => engine.setInitiativeFocus(id))
  withBroadcast(CMD.COMBAT_SET_PLAYER_EXPAND_CONDITIONS, (v: boolean) => engine.setPlayerExpandConditions(v))
  withBroadcast(CMD.COMBAT_SET_AUTO_HIDE_DEAD, (v: boolean) => engine.setAutoHideDeadCreatures(v))
  withBroadcast(CMD.COMBAT_REORDER, (id: string, newIndex: number) => engine.reorderCombatant(id, newIndex))
  withBroadcast(CMD.COMBAT_DELAY, (id: string) => engine.delayCombatant(id))
  withBroadcast(CMD.COMBAT_UNDELAY, (id: string, afterId?: string) => engine.undelayCombatant(id, afterId))
  withBroadcast(CMD.COMBAT_READY, (id: string, text: string) => engine.readyCombatant(id, text))
  withBroadcast(CMD.COMBAT_RESOLVE_READY, (id: string) => engine.resolveReadiedAction(id))
  withBroadcast(CMD.COMBAT_CANCEL_READY, (id: string) => engine.cancelReady(id))
  withBroadcast(CMD.COMBAT_HEAL, (id: string, amount: number, sourceId?: string) => engine.healCombatant(id, amount, { sourceId }))
  withBroadcast(CMD.COMBAT_ADD_EFFECT, (id: string, effect: Omit<AppliedEffect, 'id'>) => engine.addEffect(id, effect))
  withBroadcast(CMD.COMBAT_REMOVE_EFFECT, (id: string, effectId: string) => engine.removeEffect(id, effectId))
  withBroadcast(CMD.COMBAT_ADD_COMBATANT, (combatant: any) => engine.addCombatant(combatant))
  withBroadcast(CMD.COMBAT_REMOVE_COMBATANT, (id: string) => engine.removeCombatant(id))
  withBroadcast(CMD.COMBAT_UPDATE_COMBATANT, (id: string, updates: any) => engine.updateCombatant(id, updates))
  withBroadcast(CMD.COMBAT_USE_POWER, (id: string, idx: number) => engine.usePower(id, idx))
  withBroadcast(CMD.COMBAT_UNUSE_POWER, (id: string, idx: number) => engine.unusePower(id, idx))
}
