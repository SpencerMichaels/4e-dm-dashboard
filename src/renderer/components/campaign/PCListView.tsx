import { useCallback } from 'react'
import type { PlayerCharacter } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { CreatureImageEditor } from '../shared/CreatureImageEditor'

export function PCListView() {
  const playerCharacters = useCampaignStore((s) => s.playerCharacters)
  const campaign = useCampaignStore((s) => s.campaign)
  const { createPC } = useCampaignActions()

  const partyLevel = campaign?.partyLevel ?? 1

  const updatePartyLevel = useCallback(async (level: number) => {
    if (!Number.isFinite(level) || level < 1) return
    await window.api.campaign.update({ partyLevel: level })
  }, [])

  const savePC = useCallback(async (pc: PlayerCharacter) => {
    await window.api.entity.save('player-character', { ...pc, updatedAt: new Date().toISOString() })
  }, [])

  const deletePC = useCallback(async (id: string) => {
    await window.api.entity.delete('player-character', id)
  }, [])

  const handleCreate = useCallback(async () => {
    await createPC('New Character', '')
  }, [createPC])

  useHotkeys([{ key: 'n', handler: handleCreate }])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)' }}>Player Characters</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Party Level
            <input
              type="number"
              min={1}
              max={30}
              value={partyLevel}
              onChange={(e) => updatePartyLevel(Number(e.target.value))}
              style={{ width: 48, textAlign: 'center', fontWeight: 600 }}
            />
          </label>
          <button
            onClick={handleCreate}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            + New
          </button>
        </div>
      </div>

      {playerCharacters.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No player characters yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {playerCharacters.map((pc) => (
            <PCCard key={pc.id} pc={pc} partyLevel={partyLevel} onSave={savePC} onDelete={deletePC} />
          ))}
        </div>
      )}
    </div>
  )
}

interface PCCardProps {
  pc: PlayerCharacter
  partyLevel: number
  onSave: (pc: PlayerCharacter) => void
  onDelete: (id: string) => void
}

function PCCard({ pc, partyLevel, onSave, onDelete }: PCCardProps) {
  const update = (patch: Partial<PlayerCharacter>) => onSave({ ...pc, ...patch })
  const isActive = pc.active !== false

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      background: 'var(--color-bg-surface)',
      borderLeft: pc.color ? `4px solid ${pc.color}` : '1px solid var(--color-border)',
      opacity: isActive ? 1 : 0.55,
    }}>
      {/* Stat-block style header */}
      <div style={{
        background: '#62584a',
        color: '#f0e8d0',
        padding: '4px 10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 8,
      }}>
        <input
          value={pc.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Character name"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            fontFamily: "'MentorSans', 'Mentor', sans-serif",
            fontWeight: 700,
            fontSize: 16,
            flex: 1,
            outline: 'none',
            padding: 0,
          }}
        />
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, opacity: 0.85 }}
            title={isActive ? 'Active in party (counts toward party size)' : 'Inactive (does not count toward party size)'}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => update({ active: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            Active
          </label>
          <span style={{ fontFamily: "'MentorSans', 'Mentor', sans-serif", fontWeight: 700 }}>
            Level {partyLevel}
          </span>
        </span>
      </div>

      {/* Sub-header: player name + color */}
      <div style={{
        background: '#7a6f5e',
        color: '#f0e8d0',
        padding: '2px 10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
      }}>
        <input
          value={pc.playerName}
          onChange={(e) => update({ playerName: e.target.value })}
          placeholder="Player name"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            fontStyle: 'italic',
            flex: 1,
            outline: 'none',
            padding: 0,
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title="Chip color">
          <span style={{ fontSize: 11, opacity: 0.85 }}>Color</span>
          <input
            type="color"
            value={pc.color ?? '#888888'}
            onChange={(e) => update({ color: e.target.value })}
            style={{
              width: 22, height: 18, border: 'none', background: 'transparent',
              padding: 0, cursor: 'pointer',
            }}
          />
          {pc.color && (
            <button
              onClick={() => update({ color: undefined })}
              title="Clear color"
              style={{
                background: 'transparent', border: 'none', color: 'inherit',
                cursor: 'pointer', padding: 0, fontSize: 12, opacity: 0.7,
              }}
            >×</button>
          )}
        </label>
      </div>

      {/* Body: image + token editor */}
      <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <CreatureImageEditor
          imageId={pc.imageId}
          tokenImageId={pc.tokenImageId}
          tokenCrop={pc.tokenCrop}
          onImageChange={(imageId) => update({ imageId })}
          onTokenChange={(tokenImageId, crop) => update({ tokenImageId, tokenCrop: crop })}
        />
        <button
          onClick={() => onDelete(pc.id)}
          title="Delete character"
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--color-text-muted)', cursor: 'pointer',
            fontSize: 'var(--font-size-sm)', padding: 'var(--space-1) var(--space-2)',
          }}
        >Delete</button>
      </div>
    </div>
  )
}
