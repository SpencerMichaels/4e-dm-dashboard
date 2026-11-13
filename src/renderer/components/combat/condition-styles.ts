/** Visual styling for D&D 4e conditions — colors and icons for pills/badges */
import { getDamageTypeStyle } from './damage-types'
import { CLASS_MARKS } from '../../../common/rules/class-marks'

export interface ConditionStyle {
  color: string     // pill background, any CSS color incl. var(--token); use withAlpha() for tints, never append hex digits
  color2?: string   // second color for split background
  textColor: string // text color (usually white or dark)
  icon: string      // single emoji/unicode icon
  icon2?: string    // second icon for multi-type
}

// Pill tones from the theme (theme.css --cond-*): pastel in the light theme,
// deep in the dark theme, with --cond-text readable on all of them. Icons
// tell conditions of the same tone apart.
const tone = (name: 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'purple' | 'gray', icon: string): ConditionStyle =>
  ({ color: `var(--cond-${name})`, textColor: 'var(--cond-text)', icon })

export const CONDITION_STYLES: Record<string, ConditionStyle> = {
  'combat-advantage':  tone('purple', '⚠'),
  'blinded':           tone('blue', '🕶'),
  'dazed':             tone('amber', '💫'),
  'dominated':         tone('purple', '🧠'),
  'dead':              { color: 'var(--cond-dead)', textColor: 'var(--color-text-on-dark)', icon: '💀' },
  'dying':             tone('red', '☠'),
  'grabbed':           tone('orange', '✊'),
  'helpless':          tone('gray', '🪢'),
  'immobilized':       tone('blue', '⛓'),
  'invisible':         tone('gray', '👁'),
  'marked':            tone('red', '🎯'),
  'petrified':         tone('gray', '🪨'),
  'prone':             tone('orange', '⤵'),
  'restrained':        tone('blue', '🕸'),
  'slowed':            tone('blue', '🐌'),
  'stunned':           tone('red', '⚡'),
  'surprised':         tone('amber', '❗'),
  'unconscious':       tone('gray', '😵'),
  'weakened':          tone('green', '📉'),
  'bloodied':          tone('red', '🩸'),
  'ongoing-damage':    tone('red', '🔄'),
  'regenerating':      tone('green', '💚'),
  'reacted':           tone('purple', '↻'),
  // Class marks — fallback colors used when the source PC has no chip color set.
  // These are mid-tone colors in both themes, so the text stays dark.
  ...Object.fromEntries(CLASS_MARKS.map(m => [
    m.conditionId, { color: m.color, textColor: 'var(--color-text-on-warning)', icon: m.icon } as ConditionStyle,
  ])),
}

const DEFAULT_STYLE: ConditionStyle = tone('gray', '●')

// Damage-type colors (damage-types.ts) are light pastels in both themes
const DAMAGE_TEXT = 'var(--color-text-on-warning)'


export function getConditionStyle(
  conditionId: string,
  damageType?: string,
  /** Optional override for the pill background — used by class marks to color
   *  the pill with the source PC's characteristic chip color. */
  colorOverride?: string,
  /** Optional override for the pill icon — used by defender class marks
   *  (e.g. Divine Challenge) which apply the underlying `marked` condition
   *  but want their own class-specific icon. */
  iconOverride?: string,
): ConditionStyle {
  // Handle ongoing-damage-{uuid} prefix — key to damage type color if available
  if (conditionId.startsWith('ongoing-damage')) {
    if (damageType) {
      // Check for multi-type: "cold and necrotic", "fire and radiant", etc.
      const types = damageType.split(/\s+and\s+/i).map(t => t.trim().toLowerCase())
      if (types.length >= 2) {
        const dt1 = getDamageTypeStyle(types[0])
        const dt2 = getDamageTypeStyle(types[1])
        return { color: dt1.color, color2: dt2.color, textColor: DAMAGE_TEXT, icon: dt1.icon, icon2: dt2.icon }
      }
      const dtStyle = getDamageTypeStyle(damageType)
      return { color: dtStyle.color, textColor: DAMAGE_TEXT, icon: dtStyle.icon }
    }
    return CONDITION_STYLES['ongoing-damage']
  }
  const base = CONDITION_STYLES[conditionId] ?? DEFAULT_STYLE
  if (colorOverride || iconOverride) {
    return {
      ...base,
      color: colorOverride ?? base.color,
      icon: iconOverride ?? base.icon,
    }
  }
  return base
}
