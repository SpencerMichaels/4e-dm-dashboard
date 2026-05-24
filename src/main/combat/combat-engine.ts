import type { CombatState, CombatantState, CombatPhase, AppliedEffect, PlayerCombatState, PlayerCombatantState, PlayerTurnItem, CombatNotification, TurnPhase } from '@common/types'
import type { AppliedCondition, ConditionDef, SystemPlugin, TurnPrompt } from '@common/types'
import { generateId } from '@common/utils/id'
import { resolveHpDescriptor } from '@common/utils/hp'
import { rollD6, rollD20 } from '@common/utils/dice'

// ──────────────────────────────────────────────────
// Helpers — extracted to reduce duplication
// ──────────────────────────────────────────────────

/** Look up a condition definition from the plugin by id. Returns undefined when
 *  plugin is missing or no matching def exists. */
function getConditionDef(condId: string, plugin?: SystemPlugin): ConditionDef | undefined {
  return plugin?.conditions.find(d => d.id === condId)
}

/** Check whether any of the given damage types match a resistance/immunity/
 *  vulnerability type string. Handles compound types like "fire and acid". */
function matchesDamageType(entryType: string, dmgTypes: string[]): boolean {
  const lower = entryType.toLowerCase()
  return dmgTypes.some(t => t && (lower === t || lower.includes(t)))
}

/** Data about a condition that is expiring on a particular combatant's turn boundary. */
interface ExpiringConditionInfo {
  /** The combatant carrying the condition */
  carrier: CombatantState
  /** The condition itself */
  condition: AppliedCondition
  /** Resolved display name */
  name: string
  /** Whether the carrier is the same as the combatant whose turn it is */
  isSelf: boolean
}

/** Scan all combatants for conditions that expire on `expiringForId`'s turn
 *  boundary of the given type ('eont' or 'sont'). Returns structured info
 *  for each expiring condition. */
function collectExpiringConditions(
  combatants: Record<string, CombatantState>,
  expiringForId: string,
  durationType: 'eont' | 'sont',
  plugin?: SystemPlugin,
): ExpiringConditionInfo[] {
  const results: ExpiringConditionInfo[] = []
  for (const c of Object.values(combatants)) {
    for (const cond of c.conditions) {
      if (cond.duration?.type !== durationType) continue
      const expiresOn = cond.duration.expiresOnId ?? c.id
      if (expiresOn !== expiringForId) continue
      if (cond.duration.remaining != null && cond.duration.remaining > 0) continue
      const def = getConditionDef(cond.conditionId, plugin)
      const name = cond.customName ?? def?.name ?? cond.conditionId
      results.push({ carrier: c, condition: cond, name, isSelf: c.id === expiringForId })
    }
  }
  return results
}

/** Build a PlayerTurnItem for an expiring condition. */
function buildExpireItem(info: ExpiringConditionInfo, durationType: 'eont' | 'sont'): PlayerTurnItem {
  const phase = durationType === 'eont' ? 'end' : 'start'
  const kind = durationType === 'eont' ? 'eont-expire' : 'sont-expire'
  const prefix = durationType === 'eont' ? 'eont' : 'sont'
  return {
    id: `${prefix}-${info.condition.conditionId}-${info.isSelf ? 'self' : info.carrier.id}`,
    phase,
    kind,
    label: info.isSelf ? `${info.name} ends` : `${info.name} on ${info.carrier.name} ends`,
    conditionId: info.condition.conditionId,
    targetId: info.isSelf ? undefined : info.carrier.id,
    targetName: info.isSelf ? undefined : info.carrier.name,
  }
}

/** Remove expired conditions of the given duration type from all combatants.
 *  Conditions with remaining > 0 are decremented instead of removed.
 *  Also handles round-based decrement when durationType is 'eont'. */
function removeExpiredConditions(
  combatants: Record<string, CombatantState>,
  expiringForId: string,
  durationType: 'eont' | 'sont',
): void {
  for (const c of Object.values(combatants)) {
    c.conditions = c.conditions.filter(cond => {
      if (cond.duration?.type === durationType) {
        const expiresOn = cond.duration.expiresOnId ?? c.id
        if (expiresOn !== expiringForId) return true
        if (cond.duration.remaining != null && cond.duration.remaining > 0) {
          cond.duration.remaining--
          return true
        }
        return false
      }
      // Round-based decrement only during EONT removal pass
      if (durationType === 'eont' && cond.duration?.type === 'rounds' && cond.duration.remaining != null) {
        cond.duration.remaining--
        return cond.duration.remaining > 0
      }
      return true
    })
  }
}

/** Parse compound damage type string (e.g. "fire and acid") into individual types. */
function parseDamageTypes(dmgTypeStr: string): string[] {
  const trimmed = dmgTypeStr.trim().toLowerCase()
  return trimmed.includes(' and ') ? trimmed.split(/\s+and\s+/).map(t => t.trim()) : [trimmed]
}

/** Check whether ongoing damage conditions inhibit regeneration. */
function isRegenInhibitedByOngoing(
  inhibitDamageTypes: string[],
  ongoingConds: AppliedCondition[],
): boolean {
  for (const oc of ongoingConds) {
    const dmgTypes = parseDamageTypes(oc.customDescription ?? '')
    if (dmgTypes.some(t => t && inhibitDamageTypes.includes(t))) return true
  }
  return false
}

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
    readiedIds: [],
    turnPhase: 'active',
    turnItems: [],
    stepperIndex: -1,
    playerExpandConditions: true,
    autoHideDeadCreatures: false,
    notifications: [],
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
    deathSaveFailures: combatant.isPC ? 0 : undefined,
  }
  return combatState
}

export function removeCombatant(combatantId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  delete combatState.combatants[combatantId]
  combatState.initiativeOrder = combatState.initiativeOrder.filter(id => id !== combatantId)
  combatState.delayedIds = combatState.delayedIds.filter(id => id !== combatantId)
  combatState.readiedIds = combatState.readiedIds.filter(id => id !== combatantId)
  return combatState
}

