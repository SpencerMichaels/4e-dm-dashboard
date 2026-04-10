import { useState, useEffect } from 'react'
import type { Encounter } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { getPluginUI } from '../../plugins/registry'
import type { PluginUIComponents } from '../../plugins/plugin-types'
import { generateId } from '@common/utils/id'

interface Props {
  encounterId?: string
}

export function EncounterEditor({ encounterId }: Props) {
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [pluginUI, setPluginUI] = useState<PluginUIComponents | null>(null)
  const creatures = useCampaignStore((s) => s.creatures)
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const { setView } = useUiStore()

  useEffect(() => {
    if (systemPlugin?.id) getPluginUI(systemPlugin.id).then(setPluginUI)
  }, [systemPlugin?.id])

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

  const navigateTo = (creatureId: string) => {
    setView({ type: 'creature', creatureId })
  }

  // Delegate to plugin editor if available
  if (pluginUI?.EncounterEditor) {
    const PluginEncounterEditor = pluginUI.EncounterEditor
    return <PluginEncounterEditor encounter={encounter} onSave={save} creatures={creatures} onNavigate={navigateTo} />
  }

  // Fallback generic editor
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <input
        value={encounter.name}
        onChange={e => save({ ...encounter, name: e.target.value })}
        placeholder="Encounter name"
        style={{
          width: '100%', fontSize: 'var(--font-size-2xl)', fontWeight: 600,
          border: 'none', background: 'transparent', marginBottom: 'var(--space-4)', padding: 0,
        }}
      />
      <p style={{ color: 'var(--color-text-muted)' }}>No system-specific encounter editor available.</p>
    </div>
  )
}
