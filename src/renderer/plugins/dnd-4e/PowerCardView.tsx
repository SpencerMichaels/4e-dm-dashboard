import { USAGE_COLORS, DND4E_ACTION_TYPES, sign, normalizeDamage, type DamagePart } from './dnd4e-utils'
import type { DetectedCondition } from './condition-detection'
import { splitTextWithHighlights } from './condition-detection'
import './statblock.css'

/** Shared read-only power card used by creature viewer, item viewer, and trap viewer */

export interface PowerCardEntry {
  name: string
  usage: string
  actionType?: string
  action?: string          // item powers use this instead of actionType
  rechargeValue?: number       // recharge threshold: 4 means "recharge 4+" (roll 4-6 on d6)
  rechargeCondition?: string   // e.g., "when first bloodied"
  keywords?: string[]
  rangeType?: string
  rangeValue?: string
  target?: string
  attackBonus?: number | null
  attackNotes?: string
  defense?: string
  damage?: DamagePart[] | string
  hit?: string
  miss?: string
  effect?: string
  trigger?: string
  requirement?: string
  critical?: string
  sustain?: string
  text?: string
  levelScaling?: { level: number; text: string }[]
}

interface Props {
  entry: PowerCardEntry
  selectedLevel?: number
  detectedConditions?: DetectedCondition[]
  onConditionClick?: (detection: DetectedCondition, multi: boolean) => void
}

export function PowerCardView({ entry: e, selectedLevel, detectedConditions, onConditionClick }: Props) {
  // Derive rechargeValue from rechargeCondition if it's a numeric string like "5-6"
  const rechargeValue = e.rechargeValue ?? (e.rechargeCondition ? (parseInt(e.rechargeCondition) || undefined) : undefined)
  const rechargeCondition = rechargeValue ? undefined : e.rechargeCondition  // don't show condition if numeric
  const usageKey = (e.usage?.startsWith('recharge') || rechargeValue) ? 'recharge' : e.usage
  const usageColor = USAGE_COLORS[usageKey] ?? (e.usage ? '#6a6a72' : '#7a6f5e')
  const actionLabel = e.actionType ? (DND4E_ACTION_TYPES[e.actionType] ?? e.actionType) : (e.action ?? '')
  /** Render a text field with detected condition keywords highlighted */
  const renderHighlighted = (text: string, field: 'hit' | 'effect' | 'miss') => {
    if (!detectedConditions || !onConditionClick) return text
    const segments = splitTextWithHighlights(text, detectedConditions, field)
    if (segments.length === 1 && !segments[0].detection) return text
    return segments.map((seg, i) => seg.detection ? (
      <span key={i}
        onClick={(ev) => { ev.stopPropagation(); onConditionClick(seg.detection!, false) }}
        onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); onConditionClick(seg.detection!, true) }}
        style={{
          textDecoration: 'underline', textDecorationStyle: 'dotted',
          cursor: 'pointer', color: '#e8a020', fontWeight: 600,
        }}
        title={`Click to apply ${seg.detection.conditionName}`}
      >{seg.text}</span>
    ) : <span key={i}>{seg.text}</span>)
  }

  const hasAttack = e.attackBonus != null || (e.attackNotes && e.defense)
  const damage = normalizeDamage(e.damage)
  const labelStyle = { color: 'var(--color-text-secondary)' }

  return (
    <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: 1 }}>
      {/* Header */}
      <div style={{ padding: '2px 8px', background: usageColor, color: '#fff' }}>
        <b>{e.name}</b>
        {e.keywords && e.keywords.length > 0 && (
          <span style={{ color: 'rgba(255,255,255,0.7)' }}> ({e.keywords.join(', ')})</span>
        )}
        {(actionLabel || e.usage) && (
          <span style={{ color: 'rgba(255,255,255,0.8)' }}> ({[
            actionLabel,
            rechargeValue ? `recharge ${rechargeValue}${rechargeValue < 6 ? '+' : ''}`
              : rechargeCondition ? `recharge ${rechargeCondition}`
              : e.usage,
          ].filter(Boolean).join('; ')})</span>
        )}
      </div>
      {/* Attack subheader */}
      {hasAttack && (
        <div style={{ padding: '1px 8px', background: usageColor + '88', color: '#fff' }}>
          {e.rangeType && <>{e.rangeType.replace(/-/g, ' ')}</>}
          {e.rangeValue && <> {e.rangeValue}</>}
          {e.target && <> ({e.target})</>}
          {e.defense && <>
            ; {e.attackNotes && /level/i.test(e.attackNotes) ? e.attackNotes : sign(e.attackBonus!)} vs {e.defense}
          </>}
          {e.attackNotes && !/level/i.test(e.attackNotes) && <> {e.attackNotes}</>}
        </div>
      )}
      {/* Body */}
      <div style={{ padding: '1px 8px 2px 16px' }}>
        {e.requirement && <div><b style={labelStyle}>Requirement</b> {e.requirement}</div>}
        {e.trigger && <div><b style={labelStyle}>Trigger</b> {e.trigger}</div>}
        {damage.length > 0 && (
          <div>
            <b style={labelStyle}>Damage</b>{' '}
            {damage.map((p, i) => (
              <span key={i}>{i > 0 && ' plus '}{p.ongoing && 'ongoing '}{p.expr}{p.type && ` ${p.type}`}</span>
            ))}
          </div>
        )}
        {e.critical && <div><b style={labelStyle}>Critical</b> {e.critical}</div>}
        {e.hit && <div><b style={labelStyle}>Hit</b> {renderHighlighted(e.hit.replace(/^\+\s*/, ''), 'hit')}</div>}
        {e.miss && <div><b style={labelStyle}>Miss</b> {renderHighlighted(e.miss, 'miss')}</div>}
        {e.effect && <div><b style={labelStyle}>Effect</b> {renderHighlighted(e.effect, 'effect')}</div>}
        {e.sustain && <div><b style={labelStyle}>Sustain</b> {e.sustain}</div>}
        {e.text && e.text.split('\n').map((line, j) => (
          <div key={j}>{line}</div>
        ))}
        {e.levelScaling && e.levelScaling.length > 0 && (
          selectedLevel != null ? (() => {
            let best: { level: number; text: string } | undefined
            for (const s of e.levelScaling) {
              if (s.level <= selectedLevel && (!best || s.level > best.level)) best = s
            }
            return best ? <div style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Level {best.level}: {best.text}</div> : null
          })() : (
            <>{e.levelScaling.map((s, i) => (
              <div key={i} style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Level {s.level}: {s.text}</div>
            ))}</>
          )
        )}
      </div>
    </div>
  )
}