export function setInitiative(combatantId: string, initiative: number): CombatState {
  if (!combatState) throw new Error('No active combat')
  const combatant = combatState.combatants[combatantId]
  if (!combatant) throw new Error(`Combatant ${combatantId} not found`)
  combatant.initiative = initiative
  const allIds = Object.keys(combatState.combatants)
  const withInit = allIds.filter(id => combatState!.combatants[id].initiative != null)
  withInit.sort((a, b) => {
    const diff = (combatState!.combatants[b].initiative ?? 0) - (combatState!.combatants[a].initiative ?? 0)
    if (diff !== 0) return diff
    // Same initiative: group members stay adjacent
    const ga = combatState!.combatants[a].initiativeGroupId ?? ''
    const gb = combatState!.combatants[b].initiativeGroupId ?? ''
    return ga.localeCompare(gb)
  })
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

export function setAutoHideDeadCreatures(value: boolean): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.autoHideDeadCreatures = value
  if (value) tryHideDeadCreatures()
  return combatState
}

export function setSurprise(enabled: boolean, actorIds?: string[]): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.surpriseRound = enabled
  combatState.surpriseActorIds = enabled ? (actorIds ?? []) : undefined
  return combatState
}

export function startCombat(): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.phase = 'active'
  combatState.turnPhase = 'active'

  if (combatState.surpriseRound) {
    combatState.round = 0
    const actorSet = new Set(combatState.surpriseActorIds ?? [])
    for (const [id, c] of Object.entries(combatState.combatants)) {
      if (!actorSet.has(id)) {
        c.conditions.push({ conditionId: 'surprised', duration: { type: 'indefinite' } })
        if (!c.conditions.some(cond => cond.conditionId === 'combat-advantage')) {
          c.conditions.push({ conditionId: 'combat-advantage', sourceId: '__surprised', grantsCATo: 'all', duration: { type: 'indefinite' } })
        }
      }
    }
  } else {
    combatState.round = 1
  }

  combatState.turnIndex = 0
  // Skip surprised (and dead) combatants to find the first actor
  while (combatState.turnIndex < combatState.initiativeOrder.length && shouldSkip(combatState.initiativeOrder[combatState.turnIndex])) {
    combatState.turnIndex++
  }

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
  if (!c) return false
  if (c.dead) return true
  // Monsters skip at 0 HP; PCs skip only when explicitly marked dead (they may be Dying but still take turns)
  if (!c.isPC && c.hp <= 0) {
    // Don't skip if creature has a revival ability (Troll Healing, Rise Again, etc.)
    if (getStatBlockRevival(c)) return false
    return true
  }
  // During surprise round (round 0), surprised creatures can't act
  if (combatState.round === 0 && c.conditions.some(co => co.conditionId === 'surprised')) return true
  return false
}

// ──────────────────────────────────────────────────
// Turn Phase State Machine
// ──────────────────────────────────────────────────

// Notification ring buffer cap. Older entries are dropped on push.
const NOTIFICATION_BUFFER_SIZE = 30

/** Push a notification onto the combat-state ring buffer. The player window
 *  derives transient toasts from this list. id and timestamp are auto-filled
 *  if missing so the player side can dedup re-renders and age them out. */
function pushStateNotification(n: CombatNotification): void {
  if (!combatState) return
  const enriched: CombatNotification = {
    ...n,
    id: n.id ?? generateId(),
    timestamp: n.timestamp ?? Date.now(),
  }
  combatState.notifications.push(enriched)
  if (combatState.notifications.length > NOTIFICATION_BUFFER_SIZE) {
    combatState.notifications.splice(0, combatState.notifications.length - NOTIFICATION_BUFFER_SIZE)
  }
}

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
  return item.kind === 'ongoing-damage' || item.kind === 'save' || item.kind === 'recharge' || item.kind === 'death-save' || item.kind === 'revival'
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

/**
 * Build expire items for conditions that the given combatant has applied to
 * *other* combatants and which expire on the given combatant's start- or
 * end-of-turn (i.e. their `expiresOnId === combatant.id`). These appear in
 * the source's own turn info, with a label like "Marked on Bob ends".
 */
function buildSourceExpireItems(
  expiringFor: CombatantState,
  durationType: 'eont' | 'sont',
  plugin?: SystemPlugin,
): PlayerTurnItem[] {
  if (!combatState) return []
  // collectExpiringConditions finds ALL expiring conditions including self-bound ones;
  // filter to only those on other combatants (self-bound handled separately).
  return collectExpiringConditions(combatState.combatants, expiringFor.id, durationType, plugin)
    .filter(info => !info.isSelf)
    .map(info => buildExpireItem(info, durationType))
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
      const def = getConditionDef(cond.conditionId, plugin)
      if (def) condName = def.name
    }
    items.push({
      id: `save-${cond.conditionId}`, phase: 'end', kind: 'save',
      label: saveLabel(condName, saveBonus), conditionId: cond.conditionId,
      damageType: isOngoing ? cond.customDescription : undefined,
    })
  }
  // EONT expirations on conditions this combatant applied to others
  items.push(...buildSourceExpireItems(combatant, 'eont', plugin))
  // Self-EONT expirations (conditions on this combatant whose duration pins to itself)
  if (combatState) {
    const selfExpiring = collectExpiringConditions(combatState.combatants, combatant.id, 'eont', plugin)
      .filter(info => info.isSelf)
    for (const info of selfExpiring) {
      items.push(buildExpireItem(info, 'eont'))
    }
  }
  // Death save for dying PCs
  if (combatant.isPC && combatant.conditions.some(c => c.conditionId === 'dying')) {
    items.push({
      id: `death-save-${combatant.id}`, phase: 'end', kind: 'death-save',
      label: 'Death Save', conditionId: 'dying',
    })
  }
  return items
}

