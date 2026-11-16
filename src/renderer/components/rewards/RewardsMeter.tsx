// A level's rewards against its budget, like the encounter difficulty bar: experience per PC against
// what the next level needs, magic items, and monetary treasure (money, and consumables at their price).
// Treasure bars split into found, placed, and only planned; each bar has a mark at its budget.

import type { StageTally, TreasureTally } from '@common/rules/treasure'
import { gp } from '../treasure/treasure-data'

const STAGES: { key: keyof StageTally; label: string; opacity: number }[] = [
  { key: 'found', label: 'found', opacity: 1 },
  { key: 'placed', label: 'placed', opacity: 0.6 },
  { key: 'planned', label: 'not placed', opacity: 0.3 },
]

const xpText = (n: number) => `${Math.round(n).toLocaleString('en-US')} XP`

export function RewardsMeter({ xp, tally, budget, budgetLabel }: {
  /** XP per PC from the level's encounters, and what reaching the next level takes (none at 30). */
  xp?: { perPc: number; need: number }
  tally: TreasureTally
  budget: { items: number; gp: number }
  budgetLabel: string
}) {
  return (
    <div className="rewards-meter" style={{ padding: '4px var(--space-2)', display: 'grid', gridTemplateColumns: 'max-content 1fr max-content', gap: '4px var(--space-2)', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
      {xp && <Bar label="Experience" segments={[{ value: xp.perPc, opacity: 1, label: 'per PC from this level\'s encounters' }]} target={xp.need} format={xpText}
        title={`${xpText(xp.perPc)} per PC from this level's encounters; the next level takes ${xpText(xp.need)} (PHB p. 29)`} />}
      <Bar label="Magic items" segments={stages(tally.items, String)} target={budget.items} format={String} budgetLabel={budgetLabel} />
      <Bar label="Monetary" segments={stages(tally.gp, gp)} target={budget.gp} format={gp} budgetLabel={budgetLabel} />
    </div>
  )
}

interface Segment { value: number; opacity: number; label: string }

const stages = (s: StageTally, format: (n: number) => string): Segment[] =>
  STAGES.map(st => ({ value: s[st.key], opacity: st.opacity, label: `${format(s[st.key])} ${st.label}` }))

function Bar({ label, segments, target, format, budgetLabel = 'budget', title }: { label: string; segments: Segment[]; target: number; format: (n: number) => string; budgetLabel?: string; title?: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const scale = Math.max(target, total) || 1
  const pct = (n: number) => `${(n / scale) * 100}%`
  const color = total > target ? 'var(--danger)' : 'var(--accent)'
  const summary = segments.filter(s => s.value > 0).map(s => s.label).join(', ')
  return <>
    <span style={{ fontWeight: 600 }}>{label}</span>
    <div className="rewards-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={total}
      title={title ?? `${summary || 'None yet'}; ${budgetLabel} ${format(target)}`}
      style={{ position: 'relative', height: 14, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex' }}>
      {segments.map((s, i) => s.value > 0 && <div key={i} style={{ width: pct(s.value), background: color, opacity: s.opacity }} />)}
      {target > 0 && <div style={{ position: 'absolute', left: pct(target), top: 0, bottom: 0, width: 2, background: 'var(--text)', transform: 'translateX(-1px)' }} />}
    </div>
    <span style={{ whiteSpace: 'nowrap' }}>{format(total)} / {format(target)}</span>
  </>
}
