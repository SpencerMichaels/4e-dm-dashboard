// A level's treasure against its budget, like the encounter difficulty bar: one bar for magic items and
// one for monetary treasure (money and consumables at their price), each split into found, placed, and
// only planned, with a mark at the budget.

import type { StageTally, TreasureTally } from '@common/rules/treasure'
import { stageTotal } from '@common/rules/treasure'
import { gp } from './treasure-data'

const STAGES: { key: keyof StageTally; label: string; opacity: number }[] = [
  { key: 'found', label: 'found', opacity: 1 },
  { key: 'placed', label: 'placed', opacity: 0.6 },
  { key: 'planned', label: 'not placed', opacity: 0.3 },
]

export function TreasureMeter({ tally, budget, budgetLabel }: { tally: TreasureTally; budget: { items: number; gp: number }; budgetLabel: string }) {
  return (
    <div className="treasure-meter" style={{ padding: '4px var(--space-2)', display: 'grid', gridTemplateColumns: 'max-content 1fr max-content', gap: '4px var(--space-2)', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
      <Bar label="Magic items" stages={tally.items} target={budget.items} format={n => String(n)} budgetLabel={budgetLabel} />
      <Bar label="Monetary" stages={tally.gp} target={budget.gp} format={gp} budgetLabel={budgetLabel} />
    </div>
  )
}

function Bar({ label, stages, target, format, budgetLabel }: { label: string; stages: StageTally; target: number; format: (n: number) => string; budgetLabel: string }) {
  const total = stageTotal(stages)
  const scale = Math.max(target, total) || 1
  const pct = (n: number) => `${(n / scale) * 100}%`
  const color = total > target ? 'var(--danger)' : 'var(--accent)'
  const summary = STAGES.filter(s => stages[s.key] > 0).map(s => `${format(stages[s.key])} ${s.label}`).join(', ')
  return <>
    <span style={{ fontWeight: 600 }}>{label}</span>
    <div className="treasure-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={total}
      title={`${summary || 'None yet'}; ${budgetLabel} ${format(target)}`}
      style={{ position: 'relative', height: 14, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex' }}>
      {STAGES.map(s => stages[s.key] > 0 && <div key={s.key} style={{ width: pct(stages[s.key]), background: color, opacity: s.opacity }} />)}
      {target > 0 && <div style={{ position: 'absolute', left: pct(target), top: 0, bottom: 0, width: 2, background: 'var(--text)', transform: 'translateX(-1px)' }} />}
    </div>
    <span style={{ whiteSpace: 'nowrap' }}>{format(total)} / {format(target)}</span>
  </>
}