/** Compute actual damage for an ongoing-damage condition after applying
 *  immunities, resistances, and vulnerabilities from the combatant's stat block. */
function computeOngoingDamage(
  rawDmg: number,
  dmgTypes: string[],
  resistances: { type: string; value?: number }[],
  immunities: { type: string }[],
  vulnerabilities: { type: string; value?: number }[],
): { actual: number; notes: string[] } {
  const hasDmgType = dmgTypes.some(t => t !== '')

  let immune = false
  if (hasDmgType) {
    for (const imm of immunities) {
      if (matchesDamageType(imm.type, dmgTypes)) { immune = true; break }
    }
  }

  let resistAmount = 0
  if (hasDmgType && !immune) {
    for (const r of resistances) {
      if (matchesDamageType(r.type, dmgTypes)) resistAmount = Math.max(resistAmount, r.value ?? 0)
    }
  }

  let vulnAmount = 0
  if (hasDmgType && !immune) {
    for (const v of vulnerabilities) {
      if (matchesDamageType(v.type, dmgTypes)) vulnAmount = Math.max(vulnAmount, v.value ?? 0)
    }
  }

  const actual = immune ? 0 : Math.max(0, rawDmg - resistAmount + vulnAmount)
  const notes: string[] = []
  if (immune) notes.push('immune')
  else {
    if (resistAmount > 0) notes.push(`resist ${resistAmount}`)
    if (vulnAmount > 0) notes.push(`vulnerable ${vulnAmount}`)
  }
  return { actual, notes }
}

