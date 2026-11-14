// Traps and hazards in an encounter: rows (count, rename, visible to players, remove), a search over
// published and Custom traps to add one, and each row's level, role, and XP for the encounter budget.

import { useMemo } from 'react'
import type { EncounterTrap, TrapRef } from '@common/types'
import { Icon } from '../shared/Icon'
import { TrapSearch, trapKey, useTrapSources } from '../trap/trap-refs'

export interface TrapRowInfo { key: string; name: string; level: number; role: string; kind: string; xp: number }

export { trapKey }
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

/** Level, role, and XP for each trap row (XP counts toward the encounter like a monster's). */
export function useTrapRows(traps: EncounterTrap[]): TrapRowInfo[] {
  const { records, index } = useTrapSources()
  return useMemo(() => traps.flatMap(et => {
    if (et.trapId) {
      const t = records.find(r => r.id === et.trapId)?.content
      return t ? [{ key: trapKey(et), name: et.overrideName || t.name, level: t.level, role: cap(t.role), kind: cap(t.kind), xp: t.xp }] : []
    }
    const e = index.find(x => x.id === et.compendiumId)
    return e ? [{ key: trapKey(et), name: et.overrideName || e.name, level: e.level, role: e.role, kind: e.trapType, xp: e.xp }] : []
  }), [traps, records, index])
}

interface Props {
  traps: EncounterTrap[]
  onChange: (traps: EncounterTrap[]) => void
  selectedKey: string | null
  onSelect: (key: string | null) => void
  /** Traps noted on the encounter's location: they join its combat (hidden), so they show here read-only. */
  location?: { name: string; traps: TrapRef[] }
}

export function EncounterTraps({ traps, onChange, selectedKey, onSelect, location }: Props) {
  const fromLocation = (location?.traps ?? []).map(r => ({ ...r, count: 1 }))
  const rows = useTrapRows([...traps, ...fromLocation])
  const update = (key: string, patch: Partial<EncounterTrap>) => onChange(traps.map(t => trapKey(t) === key ? { ...t, ...patch } : t))
  const add = (ref: TrapRef) => {
    const key = trapKey(ref)
    const existing = traps.find(t => trapKey(t) === key)
    if (existing) update(key, { count: existing.count + 1 })
    else onChange([...traps, { ...ref, count: 1 }])
  }
  const small = { fontSize: 'var(--font-size-xs)' }

  return (
    <div className="encounter-traps" style={{ borderTop: '1px solid var(--sb-separator)' }}>
      <div className="sb-row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <b className="sb-label">Traps and hazards</b>
        <TrapSearch onAdd={add} style={{ flex: 1, maxWidth: 220 }} />
      </div>
      {traps.map(et => {
        const key = trapKey(et)
        const info = rows.find(r => r.key === key)
        return (
          <div key={key} className="encounter-trap-row sb-row" onClick={() => onSelect(selectedKey === key ? null : key)}
            style={{ gap: 6, cursor: 'pointer', background: selectedKey === key ? 'var(--active)' : undefined }}>
            <input className="ghost" value={et.overrideName ?? info?.name ?? ''} placeholder={info?.name ?? 'Loading…'} onClick={e => e.stopPropagation()}
              onChange={e => update(key, { overrideName: e.target.value || undefined })} aria-label="Trap name" style={{ flex: 1, minWidth: 0 }} />
            <span style={{ ...small, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{info ? `L${info.level} ${info.kind}${info.role ? ' ' + info.role : ''} · ${info.xp * et.count} XP` : ''}</span>
            <input className="ghost" type="number" min={1} value={et.count} onClick={e => e.stopPropagation()} aria-label="Count"
              onChange={e => update(key, { count: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 32, textAlign: 'center' }} />
            <label title="Players see this trap from the start of combat" style={{ ...small, display: 'flex', alignItems: 'center', gap: 2 }} onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={!!et.visible} onChange={e => update(key, { visible: e.target.checked || undefined })} />visible
            </label>
            <button onClick={e => { e.stopPropagation(); onChange(traps.filter(t => trapKey(t) !== key)); if (selectedKey === key) onSelect(null) }}
              title="Remove" aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="x" /></button>
          </div>
        )
      })}
      {fromLocation.map(et => {
        const key = trapKey(et)
        const info = rows.find(r => r.key === key)
        return (
          <div key={key} className="encounter-trap-row location-trap-row sb-row" onClick={() => onSelect(selectedKey === key ? null : key)}
            style={{ gap: 6, cursor: 'pointer', background: selectedKey === key ? 'var(--active)' : undefined }}>
            <span style={{ flex: 1, minWidth: 0 }}>{info?.name ?? 'Loading…'}</span>
            <span style={{ ...small, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{info ? `L${info.level} ${info.kind} · ${info.xp} XP · ` : ''}from {location!.name}</span>
          </div>
        )
      })}
    </div>
  )
}
