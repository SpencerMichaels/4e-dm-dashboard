import { usageTone, DND4E_ACTION_TYPES, sign, normalizeDamage, type DamagePart } from './dnd4e-utils'
import { tint, withAlpha } from '../../utils/color'
import type { DetectedCondition } from '../combat/condition-detection'
import { splitTextWithHighlights } from '../combat/condition-detection'
import { useSystemSetting } from '../../stores/settings-store'
import './statblock.css'

// Monochrome unicode icons (text presentation, never colored emoji) for the
// action-type and range-type indicators on power cards.
export const ACTION_ICONS: Record<string, string> = {
  standard:             '\u25CF',          // ● filled circle
  minor:                '\u25D4',          // ◔ one-quarter filled circle
  move:                 '\u226B',          // ≫ much greater-than
  free:                 '\u25CB',          // ○ empty circle
  'immediate-reaction': '\u21BB',          // ↻ clockwise loop (responds AFTER trigger)
  'immediate-interrupt':'\u21AF',          // ↯ downwards zigzag arrow (failed/interrupted reaction)
  opportunity:          '\u21BB',          // ↻ same glyph as immediate reaction (kit ACTION_TYPE_SYMBOLS)
  'no-action':          '\u2013',          // – en dash
}
const RANGE_ICONS: Record<string, string> = {
  melee:        '\u2694\uFE0E', // ⚔ crossed swords (text variation)
  ranged:       '\u27B3',       // ➳ heavy arrow with hooked head
  'close-burst':'\u229B',       // ⊛ circled asterisk (centered on self)
  'close-blast':'\u25E2',       // ◢ lower-right triangle (cone from self)
  'area-burst': '\u2738',       // ✸ heavy eight-pointed asterisk (explosion at range)
  'area-wall':  '\u25A6',       // ▦ square with orthogonal hatch (wall)
  aura:         '\u2600\uFE0E', // ☀ sun (text variation) — radiating presence
}

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
  secondary?: string
  aftereffect?: string
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
  const hideActionTypeText = useSystemSetting<boolean>('dnd-4e', 'hideActionTypeText', false)
  // Derive rechargeValue from rechargeCondition if it's a numeric string like "5-6"
  const rechargeValue = e.rechargeValue ?? (e.rechargeCondition ? (parseInt(e.rechargeCondition) || undefined) : undefined)
  const rechargeCondition = rechargeValue ? undefined : e.rechargeCondition  // don't show condition if numeric
  const usageKey = (e.usage?.startsWith('recharge') || rechargeValue) ? 'recharge' : e.usage
  const { fill: usageColor, text: usageText } = usageTone(usageKey)
  const actionLabel = e.actionType ? (DND4E_ACTION_TYPES[e.actionType] ?? e.actionType) : (e.action ?? '')
  /** Render a text field with detected condition keywords highlighted */
  const renderHighlighted = (text: string, field: 'hit' | 'effect' | 'miss') => {
    if (!detectedConditions || !onConditionClick) return text
    const segments = splitTextWithHighlights(text, detectedConditions, field)
    if (segments.length === 1 && !segments[0].detection) return text
    return segments.map((seg, i) => seg.detection ? (
      <span key={i}
        onMouseDown={(ev) => { if (ev.shiftKey) ev.preventDefault() }}
        onClick={(ev) => { ev.stopPropagation(); onConditionClick(seg.detection!, ev.shiftKey) }}
        style={{
          textDecoration: 'underline', textDecorationStyle: 'dotted',
          cursor: 'pointer', color: 'var(--color-action-point)', fontWeight: 600,
          userSelect: 'none',
        }}
        title={`Click to apply ${seg.detection.conditionName} (shift-click to apply to multiple targets)`}
      >{seg.text}</span>
    ) : <span key={i}>{seg.text}</span>)
  }

  const hasAttack = e.attackBonus != null || (e.attackNotes && e.defense)
  const damage = normalizeDamage(e.damage)
  const labelStyle = { color: 'var(--color-text-secondary)' }

  return (
    <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: 1 }}>
      {/* Header */}
      <div style={{ padding: '2px 8px', background: usageColor, color: usageText }}>
        {e.actionType && ACTION_ICONS[e.actionType] && (
          <span title={DND4E_ACTION_TYPES[e.actionType] ?? e.actionType}
            style={{ marginRight: 6, display: 'inline-block', minWidth: '1em', textAlign: 'center' }}>
            {ACTION_ICONS[e.actionType]}
          </span>
        )}
        <b>{e.name}</b>
        {e.keywords && e.keywords.length > 0 && (
          <span style={{ color: withAlpha(usageText, 0.7) }}> ({e.keywords.join(', ')})</span>
        )}
        {!hideActionTypeText && (actionLabel || e.usage) && (
          <span style={{ color: withAlpha(usageText, 0.8) }}> ({[
            actionLabel,
            rechargeValue ? `recharge ${rechargeValue}${rechargeValue < 6 ? '+' : ''}`
              : rechargeCondition ? `recharge ${rechargeCondition}`
              : e.usage,
          ].filter(Boolean).join('; ')})</span>
        )}
        {hideActionTypeText && (rechargeValue || rechargeCondition) && (
          <span style={{ color: withAlpha(usageText, 0.8) }}> ({
            rechargeValue ? `recharge ${rechargeValue}${rechargeValue < 6 ? '+' : ''}`
              : `recharge ${rechargeCondition}`
          })</span>
        )}
      </div>
      {/* Attack / range subheader — shown for attacks AND for non-attack entries that have a range (auras, blasts).
         Traits never get a subheader — they may carry range data from import but shouldn't display it.
         The subheader is lighter than the header in both themes (blended toward the white header
         text, not the surface), matching the stat block's dark-then-light header rows. */}
      {(hasAttack || (e.rangeType && e.rangeValue)) && e.usage !== 'trait' && (
        <div style={{ padding: '1px 8px', background: tint(usageColor, 0.85, 'var(--card-text)'), color: usageText }}>
          {e.rangeType && RANGE_ICONS[e.rangeType] && (
            <span title={e.rangeType.replace(/-/g, ' ')}
              style={{ marginRight: 6, display: 'inline-block', minWidth: '1em', textAlign: 'center' }}>
              {RANGE_ICONS[e.rangeType]}
            </span>
          )}
          {e.rangeType && <>{e.rangeType.replace(/-/g, ' ')}</>}
          {e.rangeValue && <> {e.rangeValue}</>}
          {e.target && <> ({e.target})</>}
          {e.defense && <>
            ; {e.attackNotes && /level/i.test(e.attackNotes) ? e.attackNotes : (
              (e as any)._levelAdjust?.attackDelta
                ? <span title={`${(e as any)._levelAdjust.source}: ${(e as any)._levelAdjust.attackDelta > 0 ? '+' : ''}${(e as any)._levelAdjust.attackDelta} to attack`}
                    style={{ color: 'var(--notify)', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>{sign(e.attackBonus!)}</span>
                : sign(e.attackBonus!)
            )} vs {e.defense}
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
            {(e as any)._levelAdjust?.damageDelta ? (
              <span title={`${(e as any)._levelAdjust.source}: ${(e as any)._levelAdjust.damageDelta > 0 ? '+' : ''}${(e as any)._levelAdjust.damageDelta} damage`}
                style={{ color: 'var(--notify)', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
                {damage.map((p, i) => (
                  <span key={i}>{i > 0 && ' plus '}{p.ongoing && 'ongoing '}{p.expr}{p.type && ` ${p.type}`}{p.saveEnds && ' (save ends)'}</span>
                ))}
              </span>
            ) : (
              damage.map((p, i) => (
                <span key={i}>{i > 0 && ' plus '}{p.ongoing && 'ongoing '}{p.expr}{p.type && ` ${p.type}`}{p.saveEnds && ' (save ends)'}</span>
              ))
            )}
          </div>
        )}
        {e.critical && <div><b style={labelStyle}>Critical</b> {e.critical}</div>}
        {e.hit && <div><b style={labelStyle}>Hit</b> {renderHighlighted(e.hit.replace(/^\+\s*/, ''), 'hit')}</div>}
        {e.secondary && <div><b style={labelStyle}>Secondary</b> {e.secondary}</div>}
        {e.aftereffect && <div><b style={labelStyle}>Aftereffect</b> {e.aftereffect}</div>}
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
