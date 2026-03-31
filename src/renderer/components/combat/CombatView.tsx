import { useState } from 'react'
import { useCombatStore } from '../../stores/combat-store'
import { useUiStore } from '../../stores/ui-store'
import { InitiativeEntry } from './InitiativeEntry'
import { InitiativeList } from './InitiativeList'
import { CombatantDetail } from './CombatantDetail'
import { DamageHealDialog } from './DamageHealDialog'
import { ConditionDialog } from './ConditionDialog'
import { EffectDialog } from './EffectDialog'

export function CombatView() {
  const combat = useCombatStore((s) => s.combat)
  const { setView } = useUiStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<
    | { type: 'damage' | 'heal'; combatantId: string }
    | { type: 'condition'; combatantId: string }
    | { type: 'effect'; combatantId: string }
    | null
  >(null)

  if (!combat) {
    return <div style={{ color: 'var(--color-text-muted)' }}>No active combat. Start one from an encounter.</div>
  }

  if (combat.phase === 'initiative-entry') {
    return <InitiativeEntry combat={combat} />
  }

  const currentId = combat.initiativeOrder[combat.turnIndex]
  const selected = selectedId ? combat.combatants[selectedId] : null

  const handleNextTurn = async () => {
    await window.api.combat.nextTurn()
  }

  const handlePrevTurn = async () => {
    await window.api.combat.prevTurn()
  }

  const handleEndCombat = async () => {
    await window.api.combat.end()
    setView({ type: 'home' })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--space-4)', height: '100%' }}>
      {/* Left panel: initiative list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>
            Round {combat.round}
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={handlePrevTurn} title="Previous turn (Ctrl+[)">Prev</button>
            <button onClick={handleNextTurn} title="Next turn (Ctrl+])">Next</button>
          </div>
        </div>

        <InitiativeList
          combat={combat}
          currentId={currentId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <button
          onClick={handleEndCombat}
          style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)', marginTop: 'auto' }}
        >
          End Combat
        </button>
      </div>

      {/* Right panel: selected combatant detail */}
      <div>
        {selected ? (
          <CombatantDetail
            combatant={selected}
            isCurrent={selected.id === currentId}
            isDelayed={combat.delayedIds.includes(selected.id)}
            onDamage={() => setDialog({ type: 'damage', combatantId: selected.id })}
            onHeal={() => setDialog({ type: 'heal', combatantId: selected.id })}
            onAddCondition={() => setDialog({ type: 'condition', combatantId: selected.id })}
            onAddEffect={() => setDialog({ type: 'effect', combatantId: selected.id })}
            onDelay={() => window.api.combat.delay(selected.id)}
            onUndelay={() => window.api.combat.undelay(selected.id, currentId)}
            onRemove={() => { window.api.combat.removeCombatant(selected.id); setSelectedId(null) }}
          />
        ) : (
          <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
            Select a combatant from the initiative list.
          </div>
        )}
      </div>

      {/* Dialogs */}
      {dialog?.type === 'damage' && (
        <DamageHealDialog
          mode="damage"
          combatantName={combat.combatants[dialog.combatantId]?.name ?? ''}
          onSubmit={(amount) => { window.api.combat.damage(dialog.combatantId, amount); setDialog(null) }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'heal' && (
        <DamageHealDialog
          mode="heal"
          combatantName={combat.combatants[dialog.combatantId]?.name ?? ''}
          onSubmit={(amount) => { window.api.combat.heal(dialog.combatantId, amount); setDialog(null) }}
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
    </div>
  )
}
