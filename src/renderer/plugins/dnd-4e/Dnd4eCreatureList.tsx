import { useState, useCallback, useRef } from 'react'
import type { Creature } from '@common/types'
import type { PluginCreatureListProps } from '../plugin-types'
import { useCompendium } from './use-compendium'
import { useGlossary } from './use-glossary'
import { Dnd4eCreatureViewer } from './Dnd4eCreatureViewer'
import { CreatureCompendiumList } from './CreatureCompendiumList'
import { useCampaignStore } from '@renderer/stores/campaign-store'

export function Dnd4eCreatureList({ creatures, onNavigate, onCreate }: PluginCreatureListProps) {
  const comp = useCompendium()
  const { tooltip } = useGlossary()
  const { filters, filtered, filterOptions, updateFilter, searchRef, totalCount, loading, filtering } = comp
  const annotations = useCampaignStore(s => s.annotations)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewCreature, setPreviewCreature] = useState<Creature | null>(null)
  const [previewIsCustom, setPreviewIsCustom] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const handleSelect = useCallback(async (entryId: string) => {
    if (entryId === selectedId) return
    setSelectedId(entryId)
    // Check if this is a campaign creature (Custom source)
    const campaignCreature = creatures.find(c => c.id === entryId)
    if (campaignCreature) {
      setPreviewCreature(campaignCreature)
      setPreviewIsCustom(true)
    } else {
      // Compendium creature — fetch for preview (but don't save to campaign)
      const creature = await window.api.compendium.get('dnd-4e', entryId)
      setPreviewCreature(creature)
      setPreviewIsCustom(false)
    }
    previewRef.current?.scrollTo(0, 0)
  }, [selectedId, creatures])

  const handleClone = useCallback(async (compendiumId: string) => {
    const creature = await window.api.compendium.get('dnd-4e', compendiumId)
    // Copy annotation image if present
    const ann = annotations[compendiumId]
    if (ann?.imageId) creature.imageId = ann.imageId
    if (ann?.tokenImageId) creature.tokenImageId = ann.tokenImageId
    await window.api.entity.save('creature', creature)
    comp.reloadIndex()
    onNavigate(creature.id)
  }, [annotations, onNavigate, comp])

  const handleAnnotateImage = useCallback(async (compendiumId: string) => {
    const imageId = await window.api.image.importDialog()
    if (!imageId) return
    const existing = annotations[compendiumId] ?? {}
    await window.api.annotation.save(compendiumId, { ...existing, imageId })
  }, [annotations])

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
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
              Level <input className="ghost" value={filters.level}
                onChange={e => updateFilter('level', e.target.value.replace(/-/g, '–'))}
                placeholder="1–30" style={{ width: 40, color: 'inherit', textAlign: 'center' }} />
              <select className="ghost" value={filters.modifier} onChange={e => updateFilter('modifier', e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">modifier</option>
                <option value="standard" title={tooltip('standard')}>standard</option>
                <option value="elite" title={tooltip('elite')}>elite</option>
                <option value="solo" title={tooltip('solo')}>solo</option>
              </select>
              <select className="ghost" value={filters.role} onChange={e => updateFilter('role', e.target.value)}
                style={{ color: 'inherit' }}>
                <option value="">role</option>
                {filterOptions.roles.map(r => <option key={r} value={r} title={tooltip(r)}>{r}</option>)}
              </select>
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
              <button onClick={onCreate} title="Create new custom creature" style={{
                padding: '1px 6px', background: 'var(--color-bg-hover)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)',
                whiteSpace: 'nowrap',
              }}>+ New</button>
            </span>
          </div>

          {/* List */}
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
              Loading...
            </div>
          ) : (
            <CreatureCompendiumList items={filtered} selectedId={selectedId}
              onSelect={handleSelect} />
          )}

          {/* Status */}
          <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0, opacity: filtering ? 0.5 : 1, fontSize: 'var(--font-size-xs)' }}>
            {loading ? '\u00A0' : `${filtered.length.toLocaleString()} of ${totalCount.toLocaleString()}`}
          </div>
        </div>

        {/* Right: preview */}
        <div ref={previewRef} className="compendium-preview">
          {previewCreature ? (
            <div>
              {/* Action bar */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-2) 0', marginBottom: 'var(--space-2)' }}>
                {previewIsCustom ? (
                  <button onClick={() => selectedId && onNavigate(selectedId)} style={{
                    padding: 'var(--space-1) var(--space-3)', background: 'var(--color-accent)',
                    color: 'var(--color-accent-text)', border: 'none', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', fontSize: 'var(--font-size-xs)', fontWeight: 600,
                  }}>Edit</button>
                ) : (
                  <>
                    <button onClick={() => selectedId && handleClone(selectedId)} style={{
                      padding: 'var(--space-1) var(--space-3)', background: 'var(--color-bg-hover)',
                      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', fontSize: 'var(--font-size-xs)',
                    }}>Clone to Custom</button>
                    <button onClick={() => selectedId && handleAnnotateImage(selectedId)} style={{
                      padding: 'var(--space-1) var(--space-3)', background: 'var(--color-bg-hover)',
                      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', fontSize: 'var(--font-size-xs)',
                    }}>
                      {selectedId && annotations[selectedId]?.imageId ? 'Change Image' : 'Add Image'}
                    </button>
                  </>
                )}
              </div>

              <Dnd4eCreatureViewer creature={previewCreature} tooltip={tooltip}
                imageId={!previewIsCustom && selectedId ? annotations[selectedId]?.imageId : undefined} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Click a creature to preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

