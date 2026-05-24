import { useState, useEffect } from 'react'
import type { Creature } from '@common/types'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { SchemaForm } from './SchemaForm'
import { generateId } from '@common/utils/id'
import { getPluginUI } from '../../plugins/registry'
import type { PluginUIComponents } from '../../plugins/plugin-types'

interface Props {
  creatureId?: string
}

export function CreatureEditor({ creatureId }: Props) {
  const [creature, setCreature] = useState<Creature | null>(null)
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const setView = useUiStore((s) => s.setView)
  const { createCreature } = useCampaignActions()
  const [pluginUI, setPluginUI] = useState<PluginUIComponents | null>(null)

  // Load plugin UI components
  useEffect(() => {
    if (systemPlugin?.id) {
      getPluginUI(systemPlugin.id).then(setPluginUI)
    }
  }, [systemPlugin?.id])

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

  const save = (updated: Creature) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setCreature(withTime)
    window.api.entity.save('creature', withTime)
  }

  const builder = systemPlugin?.creatureBuilder
  const PluginDetails = pluginUI?.CreatureDetails

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

      {/* Name — hidden when plugin provides its own header */}
      {!PluginDetails && (
        <input
          value={creature.name}
          onChange={e => save({ ...creature, name: e.target.value })}
          placeholder="Creature name"
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
      )}

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

      {/* Plugin-provided creature details */}
      {PluginDetails && builder ? (
        <PluginDetails creature={creature} onSave={save} config={builder} />
      ) : builder ? (
        /* Fallback: HP fields + generic schema (shouldn't happen for built-in plugins) */
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <label>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>HP</span>
              <input type="number" value={creature.hp} onChange={e => save({ ...creature, hp: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Max HP</span>
              <input type="number" value={creature.maxHp} onChange={e => save({ ...creature, maxHp: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
          </div>
        </div>
      ) : systemPlugin?.statBlockSchema ? (
        /* Generic schema fallback (Delta Green, etc.) */
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <label>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>HP</span>
              <input type="number" value={creature.hp} onChange={e => save({ ...creature, hp: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Max HP</span>
              <input type="number" value={creature.maxHp} onChange={e => save({ ...creature, maxHp: Number(e.target.value) })} style={{ width: '100%' }} />
            </label>
          </div>
          <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Stat Block</h3>
          <SchemaForm
            schema={systemPlugin.statBlockSchema}
            values={creature.statBlock}
            onChange={(key, value) => save({ ...creature, statBlock: { ...creature.statBlock, [key]: value } })}
          />
        </div>
      ) : null}

    </div>
  )
}
