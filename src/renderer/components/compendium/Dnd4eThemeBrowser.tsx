import { useState, useMemo, useDeferredValue } from 'react'
import { MONSTER_THEMES, type MonsterTheme, type ThemePower } from '../creature/monster-themes'
import { PowerCardView } from '../creature/PowerCardView'
import { USAGE_COLORS, extractLevelScaling } from '../creature/dnd4e-utils'
import { VirtualizedList } from '../shared/VirtualizedList'
import '../creature/statblock.css'

export function Dnd4eThemeBrowser() {
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const filters = useMemo(() => ({ search, sourceFilter }), [search, sourceFilter])
  const deferred = useDeferredValue(filters)
  const filtering = deferred !== filters

  const filtered = useMemo(() => {
    const q = deferred.search.toLowerCase()
    return MONSTER_THEMES.filter(t => {
      if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      if (deferred.sourceFilter && t.source !== deferred.sourceFilter) return false
      return true
    })
  }, [deferred])

  const sources = useMemo(() => [...new Set(MONSTER_THEMES.map(t => t.source))].sort(), [])

  const selectedTheme = selectedName != null ? MONSTER_THEMES.find(t => t.name === selectedName) ?? null : null

  type SortKey = 'name' | 'source'
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const dir = sortAsc ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'source': cmp = a.source.localeCompare(b.source) || a.name.localeCompare(b.name); break
      }
      return cmp * dir
    })
    return copy
  }, [filtered, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }
  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  const GRID_COLS = '1fr 60px'
  const xs = { fontSize: 'var(--font-size-xs)' }

  return (
    <div className="stat-block-4e compendium-split">
      {/* Left: search + list */}
      <div className="compendium-list">
        <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0 }}>
          <input className="ghost sb-name" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ color: 'inherit', flex: 1 }} />
        </div>
        <div className="sb-subheader" style={{ flexShrink: 0, marginBottom: 'var(--space-2)' }}>
          <select className="ghost" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">all sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: GRID_COLS,
          gap: 'var(--space-2)', padding: '2px var(--space-2)',
          borderBottom: '1px solid var(--sb-separator, var(--color-border))',
          flexShrink: 0, color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 'var(--font-size-xs)', userSelect: 'none',
        }}>
          <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('name')}>Name{arrow('name')}</span>
          <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('source')}>Source{arrow('source')}</span>
        </div>

        {/* List */}
        <VirtualizedList items={sorted} renderRow={(t) => {
          const isSelected = selectedName === t.name
          return (
            <div onClick={() => setSelectedName(t.name)} style={{
              display: 'grid', gridTemplateColumns: GRID_COLS, height: '100%',
              gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
              borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
              background: isSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : 'transparent',
              cursor: 'pointer', ...xs,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
                {t.name}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{t.source}</span>
            </div>
          )
        }} />

        <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0, opacity: filtering ? 0.5 : 1 }}>
          {filtered.length} of {MONSTER_THEMES.length}
        </div>
      </div>

      {/* Right: preview */}
      <div className="compendium-preview">
        {selectedTheme ? (
          <ThemeViewer theme={selectedTheme} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Click a theme to preview
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Theme Viewer ───

function ThemeViewer({ theme: t }: { theme: MonsterTheme }) {
  const attackPowers = t.powers.filter(p => p.category === 'attack')
  const utilityPowers = t.powers.filter(p => p.category === 'utility')

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name">{t.name}</span>
        <span>Theme</span>
      </div>
      <div className="sb-subheader">
        <span>{t.source}</span>
        <span>{t.powers.length} powers</span>
      </div>

      {/* Description */}
      <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
        {t.description}
      </div>

      {/* Modifications */}
      {(t.skillModifications || t.originChange) && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {t.originChange && (
            <div className="sb-row"><span><b className="sb-label">Origin</b> {t.originChange}</span></div>
          )}
          {t.skillModifications && (
            <div className="sb-row"><span><b className="sb-label">Skills</b> {t.skillModifications}</span></div>
          )}
        </div>
      )}

      {/* Attack Powers */}
      {attackPowers.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div style={{ padding: '4px 8px', marginTop: 8, fontWeight: 700, fontSize: 14 }}>Attack Powers</div>
          {attackPowers.map((pow, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <PowerCardView entry={parsePower(pow)} />
              {pow.flavorText && (
                <div style={{ padding: '2px 8px', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                  {pow.flavorText}
                </div>
              )}
              {pow.recommendedFor && !pow.flavorText && (
                <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                  Recommended for: {pow.recommendedFor}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Utility Powers */}
      {utilityPowers.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div style={{ padding: '4px 8px', marginTop: 8, fontWeight: 700, fontSize: 14 }}>Utility Powers</div>
          {utilityPowers.map((pow, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <PowerCardView entry={parsePower(pow)} />
              {pow.flavorText && (
                <div style={{ padding: '2px 8px', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                  {pow.flavorText}
                </div>
              )}
              {pow.recommendedFor && !pow.flavorText && (
                <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                  Recommended for: {pow.recommendedFor}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Source */}
      <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        {t.source}
      </div>
    </div>
  )
}

/** Parse a recharge string like "recharge 4-6" → { usage: 'recharge', rechargeValue: 4 }
 *  or "recharges when first bloodied" → { usage: 'recharge', rechargeCondition: 'when first bloodied' } */
function parseRecharge(s: string): { usage: string; rechargeValue?: number; rechargeCondition?: string } {
  // "recharge 4-5-6" or "recharge 5-6" or "recharge 6" → extract lowest number as threshold
  const diceMatch = s.match(/^recharges?\s+([\d])/i)
  if (diceMatch) return { usage: 'recharge', rechargeValue: parseInt(diceMatch[1]) }
  // "recharges when first bloodied" → condition
  const condMatch = s.match(/^recharges?\s+(.+)$/i)
  if (condMatch) return { usage: 'recharge', rechargeCondition: condMatch[1] }
  return { usage: 'recharge' }
}

/** Parse a ThemePower's action string into PowerCardEntry fields */
function parsePower(pow: ThemePower) {
  const parts = (pow.action ?? '').split(';').map(s => s.trim())
  const usageWords = ['at will', 'at-will', 'encounter', 'daily', 'recharge', 'recharges']
  const usagePart = parts.find(p => usageWords.some(u => p.toLowerCase().startsWith(u))) ?? ''
  const actionPart = parts.filter(p => p !== usagePart).join('; ')
  let usage = usagePart.replace(/^at will$/i, 'at-will')
  let rechargeValue: number | undefined
  let rechargeCondition: string | undefined
  if (/^recharge/i.test(usagePart)) {
    const r = parseRecharge(usagePart)
    usage = r.usage
    rechargeValue = r.rechargeValue
    rechargeCondition = r.rechargeCondition
  }
  if (!usage && actionPart) usage = 'at-will'

  // Extract level scaling from all text fields
  const allScaling: { level: number; text: string }[] = []
  const extract = (s: string | undefined): string | undefined => {
    if (!s) return undefined
    const { cleaned, scaling } = extractLevelScaling(s)
    allScaling.push(...scaling)
    return cleaned || undefined
  }

  return {
    name: pow.name,
    usage,
    action: actionPart || undefined,
    rechargeValue,
    rechargeCondition,
    keywords: pow.keywords ? pow.keywords.split(',').map(k => k.trim()) : undefined,
    rangeType: (pow as any).rangeType || undefined,
    rangeValue: (pow as any).rangeValue || undefined,
    target: (pow as any).target || undefined,
    attackBonus: (pow as any).attackBonus ? 0 : undefined,
    attackNotes: (pow as any).attackBonus || undefined,
    defense: (pow as any).defense || undefined,
    damage: extract((pow as any).damage),
    hit: extract((pow as any).hit),
    miss: extract((pow as any).miss),
    effect: extract(pow.description),
    trigger: (pow as any).trigger || undefined,
    requirement: (pow as any).requirement || undefined,
    critical: (pow as any).critical || undefined,
    levelScaling: allScaling.length > 0 ? allScaling : undefined,
  }
}
