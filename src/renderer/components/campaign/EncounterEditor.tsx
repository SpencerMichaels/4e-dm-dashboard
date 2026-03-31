import { useState, useEffect } from 'react'
import type { Encounter, EncounterCreature } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { Autocomplete } from '../shared/Autocomplete'
import { generateId } from '@common/utils/id'

interface Props {
  encounterId?: string
}

export function EncounterEditor({ encounterId }: Props) {
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const creatures = useCampaignStore((s) => s.creatures)
  const { setView } = useUiStore()
  const systemPlugin = useUiStore((s) => s.systemPlugin)

  useEffect(() => {
    if (encounterId) {
      window.api.entity.get('encounter', encounterId).then((e: any) => setEncounter(e))
    } else {
      const now = new Date().toISOString()
      setEncounter({
        id: generateId(),
        name: 'New Encounter',
        creatures: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
    }
  }, [encounterId])

  if (!encounter) return <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>

  const save = (updated: Encounter) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setEncounter(withTime)
    window.api.entity.save('encounter', withTime)
  }

  const addCreature = (creatureId: string) => {
    const existing = encounter.creatures.find(c => c.creatureId === creatureId)
    if (existing) {
      save({
        ...encounter,
        creatures: encounter.creatures.map(c =>
          c.creatureId === creatureId ? { ...c, count: c.count + 1 } : c
        ),
      })
    } else {
      save({
        ...encounter,
        creatures: [...encounter.creatures, { creatureId, count: 1 }],
      })
    }
  }

  const removeCreature = (creatureId: string) => {
    save({
      ...encounter,
      creatures: encounter.creatures.filter(c => c.creatureId !== creatureId),
    })
  }

  const startCombat = async () => {
    await window.api.combat.start(encounter.id)
    // Add all creatures as combatants
    for (const ec of encounter.creatures) {
      const creature = creatures.find(c => c.id === ec.creatureId)
      if (!creature) continue
      for (let i = 0; i < ec.count; i++) {
        const indicator = ec.count > 1 ? String.fromCharCode(65 + i) : undefined // A, B, C...
        const combatHp = ec.overrideHp ?? creature.maxHp
        await window.api.combat.addCombatant({
          id: generateId(),
          name: ec.count > 1 ? `${creature.name} ${indicator}` : creature.name,
          isPC: false,
          hp: combatHp,
          maxHp: combatHp,
          miniIndicator: indicator,
          statBlock: creature.statBlock,
          imageId: creature.imageId,
          entityId: creature.id,
        })
      }
    }
    setView({ type: 'combat' })
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <input
        value={encounter.name}
        onChange={e => save({ ...encounter, name: e.target.value })}
        placeholder="Encounter name"
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

      <textarea
        value={encounter.description || ''}
        onChange={e => save({ ...encounter, description: e.target.value })}
        placeholder="Description..."
        rows={3}
        style={{ width: '100%', marginBottom: 'var(--space-4)', resize: 'vertical' }}
      />

      <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Creatures</h3>

      {encounter.creatures.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>No creatures added yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {encounter.creatures.map((ec) => {
            const creature = creatures.find(c => c.id === ec.creatureId)
            return (
              <div
                key={ec.creatureId}
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
                <span style={{ flex: 1 }}>{creature?.name ?? 'Unknown'}</span>
                {systemPlugin?.creatureBuilder?.encounterCreatureModifiers?.map((mod: any) => (
                  <label key={mod.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={ec.overrideHp === mod.hpOverride}
                      onChange={e => save({
                        ...encounter,
                        creatures: encounter.creatures.map(c =>
                          c.creatureId === ec.creatureId
                            ? { ...c, overrideHp: e.target.checked ? mod.hpOverride : undefined }
                            : c
                        ),
                      })}
                    />
                    {mod.label}
                  </label>
                ))}
                <input
                  type="number"
                  min={1}
                  value={ec.count}
                  onChange={e => save({
                    ...encounter,
                    creatures: encounter.creatures.map(c =>
                      c.creatureId === ec.creatureId ? { ...c, count: Math.max(1, Number(e.target.value)) } : c
                    ),
                  })}
                  style={{ width: 60 }}
                />
                <button onClick={() => removeCreature(ec.creatureId)} style={{ color: 'var(--color-danger)' }}>
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Autocomplete
          options={creatures.map(c => ({ value: c.id, label: c.name }))}
          value=""
          onChange={(val) => { if (val) addCreature(val) }}
          placeholder="+ Add creature..."
        />
      </div>

      {encounter.creatures.length > 0 && (
        <button
          onClick={startCombat}
          style={{
            padding: 'var(--space-3) var(--space-6)',
            background: 'var(--color-danger)',
            color: '#fff',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-base)',
            fontWeight: 600,
          }}
        >
          Start Combat
        </button>
      )}
    </div>
  )
}
