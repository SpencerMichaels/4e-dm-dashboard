import { useState, useEffect, useRef, useCallback } from 'react'
import type { CombatState, CombatantState } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { generateId } from '@common/utils/id'
import { rollD20 } from '@common/utils/dice'
import { CombatToken } from './CombatToken'

interface Props {
  combat: CombatState
}

export function InitiativeEntry({ combat }: Props) {
  const playerCharacters = useCampaignStore((s) => s.playerCharacters)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')

  // Sort combatants: PCs first (alphabetical), then monsters (alphabetical)
  const sortedIds = Object.keys(combat.combatants).sort((a, b) => {
    const ca = combat.combatants[a], cb = combat.combatants[b]
    if (ca.isPC !== cb.isPC) return ca.isPC ? -1 : 1
    return ca.name.localeCompare(cb.name)
  })

  // Track which combatant we're currently prompting
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentId = sortedIds[currentIndex] ?? null
  const currentCombatant = currentId ? combat.combatants[currentId] : null

  // Broadcast focus to player display
  useEffect(() => {
    if (currentId) {
      window.api.combat.setInitiativeFocus(currentId)
    }
  }, [currentId])

  // Auto-focus the input when current combatant changes
  useEffect(() => {
    setInputValue('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [currentIndex])

  // Auto-roll monster initiatives one at a time, then reshuffle once at the end
  const autoRollMonsters = useCallback(async (startIdx: number) => {
    for (let i = startIdx; i < sortedIds.length; i++) {
      const id = sortedIds[i]
      const c = combat.combatants[id]
      if (c.isPC) continue
      // Highlight this monster as the focus (spotlight on player display)
      await window.api.combat.setInitiativeFocus(id)
      await new Promise(resolve => setTimeout(resolve, 400))
      // Roll and set the initiative — number appears next to the monster
      const bonus = (c.statBlock?.initiative as number) ?? 0
      const roll = rollD20() + bonus
      await window.api.combat.setInitiative(id, roll)
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    // All monsters rolled — clear focus, let the reshuffle animation play
    await window.api.combat.setInitiativeFocus(null)
    await new Promise(resolve => setTimeout(resolve, 1500))
    await window.api.combat.start()
  }, [sortedIds, combat.combatants])

  const handleSubmit = useCallback(async () => {
    if (!currentId || !inputValue.trim()) return
    const num = Number(inputValue)
    if (isNaN(num)) return

    await window.api.combat.setInitiative(currentId, num)

    const nextIdx = currentIndex + 1
    if (nextIdx >= sortedIds.length) {
      // All done
      await window.api.combat.start()
      return
    }

    // Check if next combatant is a monster — auto-roll all remaining monsters
    const nextCombatant = combat.combatants[sortedIds[nextIdx]]
    if (nextCombatant && !nextCombatant.isPC) {
      await autoRollMonsters(nextIdx)
      return
    }

    setCurrentIndex(nextIdx)
  }, [currentId, inputValue, currentIndex, sortedIds, combat.combatants, autoRollMonsters])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleAddPC = async (pcId: string) => {
    const pc = playerCharacters.find((p) => p.id === pcId)
    if (!pc) return
    await window.api.combat.addCombatant({
      id: generateId(),
      name: pc.name,
      isPC: true,
      playerName: pc.playerName,
      hp: pc.hp,
      maxHp: pc.maxHp,
      imageId: pc.imageId,
      entityId: pc.id,
      statBlock: pc.stats,
    })
  }

  const unaddedPCs = playerCharacters.filter(
    (pc) => !Object.values(combat.combatants).some((c) => c.entityId === pc.id)
  )

  // Count how many PCs remain
  const pcCount = sortedIds.filter(id => combat.combatants[id].isPC).length
  const monstersStart = sortedIds.findIndex(id => !combat.combatants[id].isPC)
  const totalMonsters = sortedIds.filter(id => !combat.combatants[id].isPC).length

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-4)' }}>
        Roll Initiative
      </h1>

      {/* Add PCs */}
      {unaddedPCs.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) handleAddPC(e.target.value); e.target.value = '' }}
          style={{ width: '100%', marginBottom: 'var(--space-4)' }}
        >
          <option value="">+ Add player character...</option>
          {unaddedPCs.map((pc) => (
            <option key={pc.id} value={pc.id}>{pc.name}</option>
          ))}
        </select>
      )}

      {sortedIds.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No combatants yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sortedIds.map((id, idx) => {
            const c = combat.combatants[id]
            const isCurrent = idx === currentIndex
            const isDone = c.initiative != null
            const isPastCurrent = idx < currentIndex

            // Section header
            const showPcHeader = idx === 0 && c.isPC
            const showMonsterHeader = idx === monstersStart && monstersStart >= 0

            return (
              <div key={id}>
                {showPcHeader && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0 2px', marginTop: idx > 0 ? 8 : 0 }}>
                    Players
                  </div>
                )}
                {showMonsterHeader && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0 2px', marginTop: 8 }}>
                    Monsters ({totalMonsters})
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: isCurrent ? 'var(--color-accent)' : 'var(--color-bg-surface)',
                  color: isCurrent ? 'var(--color-accent-text)' : undefined,
                  border: isCurrent ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  opacity: !isDone && !isCurrent ? 0.5 : 1,
                }}>
                  <CombatToken name={c.name} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={c.hp} maxHp={c.maxHp} size={24} />
                  <span style={{ flex: 1, fontWeight: isCurrent || c.isPC ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>

                  {isCurrent ? (
                    <input
                      ref={inputRef}
                      type="number"
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Init"
                      style={{
                        width: 60, textAlign: 'center', padding: '2px 4px',
                        borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.3)',
                        background: 'rgba(255,255,255,0.15)', color: 'inherit',
                        fontSize: 'var(--font-size-base)', fontWeight: 600,
                      }}
                    />
                  ) : isDone ? (
                    <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                      {c.initiative}
                    </span>
                  ) : (
                    <span style={{ minWidth: 30, textAlign: 'center', color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
