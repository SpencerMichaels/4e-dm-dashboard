// The monster power card ("Monster Power Cards: Proposal", card pass 1), used for powers, traits, and
// auras wherever a stat block shows them: the creature viewer, combat panels, pinned cards, reaction
// tiles, item and trap stat blocks. A header (action icon, name, keywords, basic-attack marker, usage
// chip, pin), the attack line (range, target, bonus vs defense), and the printed lines in book order,
// grouped by spacing. In combat it also shows use: a spent power collapses to its header and says so
// in its chip.

import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { abbreviateDefense, groupLines, textAtLevel, usageChipLabel, usedChipLabel, type CardLine } from '@kit'
import { DiseaseChips } from '../disease/disease-refs'
import { usageTone, DND4E_ACTION_TYPES, sign, normalizeDamage, type DamagePart } from './dnd4e-utils'
import { tint } from '../../utils/color'
import type { DetectedCondition } from '../combat/condition-detection'
import { splitTextWithHighlights } from '../combat/condition-detection'
import { useSystemSetting } from '../../stores/settings-store'
import { ActionTypeIcon, Icon } from '../shared/Icon'
import './statblock.css'

/** An encounter level adjustment, shown on the attack bonus and the damage. */
export interface LevelAdjust { attackDelta: number; damageDelta: number; source: string }

export interface PowerCardEntry {
  name: string
  /** A power's usage, or 'trait' / 'aura' for those entries. */
  usage: string
  actionType?: string
  action?: string          // item powers use this instead of actionType
  rechargeValue?: number       // recharge threshold: 4 means "recharge 4+" (roll 4-6 on d6)
  rechargeCondition?: string   // e.g., "when first bloodied"
  encounterUses?: number       // "2/Encounter"
  /** A basic attack (also read from a "Melee basic attack" line). */
  basic?: 'melee' | 'ranged'
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
  special?: string
  text?: string
  levelScaling?: { level: number; text: string }[]
  _levelAdjust?: LevelAdjust
}

interface Props {
  entry: PowerCardEntry
  selectedLevel?: number
  detectedConditions?: DetectedCondition[]
  onConditionClick?: (detection: DetectedCondition, multi: boolean) => void
  /** In combat: how often the power was used, and the most it can be (Infinity for at-will). */
  uses?: { used: number; max: number }
  /** Click uses the power; right-click restores a use. */
  onUse?: () => void
  onRestore?: () => void
  pinned?: boolean
  onPin?: () => void
  /** Header only (a reaction tile): clicking uses it (onUse) instead of expanding. */
  collapsed?: boolean
  /** Shown after the action icon (a reaction tile's "triggered" mark). */
  marker?: React.ReactNode
  /** The engine is waiting on this power's recharge roll: a dice icon in the chip. */
  rechargeQueued?: boolean
}

/** The range and target fields' icons, as 4ecb draws them: a figure instead when the value is personal. */
const isPersonal = (value: string) => /^\s*personal\s*$/i.test(value)

