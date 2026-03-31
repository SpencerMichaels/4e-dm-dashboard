import { useState, useEffect } from 'react'
import type { PlayerCharacter } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { SchemaForm } from './SchemaForm'
import { generateId } from '@common/utils/id'

interface Props {
  pcId?: string
}

export function PCEditor({ pcId }: Props) {
  const [pc, setPc] = useState<PlayerCharacter | null>(null)
  const systemPlugin = useUiStore((s) => s.systemPlugin)

  useEffect(() => {
    if (pcId) {
      window.api.entity.get('player-character', pcId).then((p: any) => setPc(p))
    } else {
      const now = new Date().toISOString()
      setPc({
        id: generateId(),
        name: 'New Character',
        playerName: '',
        hp: 10,
        maxHp: 10,
        stats: {},
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
    }
  }, [pcId])

  if (!pc) return <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  const save = (updated: PlayerCharacter) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setPc(withTime)
    window.api.entity.save('player-character', withTime)
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <input
        value={pc.name}
        onChange={(e) => save({ ...pc, name: e.target.value })}
        placeholder="Character name"
        style={{
          width: '100%',
          fontSize: 'var(--font-size-2xl)',
          fontWeight: 600,
          border: 'none',
          background: 'transparent',
          marginBottom: 'var(--space-4)',
          padding: 0,
        }}
      />

      <label style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
          Player Name
        </span>
        <input
          value={pc.playerName}
          onChange={(e) => save({ ...pc, playerName: e.target.value })}
          placeholder="Who plays this character?"
          style={{ width: '100%' }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <label>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>HP</span>
          <input type="number" value={pc.hp} onChange={(e) => save({ ...pc, hp: Number(e.target.value) })} style={{ width: '100%' }} />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Max HP</span>
          <input type="number" value={pc.maxHp} onChange={(e) => save({ ...pc, maxHp: Number(e.target.value) })} style={{ width: '100%' }} />
        </label>
      </div>

      {systemPlugin?.pcSchema && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Stats</h3>
          <SchemaForm
            schema={systemPlugin.pcSchema}
            values={pc.stats}
            onChange={(key, value) => save({ ...pc, stats: { ...pc.stats, [key]: value } })}
          />
        </div>
      )}

      <label>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
          Tags (comma-separated)
        </span>
        <input
          value={pc.tags.join(', ')}
          onChange={(e) => save({ ...pc, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          style={{ width: '100%' }}
        />
      </label>
    </div>
  )
}
