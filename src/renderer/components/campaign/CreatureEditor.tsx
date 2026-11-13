import { useState, useEffect } from 'react'
import type { Creature } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { generateId } from '@common/utils/id'
import { Dnd4eCreatureDetails } from '../creature/Dnd4eCreatureDetails'
import { AuthoredEntity } from '../authoring/AuthoredEntity'

interface Props {
  creatureId?: string
}

export function CreatureEditor({ creatureId }: Props) {
  const [creature, setCreature] = useState<Creature | null>(null)
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const setView = useUiStore((s) => s.setView)

  // Load or create creature
  useEffect(() => {
    if (creatureId) {
      window.api.entity.get('creature', creatureId).then((c: any) => setCreature(c))
    } else {
      const now = new Date().toISOString()
      setCreature({
        id: generateId(),
        name: 'New Creature',
        hp: 10,
        maxHp: 10,
        statBlock: {},
        createdAt: now,
        updatedAt: now,
      })
    }
  }, [creatureId])

  if (!creature) return <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
  if (creature.authoredContent) return <AuthoredEntity content={creature.authoredContent} kind="monster" entityId={creature.id} />

  const save = (updated: Creature) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setCreature(withTime)
    window.api.entity.save('creature', withTime)
  }

  const builder = systemPlugin?.creatureBuilder

  return (
    <div style={{ padding: '0 var(--space-4)' }}>
      {/* Top bar: back to creature list */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <button onClick={() => setView({ type: 'entity-list', entityType: 'creature' })}
          title="Back to creatures"
          style={{
            padding: '4px 10px', background: 'transparent',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)',
          }}>← Back to creatures</button>
      </div>

      {/* Import warnings */}
      {Array.isArray(creature.statBlock._importWarnings) && creature.statBlock._importWarnings.length > 0 && (
        <div style={{
          marginBottom: 'var(--space-4)', padding: 'var(--space-3)',
          background: 'var(--color-import-warning-bg)', border: '1px solid var(--color-import-warning)',
          borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 'var(--space-1)', color: 'var(--color-import-warning)' }}>Import warnings</div>
          {(creature.statBlock._importWarnings as string[]).map((w, i) => (
            <div key={i} style={{ color: 'var(--color-text-secondary)' }}>- {w}</div>
          ))}
          <button
            onClick={() => {
              const { _importWarnings, ...rest } = creature.statBlock
              save({ ...creature, statBlock: rest })
            }}
            style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}
          >Dismiss</button>
        </div>
      )}

      {builder && <Dnd4eCreatureDetails creature={creature} onSave={save} config={builder} />}

    </div>
  )
}
