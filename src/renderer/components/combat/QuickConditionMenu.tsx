import { useEffect, useRef, useState } from 'react'
import type { CombatantState, CombatState } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { useCombatStore } from '../../stores/combat-store'
import { useCampaignStore } from '../../stores/campaign-store'
import { getConditionStyle } from '../../plugins/dnd-4e/condition-styles'
import { DAMAGE_TYPE_NAMES, getDamageTypeStyle } from '../../plugins/dnd-4e/damage-types'
import { ConditionPill, buildConditionLabel } from '../../plugins/dnd-4e/ConditionPill'
import { CLASS_MARK_BY_ID, CLASS_MARK_BY_CONDITION_ID, type ClassMark } from '../../../../plugins/dnd-4e/class-marks'

interface Props {
  combatantId: string
  combatant: CombatantState
  position: { x: number; y: number }
  onClose: () => void
  onOpenFull: () => void
}

export function QuickConditionMenu({ combatantId, combatant, position, onClose, onOpenFull }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const combat = useCombatStore((s) => s.combat)
  const [ongoingMode, setOngoingMode] = useState(false)
  const [ongoingValue, setOngoingValue] = useState('')
  const [ongoingType, setOngoingType] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const ongoingRef = useRef<HTMLInputElement>(null)
  const [customName, setCustomName] = useState('')
  const customRef = useRef<HTMLInputElement>(null)
  const [markSourcePicker, setMarkSourcePicker] = useState(false)
  const [caRecipientPicker, setCaRecipientPicker] = useState(false)
  const [durationOverride, setDurationOverride] = useState<{ type: string; expiresOnId?: string } | null>(null)
  const [hoveredCondId, setHoveredCondId] = useState<string | null>(null)
  const [showTurnPicker, setShowTurnPicker] = useState<'eont' | 'sont' | null>(null)

  const isSurpriseRound = combat?.round === 0 && combat?.surpriseRound
  const conditions = (systemPlugin?.conditions ?? []).filter((c: any) =>
    c.id !== 'ongoing-damage' && !c.hidden && (c.id !== 'surprised' || isSurpriseRound)
  )
  const activeConditionIds = new Set(combatant.conditions.map(c => c.conditionId))
  // Conditions on the combatant that aren't in the plugin's known list
  // (and aren't already handled as ongoing damage). These are custom/user-added
  // conditions and need their own removal UI.
  // Class marks are also "hidden" from the standard picker but they have their
  // own dedicated section so we exclude them from the custom list too.
  const knownConditionIds = new Set(conditions.map((c: any) => c.id))
  const customActive = combatant.conditions.filter(c =>
    !knownConditionIds.has(c.conditionId)
    && !c.conditionId.startsWith('ongoing-damage')
    && !CLASS_MARK_BY_CONDITION_ID[c.conditionId]
  )

  const naturalDefault = (condId: string): string => {
    if (condId === 'prone' || condId === 'unconscious' || condId === 'combat-advantage' || condId === 'dying' || condId === 'bloodied') return 'indefinite'
    if (condId === 'marked') return 'eont'
    return 'save-ends'
  }

  // Current turn creature ID for EONT/SONT source tracking
  const currentTurnId = combat?.initiativeOrder[combat?.turnIndex ?? 0]
  const currentTurnName = currentTurnId ? combat?.combatants[currentTurnId]?.name : undefined

  // Build the list of PCs in combat that have a markType set on their PlayerCharacter.
  // We look up each PC by combatant.entityId and join with the campaign's playerCharacters list.
  const playerCharacters = useCampaignStore(s => s.playerCharacters)
  const markablePCs: { combatantId: string; pcName: string; color?: string; mark: ClassMark }[] = []
  if (combat) {
    for (const c of Object.values(combat.combatants)) {
      // PCs don't have engine-tracked HP (it's 0); use the explicit dead flag instead
      if (!c.isPC || c.dead) continue
      const pc = c.entityId ? playerCharacters.find(p => p.id === c.entityId) : undefined
      const markId = pc?.markType
      if (!markId) continue
      const mark = CLASS_MARK_BY_ID[markId]
      if (!mark) continue
      markablePCs.push({ combatantId: c.id, pcName: c.name, color: c.color ?? pc?.color, mark })
    }
  }
  // Default-detect: if the active turn creature is one of these PCs, show their mark first
  const defaultMarker = markablePCs.find(m => m.combatantId === currentTurnId) ?? null

  const getDuration = (condId: string) => {
    if (durationOverride) {
      const dur: any = { type: durationOverride.type, expiresOnId: durationOverride.expiresOnId }
      // If EONT/SONT expires on the creature whose turn it currently is,
      // set remaining=1 so it survives THIS turn and expires on the NEXT matching turn
      if ((dur.type === 'eont' || dur.type === 'sont') && dur.expiresOnId === currentTurnId) {
        dur.remaining = 1
      }
      return dur
    }
    return { type: naturalDefault(condId) as any }
  }
  const activeOngoing = combatant.conditions.filter(c => c.conditionId.startsWith('ongoing-damage'))

  const applyGrantsCA = async (recipient: 'all' | 'source' | 'source-allies', sourceId?: string) => {
    const sourceName = sourceId ? combat?.combatants[sourceId]?.name ?? sourceId : undefined
    const dur = getDuration('combat-advantage')
    const cond: any = {
      conditionId: 'combat-advantage',
      grantsCATo: recipient,
      duration: dur,
    }
    if (recipient === 'source' && sourceId && sourceName) {
      cond.sourceId = sourceId
      cond.customDescription = `to ${sourceName}`
    } else if (recipient === 'source-allies' && sourceId && sourceName) {
      cond.sourceId = sourceId
      cond.customDescription = `to ${sourceName}'s allies`
    }
    await window.api.combat.addCondition(combatantId, cond)
    setCaRecipientPicker(false)
  }

  const applyMark = async (sourceId: string) => {
    const sourceName = combat?.combatants[sourceId]?.name ?? sourceId
    const dur = getDuration('marked')
    // Default mark EONT expires on the marker's turn
    if (dur.type === 'eont' && !dur.expiresOnId) dur.expiresOnId = sourceId
    // If marking during the marker's own turn, survive this turn-end
    if ((dur.type === 'eont' || dur.type === 'sont') && dur.expiresOnId === currentTurnId) {
      dur.remaining = 1
    }
    await window.api.combat.addCondition(combatantId, {
      conditionId: 'marked',
      sourceId,
      customDescription: `by ${sourceName}`,
      duration: dur,
    })
    setMarkSourcePicker(false)
  }

  const applyClassMark = async (sourceCombatantId: string, mark: ClassMark, color?: string) => {
    const sourceName = combat?.combatants[sourceCombatantId]?.name ?? sourceCombatantId
    // Per the rules:
    //   - Defender marks (Combat Challenge / Divine Challenge / Nature's Wrath /
    //     Mind Spike) default to EONT pinned to the marker.
    //   - Aegis and the striker designations (Quarry / Curse / Oath) default
    //     to encounter-long.
    let dur: any
    if (mark.defaultDuration === 'eont') {
      dur = { type: 'eont', expiresOnId: sourceCombatantId }
      if (sourceCombatantId === currentTurnId) dur.remaining = 1
    } else {
      dur = { type: 'encounter' }
    }
    if (mark.appliesMarkedCondition) {
      // Defender path — apply the real Marked condition with display overrides.
      // Engine's existing replace-by-id semantics on `marked` enforce
      // "only one mark per target, latest replaces" — exactly the rule.
      await window.api.combat.addCondition(combatantId, {
        conditionId: 'marked',
        sourceId: sourceCombatantId,
        customName: mark.shortName,
        customDescription: `by ${sourceName}`,
        customColor: color,
        customIcon: mark.icon,
        duration: dur,
      })
    } else {
      // Striker path — own dedicated condition id, can stack with marks
      await window.api.combat.addCondition(combatantId, {
        conditionId: mark.conditionId!,
        sourceId: sourceCombatantId,
        customDescription: `by ${sourceName}`,
        customColor: color,
        duration: dur,
      })
    }
  }
  const removeClassMark = async (mark: ClassMark) => {
    await window.api.combat.removeCondition(combatantId, mark.appliesMarkedCondition ? 'marked' : mark.conditionId!)
  }

  const toggle = async (conditionId: string) => {
    // Dead is an engine flag, not a real condition
    if (conditionId === 'dead') {
      await window.api.combat.updateCombatant(combatantId, { dead: !combatant.dead })
      return
    }
    if (activeConditionIds.has(conditionId)) {
      await window.api.combat.removeCondition(combatantId, conditionId)
    } else if (conditionId === 'marked') {
      if (markSourcePicker && currentTurnId) {
        // Second click: auto-apply with current-turn creature as source
        applyMark(currentTurnId)
      } else {
        setMarkSourcePicker(true)
      }
      return
    } else if (conditionId === 'combat-advantage') {
      if (caRecipientPicker && currentTurnId) {
        // Second click: auto-apply "to current-turn creature" (most common case)
        applyGrantsCA('source', currentTurnId)
      } else {
        setCaRecipientPicker(true)
      }
      return
    } else {
      setMarkSourcePicker(false)
      setCaRecipientPicker(false)
      await window.api.combat.addCondition(combatantId, {
        conditionId,
        duration: getDuration(conditionId),
      })
    }
  }

  const applyOngoing = async (typeOverride?: string) => {
    const raw = ongoingValue.trim()
    if (!raw) return
    const dmgType = typeOverride ?? ongoingType
    // Pure integer (e.g., "5") → store as value. Dice expression (e.g., "1d6", "2d8+3") → store as customName
    const isPureNumber = /^\d+$/.test(raw)
    const label = `Ongoing ${raw}${dmgType ? ' ' + dmgType : ''}`
    await window.api.combat.addCondition(combatantId, {
      conditionId: 'ongoing-damage',
      value: isPureNumber ? parseInt(raw) : undefined,
      customName: isPureNumber ? undefined : label,
      customDescription: dmgType || undefined,
      duration: { type: 'save-ends' },
    })
    setOngoingValue('')
    setOngoingType('')
    setSelectedTypes(new Set())
    setOngoingMode(false)
  }

  useEffect(() => {
    if (ongoingMode) ongoingRef.current?.focus()
  }, [ongoingMode])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ongoingMode) { setOngoingMode(false); return }
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, ongoingMode])

  const menuWidth = 380
  const menuHeight = 500
  const x = Math.min(position.x, window.innerWidth - menuWidth - 8)
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8)

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 200,
        background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        padding: '4px 0', width: menuWidth,
      }}
    >
      <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {combatant.name}
      </div>

      {/* Duration override pills */}
      <div style={{ display: 'flex', gap: 3, padding: '0 8px 2px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Ends:</span>
        {([
          { type: 'save-ends', label: 'Save', needsPicker: false },
          { type: 'eont', label: 'EONT', needsPicker: true },
          { type: 'sont', label: 'SONT', needsPicker: true },
          { type: 'indefinite', label: 'Never', needsPicker: false },
        ] as const).map(d => {
          const isOverride = durationOverride?.type === d.type
          const isHoveredDefault = hoveredCondId != null && naturalDefault(hoveredCondId) === d.type && !durationOverride
          return (
            <span key={d.type}
              onClick={() => {
                if (isOverride) { setDurationOverride(null); setShowTurnPicker(null); return }
                if (d.needsPicker) {
                  // If target is the current-turn creature, no need to pick — auto-select
                  if (combatantId === currentTurnId) {
                    setDurationOverride({ type: d.type, expiresOnId: combatantId })
                    setShowTurnPicker(null)
                  } else {
                    setShowTurnPicker(d.type as 'eont' | 'sont')
                  }
                  return
                }
                setDurationOverride({ type: d.type }); setShowTurnPicker(null)
              }}
              style={{
                padding: '1px 5px', borderRadius: 'var(--radius-md)', fontSize: 9, fontWeight: 600,
                cursor: 'pointer', userSelect: 'none',
                background: isOverride ? 'var(--color-accent)' : (showTurnPicker === d.type) ? 'rgba(92,124,250,0.3)' : isHoveredDefault ? 'rgba(128,128,128,0.3)' : 'rgba(128,128,128,0.1)',
                color: isOverride ? 'var(--color-accent-text)' : isHoveredDefault ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                transition: 'background 0.1s',
              }}>
              {d.label}
            </span>
          )
        })}
      </div>
      {/* EONT/SONT source picker */}
      {showTurnPicker && (
        <div style={{ display: 'flex', gap: 3, padding: '0 8px 4px', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Whose turn?</span>
          {currentTurnId && currentTurnId !== combatantId && (
            <span onClick={() => {
              setDurationOverride({ type: showTurnPicker, expiresOnId: currentTurnId })
              setShowTurnPicker(null)
            }} style={{
              padding: '1px 5px', borderRadius: 'var(--radius-md)', fontSize: 9, fontWeight: 600,
              cursor: 'pointer', background: 'rgba(128,128,128,0.15)', color: 'var(--color-text-primary)',
            }}>
              Attacker: {currentTurnName}
            </span>
          )}
          <span onClick={() => {
            setDurationOverride({ type: showTurnPicker, expiresOnId: combatantId })
            setShowTurnPicker(null)
          }} style={{
            padding: '1px 5px', borderRadius: 'var(--radius-md)', fontSize: 9, fontWeight: 600,
            cursor: 'pointer', background: 'rgba(128,128,128,0.15)', color: 'var(--color-text-primary)',
          }}>
            Target: {combatant.name}
          </span>
          <span onClick={() => setShowTurnPicker(null)} style={{ fontSize: 9, color: 'var(--color-text-muted)', cursor: 'pointer' }}>✕</span>
        </div>
      )}

      {/* Show selected duration detail */}
      {durationOverride?.expiresOnId && !showTurnPicker && (
        <div style={{ padding: '0 8px 4px', fontSize: 9, color: 'var(--color-text-muted)' }}>
          {combat?.combatants[durationOverride.expiresOnId]?.name ?? '?'}
          <span onClick={() => setDurationOverride(null)} style={{ marginLeft: 4, cursor: 'pointer' }}>✕</span>
        </div>
      )}

      {/* 2-column condition grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: '0 4px' }}>
        {conditions.map((c: any) => {
          const active = c.id === 'dead' ? !!combatant.dead : activeConditionIds.has(c.id)
          const style = getConditionStyle(c.id)
          // Bloodied is read-only for monsters (auto-managed by HP)
          const readOnly = c.id === 'bloodied' && !combatant.isPC
          return (
            <div key={c.id}
              onClick={readOnly ? undefined : () => toggle(c.id)}
              title={readOnly ? `${c.description} (auto-managed for monsters)` : c.description}
              onMouseEnter={() => setHoveredCondId(c.id)}
              onMouseLeave={() => setHoveredCondId(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px', cursor: readOnly ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)',
                background: active ? style.color + '30' : 'transparent',
                opacity: readOnly ? 0.7 : 1,
              }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 8,
                background: active ? style.color : ((markSourcePicker && c.id === 'marked') || (caRecipientPicker && c.id === 'combat-advantage')) ? style.color + '90' : style.color + '40',
                color: active || (markSourcePicker && c.id === 'marked') || (caRecipientPicker && c.id === 'combat-advantage') ? style.textColor : 'var(--color-text-primary)',
                fontSize: 10, fontWeight: active || (markSourcePicker && c.id === 'marked') || (caRecipientPicker && c.id === 'combat-advantage') ? 600 : 400,
              }}>
                <span style={{ fontSize: 9 }}>{style.icon}</span>
                {c.name}
              </span>
              {active && <span style={{ fontSize: 10, color: 'var(--color-check)' }}>✓</span>}
            </div>
          )
        })}
        {/* Ongoing Damage lives at the end of the grid; clicking switches the
            menu into the ongoing-damage entry mode below. The active ongoing
            damage instances are rendered immediately after the grid. */}
        {(() => {
          const style = getConditionStyle('ongoing-damage')
          const active = activeOngoing.length > 0
          return (
            <div key="__ongoing-damage__"
              onClick={() => setOngoingMode(true)}
              title="Apply ongoing damage"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                background: ongoingMode ? style.color + '30' : 'transparent',
              }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 8,
                background: ongoingMode ? style.color : style.color + '40',
                color: ongoingMode ? style.textColor : 'var(--color-text-primary)',
                fontSize: 10, fontWeight: ongoingMode ? 600 : 400,
              }}>
                <span style={{ fontSize: 9 }}>{style.icon}</span>
                Ongoing Damage
              </span>
              {active && <span style={{ fontSize: 10, color: 'var(--color-check)' }}>✓</span>}
            </div>
          )
        })()}
      </div>

      {/* Active ongoing damage instances — 2-column grid matching the
          condition grid layout, sits right after the Ongoing Damage trigger. */}
      {activeOngoing.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: '0 4px' }}>
          {activeOngoing.map(cond => {
            const style = getConditionStyle(cond.conditionId, cond.customDescription)
            return (
              <div key={cond.conditionId} onClick={() => window.api.combat.removeCondition(combatantId, cond.conditionId)} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '1px 6px', borderRadius: 8,
                  background: style.color,
                  color: style.textColor,
                  fontSize: 10, fontWeight: 600,
                }}>
                  <span style={{ fontSize: 9 }}>{style.icon}</span>
                  Ongoing {cond.value ?? ''}{cond.customDescription ? ' ' + cond.customDescription : ''}
                </span>
                <span style={{ fontSize: 10, color: 'var(--color-check)' }}>✓</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Grants CA recipient picker */}
      {caRecipientPicker && combat && (
        <div style={{ padding: '4px 8px', background: 'var(--color-bg-surface)', margin: '2px 4px', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flex: 1 }}>Grants CA to whom?</span>
            <span onClick={() => setCaRecipientPicker(false)} style={{ fontSize: 10, color: 'var(--color-text-muted)', cursor: 'pointer' }}>✕</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 3 }}>
            <button onClick={() => applyGrantsCA('all')} style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
            }}>
              All attackers
            </button>
            {currentTurnId && currentTurnId !== combatantId && currentTurnName && (
              <>
                <button onClick={() => applyGrantsCA('source', currentTurnId)} style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: 'rgba(92,124,250,0.2)', border: '1px solid rgba(92,124,250,0.5)',
                  color: 'var(--color-text-primary)', fontWeight: 600,
                }}>
                  {currentTurnName}
                </button>
                <button onClick={() => applyGrantsCA('source-allies', currentTurnId)} style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}>
                  {currentTurnName}'s allies
                </button>
              </>
            )}
          </div>
          {/* Other combatants — each row offers "self" and "allies" */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.values(combat.combatants)
              .filter(c => c.id !== combatantId && c.id !== currentTurnId && (c.isPC ? !c.dead : c.hp > 0))
              .map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <button onClick={() => applyGrantsCA('source', c.id)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)', flex: 1, textAlign: 'left',
                  }}>
                    {c.color && (
                      <span style={{
                        width: 9, height: 9, borderRadius: '50%',
                        background: c.color,
                        border: '1px solid rgba(0,0,0,0.3)',
                        display: 'inline-block', flexShrink: 0,
                      }} />
                    )}
                    {c.name}
                  </button>
                  <button onClick={() => applyGrantsCA('source-allies', c.id)} style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                  }}>
                    + allies
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Mark source picker */}
      {markSourcePicker && combat && (
        <div style={{ padding: '4px 8px', background: 'var(--color-bg-surface)', margin: '2px 4px', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flex: 1 }}>Marked by whom?</span>
            <span onClick={() => setMarkSourcePicker(false)} style={{ fontSize: 10, color: 'var(--color-text-muted)', cursor: 'pointer' }}>✕</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {Object.values(combat.combatants)
              // PCs have hp=0 by design (engine doesn't track PC HP) — filter
              // them via the `dead` flag instead.
              .filter(c => c.id !== combatantId && (c.isPC ? !c.dead : c.hp > 0))
              .map(c => {
                const isDefault = c.id === currentTurnId
                return (
                  <button key={c.id} onClick={() => applyMark(c.id)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: isDefault ? 'rgba(92,124,250,0.2)' : 'var(--color-bg-hover)',
                    border: isDefault ? '1px solid rgba(92,124,250,0.5)' : '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                    fontWeight: isDefault ? 600 : 400,
                  }}>
                    {c.color && (
                      <span style={{
                        width: 9, height: 9, borderRadius: '50%',
                        background: c.color,
                        border: '1px solid rgba(0,0,0,0.3)',
                        display: 'inline-block', flexShrink: 0,
                      }} />
                    )}
                    {c.name}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Class marks section — only shows if at least one PC in combat has a mark type set */}
      {markablePCs.length > 0 && (
        <div style={{ padding: '4px 8px 0' }}>
          <div style={{ fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
            Class Marks
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {/* Active marker first (the current-turn PC if applicable) */}
            {[
              ...(defaultMarker ? [defaultMarker] : []),
              ...markablePCs.filter(m => m !== defaultMarker),
            ].map(({ combatantId: srcId, pcName, color, mark }) => {
              // Active when:
              //  - defender mark: there's a `marked` condition with sourceId matching this PC
              //  - striker mark: the PC's dedicated condition id is present with matching sourceId
              const active = combatant.conditions.some(c =>
                mark.appliesMarkedCondition
                  ? c.conditionId === 'marked' && c.sourceId === srcId
                  : c.conditionId === mark.conditionId && c.sourceId === srcId
              )
              const isDefault = defaultMarker && srcId === defaultMarker.combatantId
              const bg = active ? (color ?? mark.color) : 'transparent'
              const fg = active ? 'var(--color-text-on-warning)' : 'var(--color-text-primary)'
              const border = active
                ? '1px solid rgba(0,0,0,0.25)'
                : isDefault
                  ? '1px solid rgba(92,124,250,0.5)'
                  : '1px solid var(--color-border)'
              return (
                <button key={`${srcId}:${mark.id}`}
                  onClick={() => active ? removeClassMark(mark) : applyClassMark(srcId, mark, color)}
                  title={active
                    ? `Click to remove ${mark.name} from this target`
                    : `Apply ${mark.name} (by ${pcName})`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 10,
                    background: bg, border, color: fg,
                    fontSize: 10, fontWeight: isDefault || active ? 600 : 400,
                    cursor: 'pointer',
                  }}>
                  {/* Source PC chip */}
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: color ?? '#888',
                    border: '1px solid rgba(0,0,0,0.3)',
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11 }}>{mark.icon}</span>
                  <span>{mark.shortName}</span>
                  <span style={{ opacity: 0.7 }}>· {pcName}</span>
                  {active && <span style={{ color: 'var(--color-text-on-warning)' }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />

      {/* Active custom (non-plugin) conditions — click to remove */}
      {customActive.map(cond => {
        const label = cond.customName ?? cond.conditionId
        return (
          <div key={cond.conditionId}
            onClick={() => window.api.combat.removeCondition(combatantId, cond.conditionId)}
            title="Click to remove"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
            }}>
            <ConditionPill
              conditionId={cond.conditionId}
              label={label}
            />
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-check)' }}>✓</span>
          </div>
        )
      })}

      {/* Ongoing damage entry form (triggered by the grid cell at the top) */}
      {ongoingMode && (
        <div style={{ padding: '3px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4 }}>
            <span style={{ fontSize: 11 }}>Ongoing</span>
            <input
              ref={ongoingRef}
              value={ongoingValue}
              onChange={e => setOngoingValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); applyOngoing('') } }}
              placeholder="dmg"
              style={{ width: 40, fontSize: 11, textAlign: 'center', padding: '1px 4px' }}
            />
            {[5, 10, 15, 20].map(v => (
              <span key={v} onClick={() => setOngoingValue(String(v))} style={{
                padding: '1px 4px', borderRadius: 'var(--radius-sm)', fontSize: 9, cursor: 'pointer',
                background: ongoingValue === String(v) ? 'var(--color-accent)' : 'rgba(128,128,128,0.15)',
                color: ongoingValue === String(v) ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                fontWeight: 600,
              }}>{v}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {['', ...DAMAGE_TYPE_NAMES].map(t => {
              const hasValue = !!ongoingValue.trim()
              const isSelected = selectedTypes.has(t)
              const dtStyle = t ? getDamageTypeStyle(t) : { color: '#be123c', icon: '🔄' }
              return (
                <span key={t || '__untyped__'}
                  onClick={hasValue ? (e) => {
                    if (e.shiftKey && t) {
                      // Shift+click: toggle this type (max 1 selected, so total 2 with the final click)
                      setSelectedTypes(prev => {
                        const next = new Set<string>()
                        if (!prev.has(t)) next.add(t)  // toggle: if already selected, deselect (empty set)
                        return next
                      })
                    } else if (selectedTypes.size > 0 && !e.shiftKey) {
                      // Click with existing selection: add this type too and apply all
                      const allTypes = t ? [...selectedTypes, t] : [...selectedTypes]
                      const combined = [...new Set(allTypes)].join(' and ')
                      setSelectedTypes(new Set())
                      applyOngoing(combined)
                    } else {
                      // Regular click: apply with just this type
                      applyOngoing(t)
                    }
                  } : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    padding: '1px 5px', borderRadius: 8,
                    background: isSelected ? dtStyle.color
                      : hasValue ? dtStyle.color + 'cc' : dtStyle.color + '30',
                    color: isSelected || hasValue ? 'var(--color-text-on-dark)' : 'var(--color-text-muted)',
                    fontSize: 9, fontWeight: isSelected ? 700 : 500,
                    cursor: hasValue ? 'pointer' : 'default',
                    opacity: hasValue ? 1 : 0.5,
                    outline: isSelected ? '2px solid var(--color-text-on-dark)' : 'none',
                    outlineOffset: -1,
                  }}>
                  <span style={{ fontSize: 8 }}>{dtStyle.icon}</span>
                  {t || 'untyped'}
                </span>
              )
            })}
          </div>
          {selectedTypes.size > 0 && (
            <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Selected: {[...selectedTypes].join(' and ')} — click another to apply, or shift+click to add more
            </div>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />

      {/* Custom condition inline input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px' }}>
        <input
          ref={customRef}
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          onKeyDown={async e => {
            if (e.key === 'Enter' && customName.trim()) {
              e.preventDefault()
              e.stopPropagation()
              await window.api.combat.addCondition(combatantId, {
                conditionId: `custom-${Date.now()}`,
                customName: customName.trim(),
                duration: getDuration('custom'),
              })
              setCustomName('')
            }
          }}
          placeholder="Custom condition..."
          style={{ flex: 1, fontSize: 11, padding: '2px 6px' }}
        />
      </div>
    </div>
  )
}