function buildOngoingDamageItems(combatant: CombatantState): PlayerTurnItem[] {
  const items: PlayerTurnItem[] = []
  const resistances = Array.isArray((combatant.statBlock as any)?.resistances) ? (combatant.statBlock as any).resistances as { type: string; value?: number }[] : []
  const immunities = Array.isArray((combatant.statBlock as any)?.immunities) ? (combatant.statBlock as any).immunities as { type: string }[] : []
  const vulnerabilities = Array.isArray((combatant.statBlock as any)?.weaknesses) ? (combatant.statBlock as any).weaknesses as { type: string; value?: number }[] : []

  for (const cond of combatant.conditions.filter(c => c.conditionId.startsWith('ongoing-damage') && c.value)) {
    const rawDmg = cond.value ?? 0
    const dmgTypes = parseDamageTypes(cond.customDescription ?? '')
    const { actual: actualDmg, notes } = computeOngoingDamage(rawDmg, dmgTypes, resistances, immunities, vulnerabilities)
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

/** Pre-parsed regeneration data from statBlock (set at import time) */
interface StatBlockRegen { value: number; inhibitDamageTypes?: string[] }
/** Pre-parsed revival data from statBlock (set at import time) */
interface StatBlockRevival { hp: number; abilityName: string }

function getStatBlockRegen(combatant: CombatantState): StatBlockRegen | undefined {
  return (combatant.statBlock as any)?.regeneration as StatBlockRegen | undefined
}

function getStatBlockRevival(combatant: CombatantState): StatBlockRevival | undefined {
  return (combatant.statBlock as any)?.revival as StatBlockRevival | undefined
}

/**
 * For creatures with a static Regeneration trait (pre-parsed in statBlock.regeneration),
 * auto-add a "regenerating" condition at turn start when below max HP.
 * Avoids spoiling regen by not adding the condition until the creature is actually damaged.
 */
function autoApplyStaticRegenCondition(combatant: CombatantState): void {
  const regen = getStatBlockRegen(combatant)
  if (!regen) return

  // Don't add if at max HP (avoids spoiling), manually dead, or at 0 HP
  // (standard 4e rule: regeneration requires at least 1 HP)
  if (combatant.hp >= combatant.maxHp || combatant.dead || combatant.hp <= 0) {
    combatant.conditions = combatant.conditions.filter(c => c.conditionId !== 'regenerating')
    return
  }

  // Replace any existing regenerating condition (refresh with parsed values)
  combatant.conditions = combatant.conditions.filter(c => c.conditionId !== 'regenerating')
  combatant.conditions.push({
    conditionId: 'regenerating',
    value: regen.value,
    inhibitDamageTypes: regen.inhibitDamageTypes,
    duration: { type: 'indefinite' },
  })
}

/** Build a single netted regen-vs-ongoing PlayerTurnItem. */
function buildNetRegenItem(regenValue: number, totalOngoing: number): PlayerTurnItem {
  const net = regenValue - totalOngoing
  if (net > 0) {
    return {
      id: 'regen-net', phase: 'start', kind: 'regeneration',
      label: `Regeneration ${regenValue} − ${totalOngoing} ongoing = heal ${net}`,
      value: net, result: 'none',
    }
  } else if (net < 0) {
    return {
      id: 'regen-net', phase: 'start', kind: 'ongoing-damage',
      label: `${totalOngoing} ongoing − ${regenValue} regen = ${Math.abs(net)} damage`,
      value: Math.abs(net),
    }
  } else {
    return {
      id: 'regen-net', phase: 'start', kind: 'regeneration',
      label: `Regeneration ${regenValue} nets with ${totalOngoing} ongoing (no effect)`,
      value: 0, result: 'none',
    }
  }
}

/**
 * Build start-of-turn items for regen and ongoing damage, netting them together.
 * If no regen condition, falls through to standard ongoing damage items.
 */
function buildRegenAndOngoingItems(combatant: CombatantState): PlayerTurnItem[] {
  const regenCond = combatant.conditions.find(c => c.conditionId === 'regenerating')
  const ongoingConds = combatant.conditions.filter(c =>
    c.conditionId.startsWith('ongoing-damage') && c.value)

  // No regen — standard ongoing damage path
  if (!regenCond || !regenCond.value) {
    return buildOngoingDamageItems(combatant)
  }

  const regenValue = regenCond.value

  // Check inhibition from ongoing damage types
  const inhibited = !!(regenCond.inhibitDamageTypes?.length && ongoingConds.length
    && isRegenInhibitedByOngoing(regenCond.inhibitDamageTypes, ongoingConds))

  if (inhibited) {
    return [
      { id: 'regen-suppressed', phase: 'start', kind: 'regeneration', label: 'Regeneration suppressed', value: 0, result: 'none' },
      ...buildOngoingDamageItems(combatant),
    ]
  }

  // Pure regen, no ongoing damage
  if (ongoingConds.length === 0) {
    return [{ id: 'regen', phase: 'start', kind: 'regeneration', label: `Regeneration ${regenValue}`, value: regenValue, result: 'none' }]
  }

  // Net regen against total ongoing damage (after resist/immune/vuln)
  const totalOngoing = buildOngoingDamageItems(combatant).reduce((sum, item) => sum + (item.value ?? 0), 0)
  return [buildNetRegenItem(regenValue, totalOngoing)]
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
      const eontExpiring = collectExpiringConditions(combatState.combatants, currentId, 'eont', plugin)
      for (const info of eontExpiring) {
        endItems.push(buildExpireItem(info, 'eont'))
      }

      // Remove EONT + round-based conditions
      removeExpiredConditions(combatState.combatants, currentId, 'eont')

      // Plugin end-of-turn hooks → save items
      const endActions: unknown[] = []
      if (plugin?.turnHooks?.onTurnEnd) endActions.push(...plugin.turnHooks.onTurnEnd(combatant))
      endItems.push(...buildSaveItems(endActions, currentId))

      // Death save for dying PCs
      if (combatant.isPC && combatant.conditions.some(c => c.conditionId === 'dying')) {
        endItems.push({
          id: `death-save-${currentId}`, phase: 'end', kind: 'death-save',
          label: 'Death Save', conditionId: 'dying',
        })
      }
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
 * Resolve a death save with three possible outcomes.
 * - 'fail': increment death save failure count, mark dead at 3
 * - 'none': no change (10-19 roll)
 * - 'success': spend healing surge, lose dying (20+ roll)
 */
export function resolveDeathSave(index: number, outcome: 'fail' | 'none' | 'success'): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState) throw new Error('No active combat')
  const notifications: CombatNotification[] = []
  const item = combatState.turnItems[index]
  if (!item || item.kind !== 'death-save') return { state: combatState, notifications }

  const currentId = combatState.initiativeOrder[combatState.turnIndex]
  const c = currentId ? combatState.combatants[currentId] : null

  if (c) {
    if (outcome === 'fail') {
      c.deathSaveFailures = (c.deathSaveFailures ?? 0) + 1
      if (c.deathSaveFailures >= 3) {
        c.dead = true
        notifications.push({ type: 'death', combatantId: currentId!, message: `${c.name} has died!` })
      }
    } else if (outcome === 'success') {
      // Successful death save: lose Dying (and Unconscious via removeCondition logic)
      // Queue removal so the UI animation can show first
      pendingResults.push({ combatantId: currentId!, conditionId: 'dying', success: true })
    }
    // 'none' = no state change
  }

  // Mark result on the item (success/fail/none)
  item.result = outcome

  // Advance stepper
  const phase = combatState.turnPhase === 'start-of-turn' ? 'start' : 'end'
  combatState.stepperIndex = findNextActionable(combatState.turnItems, index, phase)
  if (combatState.stepperIndex === -1 && combatState.turnPhase === 'end-of-turn') {
    combatState.turnPhase = 'end-of-turn-done'
  }

  return { state: combatState, notifications }
}

/**
 * Resolve a single stepper item.
 * Ongoing damage: applied immediately. Saves/recharges: queued.
 */
export function resolveItem(index: number, success: boolean, plugin?: SystemPlugin): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState) throw new Error('No active combat')
  const notifications: CombatNotification[] = []
  const item = combatState.turnItems[index]
  if (!item) return { state: combatState, notifications }

  const currentId = combatState.initiativeOrder[combatState.turnIndex]

  if (item.kind === 'ongoing-damage') {
    if (item.value && item.value > 0 && currentId) {
      // Look up the underlying ongoing-damage condition on the carrier so we
      // can attribute the tick to whoever originally applied it.
      const carrier = combatState.combatants[currentId]
      const cond = carrier?.conditions.find(co => co.conditionId === item.conditionId)
      const sourceId = cond?.sourceId
      const result = damageCombatant(currentId, item.value, true, { ongoing: true, damageType: item.damageType, sourceId })
      notifications.push(...result.notifications)
    }
  } else if (item.kind === 'save') {
    pendingResults.push({ combatantId: currentId ?? '', conditionId: item.conditionId, success })
    // Emit a player-toast notification for the save attempt. Look up the
    // condition's display name from the carrier so it matches the toast text
    // for class-mark customNames etc.
    if (currentId && item.conditionId) {
      const carrier = combatState.combatants[currentId]
      const cond = carrier?.conditions.find(co => co.conditionId === item.conditionId)
      const isOngoing = item.conditionId?.startsWith('ongoing-damage')
      const def = getConditionDef(isOngoing ? 'ongoing-damage' : item.conditionId!, plugin)
      const displayName = isOngoing
        ? `Ongoing${cond?.value ? ' ' + cond.value : ''}${cond?.customDescription ? ' ' + cond.customDescription : ''} Damage`
        : (cond?.customName ?? def?.name ?? item.conditionId)
      pushStateNotification({
        type: success ? 'save-success' : 'save-fail',
        combatantId: currentId,
        combatantName: carrier?.name,
        conditionId: item.conditionId,
        conditionName: displayName,
        message: success ? `${carrier?.name} saved vs ${displayName}` : `${carrier?.name} failed save vs ${displayName}`,
      })
    }
  } else if (item.kind === 'revival') {
    if (success && currentId && item.value) {
      healCombatant(currentId, item.value)
      const carrier = combatState.combatants[currentId]
      // Replace heal notification with revival-specific one
      if (combatState.notifications.length > 0) {
        const last = combatState.notifications[combatState.notifications.length - 1]
        if (last.combatantId === currentId && last.type === 'heal') {
          last.type = 'regeneration'
          last.message = `${carrier?.name} revives!`
          last.amount = undefined
        }
      }
    }
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
/** Mark eligible dead creatures as hiddenDead. A dead creature is hideable when:
 *  1. It has no Regeneration action in its stat block
 *  2. No condition on any combatant expires on its turn (SONT/EONT with expiresOnId) */
function tryHideDeadCreatures(): void {
  if (!combatState) return
  // Collect all expiresOnId references from live conditions
  const referencedIds = new Set<string>()
  for (const c of Object.values(combatState.combatants)) {
    for (const cond of c.conditions) {
      if (cond.duration?.expiresOnId && (cond.duration.type === 'sont' || cond.duration.type === 'eont')) {
        referencedIds.add(cond.duration.expiresOnId)
      }
    }
  }
  for (const c of Object.values(combatState.combatants)) {
    if (c.hiddenDead) continue
    const isDead = c.dead || (!c.isPC && c.hp <= 0)
    if (!isDead) continue
    // Don't hide creatures with regen or revival abilities
    if (c.conditions.some(co => co.conditionId === 'regenerating')) continue
    if (getStatBlockRegen(c)) continue
    if (getStatBlockRevival(c)) continue
    if (referencedIds.has(c.id)) continue
    c.hiddenDead = true
  }
}

export function commitAndAdvance(plugin?: SystemPlugin, extraNotifications?: CombatNotification[]): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState) throw new Error('No active combat')
  const notifications = extraNotifications ? [...extraNotifications] : []

  applyPendingResults()

  // Advance turn pointer
  combatState.turnIndex++
  while (combatState.turnIndex < combatState.initiativeOrder.length && shouldSkip(combatState.initiativeOrder[combatState.turnIndex])) combatState.turnIndex++

  if (combatState.turnIndex >= combatState.initiativeOrder.length) {
    combatState.round++
    // Transitioning from surprise round to round 1: remove all Surprised conditions
    if (combatState.round === 1 && combatState.surpriseRound) {
      for (const c of Object.values(combatState.combatants)) {
        c.conditions = c.conditions.filter(cond =>
          cond.conditionId !== 'surprised'
          && !(cond.conditionId === 'combat-advantage' && cond.sourceId === '__surprised')
        )
      }
    }
    combatState.turnIndex = 0
    decrementRoundEffects()
    while (combatState.turnIndex < combatState.initiativeOrder.length && shouldSkip(combatState.initiativeOrder[combatState.turnIndex])) combatState.turnIndex++
  }

  // Start-of-turn for new combatant
  const startItems: PlayerTurnItem[] = []
  const newId = combatState.initiativeOrder[combatState.turnIndex]
  if (newId) {
    const combatant = combatState.combatants[newId]
    if (combatant) {
      // Collect SONT expirations
      const sontExpiring = collectExpiringConditions(combatState.combatants, newId, 'sont', plugin)
      for (const info of sontExpiring) {
        startItems.push(buildExpireItem(info, 'sont'))
      }

      // Remove SONT conditions
      removeExpiredConditions(combatState.combatants, newId, 'sont')

      combatant.usedReaction = false

      // ── Check manual inhibition (DM removed Regenerating condition) ──
      const regenInhibited = combatant.regenInhibited ?? false
      combatant.regenInhibited = undefined

      // ── Revival check (creature at 0 HP with revival ability) ──
      let revived = false
      const revival = getStatBlockRevival(combatant)
      if (combatant.hp <= 0 && !combatant.dead && revival) {
        const regen = getStatBlockRegen(combatant)
        if (regen) {
          // Has both regen + revival (e.g. Troll): auto-revive if regen is not inhibited
          if (!regenInhibited) {
            healCombatant(newId, revival.hp)
            // Replace heal notification with revival-specific one
            if (combatState.notifications.length > 0) {
              const last = combatState.notifications[combatState.notifications.length - 1]
              if (last.combatantId === newId && last.type === 'heal') {
                last.type = 'regeneration'
                last.message = `${combatant.name} revives via ${revival.abilityName}!`
                last.amount = undefined
              }
            }
            startItems.push({
              id: 'revival', phase: 'start', kind: 'revival',
              label: `${revival.abilityName}: revived with ${revival.hp} HP`,
              value: revival.hp, result: 'none',
            })
            revived = true
          } else {
            startItems.push({
              id: 'revival-inhibited', phase: 'start', kind: 'revival',
              label: `${revival.abilityName}: suppressed`,
              value: 0, result: 'none',
            })
            pushStateNotification({
              type: 'regeneration',
              combatantId: newId,
              combatantName: combatant.name,
              message: `${combatant.name} did not regenerate this turn!`,
            })
          }
        } else {
          // Revival only (no regen) — prompt the DM
          startItems.push({
            id: 'revival', phase: 'start', kind: 'revival',
            label: `${revival.abilityName}: revive with ${revival.hp} HP?`,
            value: revival.hp,
          })
        }
      }

      // ── Regeneration + ongoing damage (only if alive and didn't just revive) ──
      if (combatant.hp > 0 && !revived) {
        // Auto-add Regenerating condition for static regen creatures (if below max HP)
        autoApplyStaticRegenCondition(combatant)

        if (regenInhibited && getStatBlockRegen(combatant)) {
          pushStateNotification({
            type: 'regeneration',
            combatantId: newId,
            combatantName: combatant.name,
            message: `${combatant.name} did not regenerate this turn!`,
          })
        }

        const regenOngoingItems = regenInhibited
          ? buildOngoingDamageItems(combatant)
          : buildRegenAndOngoingItems(combatant)
        for (const ri of regenOngoingItems) {
          // Notify players when regen is suppressed by damage types
          if (ri.id === 'regen-suppressed') {
            pushStateNotification({
              type: 'regeneration',
              combatantId: newId,
              combatantName: combatant.name,
              message: `${combatant.name} did not regenerate this turn!`,
            })
          }
          if (ri.kind === 'regeneration' && ri.result === 'none' && ri.value && ri.value > 0) {
            const before = combatant.hp
            healCombatant(newId, ri.value)
            const actual = combatant.hp - before
            if (actual > 0) {
              ri.label = ri.label.replace(/heal \d+$/, `heal ${actual}`)
              // Replace generic heal notification with regen-specific one
              if (combatState.notifications.length > 0) {
                const last = combatState.notifications[combatState.notifications.length - 1]
                if (last.combatantId === newId && last.type === 'heal') {
                  last.type = 'regeneration'
                  last.message = `${combatant.name} regenerates!`
                  last.amount = undefined
                }
              }
            } else {
              ri.value = 0
            }
          }
        }
        startItems.push(...regenOngoingItems)
      }
      // Recharges
      const startActions: unknown[] = []
      if (plugin?.turnHooks?.onTurnStart) startActions.push(...plugin.turnHooks.onTurnStart(combatant))
      startItems.push(...buildRechargeItems(startActions))

      // If actionable start items, enter stepper
      const first = findFirstActionable(startItems, 'start')
      if (first >= 0) {
        combatState.turnPhase = 'start-of-turn'
        combatState.turnItems = [...startItems, ...buildEndOfTurnPreview(combatant, plugin)]
        combatState.stepperIndex = first
        if (combatState.autoHideDeadCreatures) tryHideDeadCreatures()
        return { state: combatState, notifications }
      }
    }
  }

  // No start items — turn is active
  const newCombatant = newId ? combatState.combatants[newId] : null
  combatState.turnPhase = 'active'
  combatState.turnItems = [...startItems, ...buildEndOfTurnPreview(newCombatant, plugin)]
  combatState.stepperIndex = -1
  if (combatState.autoHideDeadCreatures) tryHideDeadCreatures()
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
/**
 * Refresh the end-of-turn preview items for the current combatant.
 * Called after conditions change mid-turn so the sidebar reflects the current state.
 */
