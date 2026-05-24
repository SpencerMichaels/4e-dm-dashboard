import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../shared/Modal'
import type { PendingPrompt, CombatNotification } from '@common/types'

interface Props {
  combatantName: string
  prompts: PendingPrompt[]
  onDone: (notifications: CombatNotification[]) => void
}

export function SaveRechargeModal({ combatantName, prompts, onDone }: Props) {
  const saves = prompts.filter(p => p.type === 'save')
  const recharges = prompts.filter(p => p.type === 'recharge')
  const [savedSet, setSavedSet] = useState<Set<number>>(new Set())
  const [rechargedSet, setRechargedSet] = useState<Set<number>>(new Set())

  const saveBonus = saves[0]?.saveBonus ?? 0

  const toggleSave = useCallback((idx: number) => {
    setSavedSet(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const toggleRecharge = useCallback((idx: number) => {
    setRechargedSet(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const handleConfirm = useCallback(() => {
    const notifications: CombatNotification[] = []
    for (let i = 0; i < saves.length; i++) {
      const s = saves[i]
      const success = savedSet.has(i)
      notifications.push({
        type: success ? 'save-success' : 'save-fail',
        combatantId: s.combatantId,
        message: success ? `${combatantName} saved vs ${s.label}!` : `${combatantName} failed save vs ${s.label}`,
      })
    }

    for (let i = 0; i < recharges.length; i++) {
      const r = recharges[i]
      const success = rechargedSet.has(i)
      notifications.push({
        type: success ? 'recharge-success' : 'recharge-fail',
        combatantId: r.combatantId,
        message: success ? `${combatantName}: ${r.label} recharged!` : `${combatantName}: ${r.label} failed to recharge`,
      })
    }

    onDone(notifications)
  }, [saves, recharges, savedSet, rechargedSet, onDone])

  // Keyboard shortcuts for toggling items and confirming
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleConfirm()
        return
      }
      const num = parseInt(e.key)
      if (!isNaN(num) && num >= 1) {
        const idx = num - 1
        if (idx < saves.length) {
          toggleSave(idx)
        } else if (idx - saves.length < recharges.length) {
          toggleRecharge(idx - saves.length)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleConfirm, saves.length, recharges.length, toggleSave, toggleRecharge])

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 12px', borderRadius: 'var(--radius-sm)',
    cursor: 'pointer', userSelect: 'none',
    background: active ? 'rgba(42, 170, 102, 0.2)' : 'rgba(128,128,128,0.1)',
    border: active ? '1px solid var(--color-check)' : '1px solid var(--color-border)',
    color: active ? 'var(--color-check)' : 'var(--color-text-primary)',
    fontWeight: active ? 700 : 400,
    fontSize: 13,
  })

  let counter = 0

  return (
    <Modal onClose={handleConfirm} minWidth={400} maxWidth={600} closeOnOverlayClick={false}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>{combatantName} — End of Turn</div>

      {saves.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 'var(--space-2)' }}>
            Roll Saves{saveBonus > 0 ? ` (+${saveBonus})` : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {saves.map((s, i) => {
              counter++
              const num = counter
              return (
                <div key={i} onClick={() => toggleSave(i)} style={itemStyle(savedSet.has(i))}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{num}.</span>
                  {s.label}
                  {savedSet.has(i) && <span style={{ fontSize: 11 }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {recharges.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 'var(--space-2)' }}>
            Roll Recharge
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {recharges.map((r, i) => {
              counter++
              const num = counter
              return (
                <div key={i} onClick={() => toggleRecharge(i)} style={itemStyle(rechargedSet.has(i))}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{num}.</span>
                  {r.label} ({r.threshold}+)
                  {rechargedSet.has(i) && <span style={{ fontSize: 11 }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'center' }}>
        Click items or press number keys to toggle · Space to continue
      </div>
    </Modal>
  )
}
