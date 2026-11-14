import { useState, useEffect } from 'react'
import type { Encounter } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { Dnd4eEncounterEditor } from './Dnd4eEncounterEditor'
import { generateId } from '@common/utils/id'

interface Props {
  encounterId?: string
}

export function EncounterEditor({ encounterId }: Props) {
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const creatures = useCampaignStore((s) => s.creatures)
  const { setView } = useUiStore()

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

  if (!encounter) return <div style={{ color: 'var(--muted)' }}>Loading...</div>

  const save = (updated: Encounter) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setEncounter(withTime)
    window.api.entity.save('encounter', withTime)
  }

  const navigateTo = (creatureId: string) => {
    setView({ type: 'compendium', kind: 'creature', id: creatureId })
  }

  return <Dnd4eEncounterEditor encounter={encounter} onSave={save} creatures={creatures} onNavigate={navigateTo} />
}