export function refreshEndOfTurnPreview(plugin?: SystemPlugin): void {
  if (!combatState) return
  // Only refresh if we're in the active phase (not during a stepper)
  if (combatState.turnPhase !== 'active') return
  const curId = combatState.initiativeOrder[combatState.turnIndex]
  const cur = curId ? combatState.combatants[curId] : null
  // Keep any non-end items, replace end items with fresh preview
  const startItems = combatState.turnItems.filter(i => i.phase === 'start')
  combatState.turnItems = [...startItems, ...buildEndOfTurnPreview(cur, plugin)]
}

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

export function readyCombatant(combatantId: string, actionText: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  if (!combatState.readiedIds.includes(combatantId)) combatState.readiedIds.push(combatantId)
  combatState.combatants[combatantId].readiedAction = actionText
  const idx = combatState.initiativeOrder.indexOf(combatantId)
  if (idx >= 0) {
    combatState.initiativeOrder = combatState.initiativeOrder.filter(id => id !== combatantId)
    if (idx < combatState.turnIndex) combatState.turnIndex--
  }
  while (combatState.turnIndex < combatState.initiativeOrder.length && shouldSkip(combatState.initiativeOrder[combatState.turnIndex])) combatState.turnIndex++
  return combatState
}

export function resolveReadiedAction(combatantId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.readiedIds = combatState.readiedIds.filter(id => id !== combatantId)
  const c = combatState.combatants[combatantId]
  if (c) c.readiedAction = undefined
  // Insert before the current creature; skip if dead
  if (!shouldSkip(combatantId)) {
    combatState.initiativeOrder.splice(combatState.turnIndex, 0, combatantId)
    combatState.turnIndex++
  }
  return combatState
}

