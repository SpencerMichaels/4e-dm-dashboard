// The monster power card ("Monster Power Cards: Proposal", card passes 1 and 2), used for powers,
// traits, and auras wherever a stat block shows them: the creature viewer, combat panels, pinned cards,
// reaction tiles, item and trap stat blocks. A header (action icon, name, keywords, basic-attack marker,
// usage chip, pin), the attack line (range, target, bonus vs defense), and the printed lines in book
// order, grouped by spacing (card-lines.ts): a kit power's later attacks are groups with their own
// attack line, and structured damage leads the Hit line. In combat it also shows use (a spent power
// collapses to its header and says so in its chip) and click-to-apply: the spans its effect clauses
// (or the regex fallback) found, with a "save ends both" group highlighted and applied together.

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { abbreviateDefense, textAtLevel, usageChipLabel, usedChipLabel } from '@kit'
import type { Line, Power } from '@kit'
import { DiseaseChips } from '../disease/disease-refs'
import { usageTone, DND4E_ACTION_TYPES, sign, normalizeDamage, type DamagePart } from './dnd4e-utils'
import { tint } from '../../utils/color'
import type { CardApplies, CardApply } from '../combat/card-actions'
import { kitCardGroups, legacyCardGroups, type CardGroup } from './card-lines'
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
  /** What joined the damage to the rest of the Hit text when the editor split them (", ", ". "). */
  hitJoin?: string
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
  /** The kit power it was drawn from: the card's body and click-to-apply read it. */
  kit?: Power
  /** A trait's or aura's kit line, with its effect clauses. */
  kitLine?: Line
}

interface Props {
  entry: PowerCardEntry
  selectedLevel?: number
  /** In combat: the spans to highlight per line key, and what a click on one applies (shift: several targets). */
  applies?: CardApplies
  onApply?: (apply: CardApply, multi: boolean) => void
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

export function PowerCardView({ entry: e, selectedLevel, applies, onApply, uses, onUse, onRestore, pinned, onPin, collapsed, marker, rechargeQueued }: Props) {
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
  const damage = normalizeDamage(e.damage)
  const legacy = e.kit ? undefined : legacyCardGroups(e, hasAttack, damage.length > 0)
  const body: CardGroup[] = e.kit ? kitCardGroups(e.kit) : legacy!.groups
  // Traits and auras print their text unlabelled.
  const groups = kind === 'power' ? body : body.map(g => ({ ...g, lines: g.lines.map(l => l.label === 'Effect' ? { ...l, label: '' } : l) }))
  const basic = e.basic ?? e.kit?.basic ?? legacy?.basic
  const steps = e.levelScaling?.length ? (selectedLevel != null ? [textAtLevel(e.levelScaling, selectedLevel)].filter(Boolean) as { level: number; text: string }[] : e.levelScaling) : []

  // ── Click-to-apply: a save group's spans light up together ──
  const [hoverGroup, setHoverGroup] = useState<string>()
  const highlighted = (key: string, text: string): ReactNode => {
    const spans = onApply ? applies?.[key] : undefined
    if (!spans?.length) return text
    const out: ReactNode[] = []
    let pos = 0
    for (const a of spans) {
      if (a.at[0] < pos) continue
      if (a.at[0] > pos) out.push(text.slice(pos, a.at[0]))
      const disease = a.items.find(i => i.kind === 'disease')
      out.push(<span key={a.at[0]} className={`pc-apply${a.group && a.group === hoverGroup ? ' pc-apply-hover' : ''}`}
        onMouseEnter={() => setHoverGroup(a.group)} onMouseLeave={() => setHoverGroup(undefined)}
        onMouseDown={ev => { if (ev.shiftKey) ev.preventDefault() }}
        onClick={ev => { ev.stopPropagation(); onApply!(a, ev.shiftKey) }}
        title={(disease ? `Click, then a PC, to expose them to ${a.label} (shift-click for several)`
          : `Click to apply ${a.label} (shift-click to apply to multiple targets)`) + (a.condition ? `\nOnly ${a.condition}` : '')}
      >{text.slice(...a.at)}</span>)
      pos = a.at[1]
    }
    if (pos < text.length) out.push(text.slice(pos))
    return out
  }

  const adjusted = (delta: number, what: string, node: React.ReactNode) => delta
    ? <span className="pc-adjusted" title={`${e._levelAdjust!.source}: ${delta > 0 ? '+' : ''}${delta} ${what}`}>{node}</span>
    : node
  // Structured damage (an editor entry's damage parts) leads the Hit line.
  const damageText = damage.length > 0 && adjusted(e._levelAdjust?.damageDelta ?? 0, 'damage',
    damage.map((p, i) => <span key={i}>{i > 0 && ' plus '}{p.ongoing && 'ongoing '}{p.expr}{p.type && ` ${p.type}`} damage{p.saveEnds && ' (save ends)'}</span>))

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
        <AttackRow rangeType={e.rangeType} rangeValue={e.rangeValue} target={e.target}
          roll={e.defense && <>{e.attackNotes && /level/i.test(e.attackNotes) ? e.attackNotes : adjusted(e._levelAdjust?.attackDelta ?? 0, 'to attack', sign(e.attackBonus!))} vs {abbreviateDefense(e.defense)}</>}
          notes={e.attackNotes && !/level/i.test(e.attackNotes) ? e.attackNotes : undefined} />
      )}
      {showBody && (
        <div className="pc-body">
          {groups.map((g, i) => <div key={i} className="pc-group">
            {g.attack && <>
              <div className="pc-line"><b>{g.attack.label}</b>{g.attack.after && g.attack.after !== 'always' && <span className="pc-dim"> (on a {g.attack.after})</span>}</div>
              <AttackRow sub rangeType={g.attack.rangeType} rangeValue={g.attack.rangeValue} target={g.attack.target}
                roll={<>{adjusted(e._levelAdjust?.attackDelta ?? 0, 'to attack', g.attack.bonus)} vs {abbreviateDefense(g.attack.vs)}</>} />
            </>}
            {g.lines.map(l => <div key={l.key} className="pc-line">{l.label && <b>{l.label}</b>} {l.damage && damageText}{l.damage && l.text && (e.hitJoin?.trim() ? e.hitJoin.trim() + ' ' : '. ')}{highlighted(l.key, l.text)}</div>)}
          </div>)}
          {steps.length > 0 && <div className="pc-group pc-levels">{steps.map((s, i) => <div key={i}>Level {s.level}: {s.text}</div>)}</div>}
          <DiseaseChips text={[e.hit, e.secondary, e.aftereffect, e.miss, e.effect, e.special, e.text].filter(Boolean).join(' ')} />
        </div>
      )}
    </div>
  )
}

/** An attack's line: range, target, and the roll; `sub` for an attack after the first, inside the card's body. */
function AttackRow({ rangeType, rangeValue, target, roll, notes, sub }: { rangeType?: string; rangeValue?: string; target?: string; roll?: ReactNode; notes?: string; sub?: boolean }) {
  return (
    <div className={`pc-attack${sub ? ' pc-subattack' : ''}`}>
      {rangeType && <span><Icon name={isPersonal(rangeType) ? 'user-round' : 'sword'} label="Range" /> {rangeType.replace(/-/g, ' ')}{rangeValue && ` ${rangeValue}`}</span>}
      {target && <span><Icon name={isPersonal(target) ? 'user-round' : 'crosshair'} label="Target" /> {target}</span>}
      {roll && <span className="pc-roll"><Icon name="dices" label="Attack" /> <b>{roll}</b></span>}
      {notes && <span>{notes}</span>}
    </div>
  )
}
