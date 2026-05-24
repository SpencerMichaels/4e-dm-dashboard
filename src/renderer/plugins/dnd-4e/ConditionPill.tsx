import { getConditionStyle } from './condition-styles'
import { CLASS_MARK_BY_CONDITION_ID } from '../../../../plugins/dnd-4e/class-marks'

/** Build a display label for a condition from its data fields */
export function buildConditionLabel(opts: {
  conditionId: string
  name: string
  value?: number
  customDescription?: string
  damageType?: string
  durationType?: string
  expiresOnName?: string
}): string {
  const { conditionId, name, value, customDescription } = opts
  // Ongoing damage: "Ongoing 5 fire"
  if (conditionId.startsWith('ongoing-damage')) {
    return `Ongoing ${value ?? ''}${opts.damageType ? ' ' + opts.damageType : ''}`
  }
  // Regenerating: "Regenerating 10"
  if (conditionId === 'regenerating') {
    return `Regenerating${value ? ' ' + value : ''}`
  }
  // Class marks: "Quarried by Bob" (use the class mark's short name, not the raw id)
  const classMark = CLASS_MARK_BY_CONDITION_ID[conditionId]
  if (classMark) {
    let label = classMark.shortName
    if (customDescription) label += ` ${customDescription}`
    return label
  }
  let label = name
  // Marked: append "by X"
  if (conditionId === 'marked' && customDescription) label += ` ${customDescription}`
  // Grants CA: append "to X" / "to X's allies" — recipient is preformatted into
  // customDescription at apply time (undefined for the 'all' case, which renders
  // as the bare condition name).
  if (conditionId === 'combat-advantage' && customDescription) label += ` ${customDescription}`
  return label
}

/** Shared condition pill component — used in initiative cards, right-click menu, etc. */
export function ConditionPill({ conditionId, label, damageType, customColor, customIcon, title, onClick, style: extraStyle }: {
  conditionId: string
  label: string
  damageType?: string
  customColor?: string
  customIcon?: string
  title?: string
  onClick?: () => void
  style?: React.CSSProperties
}) {
  const style = getConditionStyle(conditionId, damageType, customColor, customIcon)
  const background = style.color2
    ? `linear-gradient(135deg, ${style.color} 45%, ${style.color2} 55%)`
    : style.color

  return (
    <span title={title} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '0 6px 0 2px', borderRadius: 8,
      background, color: style.textColor,
      fontSize: 9, fontWeight: 600, lineHeight: '14px',
      whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : 'default',
      ...extraStyle,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '1.7em', height: '1.7em', borderRadius: '50%',
        background: 'rgba(0,0,0,0.35)',
        fontSize: '0.85em', flexShrink: 0,
      }}>{style.icon}{style.icon2 ?? ''}</span>
      {label}
    </span>
  )
}
