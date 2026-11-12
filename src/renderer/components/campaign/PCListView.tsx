import { useCallback, useState } from 'react'
import type { PlayerCharacter } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { CreatureImageEditor } from '../shared/CreatureImageEditor'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { CLASS_MARKS } from '../../../common/rules/class-marks'

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
    <div>
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
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          alignItems: 'flex-start',
        }}>
          {playerCharacters.map((pc) => (
            <PCCard key={pc.id} pc={pc} onSave={savePC} onDelete={deletePC} />
          ))}
        </div>
      )}
    </div>
  )
}

interface PCCardProps {
  pc: PlayerCharacter
  onSave: (pc: PlayerCharacter) => void
  onDelete: (id: string) => void
}

function PCCard({ pc, onSave, onDelete }: PCCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const update = (patch: Partial<PlayerCharacter>) => onSave({ ...pc, ...patch })
  const isActive = pc.active !== false

  // Reset input chrome (the global input rule adds bg + border that fight the dark header)
  const headerInputStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    padding: 0,
    color: 'inherit',
    outline: 'none',
  }

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      background: 'var(--color-bg-surface)',
      opacity: isActive ? 1 : 0.55,
      width: 'fit-content',
    }}>
      {/* Stat-block style header: [color][character name] (spacer) [delete] */}
      <div style={{
        background: '#62584a',
        color: '#f0e8d0',
        padding: '4px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <label title="Chip color (click to change)"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, cursor: 'pointer', position: 'relative',
            flexShrink: 0,
          }}>
          <span style={{
            width: 14, height: 14, borderRadius: '50%',
            background: pc.color ?? '#888888',
            border: '1px solid rgba(255,255,255,0.5)',
            display: 'block',
          }} />
          <input
            type="color"
            value={pc.color ?? '#888888'}
            onChange={(e) => update({ color: e.target.value })}
            style={{
              position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
              padding: 0, border: 'none',
            }}
          />
        </label>
        <input
          className="header-input"
          value={pc.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Character name"
          style={{
            ...headerInputStyle,
            fontFamily: "'MentorSans', 'Mentor', sans-serif",
            fontWeight: 700,
            fontSize: 16,
            flex: 1,
            minWidth: 0,
          }}
        />
        <button
          onClick={() => setShowDeleteConfirm(true)}
          title="Delete character"
          style={{
            background: 'transparent', border: 'none',
            cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18,
            color: 'var(--color-danger)', flexShrink: 0,
          }}
        >❌</button>
      </div>

      {/* Sub-header: [active][player name] */}
      <div style={{
        background: '#7a6f5e',
        color: '#f0e8d0',
        padding: '2px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
      }}>
        <button
          onClick={() => update({ active: !isActive })}
          title={isActive ? 'Active in party (click to mark inactive)' : 'Inactive (click to mark active)'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18,
            color: 'inherit', flexShrink: 0,
          }}
        >
          {isActive ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21 c0-4 4-7 8-7 s8 3 8 7 z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21 c0-4 4-7 8-7 s8 3 8 7" />
            </svg>
          )}
        </button>
        <input
          className="header-input"
          value={pc.playerName}
          onChange={(e) => update({ playerName: e.target.value })}
          placeholder="Player name"
          style={{
            ...headerInputStyle,
            flex: '0 0 auto',
            width: 'auto', minWidth: 0,
            fieldSizing: 'content' as any,
          }}
        />
        <span style={{ flex: 1 }} />
        <select
          value={pc.markType ?? ''}
          onChange={(e) => update({ markType: e.target.value || undefined })}
          title="Class mark ability — used by the right-click 'Class Marks' menu in combat"
          style={{
            background: 'transparent', border: 'none', color: 'inherit',
            font: 'inherit', cursor: 'pointer', padding: 0,
            fontSize: 11, opacity: 0.85, flexShrink: 0,
          }}
        >
          <option value="" style={{ color: '#000' }}>— no mark —</option>
          {CLASS_MARKS.map(m => (
            <option key={m.id} value={m.id} style={{ color: '#000' }}>
              {m.icon} {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Body: image only — fixed height so the contained image can never overflow the card */}
      <div style={{ padding: 6 }}>
        <div style={{ width: 180, height: 200, display: 'flex' }}>
          <CreatureImageEditor
            imageId={pc.imageId}
            tokenImageId={pc.tokenImageId}
            tokenCrop={pc.tokenCrop}
            onImageChange={(imageId) => update({ imageId })}
            onTokenChange={(tokenImageId, crop) => update({ tokenImageId, tokenCrop: crop })}
          />
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Delete PC "${pc.name}"? This cannot be undone.`}
          onConfirm={() => {
            onDelete(pc.id)
            setShowDeleteConfirm(false)
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
