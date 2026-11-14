// A trap's countermeasures in combat: each printed line with its checks (skill and DC), the check's
// action, an attackable part's defenses and hit points, and a button for what success does (Disable,
// Destroy, Delay). A skill challenge counts successes and failures toward its complexity; reaching
// the successes applies its effect. The compact form (Triggered traps strip) shows only the actions.
// Many countermeasures stop only part of a trap ("one door's trigger"), so stopping the whole trap
// stays the DM's click.

import type { CombatantState } from '@common/types'
import type { Trap } from '@kit'
import { ACTION_TYPE_LABELS } from '@kit'
import { checkLabel, countermeasureLines, EFFECT_LABEL, partLabel, type Countermeasure } from '@common/combat/countermeasures'
import { ActionTypeIcon } from '../shared/Icon'

export type CountermeasureUse = { m: Countermeasure } | { m: Countermeasure; outcome: 'success' | 'failure'; delta: 1 | -1 }

interface Props {
  combatant: CombatantState
  onUse: (use: CountermeasureUse) => void
  compact?: boolean
}

const small = { fontSize: 'var(--font-size-xs)', padding: '0 6px' }

/** "Thievery DC 22 or Arcana DC 22"; a part with no check reads by its effect. */
export const checksText = (m: Countermeasure) => m.checks.map(checkLabel).join(' or ')

/** The countermeasure's buttons: Successes and Failures for a skill challenge, else its effect (Disable, Destroy, Delay). */
function Actions({ c, m, onUse }: { c: CombatantState; m: Countermeasure; onUse: Props['onUse'] }) {
  if (c.dead) return null
  const label = EFFECT_LABEL[m.effect]
  if (m.complexity) {
    const p = c.countermeasures?.[m.key] ?? { successes: 0, failures: 0 }
    const counter = (outcome: 'success' | 'failure', n: number, goal: number | undefined, text: string) => (
      <button className="btn btn-sm" style={small} title={`A ${outcome}${goal ? ` (${goal} needed)` : ''}. Right click: take one back`}
        onClick={() => onUse({ m, outcome, delta: 1 })}
        onContextMenu={e => { e.preventDefault(); if (n > 0) onUse({ m, outcome, delta: -1 }) }}>
        {text} {n}{goal ? `/${goal}` : ''}
      </button>
    )
    return <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
      {counter('success', p.successes, m.complexity.successes, 'Successes')}
      {counter('failure', p.failures, m.complexity.failures, 'Failures')}
    </span>
  }
  if (!label) return null
  return <button className="btn btn-sm" style={{ ...small, flexShrink: 0 }} onClick={() => onUse({ m })}
    title={m.effect === 'delay' ? 'Log that a countermeasure delayed the trap' : `A countermeasure ${m.effect === 'destroy' ? 'destroyed' : 'stopped'} the whole trap`}>
    {label}
  </button>
}

export function TrapCountermeasures({ combatant: c, onUse, compact }: Props) {
  if (c.kind !== 'trap' || !c.content) return null
  const lines = countermeasureLines(c.content as Trap)
  if (compact) {
    // One row per countermeasure: its check (or attackable part) at the left, its buttons at the right.
    const measures = lines.flatMap(l => l.measures).filter(m => m.complexity || EFFECT_LABEL[m.effect])
    if (c.dead || !measures.length) return null
    return <div className="trap-countermeasures-compact" style={{ padding: '2px 0 2px 12px', fontSize: 'var(--font-size-xs)' }}>
      {measures.map(m => {
        const what = checksText(m) || partLabel(m)
        return <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <span title={what} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{what}</span>
          <Actions c={c} m={m} onUse={onUse} />
        </div>
      })}
    </div>
  }
  if (!lines.length) return null
  return (
    <div className="trap-countermeasures" style={{ borderTop: '1px solid var(--sb-separator)', fontSize: 11 }}>
      <div className="sb-row" style={{ fontWeight: 700 }}>Countermeasures</div>
      {lines.map((l, i) => (
        <div key={i} className="sb-row" style={{ paddingLeft: 8, display: 'block' }}>
          <div>{l.text}</div>
          {l.measures.map(m => {
            const facts = [
              checksText(m) && <b key="checks">{checksText(m)}</b>,
              m.action && <span key="action" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ActionTypeIcon action={m.action} />{ACTION_TYPE_LABELS[m.action]}</span>,
              partLabel(m) && <span key="part">{partLabel(m)}</span>,
            ].filter(Boolean)
            if (!facts.length && !EFFECT_LABEL[m.effect] && !m.complexity) return null
            return (
              <div key={m.key} className="trap-countermeasure" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {facts.map((f, k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center' }}>{k > 0 && <span style={{ color: 'var(--muted)', marginRight: 6 }}>·</span>}{f}</span>)}
                <Actions c={c} m={m} onUse={onUse} />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
