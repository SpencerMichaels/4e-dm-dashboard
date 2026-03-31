import { useState } from 'react'
import type { CombatState } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { generateId } from '@common/utils/id'

interface Props {
  combat: CombatState
}

export function InitiativeEntry({ combat }: Props) {
  const [initiatives, setInitiatives] = useState<Record<string, string>>({})
  const playerCharacters = useCampaignStore((s) => s.playerCharacters)

  const combatants = Object.values(combat.combatants)
  const allSet = combatants.length > 0 && combatants.every((c) => c.initiative != null)

  const handleSetInitiative = (id: string, value: string) => {
    setInitiatives({ ...initiatives, [id]: value })
    const num = Number(value)
    if (!isNaN(num) && value !== '') {
      window.api.combat.setInitiative(id, num)
    }
  }

  const handleBegin = async () => {
    await window.api.combat.begin()
  }

  const handleAddPC = async (pcId: string) => {
    const pc = playerCharacters.find((p) => p.id === pcId)
    if (!pc) return
    await window.api.combat.addCombatant({
      id: generateId(),
      name: pc.name,
      isPC: true,
      hp: pc.hp,
      maxHp: pc.maxHp,
      imageId: pc.imageId,
      entityId: pc.id,
      statBlock: pc.stats,
    })
  }

  const unaddedPCs = playerCharacters.filter(
    (pc) => !combatants.some((c) => c.entityId === pc.id)
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-4)' }}>
        Roll Initiative
      </h1>

      {combatants.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No combatants yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {combatants.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span style={{
                flex: 1,
                fontWeight: c.isPC ? 600 : 400,
                color: c.isPC ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}>
                {c.name}
                {c.miniIndicator && <span style={{ color: 'var(--color-text-muted)', marginLeft: 'var(--space-1)' }}>({c.miniIndicator})</span>}
              </span>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', minWidth: 40 }}>
                {c.isPC ? 'PC' : `${c.hp}hp`}
              </span>
              <input
                type="number"
                value={initiatives[c.id] ?? (c.initiative != null ? String(c.initiative) : '')}
                onChange={(e) => handleSetInitiative(c.id, e.target.value)}
                placeholder="Init"
                style={{ width: 70, textAlign: 'center' }}
                autoFocus={combatants.indexOf(c) === 0}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add PCs */}
      {unaddedPCs.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) handleAddPC(e.target.value); e.target.value = '' }}
          style={{ width: '100%', marginBottom: 'var(--space-4)' }}
        >
          <option value="">+ Add player character...</option>
          {unaddedPCs.map((pc) => (
            <option key={pc.id} value={pc.id}>{pc.name} ({pc.playerName})</option>
          ))}
        </select>
      )}

      <button
        onClick={handleBegin}
        disabled={!allSet}
        style={{
          padding: 'var(--space-3) var(--space-6)',
          background: allSet ? 'var(--color-accent)' : 'var(--color-bg-surface)',
          color: allSet ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-base)',
          fontWeight: 600,
          cursor: allSet ? 'pointer' : 'default',
        }}
      >
        {allSet ? 'Begin Combat' : `Set all initiatives first (${combatants.filter(c => c.initiative != null).length}/${combatants.length})`}
      </button>
    </div>
  )
}
