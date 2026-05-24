import { useState, useEffect, useCallback, useRef } from 'react'
import { useCombatStore } from '../../stores/combat-store'
import { useUiStore } from '../../stores/ui-store'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { getPluginUI } from '../../plugins/registry'
import type { PluginUIComponents } from '../../plugins/plugin-types'
import type { CombatNotification, CombatantState } from '@common/types'
import { InitiativeEntry } from './InitiativeEntry'
import { InitiativeList } from './InitiativeList'
import { CombatantDetail } from './CombatantDetail'
import { DamageHealDialog } from './DamageHealDialog'
import { ConditionDialog } from './ConditionDialog'
import { PinnedCardsPanel, type PinnedCard } from './PinnedCardsPanel'
import { QuickConditionMenu } from './QuickConditionMenu'
import { CombatLogPanel } from './CombatLogPanel'
import { Modal } from '../shared/Modal'
import { PopoutStatblockPanel } from './PopoutStatblockPanel'
import { AttackApplyPanel } from './AttackApplyPanel'
import { ReadyActionDialog } from './ReadyActionDialog'
import { EffectDialog } from './EffectDialog'

export interface AttackMode {
  phase: 'select' | 'resolve' | 'apply'
  targetIds: string[]
  results: Record<string, 'hit' | 'miss' | null>
  currentIndex: number
  defense?: string  // which defense to display (AC/Fortitude/Reflex/Will)
  singleTarget?: boolean
}

