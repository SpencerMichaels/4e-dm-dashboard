import { getConditionStyle } from './condition-styles'

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
  const { conditionId, name, value, customDescription, durationType, expiresOnName } = opts
  // Ongoing damage: "Ongoing 5 fire"
  if (conditionId.startsWith('ongoing-damage')) {
    return `Ongoing ${value ?? ''}${opts.damageType ? ' ' + opts.damageType : ''}`
  }
  let label = name
  // Marked: append "by X"
  if (conditionId === 'marked' && customDescription) label += ` ${customDescription}`
  // Duration suffix
  if (durationType === 'save-ends' || durationType === 'unlimited') label += ' (save)'
  else if (durationType === 'eont') label += ` (EONT${expiresOnName ? ' ' + expiresOnName : ''})`
  else if (durationType === 'sont') label += ` (SONT${expiresOnName ? ' ' + expiresOnName : ''})`
  return label
}

/** Shared condition pill component — used in initiative cards, right-click menu, etc. */
export function ConditionPill({ conditionId, label, damageType, title, onClick, style: extraStyle }: {
  conditionId: string
  label: string
  damageType?: string
  title?: string
  onClick?: () => void
  style?: React.CSSProperties
}) {
  const style = getConditionStyle(conditionId, damageType)
  const background = style.color2
    ? `linear-gradient(135deg, ${style.color} 45%, ${style.color2} 55%)`
    : style.color

  return (
    <span title={title} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      padding: '0 5px', borderRadius: 8,
      background, color: style.textColor,
      fontSize: 9, fontWeight: 600, lineHeight: '14px',
      whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : 'default',
      ...extraStyle,
    }}>
      <span style={{ fontSize: 8 }}>{style.icon}{style.icon2 ?? ''}</span>
      {label}
    </span>
  )
}
