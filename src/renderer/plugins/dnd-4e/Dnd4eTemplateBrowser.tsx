import { useState, useMemo, useDeferredValue } from 'react'
import { MONSTER_TEMPLATES, type MonsterTemplate } from './monster-templates'
import { PowerCardView } from './PowerCardView'
import { extractLevelScaling } from './dnd4e-utils'
import { VirtualizedList } from './VirtualizedList'
import './statblock.css'

const ROW_HEIGHT = 28

export function Dnd4eTemplateBrowser() {
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const filters = useMemo(() => ({ search, sourceFilter, roleFilter }), [search, sourceFilter, roleFilter])
  const deferred = useDeferredValue(filters)
  const filtering = deferred !== filters

  const filtered = useMemo(() => {
    const q = deferred.search.toLowerCase()
    return MONSTER_TEMPLATES.filter(t => {
      if (q && !t.name.toLowerCase().includes(q) && !t.role.includes(q) && !t.prerequisite.toLowerCase().includes(q)) return false
      if (deferred.sourceFilter && t.source !== deferred.sourceFilter) return false
      if (deferred.roleFilter && t.role !== deferred.roleFilter) return false
      return true
    })
  }, [deferred])

  const sources = useMemo(() => [...new Set(MONSTER_TEMPLATES.map(t => t.source).filter(Boolean))].sort() as string[], [])
  const roles = useMemo(() => [...new Set(MONSTER_TEMPLATES.map(t => t.role))].sort(), [])

  const selectedTemplate = selectedName != null ? MONSTER_TEMPLATES.find(t => t.name === selectedName) ?? null : null

  type SortKey = 'name' | 'source' | 'role'
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const dir = sortAsc ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'source': cmp = (a.source ?? '').localeCompare(b.source ?? '') || a.name.localeCompare(b.name); break
        case 'role': cmp = a.role.localeCompare(b.role) || a.name.localeCompare(b.name); break
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

  const GRID_COLS = '1fr 60px 80px'
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
          <select className="ghost" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">role</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
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
          <span style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('role')}>Role{arrow('role')}</span>
        </div>

        {/* List */}
        <VirtualizedList items={sorted} renderRow={(t) => {
          const isSelected = selectedTemplate?.name === t.name
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
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{t.role}{t.leader ? ' (L)' : ''}</span>
            </div>
          )
        }} />

        <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2) 0', flexShrink: 0, opacity: filtering ? 0.5 : 1 }}>
          {filtered.length} of {MONSTER_TEMPLATES.length}
        </div>
      </div>

      {/* Right: preview */}
      <div className="compendium-preview">
        {selectedTemplate ? (
          <TemplateViewer template={selectedTemplate} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Click a template to preview
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Template Viewer ───

export function TemplateViewer({ template: t }: { template: MonsterTemplate }) {
  const roleLabel = t.role + (t.leader ? ' (Leader)' : '')
  const defEntries = Object.entries(t.defenses).filter(([, v]) => v)

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name">{t.name}</span>
        <span>Elite {roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)}</span>
      </div>
      <div className="sb-subheader">
        <span>{t.prerequisite}</span>
        <span>XP Elite</span>
      </div>

      {/* Description */}
      {t.description && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
          {t.description}
        </div>
      )}

      {/* Stats */}
      <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
        {t.keyword && (
          <div className="sb-row"><span><b className="sb-label">Keyword</b> {t.keyword}</span></div>
        )}
        {t.senses && t.senses.length > 0 && (
          <div className="sb-row"><span><b className="sb-label">Senses</b> {t.senses.join(', ')}</span></div>
        )}
        {defEntries.length > 0 && (
          <div className="sb-row">
            <span><b className="sb-label">Defenses</b> {defEntries.map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(', ')}</span>
          </div>
        )}
        {(t.immunities && t.immunities.length > 0) && (
          <div className="sb-row"><span><b className="sb-label">Immune</b> {t.immunities.join(', ')}</span></div>
        )}
        {t.resistPerTier && (
          <div className="sb-row">
            <span><b className="sb-label">Resist</b> {t.resistPerTier.heroic}/{t.resistPerTier.paragon}/{t.resistPerTier.epic} {t.resistPerTier.type} (heroic/paragon/epic)</span>
          </div>
        )}
        {t.vulnerable && (
          <div className="sb-row"><span><b className="sb-label">Vulnerable</b> {t.vulnerable.value} {t.vulnerable.type}</span></div>
        )}
        <div className="sb-row">
          <span><b className="sb-label">Hit Points</b> +{t.hpPerLevel} per level + Constitution score</span>
        </div>
        {t.regeneration && (
          <div className="sb-row">
            <span><b className="sb-label">Regeneration</b> {t.regeneration}{t.regenerationNote ? ` (${t.regenerationNote})` : ''}</span>
          </div>
        )}
        <div className="sb-row">
          <span><b className="sb-label">Saving Throws</b> +{t.savingThrows}; <b className="sb-label">Action Points</b> {t.actionPoints}</span>
        </div>
      </div>

      {/* Powers */}
      {t.powers.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {t.powers.map((pow, i) => {
            const parts = (pow.action ?? '').split(';').map(s => s.trim())
            const usageWords = ['at will', 'at-will', 'encounter', 'daily', 'recharge', 'recharges']
            const usagePart = parts.find(p => usageWords.some(u => p.toLowerCase().startsWith(u))) ?? ''
            const actionPart = parts.filter(p => p !== usagePart).join('; ')
            let usage = usagePart.replace(/^at will$/i, 'at-will')
            let rechargeValue: number | undefined
            let rechargeCondition: string | undefined
            if (/^recharge/i.test(usagePart)) {
              const diceMatch = usagePart.match(/^recharges?\s+([\d])/i)
              if (diceMatch) { usage = 'recharge'; rechargeValue = parseInt(diceMatch[1]) }
              else {
                const condMatch = usagePart.match(/^recharges?\s+(.+)$/i)
                usage = 'recharge'
                if (condMatch) rechargeCondition = condMatch[1]
              }
            }
            if (!usage && actionPart) usage = 'at-will'
            const p = pow as any
            const allScaling: { level: number; text: string }[] = []
            const ext = (s: string | undefined): string | undefined => {
              if (!s) return undefined
              const { cleaned, scaling } = extractLevelScaling(s)
              allScaling.push(...scaling)
              return cleaned || undefined
            }
            return (
              <PowerCardView key={i} entry={{
                name: pow.name,
                usage,
                action: actionPart || undefined,
                rechargeValue,
                rechargeCondition,
                keywords: pow.keywords ? pow.keywords.split(',').map(k => k.trim()) : undefined,
                rangeType: p.rangeType || undefined,
                rangeValue: p.rangeValue || undefined,
                target: p.target || undefined,
                attackBonus: p.attackBonus ? 0 : undefined,
                attackNotes: p.attackBonus || undefined,
                defense: p.defense || undefined,
                damage: ext(p.damage),
                hit: ext(p.hit),
                miss: ext(p.miss),
                effect: ext(pow.description),
                trigger: p.trigger || undefined,
                requirement: p.requirement || undefined,
                critical: p.critical || undefined,
                levelScaling: allScaling.length > 0 ? allScaling : undefined,
              }} />
            )
          })}
        </div>
      )}

      {/* Source */}
      {t.source && (
        <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {t.source}
        </div>
      )}
    </div>
  )
}
