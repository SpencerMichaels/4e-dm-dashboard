import { useCallback, useMemo, useState } from 'react'
import type { PlayerCharacter } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { useHotkeys } from '../../hooks/use-hotkeys'
import { CreatureImageEditor } from '../shared/CreatureImageEditor'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { CLASS_MARKS, CLASS_MARK_BY_ID } from '../../../common/rules/class-marks'
import { pcLevel } from '@common/rules/party'
import { Icon } from '../shared/Icon'
import { CombatToken } from '../combat/CombatToken'
import { ImportErrorsDialog, PcSheetRows, useCharacterImport } from './PcSheet'
import '../creature/statblock.css'

// The PCs page is the campaign's character library, laid out like a compendium page: a searchable,
// sortable list beside the selected character's pane. The active party (its level, diseases, the
// numbers asked at the table) is the Home board's.

// Columns: active, portrait, character, player, race, class, level.
// Names and players are capped (longer ones end in an ellipsis, with the full text in the tooltip); the rest fit their text.
const PC_COLUMNS = 'max-content max-content fit-content(160px) fit-content(120px) max-content max-content max-content'
// A heading row, the row list, or a row: spans every column and lines its cells up with the list's columns.
const SUBGRID = { gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid' } as const
// A cell in a column sized to its text: never clipped (a row's cells otherwise end in an ellipsis).
const FITS = { overflow: 'visible' } as const

type SortKey = 'name' | 'player' | 'race' | 'class' | 'level'

const raceClass = (pc: PlayerCharacter) => pc.sheet ? [pc.sheet.race, pc.sheet.class].filter(Boolean).join(' ') : ''
const sortValue: Record<SortKey, (pc: PlayerCharacter) => string | number> = {
  name: pc => pc.name.toLowerCase(),
  player: pc => pc.playerName.toLowerCase(),
  race: pc => (pc.sheet?.race ?? '').toLowerCase(),
  class: pc => (pc.sheet?.class ?? '').toLowerCase(),
  level: pc => pcLevel(pc) ?? 0,
}

const savePC = (pc: PlayerCharacter) => window.api.entity.save('player-character', { ...pc, updatedAt: new Date().toISOString() })

export function PCListView() {
  const playerCharacters = useCampaignStore((s) => s.playerCharacters)
  const { createPC } = useCampaignActions()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PlayerCharacter | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const shown = q ? playerCharacters.filter(pc => pc.name.toLowerCase().includes(q) || pc.playerName.toLowerCase().includes(q)) : [...playerCharacters]
    const dir = sort.asc ? 1 : -1
    const value = sortValue[sort.key]
    return shown.sort((a, b) => (value(a) < value(b) ? -dir : value(a) > value(b) ? dir : 0) || a.name.localeCompare(b.name))
  }, [playerCharacters, search, sort])

  // The selected PC, or the first one listed.
  const selected = playerCharacters.find(pc => pc.id === selectedId) ?? rows[0]

  const handleCreate = useCallback(async () => {
    const pc = await createPC('New Character', '')
    setSearch('')
    setSelectedId(pc.id)
  }, [createPC])

  const { pick, outcome, clear } = useCharacterImport()

  useHotkeys([{ key: 'n', handler: handleCreate }, { key: 'i', handler: () => pick() }])

  const header = (label: string, key: SortKey, style?: React.CSSProperties) => (
    <span style={{ cursor: 'pointer', whiteSpace: 'nowrap', ...style }} onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))}>
      {label}{sort.key === key && <>{' '}<Icon name={sort.asc ? 'chevron-up' : 'chevron-down'} label={sort.asc ? 'ascending' : 'descending'} style={{ verticalAlign: '-0.125em' }} /></>}
    </span>
  )

  return (
    <div className="stat-block-4e compendium-split pc-library">
      <div className="compendium-list" style={{ flex: '0 0 auto' }}>
        <div className="sb-header" style={{ flexShrink: 0 }}>
          <input className="ghost sb-name" value={search} placeholder="Search characters and players..." aria-label="Search PCs"
            onChange={e => setSearch(e.target.value)} style={{ color: 'inherit', flex: 1 }} />
          <span className="sb-header-actions">
            <button className="sb-icon-btn" onClick={() => pick()} aria-label="Import characters"
              title="Import characters from Character Builder (.dnd4e) or 4ecb (.4ecb) files (I)"><Icon name="folder-input" /></button>
            <button className="sb-icon-btn" onClick={handleCreate} aria-label="New character" title="New character (N)"><Icon name="plus" /></button>
          </span>
        </div>
        {/* Empty for now: the band under the title bar, as on the compendium pages (their filters) and in the pane. */}
        <div className="sb-subheader" style={{ flexShrink: 0, minHeight: 18 }} aria-hidden />
        {/* One grid for the headings and every row (rows are subgrids), so each column is as wide as its widest cell. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: PC_COLUMNS, columnGap: 'var(--space-2)', alignContent: 'start' }}>
          <div className="sb-columns" style={{ ...SUBGRID, position: 'sticky', top: 0, zIndex: 1, background: 'var(--background)' }}>
            <span />
            {/* Over the portrait and the name. */}
            {header('Character', 'name', { gridColumn: 'span 2' })}
            {header('Player', 'player')}
            {header('Race', 'race')}
            {header('Class', 'class')}
            {header('Level', 'level')}
          </div>
          {playerCharacters.length === 0 ? (
            <div className="record-empty" style={{ gridColumn: '1 / -1', padding: 'var(--space-3)', color: 'var(--muted)' }}>No player characters yet. Import a sheet, or make a new one.</div>
          ) : (
            <div className="striped-rows" role="list" style={SUBGRID}>
              {rows.map(pc => <PcRow key={pc.id} pc={pc} selected={pc.id === selected?.id} onSelect={() => setSelectedId(pc.id)} />)}
            </div>
          )}
        </div>
        <div style={{ color: 'var(--muted)', padding: 'var(--space-2)', flexShrink: 0, fontSize: 'var(--font-size-xs)' }}>
          {rows.length} of {playerCharacters.length}
        </div>
      </div>

      <div className="compendium-preview">
        {selected
          ? <PcDetail key={selected.id} pc={selected} onImport={() => pick(selected.id)} onDelete={() => setDeleting(selected)} />
          : <div className="record-empty" style={{ color: 'var(--muted)' }}>Click a character to see it</div>}
      </div>

      {outcome && outcome.errors.length > 0 && <ImportErrorsDialog errors={outcome.errors} onClose={clear} />}

      {deleting && (
        <ConfirmDialog
          message={`Delete PC "${deleting.name}"? This cannot be undone.`}
          onConfirm={async () => {
            await window.api.entity.delete('player-character', deleting.id)
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

/** A figure, filled for a PC active in the party, outlined for an inactive one. */
function ActiveIcon({ active }: { active: boolean }) {
  return active ? (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21 c0-4 4-7 8-7 s8 3 8 7 z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21 c0-4 4-7 8-7 s8 3 8 7" />
    </svg>
  )
}

function ActiveToggle({ pc }: { pc: PlayerCharacter }) {
  const isActive = pc.active !== false
  return (
    <button
      onClick={(e) => { e.stopPropagation(); void savePC({ ...pc, active: !isActive }) }}
      title={isActive ? 'Active in the party (click to mark inactive)' : 'Inactive (click to mark active)'}
      aria-label={isActive ? 'Mark inactive' : 'Mark active'}
      aria-pressed={isActive}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <ActiveIcon active={isActive} />
    </button>
  )
}

/** The mark picker for a PC without a sheet (a sheet's mark comes from its class features). */
function MarkSelect({ pc }: { pc: PlayerCharacter }) {
  return (
    <select
      className="ghost"
      value={pc.markType ?? ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void savePC({ ...pc, markType: e.target.value || undefined })}
      title="Class mark ability, for the right-click Class Marks menu in combat (an imported sheet sets it from the class)"
      aria-label="Class mark"
      style={{ color: 'inherit' }}
    >
      <option value="">no mark</option>
      {CLASS_MARKS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}

function PcRow({ pc, selected, onSelect }: { pc: PlayerCharacter; selected: boolean; onSelect: () => void }) {
  const level = pcLevel(pc)
  return (
    <div role="listitem" className="sb-list-row pc-row" onClick={onSelect} aria-selected={selected}
      style={{
        ...SUBGRID, padding: '2px var(--space-2)', cursor: 'pointer',
        opacity: pc.active !== false ? 1 : 0.55,
        ...(selected ? { background: 'var(--active)', fontWeight: 600 } : {}),
      }}>
      <ActiveToggle pc={pc} />
      <CombatToken name={pc.name || '?'} imageId={pc.imageId} tokenImageId={pc.tokenImageId} hp={1} maxHp={1} size={30} hideHpRing={!!pc.color} solidRingColor={pc.color} />
      <span title={pc.name || undefined}>{pc.name || <span style={{ color: 'var(--muted)' }}>Unnamed Character</span>}</span>
      <span title={pc.playerName || undefined}>{pc.playerName}</span>
      <span style={FITS}>{pc.sheet?.race}</span>
      {pc.sheet ? <span style={FITS} title={pc.sheetFile ? `From ${pc.sheetFile}` : undefined}>{pc.sheet.class}</span> : (
        <span style={{ ...FITS, color: 'var(--muted)' }}>No sheet (<MarkSelect pc={pc} />)</span>
      )}
      <span style={FITS}>{level ?? <span style={{ color: 'var(--muted)' }}>–</span>}</span>
    </div>
  )
}

/** The selected PC: name, player, chip color, active, portrait and token, and the imported sheet (or level and mark without one). */
function PcDetail({ pc, onImport, onDelete }: { pc: PlayerCharacter; onImport: () => void; onDelete: () => void }) {
  const update = (patch: Partial<PlayerCharacter>) => void savePC({ ...pc, ...patch })
  const sheet = pc.sheet
  const mark = sheet?.markType ? CLASS_MARK_BY_ID[sheet.markType] : undefined

  return (
    <div className="stat-block-4e pc-detail">
      <div className="sb-header" style={{ alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <label title="Chip color (click to change)" style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, cursor: 'pointer' }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: pc.color ?? '#888888', border: '1px solid var(--sb-header-text)', display: 'block' }} />
            <input type="color" aria-label="Chip color" value={pc.color ?? '#888888'} onChange={(e) => update({ color: e.target.value })}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', padding: 0, border: 'none', width: '100%', height: '100%' }} />
          </label>
          <input className="ghost sb-name header-input" value={pc.name} onChange={(e) => update({ name: e.target.value })}
            placeholder="Character name" aria-label="Character name" style={{ color: 'inherit', minWidth: '1ch', fieldSizing: 'content' } as React.CSSProperties} />
          <span className="sb-header-actions">
            <button className="sb-icon-btn" onClick={onImport} aria-label={sheet ? 'Update the sheet' : 'Import a sheet'}
              title={sheet ? `Update the sheet from a .dnd4e or .4ecb file (last: ${pc.sheetFile ?? 'unknown'})` : 'Import a sheet from a .dnd4e or .4ecb file'}>
              <Icon name="folder-input" />
            </button>
            <button className="sb-icon-btn" onClick={onDelete} aria-label="Delete character" title="Delete character"><Icon name="trash" /></button>
          </span>
        </span>
        {sheet ? (
          <span className="pc-class-level" style={{ whiteSpace: 'nowrap' }}
            title={[raceClass(pc), sheet.paragonPath, sheet.epicDestiny].filter(Boolean).join(', ') + ' (from the imported sheet)'}>
            {raceClass(pc)} {sheet.level}
          </span>
        ) : (
          <label className="pc-level" title="This PC's level, until a sheet is imported (the sheet's level then counts)" style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
            Level
            <input className="ghost header-input" type="number" min={1} max={30} value={pc.level ?? ''} placeholder="–" aria-label="Level"
              onChange={(e) => { const level = Number(e.target.value); update({ level: Number.isInteger(level) && level >= 1 ? level : undefined }) }}
              style={{ width: '3ch', color: 'inherit', textAlign: 'center', fieldSizing: 'fixed' } as React.CSSProperties} />
          </label>
        )}
      </div>
      <div className="sb-subheader" style={{ gap: 8, justifyContent: 'flex-start', alignItems: 'center' }}>
        <span title={pc.active !== false ? 'Active in the party (toggle it in the list)' : 'Inactive (toggle it in the list)'} style={{ display: 'inline-flex' }}><ActiveIcon active={pc.active !== false} /></span>
        <input className="ghost header-input" value={pc.playerName} onChange={(e) => update({ playerName: e.target.value })}
          placeholder="Player name" aria-label="Player name" style={{ color: 'inherit', minWidth: '1ch', fieldSizing: 'content' } as React.CSSProperties} />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-2)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 200, height: 240, display: 'flex', flexShrink: 0 }}>
          <CreatureImageEditor
            imageId={pc.imageId}
            tokenImageId={pc.tokenImageId}
            tokenCrop={pc.tokenCrop}
            onImageChange={(imageId) => update({ imageId })}
            onTokenChange={(tokenImageId, crop) => update({ tokenImageId, tokenCrop: crop })}
          />
        </div>
        <div className="pc-sheet" style={{ flex: '1 1 220px', minWidth: 0 }}>
          {sheet ? <>
            <PcSheetRows sheet={sheet} />
            <div className="sb-row"><span><b className="sb-label">Class mark</b> {mark ? <span title={mark.description}>{mark.name}</span> : 'none'}</span></div>
            {pc.sheetFile && <div className="sb-row" style={{ color: 'var(--muted)' }}><span>Imported from {pc.sheetFile}</span></div>}
          </> : <>
            <div className="sb-row"><span><b className="sb-label">Class mark</b> <MarkSelect pc={pc} /></span></div>
            <div className="sb-row" style={{ color: 'var(--muted)' }}>
              <span>No sheet imported.</span>
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}
