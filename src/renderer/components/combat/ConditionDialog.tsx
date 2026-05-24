import { useState } from 'react'
import { useUiStore } from '../../stores/ui-store'
import { Modal, modalStyles } from '../shared/Modal'
import type { AppliedCondition, DurationType } from '@common/types'
import { generateId } from '@common/utils/id'

interface Props {
  combatantId: string
  onClose: () => void
}

export function ConditionDialog({ combatantId, onClose }: Props) {
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const [selectedConditionId, setSelectedConditionId] = useState('')
  const [customName, setCustomName] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [value, setValue] = useState('')
  const [durationType, setDurationType] = useState<DurationType>('save-ends')
  const [durationNote, setDurationNote] = useState('')

  const conditions = systemPlugin?.conditions ?? []
  const isCustom = selectedConditionId === '__custom__'
  const selectedDef = isCustom ? null : conditions.find((c: any) => c.id === selectedConditionId)
  const canSubmit = isCustom ? customName.trim() : !!selectedConditionId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    const condition: AppliedCondition = {
      conditionId: isCustom ? `custom-${generateId()}` : selectedConditionId,
      ...(isCustom ? { customName: customName.trim(), customDescription: customDescription.trim() || undefined } : {}),
    }

    if (selectedDef?.hasValue && value) {
      condition.value = Number(value)
    }

    condition.duration = {
      type: durationType,
      ...(durationType === 'custom' && durationNote.trim() ? { note: durationNote.trim() } : {}),
    }

    await window.api.combat.addCondition(combatantId, condition)
    onClose()
  }

  return (
    <Modal onClose={onClose} minWidth={350}>
      <form onSubmit={handleSubmit}>
        <h3 style={{ marginBottom: 'var(--space-3)' }}>Add Condition</h3>

        <select
          value={selectedConditionId}
          onChange={(e) => setSelectedConditionId(e.target.value)}
          style={{ width: '100%', marginBottom: 'var(--space-3)' }}
          autoFocus
        >
          <option value="">Select condition...</option>
          {conditions.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__custom__">Custom...</option>
        </select>

        {isCustom && (
          <>
            <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                Name
              </span>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Slowed by ice, Mark of Bane"
                style={{ width: '100%' }}
                autoFocus
              />
            </label>
            <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                Description (optional)
              </span>
              <input
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Brief description of the effect..."
                style={{ width: '100%' }}
              />
            </label>
          </>
        )}

        {selectedDef?.hasValue && (
          <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
            <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
              Value
            </span>
            <input
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 2"
              style={{ width: '100%' }}
            />
          </label>
        )}

        <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Duration
          </span>
          <select
            value={durationType}
            onChange={(e) => setDurationType(e.target.value as DurationType)}
            style={{ width: '100%' }}
          >
            <option value="save-ends">Save ends</option>
            <option value="eont">End of next turn (EONT)</option>
            <option value="sont">Start of next turn (SONT)</option>
            <option value="indefinite">Never (manual removal)</option>
            <option value="custom">Custom...</option>
          </select>
        </label>

        {durationType === 'custom' && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <input
              value={durationNote}
              onChange={(e) => setDurationNote(e.target.value)}
              placeholder="e.g. until no longer grabbed"
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className={modalStyles.btnSecondary}>Cancel</button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={modalStyles.btnPrimary}
          >
            Apply
          </button>
        </div>
      </form>
    </Modal>
  )
}
