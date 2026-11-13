// Traps without initiative act only when triggered, so they sit outside the turn order. This strip
// lists them: click a name to inspect it, Trigger to bring up its stat block and log it, Disable when
// a countermeasure stops it. The eye shows whether players can see it.

import type { CombatState } from '@common/types'
import { actsOnInitiative } from '@common/combat/facts'

interface Props {
  combat: CombatState
  selectedIds: string[]
  onInspect: (id: string) => void
  onTrigger: (id: string) => void
  onToggleDisabled: (id: string) => void
}

export function TriggeredTraps({ combat, selectedIds, onInspect, onTrigger, onToggleDisabled }: Props) {
  const traps = Object.values(combat.combatants).filter(c => c.kind === 'trap' && !actsOnInitiative(c))
  if (!traps.length) return null
  const small = { fontSize: 'var(--font-size-xs)', padding: '1px 6px' }
  return (
    <div className="triggered-traps" style={{ flexShrink: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 6px' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 2 }}>Triggered traps</div>
      {traps.map(t => (
        <div key={t.id} className="triggered-trap" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: t.dead ? 0.5 : 1 }}>
          <button onClick={() => onInspect(t.id)} title="Inspect"
            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: selectedIds.includes(t.id) ? 700 : 400, textDecoration: t.dead ? 'line-through' : undefined }}>
            {t.name}
          </button>
          <button onClick={() => window.api.combat.updateCombatant(t.id, { hidden: !t.hidden })}
            title={t.hidden ? 'Hidden from players: click to reveal' : 'Visible to players: click to hide'}
            style={{ ...small, background: 'none', border: 'none', opacity: t.hidden ? 0.35 : 1 }}>👁</button>
          {!t.dead && <button style={small} onClick={() => onTrigger(t.id)} title="The trap's trigger happened">Trigger</button>}
          <button style={small} onClick={() => onToggleDisabled(t.id)}>{t.dead ? 'Re-arm' : 'Disable'}</button>
        </div>
      ))}
    </div>
  )
}
