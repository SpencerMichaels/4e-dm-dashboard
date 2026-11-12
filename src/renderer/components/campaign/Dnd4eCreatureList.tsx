import { useState, useCallback, useRef, useEffect } from 'react'
import type { Creature } from '@common/types'
import { FloatingPanel } from '@renderer/components/shared/FloatingPanel'
import type { PluginCreatureListProps } from '../combat/panel-types'
import { useCompendium } from '../compendium/use-compendium'
import { useGlossary } from '../compendium/use-glossary'
import { Dnd4eCreatureViewer } from '../creature/Dnd4eCreatureViewer'
import { Dnd4eCreatureDetails } from '../creature/Dnd4eCreatureDetails'
import { CreatureCompendiumList } from '../compendium/CreatureCompendiumList'
import { MultiSelectDropdown } from '@renderer/components/shared/MultiSelectDropdown'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useUiStore } from '@renderer/stores/ui-store'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { generateId } from '@common/utils/id'

export function Dnd4eCreatureList({ creatures, onNavigate }: PluginCreatureListProps) {
  const comp = useCompendium()
  const { tooltip } = useGlossary()
  const { filters, filtered, filterOptions, updateFilter, resetFilters, hasActiveFilters, searchRef, totalCount, loading, filtering } = comp
  const annotations = useCampaignStore(s => s.annotations)
  const systemPlugin = useUiStore(s => s.systemPlugin)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewCreature, setPreviewCreature] = useState<Creature | null>(null)
  const [previewIsCustom, setPreviewIsCustom] = useState(false)
  // Inline editor state
  const [editingCreature, setEditingCreature] = useState<Creature | null>(null)
  const [isDraft, setIsDraft] = useState(false)  // True when editingCreature hasn't been saved yet
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  // Right-click context menu state (only shown for Custom creatures)
  const [contextMenu, setContextMenu] = useState<{ creatureId: string; x: number; y: number } | null>(null)
  // Popped-out stat block panels
  const [poppedOut, setPoppedOut] = useState<{ id: string; creature: Creature }[]>([])

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return
    const onDown = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback((entryId: string, e: React.MouseEvent) => {
    // Only show context menu for Custom creatures (those that exist in the campaign)
    const isCustom = creatures.some(c => c.id === entryId)
    if (!isCustom) return
    setContextMenu({ creatureId: entryId, x: e.clientX, y: e.clientY })
  }, [creatures])

  const handleDeleteCustom = useCallback(async (id: string) => {
    setContextMenu(null)
    if (selectedId === id) {
      setSelectedId(null)
      setPreviewCreature(null)
      setPreviewIsCustom(false)
    }
    if (editingCreature?.id === id) {
      setEditingCreature(null)
      setIsDraft(false)
    }
    await window.api.entity.delete('creature', id)
    comp.reloadIndex()
  }, [comp, selectedId, editingCreature])

  // Forward-ref so exitEditor can call flushPendingSave (which is defined later)
  const flushPendingSaveRef = useRef<() => Promise<void>>(async () => {})
  const exitEditor = useCallback(async () => {
    await flushPendingSaveRef.current()
    setEditingCreature(null)
    setIsDraft(false)
    setLastSavedAt(null)
  }, [])

  const handleSelect = useCallback(async (entryId: string) => {
    if (entryId === selectedId && !editingCreature) return
    exitEditor()
    setSelectedId(entryId)
    // Check if this is a campaign creature (Custom source)
    const campaignCreature = creatures.find(c => c.id === entryId)
    if (campaignCreature) {
      setPreviewCreature(campaignCreature)
      setPreviewIsCustom(true)
    } else {
      // Compendium creature — fetch for preview (but don't save to campaign)
      const creature = await window.api.compendium.get(entryId)
      setPreviewCreature(creature)
      setPreviewIsCustom(false)
    }
    previewRef.current?.scrollTo(0, 0)
  }, [selectedId, creatures, editingCreature, exitEditor])

  // Start editing a custom creature that already exists in the campaign
  const handleEditExisting = useCallback((creature: Creature) => {
    setEditingCreature(creature)
    setIsDraft(false)
  }, [])

  // Create a new draft creature (not saved until first edit)
  const handleNewDraft = useCallback(() => {
    const now = new Date().toISOString()
    const draft: Creature = {
      id: generateId(),
      name: 'New Creature',
      hp: 10,
      maxHp: 10,
      statBlock: {},
      createdAt: now,
      updatedAt: now,
    }
    setSelectedId(null)
    setPreviewCreature(null)
    setEditingCreature(draft)
    setIsDraft(true)
  }, [])

  // Edit (if Custom) or clone (if compendium) — used by both hotkey and double-click
  const editOrClone = useCallback(async (entryId: string) => {
    const campaignCreature = creatures.find(c => c.id === entryId)
    if (campaignCreature) {
      setEditingCreature(campaignCreature)
      setIsDraft(false)
    } else {
      // Same as handleClone but defined inline so it doesn't depend on it
      const creature = await window.api.compendium.get(entryId)
      const ann = annotations[entryId]
      if (ann?.imageId) creature.imageId = ann.imageId
      if (ann?.tokenImageId) creature.tokenImageId = ann.tokenImageId
      const now = new Date().toISOString()
      const draft: Creature = { ...creature, id: generateId(), createdAt: now, updatedAt: now,
        statBlock: { ...creature.statBlock, source: 'Custom' } }
      setSelectedId(null)
      setPreviewCreature(null)
      setEditingCreature(draft)
      setIsDraft(true)
    }
  }, [creatures, annotations])

  // 'e' hotkey: edit/clone the currently selected creature
  useHotkeys([
    { key: 'e', handler: () => { if (selectedId && !editingCreature) editOrClone(selectedId) } },
  ])

  // Clone a compendium creature into a draft
  const handleClone = useCallback(async (compendiumId: string) => {
    const creature = await window.api.compendium.get(compendiumId)
    // Copy annotation image if present
    const ann = annotations[compendiumId]
    if (ann?.imageId) creature.imageId = ann.imageId
    if (ann?.tokenImageId) creature.tokenImageId = ann.tokenImageId
    // Give it a fresh id so it doesn't collide with the compendium entry
    const now = new Date().toISOString()
    const draft: Creature = { ...creature, id: generateId(), createdAt: now, updatedAt: now,
      statBlock: { ...creature.statBlock, source: 'Custom' } }
    setSelectedId(null)
    setPreviewCreature(null)
    setEditingCreature(draft)
    setIsDraft(true)
  }, [annotations])

  // Editor save callback — persists the creature, commits drafts on first save.
  // Read isDraft via a ref so this callback's identity stays stable and avoids
  // stale closures on rapid edits.
  const isDraftRef = useRef(isDraft)
  useEffect(() => { isDraftRef.current = isDraft }, [isDraft])
  // Debounced save: keep the latest pending creature in a ref, fire after a
  // short pause in typing. flushPendingSave() can be called from exit/navigate
  // handlers to commit immediately without waiting for the debounce.
  const pendingSaveRef = useRef<Creature | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SAVE_DEBOUNCE_MS = 500

  const performSave = useCallback(async (creature: Creature) => {
    const wasDraft = isDraftRef.current
    if (wasDraft) {
      isDraftRef.current = false
      setIsDraft(false)
    }
    await window.api.entity.save('creature', creature)
    setLastSavedAt(new Date())
    comp.reloadIndex()
    if (wasDraft) setSelectedId(creature.id)
  }, [comp])

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (pending) await performSave(pending)
  }, [performSave])
  useEffect(() => { flushPendingSaveRef.current = flushPendingSave }, [flushPendingSave])

  const handleEditSave = useCallback((updated: Creature) => {
    const withTime = { ...updated, updatedAt: new Date().toISOString() }
    setEditingCreature(withTime)
    pendingSaveRef.current = withTime
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const pending = pendingSaveRef.current
      pendingSaveRef.current = null
      if (pending) performSave(pending)
    }, SAVE_DEBOUNCE_MS)
  }, [performSave])

  // Flush any pending save when the component unmounts (e.g., navigating away)
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        const pending = pendingSaveRef.current
        pendingSaveRef.current = null
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        // Fire and forget — can't await in cleanup
        void window.api.entity.save('creature', pending)
      }
    }
  }, [])

  return (
    <div style={{ height: 'calc(100vh - var(--header-height) - 2 * var(--space-6))', display: 'flex', flexDirection: 'column' }}>
      <div className="stat-block-4e compendium-split" style={{ flex: 1 }}>
        {/* Left: search + list */}
        <div className="compendium-list">
          {/* Header */}
          <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0 }}>
            <input className="ghost sb-name" ref={searchRef} value={filters.search}
              onChange={e => updateFilter('search', e.target.value)}
              placeholder="Search..."
              style={{ color: 'inherit', flex: 1 }} />
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
              <span>Level <input className="ghost" value={filters.level}
                onChange={e => updateFilter('level', e.target.value.replace(/-/g, '–'))}
                placeholder="1–30" style={{ width: 40, color: 'inherit', textAlign: 'center' }} /></span>
              <select className="ghost" value={filters.modifier} onChange={e => updateFilter('modifier', e.target.value)}
                style={{ color: 'inherit', textTransform: 'capitalize' }}>
                <option value="">modifier</option>
                <option value="standard" title={tooltip('standard')}>standard</option>
                <option value="elite" title={tooltip('elite')}>elite</option>
                <option value="solo" title={tooltip('solo')}>solo</option>
                <option value="minion" title={tooltip('minion')}>minion</option>
              </select>
              <MultiSelectDropdown className="ghost"
                options={filterOptions.roles}
                selected={filters.role}
                onChange={(roles) => updateFilter('role', roles)}
                placeholder="role"
                optionLabel={r => r ? r.charAt(0).toUpperCase() + r.slice(1) : r}
                optionTitle={r => tooltip(r)} />
            </span>
          </div>
          {/* Subheader */}
          <div className="sb-subheader" style={{ flexShrink: 0, marginBottom: 'var(--space-2)' }}>
            <span style={{ display: 'flex', gap: 4 }}>
              <select className="ghost" value={filters.size} onChange={e => updateFilter('size', e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">size</option>
                {filterOptions.sizes.map(s => <option key={s} value={s} title={tooltip(s)}>{s}</option>)}
              </select>
              <select className="ghost" value={filters.origin} onChange={e => updateFilter('origin', e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">origin</option>
                {filterOptions.origins.map(o => <option key={o} value={o} title={tooltip(o)}>{o}</option>)}
              </select>
              <select className="ghost" value={filters.type} onChange={e => updateFilter('type', e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">type</option>
                {filterOptions.types.map(t => <option key={t} value={t} title={tooltip(t)}>{t}</option>)}
              </select>
              <select className="ghost" value={filters.source} onChange={e => updateFilter('source', e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">source</option>
                {filterOptions.sources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select className="ghost" value={filters.alignment} onChange={e => updateFilter('alignment', e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">alignment</option>
                {filterOptions.alignments.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button onClick={handleNewDraft} title="Create new custom creature"
                className="ghost"
                style={{ color: 'inherit', font: 'inherit', whiteSpace: 'nowrap' }}>
                + new
              </button>
            </span>
          </div>

          {/* List */}
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
              Loading...
            </div>
          ) : (
            <CreatureCompendiumList items={filtered} selectedId={selectedId}
              onSelect={handleSelect} onActivate={editOrClone} onContextMenu={handleContextMenu} />
          )}

          {/* Status */}
          <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0, opacity: filtering ? 0.5 : 1, fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>{loading ? '\u00A0' : `${filtered.length.toLocaleString()} of ${totalCount.toLocaleString()}`}</span>
            <button onClick={resetFilters} disabled={!hasActiveFilters}
              title={hasActiveFilters ? 'Clear all filters' : 'No filters active'}
              style={{
                padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: hasActiveFilters ? 'var(--color-bg-active)' : 'transparent',
                color: hasActiveFilters ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                cursor: hasActiveFilters ? 'pointer' : 'default',
                opacity: hasActiveFilters ? 1 : 0.4,
                fontSize: 'var(--font-size-xs)', fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>
              ✕ Clear filters
            </button>
          </div>

          {/* Editor toolbar — only when editing a creature in the right pane */}
          {editingCreature && (
            <div style={{
              flexShrink: 0,
              borderTop: '1px solid var(--sb-separator)',
              padding: 'var(--space-2) 0',
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              fontSize: 'var(--font-size-xs)',
            }}>
              <button onClick={exitEditor}
                title="Back to preview"
                style={{
                  padding: '2px 8px', background: 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)',
                }}>← Back</button>
              <button onClick={async () => { await flushPendingSaveRef.current(); onNavigate(editingCreature.id) }}
                disabled={isDraft}
                title={isDraft ? 'Make an edit first to save the draft, then full-screen' : 'Open full-screen editor'}
                style={{
                  padding: '2px 8px', background: 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  cursor: isDraft ? 'not-allowed' : 'pointer',
                  color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)',
                  opacity: isDraft ? 0.4 : 1,
                }}>⛶ Fullscreen</button>
              <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isDraft
                  ? 'Draft (saves on first edit)'
                  : lastSavedAt
                    ? `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                    : 'Editing'}
              </span>
            </div>
          )}
        </div>

        {/* Right: editor or preview */}
        <div ref={previewRef} className="compendium-preview">
          {editingCreature && systemPlugin?.creatureBuilder ? (
            <Dnd4eCreatureDetails
              creature={editingCreature}
              onSave={handleEditSave}
              config={systemPlugin.creatureBuilder}
              compact />
          ) : previewCreature ? (
            <Dnd4eCreatureViewer creature={previewCreature} tooltip={tooltip}
              compendiumId={!previewIsCustom ? selectedId ?? undefined : undefined}
              onImageChange={previewIsCustom
                ? async (imageId) => {
                    const updated = { ...previewCreature, imageId, updatedAt: new Date().toISOString() }
                    setPreviewCreature(updated)
                    await window.api.entity.save('creature', updated)
                  }
                : (selectedId ? async (imageId) => {
                    const existing = annotations[selectedId] ?? {}
                    await window.api.annotation.save(selectedId, { ...existing, imageId })
                  } : undefined)}
              onTokenChange={previewIsCustom
                ? async (tokenImageId, crop) => {
                    const updated = { ...previewCreature, tokenImageId, tokenCrop: crop, updatedAt: new Date().toISOString() }
                    setPreviewCreature(updated)
                    await window.api.entity.save('creature', updated)
                  }
                : (selectedId ? async (tokenImageId, crop) => {
                    const existing = annotations[selectedId] ?? {}
                    await window.api.annotation.save(selectedId, { ...existing, tokenImageId, tokenCrop: crop })
                  } : undefined)}
              onPopout={previewCreature ? () => {
                if (!poppedOut.some(p => p.id === (selectedId ?? previewCreature.id))) {
                  setPoppedOut(prev => [...prev, { id: selectedId ?? previewCreature.id, creature: previewCreature }])
                }
              } : undefined}
              onClone={!previewIsCustom && selectedId ? () => handleClone(selectedId) : undefined}
              onEdit={previewIsCustom ? () => handleEditExisting(previewCreature) : undefined} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Click a creature to preview
            </div>
          )}
        </div>
      </div>
      {/* Right-click context menu */}
      {contextMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            padding: 'var(--space-1) 0', minWidth: 140,
          }}
        >
          <button
            onClick={() => handleDeleteCustom(contextMenu.creatureId)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '4px 12px', background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'var(--color-danger)',
              fontSize: 'var(--font-size-sm)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >Delete creature</button>
        </div>
      )}

      {/* Popped-out stat block floating panels */}
      {poppedOut.map((p, i) => (
        <FloatingPanel
          key={p.id}
          title={`📑 ${p.creature.name}`}
          initialX={100 + i * 30}
          initialY={100 + i * 30}
          width={420}
          maxHeight="80vh"
          onClose={() => setPoppedOut(prev => prev.filter(x => x.id !== p.id))}
        >
          <Dnd4eCreatureViewer creature={p.creature} tooltip={tooltip}
            compendiumId={p.creature.compendiumId ?? p.id} />
        </FloatingPanel>
      ))}
    </div>
  )
}