export function PowerCardView({ entry: e, selectedLevel, detectedConditions, onConditionClick, uses, onUse, onRestore, pinned, onPin, collapsed, marker, rechargeQueued }: Props) {
  const hideActionTypeText = useSystemSetting<boolean>('dnd-4e', 'hideActionTypeText', false)
  const [expanded, setExpanded] = useState(false)
  const kind = e.usage === 'trait' || e.usage === 'aura' ? e.usage : 'power'
  // A numeric recharge printed as "5-6" carries its threshold in the condition.
  const rechargeValue = e.rechargeValue ?? (e.rechargeCondition ? (parseInt(e.rechargeCondition) || undefined) : undefined)
  const usage = { usage: e.usage, rechargeValue, rechargeCondition: rechargeValue ? undefined : e.rechargeCondition, encounterUses: e.encounterUses, auraSize: e.rangeValue }
  const usageKey = kind !== 'power' ? 'trait' : (e.usage?.startsWith('recharge') || rechargeValue) ? 'recharge' : e.usage
  const tone = usageTone(usageKey)
  const spent = !!uses && uses.max !== Infinity && uses.used >= uses.max
  const chip = uses ? usedChipLabel(usage, uses.used, uses.max) : usageChipLabel(usage)
  const showBody = !collapsed && (!spent || expanded)
  const actionLabel = e.actionType ? (DND4E_ACTION_TYPES[e.actionType] ?? e.actionType) : (e.action ?? '')

  const hasAttack = e.attackBonus != null || !!(e.attackNotes && e.defense)
  const lines = groupLines({ ...e, attack: hasAttack })
  // Traits and auras print their text unlabelled.
  const groups = kind === 'power' ? lines.groups : lines.groups.map(g => g.map(l => l.label === 'Effect' ? { ...l, label: '' } : l))
  const basicLine = lines.basic
  const basic = e.basic ?? basicLine
  const damage = normalizeDamage(e.damage)
  const steps = e.levelScaling?.length ? (selectedLevel != null ? [textAtLevel(e.levelScaling, selectedLevel)].filter(Boolean) as { level: number; text: string }[] : e.levelScaling) : []

  /** Text with detected condition keywords (and disease names) highlighted for click-to-apply. */
  const highlighted = (text: string, field?: CardLine['field']) => {
    if (!field || !detectedConditions || !onConditionClick) return text
    const segments = splitTextWithHighlights(text, detectedConditions, field)
    if (segments.length === 1 && !segments[0].detection) return text
    return segments.map((seg, i) => seg.detection ? (
      <span key={i} className="pc-apply"
        onMouseDown={ev => { if (ev.shiftKey) ev.preventDefault() }}
        onClick={ev => { ev.stopPropagation(); onConditionClick(seg.detection!, ev.shiftKey) }}
        title={seg.detection.disease
          ? `Click, then a PC, to expose them to ${seg.detection.conditionName} (shift-click for several)`
          : `Click to apply ${seg.detection.conditionName} (shift-click to apply to multiple targets)`}
      >{seg.text}</span>
    ) : <span key={i}>{seg.text}</span>)
  }

  const adjusted = (delta: number, what: string, node: React.ReactNode) => delta
    ? <span className="pc-adjusted" title={`${e._levelAdjust!.source}: ${delta > 0 ? '+' : ''}${delta} ${what}`}>{node}</span>
    : node
  const damageLine = damage.length > 0 && <div className="pc-line"><b>Damage</b> {adjusted(e._levelAdjust?.damageDelta ?? 0, 'damage',
    damage.map((p, i) => <span key={i}>{i > 0 && ' plus '}{p.ongoing && 'ongoing '}{p.expr}{p.type && ` ${p.type}`}{p.saveEnds && ' (save ends)'}</span>))}</div>
  // Damage leads the attack's outcome (pass 2 folds it into the Hit line).
  const damageGroup = damage.length > 0 ? Math.max(0, groups.findIndex(g => g.some(l => l.label === 'Hit'))) : -1

  // ── Use, restore, expand ──
  const activate = () => {
    if (collapsed) return void onUse?.()
    if (spent) setExpanded(x => !x)
    else onUse?.()
  }
  const interactive = !!onUse || spent
  const onClick = (ev: MouseEvent) => { if (interactive && !(ev.target as HTMLElement).closest('button, .pc-apply, .disease-chips')) activate() }
  const onContextMenu = (ev: MouseEvent) => { if (onRestore && uses?.used) { ev.preventDefault(); onRestore() } }
  const onKeyDown = (ev: KeyboardEvent) => { if (interactive && (ev.key === 'Enter' || ev.key === ' ') && ev.target === ev.currentTarget) { ev.preventDefault(); activate() } }

  return (
    <div className={`power-card power-card-${kind}${spent ? ' spent' : ''}${interactive ? ' interactive' : ''}`}
      style={{ '--pc-fill': tone.fill, '--pc-text': tone.text, '--pc-sub': tint(tone.fill, 0.85, 'var(--card-text)') } as React.CSSProperties}
      tabIndex={interactive || onPin ? 0 : undefined} onClick={onClick} onContextMenu={onContextMenu} onKeyDown={onKeyDown}
      title={interactive ? (spent ? 'Click to show or hide · right-click to restore a use' : 'Click to use · right-click to restore') : undefined}>
      <div className="pc-header">
        <ActionTypeIcon action={e.actionType} />
        {marker}
        <span className="pc-title">
          <b className="pc-name">{e.name}</b>
          {e.keywords && e.keywords.length > 0 && <span className="pc-dim"> ({e.keywords.join(', ')})</span>}
          {!hideActionTypeText && !collapsed && actionLabel && kind === 'power' && <span className="pc-dim"> · {actionLabel}</span>}
        </span>
        {basic && <span className="pc-basic" title={`${basic === 'melee' ? 'Melee' : 'Ranged'} basic attack`}>Basic</span>}
        {chip && <span className="pc-chip" title={rechargeQueued ? 'Recharge roll pending this turn' : undefined}>{rechargeQueued && <Icon name="dices" label="Recharge roll pending" />}{rechargeQueued ? ' ' : ''}{chip}</span>}
        {onPin && <button type="button" className="pc-pin" onClick={ev => { ev.stopPropagation(); onPin() }}
          title={pinned ? 'Unpin' : 'Pin to the overlay'} aria-pressed={pinned}><Icon name={pinned ? 'pin-off' : 'pin'} /></button>}
      </div>
      {showBody && kind === 'power' && (hasAttack || (e.rangeType && e.rangeValue)) && (
        <div className="pc-attack">
          {e.rangeType && <span><Icon name={isPersonal(e.rangeType) ? 'user-round' : 'sword'} label="Range" /> {e.rangeType.replace(/-/g, ' ')}{e.rangeValue && ` ${e.rangeValue}`}</span>}
          {e.target && <span><Icon name={isPersonal(e.target) ? 'user-round' : 'crosshair'} label="Target" /> {e.target}</span>}
          {e.defense && <span className="pc-roll"><Icon name="dices" label="Attack" /> <b>
            {e.attackNotes && /level/i.test(e.attackNotes) ? e.attackNotes : adjusted(e._levelAdjust?.attackDelta ?? 0, 'to attack', sign(e.attackBonus!))} vs {abbreviateDefense(e.defense)}
          </b></span>}
          {e.attackNotes && !/level/i.test(e.attackNotes) && <span>{e.attackNotes}</span>}
        </div>
      )}
      {showBody && (
        <div className="pc-body">
          {groups.map((g, i) => <div key={i} className="pc-group">
            {i === damageGroup && damageLine}
            {g.map((l, j) => <div key={j} className="pc-line">{l.label && <b>{l.label}</b>} {highlighted(l.text, l.field)}</div>)}
          </div>)}
          {groups.length === 0 && damageLine && <div className="pc-group">{damageLine}</div>}
          {steps.length > 0 && <div className="pc-group pc-levels">{steps.map((s, i) => <div key={i}>Level {s.level}: {s.text}</div>)}</div>}
          <DiseaseChips text={[e.hit, e.secondary, e.aftereffect, e.miss, e.effect, e.special, e.text].filter(Boolean).join(' ')} />
        </div>
      )}
    </div>
  )
}