export function cancelReady(combatantId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  combatState.readiedIds = combatState.readiedIds.filter(id => id !== combatantId)
  const c = combatState.combatants[combatantId]
  if (c) c.readiedAction = undefined
  // Slot in after the current creature
  if (!shouldSkip(combatantId)) {
    const insertIdx = combatState.turnIndex + 1
    combatState.initiativeOrder.splice(insertIdx, 0, combatantId)
  }
  return combatState
}

export function damageCombatant(
  combatantId: string,
  amount: number,
  wasHit: boolean = true,
  opts: { sourceId?: string; ongoing?: boolean; damageType?: string } = {},
): { state: CombatState; notifications: CombatNotification[] } {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  const notifications: CombatNotification[] = []
  const isMinion = !!(c.statBlock && (c.statBlock as Record<string, unknown>).isMinion)
  // Minions take no damage from a miss, even if the power deals half on miss
  if (isMinion && !wasHit) return { state: combatState, notifications }
  const wasAlreadyDead = c.hp <= 0 || c.dead
  let remaining = amount
  if (c.tempHp > 0) { const absorbed = Math.min(c.tempHp, remaining); c.tempHp -= absorbed; remaining -= absorbed }
  c.hp = Math.max(0, c.hp - remaining)
  // Track damage type inhibition for regeneration
  if (opts.damageType) {
    const regen = getStatBlockRegen(c)
    if (regen?.inhibitDamageTypes?.includes(opts.damageType.toLowerCase())) {
      c.regenInhibited = true
    }
  }
  // Auto-bloodied management — only for monsters, and never for minions (they have no bloodied state)
  let crossedBloodied = false
  if (!c.isPC && !isMinion) {
    const isBloodied = c.maxHp > 0 && c.hp <= c.maxHp / 2 && c.hp > 0
    const hasBloodied = c.conditions.some(cond => cond.conditionId === 'bloodied')
    if (isBloodied && !hasBloodied) {
      c.conditions.push({ conditionId: 'bloodied', duration: { type: 'indefinite' } })
      notifications.push({ type: 'bloodied', combatantId, message: `${c.name} is Bloodied!` })
      crossedBloodied = true
    } else if (!isBloodied && hasBloodied) {
      c.conditions = c.conditions.filter(cond => cond.conditionId !== 'bloodied')
    }
  }
  // Player-toast damage notification (only for nonzero damage)
  if (amount > 0 && !wasAlreadyDead) {
    const sourceName = opts.sourceId ? combatState.combatants[opts.sourceId]?.name : undefined
    pushStateNotification({
      type: 'damage',
      combatantId,
      combatantName: c.name,
      sourceId: opts.sourceId && opts.sourceId !== combatantId ? opts.sourceId : undefined,
      sourceName: opts.sourceId && opts.sourceId !== combatantId ? sourceName : undefined,
      amount,
      becameBloodied: crossedBloodied,
      ongoing: opts.ongoing,
      damageType: opts.damageType,
      message: `${c.name} took ${amount} damage`,
    })
  }
  if (c.hp <= 0) {
    notifications.push({ type: 'death', combatantId, message: c.isPC ? `${c.name} is down!` : `${c.name} is defeated!` })
    if (!wasAlreadyDead) {
      const sourceName = opts.sourceId ? combatState.combatants[opts.sourceId]?.name : undefined
      pushStateNotification({
        type: 'death',
        combatantId,
        combatantName: c.name,
        sourceId: opts.sourceId && opts.sourceId !== combatantId ? opts.sourceId : undefined,
        sourceName: opts.sourceId && opts.sourceId !== combatantId ? sourceName : undefined,
        message: c.isPC ? `${c.name} is down!` : `${c.name} was slain!`,
      })
    }
  }
  return { state: combatState, notifications }
}

