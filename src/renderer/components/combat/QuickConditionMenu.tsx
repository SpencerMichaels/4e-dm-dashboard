import { useEffect, useRef, useState } from 'react'
import type { CombatantState, CombatState } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { useCombatStore } from '../../stores/combat-store'
import { getConditionStyle } from '../../plugins/dnd-4e/condition-styles'
import { DAMAGE_TYPE_NAMES, getDamageTypeStyle } from '../../plugins/dnd-4e/damage-types'
import { ConditionPill } from '../../plugins/dnd-4e/ConditionPill'

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
  const [durationOverride, setDurationOverride] = useState<{ type: string; expiresOnId?: string } | null>(null)
  const [hoveredCondId, setHoveredCondId] = useState<string | null>(null)
  const [showTurnPicker, setShowTurnPicker] = useState<'eont' | 'sont' | null>(null)

  const conditions = (systemPlugin?.conditions ?? []).filter((c: any) => c.id !== 'ongoing-damage' && !c.hidden)
  const activeConditionIds = new Set(combatant.conditions.map(c => c.conditionId))

  const naturalDefault = (condId: string): string => {
    if (condId === 'prone' || condId === 'unconscious' || condId === 'combat-advantage' || condId === 'dying') return 'indefinite'
    if (condId === 'marked') return 'eont'
    return 'save-ends'
  }

  // Current turn creature ID for EONT/SONT source tracking
  const currentTurnId = combat?.initiativeOrder[combat?.turnIndex ?? 0]
  const currentTurnName = currentTurnId ? combat?.combatants[currentTurnId]?.name : undefined

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

  const applyMark = (sourceId: string) => {
    const sourceName = combat?.combatants[sourceId]?.name ?? sourceId
    const dur = getDuration('marked')
    // Default mark EONT expires on the marker's turn
    if (dur.type === 'eont' && !dur.expiresOnId) dur.expiresOnId = sourceId
    // If marking during the marker's own turn, survive this turn-end
    if ((dur.type === 'eont' || dur.type === 'sont') && dur.expiresOnId === currentTurnId) {
      dur.remaining = 1
    }
    window.api.combat.addCondition(combatantId, {
      conditionId: 'marked',
      sourceId,
      customDescription: `by ${sourceName}`,
      duration: dur,
    })
    setMarkSourcePicker(false)
  }

  const toggle = (conditionId: string) => {
    if (activeConditionIds.has(conditionId)) {
      window.api.combat.removeCondition(combatantId, conditionId)
    } else if (conditionId === 'marked') {
      if (markSourcePicker && currentTurnId) {
        // Second click: auto-apply with current-turn creature as source
        applyMark(currentTurnId)
      } else {
        setMarkSourcePicker(true)
      }
      return
    } else {
      setMarkSourcePicker(false)
      window.api.combat.addCondition(combatantId, {
        conditionId,
        duration: getDuration(conditionId),
      })
    }
  }

  const applyOngoing = (typeOverride?: string) => {
    const raw = ongoingValue.trim()
    if (!raw) return
    const dmgType = typeOverride ?? ongoingType
    // Pure integer (e.g., "5") → store as value. Dice expression (e.g., "1d6", "2d8+3") → store as customName
    const isPureNumber = /^\d+$/.test(raw)
    const label = `Ongoing ${raw}${dmgType ? ' ' + dmgType : ''}`
    window.api.combat.addCondition(combatantId, {
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
                padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 600,
                cursor: 'pointer', userSelect: 'none',
                background: isOverride ? 'var(--color-accent)' : (showTurnPicker === d.type) ? 'rgba(92,124,250,0.3)' : isHoveredDefault ? 'rgba(128,128,128,0.3)' : 'rgba(128,128,128,0.1)',
                color: isOverride ? 'var(--color-accent-text)' : isHoveredDefault ? 'var(--color-text)' : 'var(--color-text-muted)',
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
              padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 600,
              cursor: 'pointer', background: 'rgba(128,128,128,0.15)', color: 'var(--color-text)',
            }}>
              Attacker: {currentTurnName}
            </span>
          )}
          <span onClick={() => {
            setDurationOverride({ type: showTurnPicker, expiresOnId: combatantId })
            setShowTurnPicker(null)
          }} style={{
            padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 600,
            cursor: 'pointer', background: 'rgba(128,128,128,0.15)', color: 'var(--color-text)',
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
          const active = activeConditionIds.has(c.id)
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
                padding: '3px 6px', cursor: readOnly ? 'default' : 'pointer', borderRadius: 3,
                background: active ? style.color + '30' : 'transparent',
                opacity: readOnly ? 0.7 : 1,
              }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 8,
                background: active ? style.color : (markSourcePicker && c.id === 'marked') ? style.color + '90' : style.color + '40',
                color: active || (markSourcePicker && c.id === 'marked') ? style.textColor : 'var(--color-text)',
                fontSize: 10, fontWeight: active || (markSourcePicker && c.id === 'marked') ? 600 : 400,
              }}>
                <span style={{ fontSize: 9 }}>{style.icon}</span>
                {c.name}
              </span>
              {active && <span style={{ fontSize: 10, color: '#2a6' }}>✓</span>}
            </div>
          )
        })}
      </div>

      {/* Mark source picker */}
      {markSourcePicker && combat && (
        <div style={{ padding: '4px 8px', background: 'var(--color-bg-surface)', margin: '2px 4px', borderRadius: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flex: 1 }}>Marked by whom?</span>
            <span onClick={() => setMarkSourcePicker(false)} style={{ fontSize: 10, color: 'var(--color-text-muted)', cursor: 'pointer' }}>✕</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {Object.values(combat.combatants)
              .filter(c => c.id !== combatantId && c.hp > 0)
              .map(c => {
                const isDefault = c.id === currentTurnId
                return (
                  <button key={c.id} onClick={() => applyMark(c.id)} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    background: isDefault ? 'rgba(92,124,250,0.2)' : 'var(--color-bg-hover)',
                    border: isDefault ? '1px solid rgba(92,124,250,0.5)' : '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontWeight: isDefault ? 600 : 400,
                  }}>
                    {c.name}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />

      {/* Active ongoing damage instances */}
      {activeOngoing.map(cond => (
        <div key={cond.conditionId} onClick={() => window.api.combat.removeCondition(combatantId, cond.conditionId)} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', cursor: 'pointer', borderRadius: 3,
        }}>
          <ConditionPill
            conditionId={cond.conditionId}
            label={`Ongoing ${cond.value ?? ''}${cond.customDescription ? ' ' + cond.customDescription : ''}`}
            damageType={cond.customDescription}
          />
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#2a6' }}>✓</span>
        </div>
      ))}

      {/* Add ongoing damage */}
      {!ongoingMode ? (
        <div onClick={() => setOngoingMode(true)} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', cursor: 'pointer', borderRadius: 3,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', borderRadius: 8,
            background: getConditionStyle('ongoing-damage').color + '40',
            color: 'var(--color-text)', fontSize: 10,
          }}>
            <span style={{ fontSize: 9 }}>{getConditionStyle('ongoing-damage').icon}</span>
            Ongoing Damage
          </span>
        </div>
      ) : (
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
                padding: '1px 4px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
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
                    color: isSelected || hasValue ? '#fff' : 'var(--color-text-muted)',
                    fontSize: 9, fontWeight: isSelected ? 700 : 500,
                    cursor: hasValue ? 'pointer' : 'default',
                    opacity: hasValue ? 1 : 0.5,
                    outline: isSelected ? '2px solid #fff' : 'none',
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
          onKeyDown={e => {
            if (e.key === 'Enter' && customName.trim()) {
              e.preventDefault()
              e.stopPropagation()
              window.api.combat.addCondition(combatantId, {
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