export function CombatView() {
  const combat = useCombatStore((s) => s.combat)
  const { setView } = useUiStore()
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const handleSelect = useCallback((id: string, event?: React.MouseEvent) => {
    if (event?.shiftKey) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    } else {
      setSelectedIds(prev => prev.length === 1 && prev[0] === id ? [] : [id])
    }
  }, [])
  const [pluginUI, setPluginUI] = useState<PluginUIComponents | null>(null)
  const [notifications, setNotifications] = useState<CombatNotification[]>([])
  const [combatEvents, setCombatEvents] = useState<import('@common/types').CombatEvent[]>([])
  const [showLog, setShowLog] = useState(false)
  const [pinnedCards, setPinnedCards] = useState<PinnedCard[]>([])
  const [poppedOutStatblockIds, setPoppedOutStatblockIds] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ combatantId: string; x: number; y: number } | null>(null)
  const [attackMode, setAttackMode] = useState<AttackMode | null>(null)
  const [hideInspectedActions, setHideInspectedActions] = useState(true)
  const [pendingCondition, setPendingCondition] = useState<{ conditionId: string; value?: number; customDescription?: string; sourceId?: string; duration?: any; multi: boolean; grantsCATo?: 'all' | 'source' | 'source-allies' } | null>(null)
  const [pendingAction, setPendingAction] = useState<{ type: 'damage' | 'heal'; multi: boolean } | null>(null)
  const [readyDialog, setReadyDialog] = useState<{ combatantId: string } | null>(null)
  const [dialog, setDialog] = useState<
    | { type: 'damage' | 'heal'; combatantId: string; initialAmount?: number; multiTargetIds?: string[] }
    | { type: 'condition'; combatantId: string }
    | null
  >(null)

  // Load plugin UI
  useEffect(() => {
    if (systemPlugin?.id) getPluginUI(systemPlugin.id).then(setPluginUI)
  }, [systemPlugin?.id])

  const addEvent = useCallback((type: import('@common/types').CombatEventType, targetId: string, targetName: string, data: Record<string, unknown> = {}, sourceId?: string, sourceName?: string, roundOverride?: number) => {
    setCombatEvents(prev => {
      // Check if the last event cancels out with this one
      if (prev.length > 0) {
        const last = prev[prev.length - 1]
        if (last.targetId === targetId) {
          const lastCond = (last.data as any)?.conditionId
          const thisCond = (data as any)?.conditionId
          if (lastCond && thisCond && lastCond === thisCond) {
            const isInverse = (last.type === 'condition-applied' && type === 'condition-removed')
              || (last.type === 'condition-removed' && type === 'condition-applied')
            if (isInverse) return prev.slice(0, -1)  // remove last event, don't add new one
          }
        }
      }
      return [...prev, {
        timestamp: Date.now(),
        round: roundOverride ?? combat?.round ?? 0,
        type, targetId, targetName, data, sourceId, sourceName,
      }]
    })
  }, [combat?.round])

  const addNotificationsToLog = useCallback((notifs: CombatNotification[]) => {
    for (const n of notifs) {
      const type = n.type as import('@common/types').CombatEventType
      const data: Record<string, unknown> = {}
      if (n.detail) {
        // Parse roll details from notification detail strings
        const rollMatch = n.detail.match(/Rolled (\d+)/)
        if (rollMatch) data.roll = parseInt(rollMatch[1])
        const dcMatch = n.detail.match(/DC (\d+)/)
        if (dcMatch) data.dc = parseInt(dcMatch[1])
        const threshMatch = n.detail.match(/vs (\d+)\+/)
        if (threshMatch) data.threshold = parseInt(threshMatch[1])
        const bonusMatch = n.detail.match(/\+ (\d+) =/)
        if (bonusMatch) data.bonus = parseInt(bonusMatch[1])
      }
      // Extract condition/power name from message
      if (type === 'save-success' || type === 'save-fail') {
        const m = n.message.match(/vs (.+?)!?$/)
        if (m) data.conditionName = m[1]
      }
      if (type === 'recharge-success' || type === 'recharge-fail') {
        const m = n.message.match(/: (.+?)(?:\s+recharged|\s+failed)/)
        if (m) data.powerName = m[1]
      }
      addEvent(type, n.combatantId, combat?.combatants[n.combatantId]?.name ?? n.combatantId, data)
    }
  }, [addEvent, combat])

  // Diff combat state to detect condition changes and log them
  const prevCombatRef = useRef<typeof combat>(null)
  useEffect(() => {
    const prev = prevCombatRef.current
    if (prev && combat) {
      for (const [id, c] of Object.entries(combat.combatants)) {
        const pc = prev.combatants[id]
        if (!pc) continue
        const prevCondIds = new Set(pc.conditions.map(c => c.conditionId))
        const currCondIds = new Set(c.conditions.map(c => c.conditionId))
        // New conditions
        for (const cond of c.conditions) {
          if (!prevCondIds.has(cond.conditionId)) {
            const def = conditionDefs.find((d: any) => d.id === cond.conditionId) ?? (cond.conditionId.startsWith('ongoing-damage') ? conditionDefs.find((d: any) => d.id === 'ongoing-damage') : undefined)
            let name = cond.customName ?? def?.name ?? cond.conditionId
            if (cond.conditionId.startsWith('ongoing-damage')) name = `Ongoing ${cond.value ?? ''}${cond.customDescription ? ' ' + cond.customDescription : ''} damage`
            const duration = (cond.duration?.type === 'save-ends' || cond.duration?.type === 'unlimited') ? 'save ends'
              : cond.duration?.type === 'rounds' ? `${cond.duration.remaining} rounds`
              : cond.duration?.type === 'encounter' ? 'encounter' : undefined
            addEvent('condition-applied', id, c.name, {
              conditionId: cond.conditionId, conditionName: name,
              value: cond.value, duration,
            }, cond.sourceId, cond.sourceId ? combat.combatants[cond.sourceId]?.name : undefined)
          }
        }
        // Removed conditions
        for (const cond of pc.conditions) {
          if (!currCondIds.has(cond.conditionId)) {
            const def = conditionDefs.find((d: any) => d.id === cond.conditionId) ?? (cond.conditionId.startsWith('ongoing-damage') ? conditionDefs.find((d: any) => d.id === 'ongoing-damage') : undefined)
            let name = cond.customName ?? def?.name ?? cond.conditionId
            if (cond.conditionId.startsWith('ongoing-damage')) name = `Ongoing ${cond.value ?? ''}${cond.customDescription ? ' ' + cond.customDescription : ''} damage`
            else if (cond.conditionId === 'marked' && cond.customDescription) name += ` ${cond.customDescription}`
            addEvent('condition-removed', id, c.name, { conditionId: cond.conditionId, conditionName: name })
          }
        }
      }
    }
    prevCombatRef.current = combat
  }, [combat])

  // Handler for applying a condition via target selection (from power card keyword click)
  const handleApplyConditionToTargets = useCallback((condition: { conditionId: string; value?: number; duration?: any }, multi: boolean) => {
    setPendingCondition({ ...condition, multi })
    // Enter target selection mode
    setAttackMode({ phase: 'select', targetIds: [], results: {}, currentIndex: 0, singleTarget: !multi })
  }, [])



  // Log the very first turn-start when combat begins
  const firstTurnLogged = useRef(false)
  useEffect(() => {
    if (combat?.phase === 'active') {
      const currentId = combat.initiativeOrder[combat.turnIndex]
      if (currentId && !firstTurnLogged.current) {
        firstTurnLogged.current = true
        const name = combat.combatants[currentId]?.name
        if (name) addEvent('turn-start', currentId, name, {}, undefined, undefined, combat.round)
      }
    } else {
      firstTurnLogged.current = false
    }
  }, [combat?.turnIndex, combat?.round, combat?.phase])

  // Auto-select current attack target during resolve phase
  useEffect(() => {
    if (attackMode?.phase === 'resolve') {
      const targetId = attackMode.targetIds[attackMode.currentIndex]
      if (targetId) setSelectedIds([targetId])
    }
  }, [attackMode?.phase, attackMode?.currentIndex])

  // Clear notifications on turn change
  useEffect(() => {
    setNotifications([])
  }, [combat?.turnIndex, combat?.round])

  // Log turn-start when turnIndex changes
  const prevTurnRef = useRef<{ turnIndex: number; round: number } | null>(null)
  useEffect(() => {
    if (!combat || combat.phase !== 'active') return
    const prev = prevTurnRef.current
    prevTurnRef.current = { turnIndex: combat.turnIndex, round: combat.round }
    if (prev && (prev.turnIndex !== combat.turnIndex || prev.round !== combat.round)) {
      const newId = combat.initiativeOrder[combat.turnIndex]
      const newName = newId ? combat.combatants[newId]?.name : null
      if (newId && newName) addEvent('turn-start', newId, newName, {}, undefined, undefined, combat.round)
    }
  }, [combat?.turnIndex, combat?.round])

  const handleEndTurn = useCallback(async () => {
    const result = await window.api.combat.endTurn()
    if (result?.notifications?.length) addNotificationsToLog(result.notifications)
  }, [addNotificationsToLog])

  const handleResolveItem = useCallback(async (success: boolean) => {
    if (!combat || combat.stepperIndex < 0) return
    const item = combat.turnItems[combat.stepperIndex]
    if (!item) return

    const currentId = combat.initiativeOrder[combat.turnIndex]
    const name = currentId ? combat.combatants[currentId]?.name ?? '' : ''

    // Log notification locally
    if (item.kind === 'ongoing-damage') {
      if (item.value && item.value > 0) addNotificationsToLog([{ type: 'damage' as any, combatantId: currentId ?? '', message: `${name}: ${item.label}` }])
    } else if (item.kind === 'save') {
      const msg = success ? `${name} saved vs ${item.label}!` : `${name} failed: ${item.label}`
      addNotificationsToLog([{ type: success ? 'save-success' : 'save-fail', combatantId: currentId ?? '', message: msg }])
    } else if (item.kind === 'recharge') {
      const msg = success ? `${name}: recharged!` : `${name}: failed to recharge`
      addNotificationsToLog([{ type: success ? 'recharge-success' : 'recharge-fail', combatantId: currentId ?? '', message: msg }])
    }

    await window.api.combat.resolveItem(combat.stepperIndex, success)
  }, [combat, addNotificationsToLog])

  const handleResolveDeathSave = useCallback(async (outcome: 'fail' | 'none' | 'success') => {
    if (!combat || combat.stepperIndex < 0) return
    const item = combat.turnItems[combat.stepperIndex]
    if (!item || item.kind !== 'death-save') return
    const currentId = combat.initiativeOrder[combat.turnIndex]
    const name = currentId ? combat.combatants[currentId]?.name ?? '' : ''
    const msg = outcome === 'success' ? `${name} stabilized!`
      : outcome === 'fail' ? `${name} failed death save`
      : `${name}: death save unchanged`
    addNotificationsToLog([{ type: outcome === 'success' ? 'save-success' : outcome === 'fail' ? 'save-fail' : 'save-fail', combatantId: currentId ?? '', message: msg }])
    await window.api.combat.resolveDeathSave(combat.stepperIndex, outcome)
  }, [combat, addNotificationsToLog])

  const handleEndCombat = useCallback(async () => {
    await window.api.combat.end()
    setView({ type: 'home' })
  }, [setView])

  const handleDamage = useCallback(async (combatantId: string, amount: number, wasHit: boolean = true) => {
    const name = combat?.combatants[combatantId]?.name ?? 'Creature'
    addEvent('damage', combatantId, name, { amount })
    // Damage is almost always dealt by whoever's turn it currently is — pass
    // that as the source for player-toast attribution.
    const sourceId = combat?.initiativeOrder[combat?.turnIndex ?? 0]
    const result = await window.api.combat.damage(combatantId, amount, wasHit, sourceId)
    if (result?.notifications?.length) {
      setNotifications(prev => [...prev, ...result.notifications])
      addNotificationsToLog(result.notifications)
    }
    setDialog(null)
  }, [combat, addEvent, addNotificationsToLog])

  const handlePinCard = useCallback((card: PinnedCard) => {
    setPinnedCards(prev => {
      const exists = prev.some(p => p.key === card.key)
      return exists ? prev.filter(p => p.key !== card.key) : [...prev, card]
    })
  }, [])

  const pinnedKeys = new Set(pinnedCards.map(p => p.key))

  // Attack mode handlers
  const startAttackMode = useCallback((multi: boolean) => {
    if (!combat) return
    // Both single and multi start in select phase — single just limits to 1 selection
    setAttackMode({ phase: 'select', targetIds: [], results: {}, currentIndex: 0, singleTarget: !multi } as any)
  }, [combat])

  // Resolve a condition's duration before applying. For EONT/SONT durations
  // without an explicit expiresOnId, pin to the *source* (attacker) — the
  // ambiguous case "the cultist's next turn" in a power written about the
  // attacker's own creature type means the attacker's next turn, not the
  // target's. Also: if the source is currently taking their turn, set
  // remaining=1 so the condition survives this turn-end.
  const resolveDurationForApply = useCallback((duration: any | undefined, sourceId?: string): any => {
    const dur: any = { ...(duration ?? { type: 'save-ends' }) }
    if ((dur.type === 'eont' || dur.type === 'sont') && !dur.expiresOnId && sourceId) {
      dur.expiresOnId = sourceId
    }
    if (combat && (dur.type === 'eont' || dur.type === 'sont') && dur.expiresOnId) {
      const currentId = combat.initiativeOrder[combat.turnIndex]
      if (dur.expiresOnId === currentId && dur.remaining == null) dur.remaining = 1
    }
    return dur
  }, [combat])

  const attackModeToggleTarget = useCallback(async (id: string) => {
    if (!attackMode || attackMode.phase !== 'select') return
    if (attackMode.singleTarget) {
      if (pendingCondition) {
        await window.api.combat.addCondition(id, {
          conditionId: pendingCondition.conditionId,
          value: pendingCondition.value,
          customDescription: pendingCondition.customDescription,
          sourceId: pendingCondition.sourceId,
          duration: resolveDurationForApply(pendingCondition.duration, pendingCondition.sourceId),
          grantsCATo: pendingCondition.grantsCATo,
        })
        setPendingCondition(null)
        setAttackMode(null)
        return
      }
      if (pendingAction) {
        // Open damage/heal dialog for the selected target
        setDialog({ type: pendingAction.type, combatantId: id })
        setPendingAction(null)
        setAttackMode(null)
        return
      }
      // Single target attack: select and immediately confirm
      const results: Record<string, 'hit' | 'miss' | null> = { [id]: null }
      setAttackMode({ ...attackMode, phase: 'resolve', targetIds: [id], results, currentIndex: 0, defense: 'AC' })
    } else {
      setAttackMode(prev => {
        if (!prev) return prev
        const has = prev.targetIds.includes(id)
        const targetIds = has ? prev.targetIds.filter(t => t !== id) : [...prev.targetIds, id]
        return { ...prev, targetIds }
      })
    }
  }, [attackMode])

  const attackModeConfirmSelection = useCallback(async () => {
    if (!attackMode || attackMode.phase !== 'select' || attackMode.targetIds.length === 0) return
    if (pendingCondition) {
      // Condition apply mode: apply to all targets and exit
      for (const id of attackMode.targetIds) {
        await window.api.combat.addCondition(id, {
          conditionId: pendingCondition.conditionId,
          value: pendingCondition.value,
          customDescription: pendingCondition.customDescription,
          sourceId: pendingCondition.sourceId,
          duration: resolveDurationForApply(pendingCondition.duration, pendingCondition.sourceId),
          grantsCATo: pendingCondition.grantsCATo,
        })
      }
      setPendingCondition(null)
      setAttackMode(null)
      return
    }
    if (pendingAction) {
      // Open damage/heal dialog — will apply to all selected targets
      setDialog({ type: pendingAction.type, combatantId: attackMode.targetIds[0], multiTargetIds: attackMode.targetIds } as any)
      setPendingAction(null)
      setAttackMode(null)
      return
    }
    const results: Record<string, 'hit' | 'miss' | null> = {}
    for (const id of attackMode.targetIds) results[id] = null
    setAttackMode({ ...attackMode, phase: 'resolve', results, currentIndex: 0, defense: 'AC' })
  }, [attackMode])

  const attackModeResolve = useCallback((result: 'hit' | 'miss') => {
    if (!attackMode || attackMode.phase !== 'resolve') return
    const currentTarget = attackMode.targetIds[attackMode.currentIndex]
    if (!currentTarget) return
    const results = { ...attackMode.results, [currentTarget]: result }
    const nextIndex = attackMode.currentIndex + 1
    if (nextIndex >= attackMode.targetIds.length) {
      setAttackMode({ ...attackMode, results, currentIndex: nextIndex, phase: 'apply' })
    } else {
      setAttackMode({ ...attackMode, results, currentIndex: nextIndex })
    }
  }, [attackMode])

  const attackModeUndo = useCallback(() => {
    if (!attackMode || attackMode.phase !== 'resolve' || attackMode.currentIndex <= 0) return
    const prevIndex = attackMode.currentIndex - 1
    const prevTarget = attackMode.targetIds[prevIndex]
    const results = { ...attackMode.results, [prevTarget]: null }
    setAttackMode({ ...attackMode, results, currentIndex: prevIndex })
  }, [attackMode])

  const attackModeCancel = useCallback(() => {
    setAttackMode(null)
    setPendingCondition(null)
    setPendingAction(null)
  }, [])

  // Keyboard shortcuts — context-dependent on attack mode
  const hasModal = !!dialog || showSettings || !!contextMenu || !!readyDialog
  const inStepper = combat?.turnPhase === 'end-of-turn' || combat?.turnPhase === 'start-of-turn'
  const inAttackMode = !!attackMode
  useHotkeys([
    // Damage: d = single target, Shift+D = multi target
    // Pressing d/h again while in select auto-targets the inspected pane creature(s)
    { key: 'd', handler: () => {
      if (hasModal) return
      if (attackMode?.phase === 'select' && pendingAction?.type === 'damage') {
        const inspected = selectedIds.filter(id => id !== currentId)
        if (inspected.length > 0) {
          if (inspected.length === 1) { attackModeToggleTarget(inspected[0]); return }
          setDialog({ type: 'damage', combatantId: inspected[0], multiTargetIds: inspected } as any)
          setPendingAction(null); setAttackMode(null)
          return
        }
      }
      if (inAttackMode) return
      setPendingAction({ type: 'damage', multi: false })
      setAttackMode({ phase: 'select', targetIds: [], results: {}, currentIndex: 0, singleTarget: true })
    }},
    { key: 'D', shift: true, handler: () => {
      if (hasModal || inAttackMode) return
      setPendingAction({ type: 'damage', multi: true })
      setAttackMode({ phase: 'select', targetIds: [], results: {}, currentIndex: 0, singleTarget: false })
    }},
    // h = hit (in attack resolve) or heal target select
    { key: 'h', handler: () => {
      if (attackMode?.phase === 'resolve') { attackModeResolve('hit'); return }
      if (hasModal) return
      if (attackMode?.phase === 'select' && pendingAction?.type === 'heal') {
        const inspected = selectedIds.filter(id => id !== currentId)
        if (inspected.length > 0) {
          if (inspected.length === 1) { attackModeToggleTarget(inspected[0]); return }
          setDialog({ type: 'heal', combatantId: inspected[0], multiTargetIds: inspected } as any)
          setPendingAction(null); setAttackMode(null)
          return
        }
      }
      if (inAttackMode) return
      setPendingAction({ type: 'heal', multi: false })
      setAttackMode({ phase: 'select', targetIds: [], results: {}, currentIndex: 0, singleTarget: true })
    }},
    { key: 'H', shift: true, handler: () => {
      if (hasModal || inAttackMode) return
      setPendingAction({ type: 'heal', multi: true })
      setAttackMode({ phase: 'select', targetIds: [], results: {}, currentIndex: 0, singleTarget: false })
    }},
    // Delay (yield) current creature
    { key: 'y', handler: () => { if (!hasModal && !inAttackMode && currentId) window.api.combat.delay(currentId) } },
    // Ready an action
    { key: 'r', handler: () => { if (!hasModal && !inAttackMode && currentId) setReadyDialog({ combatantId: currentId }) } },
    // Attack mode entry
    { key: 'a', handler: () => { if (!hasModal && !inAttackMode) startAttackMode(false) } },
    { key: 'A', shift: true, handler: () => { if (!hasModal && !inAttackMode) startAttackMode(true) } },
    // Stepper keys
    { key: 's', handler: () => {
      if (!inStepper || !combat) return
      const item = combat.turnItems[combat.stepperIndex]
      if (!item || item.kind === 'ongoing-damage') return
      if (item.kind === 'death-save') handleResolveDeathSave('success')
      else handleResolveItem(true)
    }},
    { key: 'f', handler: () => {
      if (!inStepper || !combat) return
      const item = combat.turnItems[combat.stepperIndex]
      if (!item || item.kind === 'ongoing-damage') return
      if (item.kind === 'death-save') handleResolveDeathSave('fail')
      else handleResolveItem(false)
    }},
    { key: 'n', handler: () => {
      if (!inStepper || !combat) return
      const item = combat.turnItems[combat.stepperIndex]
      if (item?.kind === 'death-save') handleResolveDeathSave('none')
    }},
    { key: ' ', handler: () => {
      if (hasModal) return
      if (inStepper && combat) {
        const item = combat.turnItems[combat.stepperIndex]
        if (item?.kind === 'ongoing-damage') handleResolveItem(true)
        return
      }
      if (combat?.turnPhase === 'end-of-turn-done') return // animation playing
      if (attackMode?.phase === 'select') attackModeConfirmSelection()
      else if (!inAttackMode && combat?.turnPhase === 'active') handleEndTurn()
    }},
    { key: 'Enter', handler: () => {
      if (hasModal) return
      if (inStepper || combat?.turnPhase === 'end-of-turn-done') return
      if (attackMode?.phase === 'select') attackModeConfirmSelection()
      else if (!inAttackMode && combat?.turnPhase === 'active') handleEndTurn()
    }},
    { key: 'm', handler: () => { if (attackMode?.phase === 'resolve') attackModeResolve('miss') } },
    { key: 'Backspace', handler: () => { if (attackMode?.phase === 'resolve') attackModeUndo() } },
    // Escape cancels attack mode or closes dialog
    { key: 'Escape', handler: () => {
      if (inAttackMode) attackModeCancel()
      else setDialog(null)
    }},
  ])

  if (!combat) {
    return <div style={{ color: 'var(--color-text-muted)' }}>No active combat. Start one from an encounter.</div>
  }

  if (combat.phase === 'initiative-entry') {
    return <InitiativeEntry combat={combat} />
  }

  const currentId = combat.initiativeOrder[combat.turnIndex]
  const currentIsPC = currentId ? combat.combatants[currentId]?.isPC : false

  const PluginCombatPanel = pluginUI?.CombatPanel
  const conditionDefs = systemPlugin?.conditions ?? []

  const currentCombatant = currentId ? combat.combatants[currentId] : null
  const inspectedIds = selectedIds.filter(id => id !== currentId)
  const showInspectPanel = inspectedIds.length > 0

  const renderDetailPanel = (combatant: CombatantState, opts?: { hideMainActionPowers?: boolean }) => {
    const isCurrent = combatant.id === currentId
    if (PluginCombatPanel) {
      return (
        <PluginCombatPanel
          combatant={combatant}
          combat={combat}
          isCurrent={isCurrent}
          isDelayed={combat.delayedIds.includes(combatant.id)}
          isReadied={(combat.readiedIds ?? []).includes(combatant.id)}
          onUsePower={(idx) => window.api.combat.usePower(combatant.id, idx)}
          onUnusePower={(idx) => window.api.combat.unusePower(combatant.id, idx)}
          onQuickDamage={(amount) => setDialog({ type: 'damage', combatantId: combatant.id, initialAmount: amount })}
          onDamage={() => setDialog({ type: 'damage', combatantId: combatant.id })}
          onHeal={() => setDialog({ type: 'heal', combatantId: combatant.id })}
          onAddCondition={() => setDialog({ type: 'condition', combatantId: combatant.id })}
          onAddEffect={() => setDialog({ type: 'effect', combatantId: combatant.id })}
          onDelay={() => window.api.combat.delay(combatant.id)}
          onUndelay={() => window.api.combat.undelay(combatant.id, currentId)}
          onReady={() => setReadyDialog({ combatantId: combatant.id })}
          onResolveReady={() => window.api.combat.resolveReady(combatant.id)}
          onCancelReady={() => window.api.combat.cancelReady(combatant.id)}
          onRemove={() => { window.api.combat.removeCombatant(combatant.id); setSelectedIds(prev => prev.filter(x => x !== combatant.id)) }}
          conditions={conditionDefs}
          notifications={notifications.filter(n => n.combatantId === combatant.id)}
          onPinCard={handlePinCard}
          pinnedKeys={pinnedKeys}
          onPopoutStatblock={(id) => setPoppedOutStatblockIds(prev => prev.includes(id) ? prev : [...prev, id])}
          onApplyConditionToTargets={handleApplyConditionToTargets}
          hideMainActionPowers={opts?.hideMainActionPowers}
        />
      )
    }
    return (
      <CombatantDetail
        combatant={combatant}
        isCurrent={isCurrent}
        isDelayed={combat.delayedIds.includes(combatant.id)}
        isReadied={(combat.readiedIds ?? []).includes(combatant.id)}
        onDamage={() => setDialog({ type: 'damage', combatantId: combatant.id })}
        onHeal={() => setDialog({ type: 'heal', combatantId: combatant.id })}
        onAddCondition={() => setDialog({ type: 'condition', combatantId: combatant.id })}
        onAddEffect={() => setDialog({ type: 'effect', combatantId: combatant.id })}
        onDelay={() => window.api.combat.delay(combatant.id)}
        onUndelay={() => window.api.combat.undelay(combatant.id, currentId)}
        onReady={() => setReadyDialog({ combatantId: combatant.id })}
        onResolveReady={() => window.api.combat.resolveReady(combatant.id)}
        onCancelReady={() => window.api.combat.cancelReady(combatant.id)}
        onRemove={() => { window.api.combat.removeCombatant(combatant.id); setSelectedIds(prev => prev.filter(x => x !== combatant.id)) }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Global notifications banner — overlaid, doesn't affect layout */}
      {notifications.length > 0 && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center',
          maxWidth: '90%', zIndex: 50, pointerEvents: 'none',
        }}>
          {notifications.map((n, i) => {
            const bg = n.type === 'bloodied' ? 'var(--color-notify-bloodied)' : n.type === 'death' ? 'var(--color-notify-death)'
              : n.type === 'recharge-success' || n.type === 'save-success' ? 'var(--color-notify-success)'
              : n.type === 'recharge-fail' || n.type === 'save-fail' ? 'var(--color-notify-fail)' : 'var(--color-notify-neutral)'
            return (
              <div key={i} style={{
                padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 600,
                background: bg, color: 'var(--color-text-on-dark)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}>
                {n.message}
                {n.detail && <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>{n.detail}</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Attack mode banner — overlaid */}
      {attackMode && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          padding: '4px 12px', background: 'rgba(92,124,250,0.95)', border: '1px solid rgba(92,124,250,0.5)',
          borderRadius: 'var(--radius-sm)', zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontWeight: 700 }}>
            {attackMode.phase === 'select' ? (pendingCondition
              ? (attackMode.singleTarget ? '🎯 Click a target to apply condition' : '🎯 Select targets for condition (Space to confirm)')
              : pendingAction
              ? (attackMode.singleTarget ? `💥 Click a target to ${pendingAction.type}` : `💥 Select targets to ${pendingAction.type} (Space to confirm)`)
              : (attackMode.singleTarget ? '⚔ Click a target' : '⚔ Select targets (click creatures, Space to confirm)')) :
              attackMode.phase === 'resolve' ? `⚔ Resolving ${Math.min(attackMode.currentIndex + 1, attackMode.targetIds.length)}/${attackMode.targetIds.length} — H=hit, M=miss${attackMode.currentIndex > 0 ? ', Backspace=undo' : ''}` :
              '⚔ Apply results'}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={attackModeCancel} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Cancel (Esc)</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr', gap: 'var(--space-4)', flex: 1, minHeight: 0 }}>
      {/* Left panel: initiative list + reactions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>
            {combat.round === 0 ? 'Surprise Round' : `Round ${combat.round}`}
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <button onClick={handleEndTurn} title="End turn (Space)" disabled={combat.turnPhase !== 'active'}>Next</button>
            <button onClick={() => { if (currentId) window.api.combat.delay(currentId) }} title="Delay current creature (Y)">Delay</button>
            <button onClick={() => { if (currentId) setReadyDialog({ combatantId: currentId }) }} title="Ready an action (R)">Ready</button>
            <button onClick={() => setShowLog(!showLog)} title="Combat log" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>📋</button>
            <button onClick={() => setShowSettings(true)} title="Combat settings" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>⚙</button>
          </div>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 200, overflow: 'auto' }}>
          <InitiativeList
            combat={combat}
            currentId={currentId}
            selectedIds={selectedIds}
            onSelect={attackMode?.phase === 'select' ? (id: string, _e: React.MouseEvent) => attackModeToggleTarget(id) : handleSelect}
            onContextMenu={attackMode ? undefined : (id, e) => setContextMenu({ combatantId: id, x: e.clientX, y: e.clientY })}
            attackMode={attackMode ?? undefined}
            conditionDefs={conditionDefs}
            notifications={notifications}
            onUndelay={(id) => window.api.combat.undelay(id, currentId)}
            onResolveReady={(id) => window.api.combat.resolveReady(id)}
            onCancelReady={(id) => window.api.combat.cancelReady(id)}
          />
        </div>

        <button
          onClick={handleEndCombat}
          style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}
        >
          End Combat
        </button>
      </div>

      {/* Current turn detail panel */}
      <div style={{ overflow: 'auto', minHeight: 0 }}>
        {currentCombatant ? renderDetailPanel(currentCombatant) : (
          <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>No current combatant.</div>
        )}
      </div>

      {/* Inspected / attack-apply panel */}
      <div style={{ overflow: 'auto', minHeight: 0 }}>
        {attackMode?.phase === 'apply' ? (
          <AttackApplyPanel
            combat={combat}
            attackMode={attackMode}
            conditionDefs={conditionDefs}
            onApply={async (hitDamage, missDamage, hitConditions, missConditions) => {
              for (const [id, result] of Object.entries(attackMode.results)) {
                const name = combat.combatants[id]?.name ?? id
                const currentTurnId = combat.initiativeOrder[combat.turnIndex]
                const currentTurnName = currentTurnId ? combat.combatants[currentTurnId]?.name : undefined
                if (result === 'hit') {
                  addEvent('attack-hit', id, name, {}, currentTurnId, currentTurnName)
                  if (hitDamage > 0) { addEvent('damage', id, name, { amount: hitDamage }); await window.api.combat.damage(id, hitDamage, true, currentTurnId) }
                  for (const c of hitConditions) await window.api.combat.addCondition(id, c)
                } else if (result === 'miss') {
                  addEvent('attack-miss', id, name, {}, currentTurnId, currentTurnName)
                  if (missDamage > 0) { addEvent('damage', id, name, { amount: missDamage }); await window.api.combat.damage(id, missDamage, false, currentTurnId) }
                  for (const c of missConditions) await window.api.combat.addCondition(id, c)
                }
              }
              setAttackMode(null)
            }}
            onCancel={attackModeCancel}
          />
        ) : showInspectPanel ? (
          <>
            {(() => {
              // Group inspected combatants by baseName, preserving first-appearance order
              const groups: { key: string; ids: string[] }[] = []
              const keyIndex: Record<string, number> = {}
              for (const id of inspectedIds) {
                const c = combat.combatants[id]
                if (!c) continue
                const key = c.baseName ?? c.name
                if (keyIndex[key] != null) {
                  groups[keyIndex[key]].ids.push(id)
                } else {
                  keyIndex[key] = groups.length
                  groups.push({ key, ids: [id] })
                }
              }
              return groups.map((group, gi) => {
                const combatants = group.ids.map(id => combat.combatants[id]).filter(Boolean) as CombatantState[]
                if (combatants.length === 0) return null

                // Single creature — render normally
                if (combatants.length === 1) {
                  return (
                    <div key={group.key} style={gi > 0 ? { marginTop: 'var(--space-4)' } : undefined}>
                      {renderDetailPanel(combatants[0], { hideMainActionPowers: hideInspectedActions })}
                    </div>
                  )
                }

                // Multiple creatures of same type — use grouped panel if plugin provides one
                const GroupedPanel = pluginUI?.GroupedCombatPanel
                if (GroupedPanel) {
                  return (
                    <div key={group.key} style={gi > 0 ? { marginTop: 'var(--space-4)' } : undefined}>
                      <GroupedPanel
                        combatants={combatants}
                        combat={combat}
                        conditions={conditionDefs}
                        notifications={notifications.filter(n => group.ids.includes(n.combatantId))}
                        onDamage={(cid) => setDialog({ type: 'damage', combatantId: cid })}
                        onHeal={(cid) => setDialog({ type: 'heal', combatantId: cid })}
                        onAddCondition={(cid) => setDialog({ type: 'condition', combatantId: cid })}
                        onAddEffect={(cid) => setDialog({ type: 'effect', combatantId: cid })}
                        hideMainActionPowers={hideInspectedActions}
                        onPinCard={handlePinCard}
                        pinnedKeys={pinnedKeys}
                        onPopoutStatblock={(id) => setPoppedOutStatblockIds(prev => prev.includes(id) ? prev : [...prev, id])}
                      />
                    </div>
                  )
                }

                // Fallback: render each individually
                return combatants.map((c, ci) => (
                  <div key={c.id} style={(gi > 0 || ci > 0) ? { marginTop: 'var(--space-4)' } : undefined}>
                    {renderDetailPanel(c, { hideMainActionPowers: hideInspectedActions })}
                  </div>
                ))
              })
            })()}
          </>
        ) : (
          <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
            Click a combatant to inspect side-by-side
          </div>
        )}
      </div>

      {/* Dialogs */}
      {dialog?.type === 'damage' && (
        <DamageHealDialog
          mode="damage"
          combatantName={dialog.multiTargetIds
            ? `${dialog.multiTargetIds.length} creatures`
            : combat.combatants[dialog.combatantId]?.name ?? ''}
          initialAmount={dialog.initialAmount}
          onSubmit={(amount, wasHit) => {
            const targets = dialog.multiTargetIds ?? [dialog.combatantId]
            for (const id of targets) handleDamage(id, amount, wasHit)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'heal' && (
        <DamageHealDialog
          mode="heal"
          combatantName={dialog.multiTargetIds
            ? `${dialog.multiTargetIds.length} creatures`
            : combat.combatants[dialog.combatantId]?.name ?? ''}
          onSubmit={async (amount) => {
            const targets = dialog.multiTargetIds ?? [dialog.combatantId]
            const healSourceId = combat.initiativeOrder[combat.turnIndex]
            for (const id of targets) {
              const name = combat.combatants[id]?.name ?? 'Creature'
              addEvent('heal', id, name, { amount })
              await window.api.combat.heal(id, amount, healSourceId)
            }
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'condition' && (
        <ConditionDialog
          combatantId={dialog.combatantId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'effect' && (
        <EffectDialog
          combatantId={dialog.combatantId}
          onClose={() => setDialog(null)}
        />
      )}
      {readyDialog && (
        <ReadyActionDialog
          combatantName={combat.combatants[readyDialog.combatantId]?.name ?? ''}
          onSubmit={async (actionText) => {
            await window.api.combat.ready(readyDialog.combatantId, actionText)
            setReadyDialog(null)
          }}
          onClose={() => setReadyDialog(null)}
        />
      )}

      {/* Floating pinned cards */}
      <PinnedCardsPanel cards={pinnedCards} onUnpin={(key) => setPinnedCards(prev => prev.filter(p => p.key !== key))} />

      {/* Combat log */}
      {showLog && <CombatLogPanel events={combatEvents} onClose={() => setShowLog(false)} />}

      {/* Popped-out floating creature stat blocks */}
      {poppedOutStatblockIds.map((id, i) => {
        const c = combat.combatants[id]
        if (!c) return null
        return (
          <PopoutStatblockPanel key={id} combatant={c}
            offsetIndex={i}
            onClose={() => setPoppedOutStatblockIds(prev => prev.filter(x => x !== id))} />
        )
      })}

      {/* Quick condition context menu */}
      {contextMenu && combat.combatants[contextMenu.combatantId] && (
        <QuickConditionMenu
          combatantId={contextMenu.combatantId}
          combatant={combat.combatants[contextMenu.combatantId]}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onOpenFull={() => {
            setDialog({ type: 'condition', combatantId: contextMenu.combatantId })
            setContextMenu(null)
          }}
        />
      )}

      {/* Save/Recharge resolution modal */}
      {/* Turn item stepper banner */}
      {inStepper && combat.stepperIndex >= 0 && combat.turnItems[combat.stepperIndex] && (() => {
        const item = combat.turnItems[combat.stepperIndex]
        const combatantId = combat.initiativeOrder[combat.turnIndex]
        const combatantName = combatantId ? combat.combatants[combatantId]?.name ?? '' : ''
        const isOngoing = item.kind === 'ongoing-damage'
        const isDeathSave = item.kind === 'death-save'
        return (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            padding: 'var(--space-3) var(--space-6)',
            background: 'var(--color-bg-secondary)',
            borderTop: `2px solid ${isOngoing ? 'var(--color-danger)' : isDeathSave ? 'var(--color-miss)' : 'var(--color-accent)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)',
            zIndex: 100,
          }}>
            <span style={{ fontWeight: 600 }}>{combatantName}:</span>
            <span style={{ fontSize: 'var(--font-size-lg)', color: isOngoing ? 'var(--color-danger)' : isDeathSave ? 'var(--color-miss)' : undefined }}>
              {isDeathSave ? '💀 Death Save' : item.label}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {isOngoing ? (
                <button onClick={() => handleResolveItem(true)} style={{
                  padding: 'var(--space-2) var(--space-4)', background: 'var(--color-accent)', color: 'var(--color-text-on-dark)',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600,
                }}>Continue (Space)</button>
              ) : isDeathSave ? (
                <>
                  <button onClick={() => handleResolveDeathSave('fail')} style={{
                    padding: 'var(--space-2) var(--space-4)', background: 'var(--color-miss)', color: 'var(--color-text-on-dark)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600,
                  }}>Fail &lt;10 (F)</button>
                  <button onClick={() => handleResolveDeathSave('none')} style={{
                    padding: 'var(--space-2) var(--space-4)', background: 'var(--color-notify-neutral)', color: 'var(--color-text-on-dark)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600,
                  }}>10–19 (N)</button>
                  <button onClick={() => handleResolveDeathSave('success')} style={{
                    padding: 'var(--space-2) var(--space-4)', background: 'var(--color-check)', color: 'var(--color-text-on-dark)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600,
                  }}>20+ (S)</button>
                </>
              ) : (
                <>
                  <button onClick={() => handleResolveItem(true)} style={{
                    padding: 'var(--space-2) var(--space-4)', background: 'var(--color-check)', color: 'var(--color-text-on-dark)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600,
                  }}>{item.kind === 'save' ? 'Save (S)' : 'Success (S)'}</button>
                  <button onClick={() => handleResolveItem(false)} style={{
                    padding: 'var(--space-2) var(--space-4)', background: 'var(--color-miss)', color: 'var(--color-text-on-dark)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600,
                  }}>Fail (F)</button>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Settings modal */}
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} minWidth={350}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Combat Settings</h3>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={hideInspectedActions}
                onChange={e => setHideInspectedActions(e.target.checked)}
                style={{ marginTop: 2, cursor: 'pointer' }} />
              <span>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Hide on-turn actions in target stat blocks</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 1 }}>
                  When inspecting off-turn creatures during combat, hide standard/move/minor powers to focus on triggered actions and reactions.
                </div>
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', cursor: 'pointer', marginTop: 'var(--space-3)' }}>
              <input type="checkbox" checked={combat.playerExpandConditions ?? true}
                onChange={e => window.api.combat.setPlayerExpandConditions(e.target.checked)}
                style={{ marginTop: 2, cursor: 'pointer' }} />
              <span>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Show condition details on player display</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 1 }}>
                  Show full condition descriptions under the active creature on the player-facing screen. When off, only shows condition pills.
                </div>
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', cursor: 'pointer', marginTop: 'var(--space-3)' }}>
              <input type="checkbox" checked={combat.autoHideDeadCreatures ?? false}
                onChange={e => window.api.combat.setAutoHideDeadCreatures(e.target.checked)}
                style={{ marginTop: 2, cursor: 'pointer' }} />
              <span>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Auto-hide dead creatures</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 1 }}>
                  Remove dead creatures from the initiative list once no effects are tied to their turn. Creatures with regeneration are kept visible.
                </div>
              </span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
              <button onClick={() => setShowSettings(false)}>Close</button>
            </div>
        </Modal>
      )}
    </div>
    </div>
  )
}