export function healCombatant(combatantId: string, amount: number, opts: { sourceId?: string } = {}): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  const before = c.hp
  c.hp = Math.min(c.maxHp, c.hp + amount)
  const actual = c.hp - before
  // Auto-unbloodied — only for monsters
  if (!c.isPC && c.maxHp > 0 && c.hp > c.maxHp / 2) {
    c.conditions = c.conditions.filter(cond => cond.conditionId !== 'bloodied')
  }
  if (actual > 0) {
    const sourceName = opts.sourceId ? combatState.combatants[opts.sourceId]?.name : undefined
    pushStateNotification({
      type: 'heal',
      combatantId,
      combatantName: c.name,
      sourceId: opts.sourceId && opts.sourceId !== combatantId ? opts.sourceId : undefined,
      sourceName: opts.sourceId && opts.sourceId !== combatantId ? sourceName : undefined,
      amount: actual,
      message: `${c.name} was healed for ${actual}`,
    })
  }
  return combatState
}

export function addCondition(combatantId: string, condition: AppliedCondition, plugin?: SystemPlugin): CombatState {
  if (!combatState) throw new Error('No active combat')
  // Surprised is engine-managed only — cannot be manually applied
  if (condition.conditionId === 'surprised') return combatState
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  // Determine if this is a "new" application (vs replacing an existing instance
  // of the same condition id) — used to suppress no-op notifications.
  const wasAlreadyPresent = c.conditions.some(co => co.conditionId === condition.conditionId)
  // Resolve display name. customName overrides everything (used by defender
  // class marks to render "Challenged" instead of "Marked"). Otherwise fall
  // back to the plugin's def name, then the raw id.
  const def = getConditionDef(condition.conditionId, plugin)
  const displayName = condition.customName ?? def?.name ?? condition.conditionId
  // Suppress notifications for engine-internal/hidden condition defs
  // (`bloodied`, `ongoing-damage` shim, etc.) — those are noise.
  const suppress = !!def?.hidden || condition.conditionId === 'bloodied'
  if (condition.conditionId === 'ongoing-damage') {
    c.conditions.push({ ...condition, conditionId: `ongoing-damage-${generateId()}` })
    // Emit an "applied" notification for the player toast — distinct from the
    // per-tick damage notifications fired later by resolveItem.
    if (condition.value && condition.value > 0) {
      const sourceId = condition.sourceId
      const sourceName = sourceId ? combatState.combatants[sourceId]?.name : undefined
      const isSelf = !sourceId || sourceId === combatantId
      pushStateNotification({
        type: 'condition',
        combatantId,
        combatantName: c.name,
        sourceId: isSelf ? undefined : sourceId,
        sourceName: isSelf ? undefined : sourceName,
        conditionId: 'ongoing-damage',
        conditionName: 'Ongoing Damage',
        amount: condition.value,
        damageType: condition.customDescription,
        message: `${c.name} started taking ongoing damage`,
      })
    }
  } else if (condition.conditionId === 'dying') {
    // Dying auto-applies unconscious + prone (and inits death save counter)
    c.conditions = c.conditions.filter(cond => cond.conditionId !== 'dying' && cond.conditionId !== 'unconscious')
    c.conditions.push(condition)
    c.conditions.push({ conditionId: 'unconscious', duration: { type: 'indefinite' } } as AppliedCondition)
    if (!c.conditions.some(cond => cond.conditionId === 'prone')) {
      c.conditions.push({ conditionId: 'prone', duration: { type: 'indefinite' } } as AppliedCondition)
    }
    if (c.deathSaveFailures == null) c.deathSaveFailures = 0
  } else if (condition.conditionId === 'grabbed') {
    // Grabbed implies immobilized — tag the implied instance with
    // sourceId='__grabbed' so we can distinguish it from independently
    // applied immobilized on removal.
    c.conditions = c.conditions.filter(cond => cond.conditionId !== 'grabbed')
    c.conditions.push(condition)
    if (!c.conditions.some(cond => cond.conditionId === 'immobilized')) {
      c.conditions.push({ conditionId: 'immobilized', sourceId: '__grabbed', duration: condition.duration ?? { type: 'indefinite' } } as AppliedCondition)
    }
  } else {
    c.conditions = c.conditions.filter(cond => cond.conditionId !== condition.conditionId)
    c.conditions.push(condition)
  }
  // Emit a player-toast notification for the application. Skip ongoing-damage
  // (handled separately on each tick), hidden defs, and pure no-op replacements
  // — except for class marks where re-application means a new source/target
  // pair the player should still see.
  if (!suppress && !condition.conditionId.startsWith('ongoing-damage')) {
    const isClassMark = condition.conditionId === 'marked' || (def && def.id !== condition.conditionId)
    const isClassMarkAlias = condition.conditionId.startsWith('mark-')
    if (!wasAlreadyPresent || isClassMark || isClassMarkAlias) {
      const sourceId = condition.sourceId
      const sourceName = sourceId ? combatState.combatants[sourceId]?.name : undefined
      const isSelf = !sourceId || sourceId === combatantId
      pushStateNotification({
        type: 'condition',
        combatantId,
        combatantName: c.name,
        sourceId: isSelf ? undefined : sourceId,
        sourceName: isSelf ? undefined : sourceName,
        conditionId: condition.conditionId,
        conditionName: displayName,
        message: def
          ? `${c.name} was ${displayName}${isSelf ? '' : ` by ${sourceName ?? '?'}`}`
          : `${c.name} gained condition "${displayName}"`,
      })
    }
  }
  return combatState
}

