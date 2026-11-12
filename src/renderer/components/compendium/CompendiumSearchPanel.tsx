/**
 * Shared creature compendium search panel — used by both the creature list
 * (compendium browser) and the encounter editor's search sidebar.
 * Renders the filter header, subheader, creature list, and status bar.
 */

import { useMemo } from 'react'
import { MultiSelectDropdown } from '@renderer/components/shared/MultiSelectDropdown'
import { CreatureCompendiumList } from './CreatureCompendiumList'
import { xpForCreature } from '../creature/dnd4e-utils'
import type { useCompendium } from './use-compendium'

interface Props {
  comp: ReturnType<typeof useCompendium>
  onSelect: (monsterId: string) => void
  onActivate: (monsterId: string) => void
  selectedId: string | null
  /** Optional XP cap — filters out creatures above this XP value */
  maxCreatureXP?: number
  /** Optional tooltip function for glossary terms on filter options */
  tooltip?: (term: string) => string
}

export function CompendiumSearchPanel({ comp, onSelect, onActivate, selectedId, maxCreatureXP, tooltip: tip }: Props) {
  const { filters, filtered: allFiltered, filterOptions, updateFilter, resetFilters, hasActiveFilters, searchRef, totalCount, loading, filtering } = comp
  const tooltip = tip ?? (() => '')

  const filtered = useMemo(() => {
    if (maxCreatureXP == null) return allFiltered
    return allFiltered.filter(c => xpForCreature(c.level, c.modifier) <= maxCreatureXP)
  }, [allFiltered, maxCreatureXP])

  return (
    <div className="stat-block-4e" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12 }}>
      {/* Search header */}
      <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0 }}>
        <input className="ghost sb-name" ref={searchRef} value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          placeholder="Search..."
          style={{ color: 'inherit', width: 'auto', fieldSizing: 'content' as any }} />
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
      <div className="sb-subheader" style={{ flexShrink: 0, marginBottom: 0 }}>
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
      </div>

      {/* List */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
          Loading...
        </div>
      ) : (
        <CreatureCompendiumList items={filtered} onSelect={onSelect} onActivate={onActivate} selectedId={selectedId} />
      )}

      {/* Status */}
      <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2)', flexShrink: 0, opacity: filtering ? 0.5 : 1, fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
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
    </div>
  )
}
