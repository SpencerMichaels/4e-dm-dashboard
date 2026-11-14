// "There's a trap in this room": traps and hazards noted on a location, each shown as its stat block
// (collapsible). Used on the location page and in the map's location sidebar.

import { useState } from 'react'
import type { TrapRef } from '@common/types'
import { Icon } from '../shared/Icon'
import { TrapSearch, trapKey, useTrap } from '../trap/trap-refs'
import { TrapStatblock } from '../trap/TrapStatblock'

export function LocationTraps({ traps, onChange, label }: { traps: TrapRef[]; onChange: (traps: TrapRef[]) => void; label: React.ReactNode }) {
  const add = (ref: TrapRef) => { if (!traps.some(t => trapKey(t) === trapKey(ref))) onChange([...traps, ref]) }
  return (
    <div className="location-traps" style={{ marginBottom: 'var(--space-3)' }}>
      {label}
      {traps.map(ref => <LocationTrap key={trapKey(ref)} trapRef={ref} onRemove={() => onChange(traps.filter(t => trapKey(t) !== trapKey(ref)))} />)}
      <TrapSearch onAdd={add} placeholder="+ Add a trap or hazard…" style={{ marginTop: 'var(--space-1)' }} />
    </div>
  )
}

function LocationTrap({ trapRef, onRemove }: { trapRef: TrapRef; onRemove: () => void }) {
  const trap = useTrap(trapRef)
  const [open, setOpen] = useState(true)
  const button = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 4px', display: 'inline-flex' }
  return (
    <div className="location-trap" style={{ marginBottom: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-sm)' }}>
        <button onClick={() => setOpen(!open)} style={button} aria-expanded={open} title={open ? 'Collapse' : 'Expand'}><Icon name={open ? 'chevron-down' : 'chevron-right'} /></button>
        {/* Expanded, the stat block header names the trap. */}
        <span style={{ flex: 1, fontWeight: 600 }}>{trap === undefined ? 'Loading…' : !trap ? 'This trap no longer exists' : open ? '' : trap.name}</span>
        {trap && !open && <span style={{ color: 'var(--muted)', fontSize: 'var(--font-size-xs)' }}>L{trap.level} {trap.kind} · {trap.xp} XP</span>}
        <button onClick={onRemove} style={button} title="Remove from this location" aria-label="Remove from this location"><Icon name="x" /></button>
      </div>
      {open && trap && <TrapStatblock trap={trap} />}
    </div>
  )
}