export function removeCondition(combatantId: string, conditionId: string): CombatState {
  if (!combatState) throw new Error('No active combat')
  const c = combatState.combatants[combatantId]
  if (!c) throw new Error(`Combatant ${combatantId} not found`)
  c.conditions = c.conditions.filter(cond => cond.conditionId !== conditionId)
  // Removing Regenerating from a static-regen creature = manual inhibition for next turn
  if (conditionId === 'regenerating' && getStatBlockRegen(c)) {
    c.regenInhibited = true
  }
  // Removing Dying also clears Unconscious (but Prone stays — they need to stand up)
  if (conditionId === 'dying') {
    c.conditions = c.conditions.filter(cond => cond.conditionId !== 'unconscious')
  }
  // Removing Grabbed clears the implied Immobilized (tagged with sourceId='__grabbed'),
  // but leaves independently applied Immobilized intact.
  if (conditionId === 'grabbed') {
    c.conditions = c.conditions.filter(cond => !(cond.conditionId === 'immobilized' && cond.sourceId === '__grabbed'))
  }
  // Removing Surprised clears the implied Grants CA (tagged with sourceId='__surprised'),
  // but leaves independently applied combat-advantage intact.
  if (conditionId === 'surprised') {
    c.conditions = c.conditions.filter(cond => !(cond.conditionId === 'combat-advantage' && cond.sourceId === '__surprised'))
  }
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
    // Hidden creatures and auto-hidden dead are completely omitted from the player state
    if (c.hidden || c.hiddenDead) continue
    // During initiative entry, players only see PCs — monsters are revealed
    // when the DM clicks "Start Combat"
    if (state.phase === 'initiative-entry' && !c.isPC) continue
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
      dead: c.dead, deathSaveFailures: c.deathSaveFailures,
      hpDescriptor: label,
      hpPct,
      hpColor: color,
      conditions: c.conditions.map(cond => {
        const def = getConditionDef(cond.conditionId, plugin)
        const expiresOnId = cond.duration?.expiresOnId
        return {
          conditionId: cond.conditionId,
          name: cond.customName ?? def?.name ?? cond.conditionId,
          value: cond.value,
          // Prefer the def's static description (the rules text). customDescription
          // is normally a label suffix like "by X" — already in the pill label —
          // and shouldn't override the description. Custom/ad-hoc conditions
          // without a def fall back to it.
          description: def?.description ?? cond.customDescription,
          customDescription: cond.customDescription,
          damageType: cond.conditionId.startsWith('ongoing-damage') ? cond.customDescription : undefined,
          durationType: cond.duration?.type,
          expiresOnName: expiresOnId ? state.combatants[expiresOnId]?.name : undefined,
          customColor: cond.customColor,
          customIcon: cond.customIcon,
          grantsCATo: cond.grantsCATo,
          sourceId: cond.sourceId,
        }
      }),
      readiedAction: c.readiedAction,
      effects: c.effects.map(e => ({ name: e.name })),
      miniIndicator: c.miniIndicator,
      miniNumber: c.miniNumber,
      imageId: c.imageId,
      tokenImageId: c.tokenImageId,
      color: c.color,
    }
  }

  // Filter hidden creatures from the player-visible initiative order
  const hiddenIds = new Set(Object.entries(state.combatants).filter(([_, c]) => c.hidden || c.hiddenDead).map(([id]) => id))
  const filteredOrder = state.initiativeOrder.filter(id => !hiddenIds.has(id))
  const filteredDelayed = state.delayedIds.filter(id => !hiddenIds.has(id))
  const filteredReadied = state.readiedIds.filter(id => !hiddenIds.has(id))
  // Adjust turnIndex to the filtered order: find which visible creature is currently active
  const currentId = state.initiativeOrder[state.turnIndex]
  const filteredTurnIndex = currentId ? filteredOrder.indexOf(currentId) : 0

  return {
    round: state.round,
    phase: state.phase,
    turnIndex: Math.max(0, filteredTurnIndex),
    initiativeOrder: filteredOrder,
    combatants,
    delayedIds: filteredDelayed,
    readiedIds: filteredReadied,
    notifications: state.notifications ?? [],
    activeInitiativeId: hiddenIds.has(state.activeInitiativeId ?? '') ? undefined : state.activeInitiativeId,
    turnPhase: state.turnPhase,
    turnItems: state.turnItems ?? [],
    stepperIndex: state.stepperIndex ?? -1,
    playerExpandConditions: state.playerExpandConditions ?? true,
    surpriseRound: state.surpriseRound,
  }
}
