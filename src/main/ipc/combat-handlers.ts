import { ipcMain } from 'electron'
import { CMD, SYNC } from '@common/ipc-channels'
import type { AppliedCondition, AppliedEffect, CampaignRecord, DiseaseRef, Encounter, EncounterCreature, Location, PlayerCharacter } from '@common/types'
import type { Disease } from '@kit'
import { carriedConditions, diseaseKey, pcDiseases } from '@common/rules/pc-conditions'
import { getLibraryRecord } from '../data/library-store'
import { getKitEntry } from '../compendium/kit'
import * as engine from '../combat/combat-engine'
import { getActiveCampaignId, getEntity } from '../data/campaign-store'
import { broadcastToAll, broadcastToPlayer, getPlayerWindow, createPlayerWindow } from '../windows'
import { setCurrentScene } from './system-handlers'
import { campaignSources, encounterCombatants, resolveRow, type RowTheme } from '../combat/encounter-combatants'

function handlePostResolve(): void {
  const state = engine.getCombatState()
  if (state?.turnPhase === 'end-of-turn-done') {
    broadcastCombatState()
    engine.commitAndAdvance()
    broadcastCombatState()
  } else if (state?.turnPhase === 'start-of-turn' && state.stepperIndex === -1) {
    broadcastCombatState()
    engine.finishStartOfTurn()
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
  const playerState = engine.toPlayerCombatState(state)
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
      // The encounter's creatures join as kit monsters with the encounter's adjustments applied.
      if (encounter) for (const c of encounterCombatants(encounter, await campaignSources(encounter.locationId))) engine.addCombatant(c)
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
    const result = engine.endTurn()
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

  ipcMain.handle(CMD.COMBAT_DAMAGE, async (_e, combatantId: string, amount: number, wasHit: boolean = true, sourceId?: string) => {
    const { state, notifications } = engine.damageCombatant(combatantId, amount, wasHit, { sourceId })
    broadcastCombatState()
    return { state, notifications }
  })

  ipcMain.handle(CMD.COMBAT_ADD_CONDITION, async (_e, combatantId: string, condition: AppliedCondition) => {
    const state = engine.addCondition(combatantId, condition)
    engine.refreshEndOfTurnPreview()
    broadcastCombatState()
    return state
  })

  ipcMain.handle(CMD.COMBAT_REMOVE_CONDITION, async (_e, combatantId: string, conditionId: string) => {
    const state = engine.removeCondition(combatantId, conditionId)
    engine.refreshEndOfTurnPreview()
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
  // A PC joins with its lasting conditions (diseases, conditions, the DM's effects); the encounter's go on top.
  ipcMain.handle(CMD.COMBAT_ADD_COMBATANT, async (_e, combatant: any) => {
    const pc = combatant.isPC && combatant.entityId ? await getEntity<PlayerCharacter>('player-character', combatant.entityId) : null
    const result = engine.addCombatant(pc ? { ...combatant, conditions: carriedConditions(pc, await pcDiseaseLookup(pc)) } : combatant)
    broadcastCombatState()
    return result
  })
  withBroadcast(CMD.COMBAT_REMOVE_COMBATANT, (id: string) => engine.removeCombatant(id))
  withBroadcast(CMD.COMBAT_UPDATE_COMBATANT, (id: string, updates: any) => engine.updateCombatant(id, updates))
  withBroadcast(CMD.COMBAT_USE_POWER, (id: string, idx: number) => engine.usePower(id, idx))
  withBroadcast(CMD.COMBAT_UNUSE_POWER, (id: string, idx: number) => engine.unusePower(id, idx))

  // The encounter editor's preview of a row: the adjusted kit monster and what each adjustment changed.
  ipcMain.handle(CMD.COMBAT_PREVIEW_ROW, async (_e, row: EncounterCreature, theme?: RowTheme) =>
    resolveRow(row, await campaignSources(), theme === undefined ? row.monsterTheme : theme))
}

/** The kit diseases a PC's conditions name, looked up for carriedConditions (null: the entry is gone). */
async function pcDiseaseLookup(pc: PlayerCharacter): Promise<(ref: DiseaseRef) => Disease | null> {
  const found = new Map<string, Disease | null>()
  for (const ref of pcDiseases(pc)) {
    const disease = ref.diseaseId ? (await getEntity<CampaignRecord<Disease>>('disease', ref.diseaseId))?.content
      : ref.libraryId ? (await getLibraryRecord<Disease>('disease', ref.libraryId))?.content
      : ref.compendiumId ? getKitEntry('disease', ref.compendiumId) as Disease | null
      : null
    found.set(diseaseKey(ref), disease ?? null)
  }
  return ref => found.get(diseaseKey(ref)) ?? null
}
