/** Visual styling for D&D 4e conditions — colors and icons for pills/badges */
import { getDamageTypeStyle } from './damage-types'
import { CLASS_MARKS } from '../../../common/rules/class-marks'

export interface ConditionStyle {
  color: string     // pill background, any CSS color incl. var(--token); use withAlpha() for tints, never append hex digits
  color2?: string   // second color for split background
  textColor: string // text color (usually white or dark)
  icon: string      // Lucide icon name, drawn with <Glyph>; a custom icon may be any text
  icon2?: string    // second icon for multi-type (a Lucide name too)
}

// Pill tones from the theme (theme.css --cond-*): pastel in the light theme,
// deep in the dark theme, with --cond-text readable on all of them. Icons
// tell conditions of the same tone apart.
const tone = (name: 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'purple' | 'gray', icon: string): ConditionStyle =>
  ({ color: `var(--cond-${name})`, textColor: 'var(--cond-text)', icon })

export const CONDITION_STYLES: Record<string, ConditionStyle> = {
  'combat-advantage':  tone('purple', 'triangle-exclamation-point'),
  'blinded':           tone('blue', 'eye-off'),
  'dazed':             tone('amber', 'orbit'),
  'dominated':         tone('purple', 'brain-circuit'),
  'dead':              { color: 'var(--cond-dead)', textColor: 'var(--on-dark)', icon: 'skull' },
  'dying':             tone('red', 'heart-pulse'),
  'grabbed':           tone('orange', 'hand-grab'),
  'helpless':          tone('gray', 'shield-off'),
  'immobilized':       tone('blue', 'anchor'),
  'invisible':         tone('gray', 'ghost'),
  'marked':            tone('red', 'target'),
  'petrified':         tone('gray', 'mountain'),
  'prone':             tone('orange', 'arrow-down-to-line'),
  'restrained':        tone('blue', 'lock'),
  'slowed':            tone('blue', 'snail'),
  'stunned':           tone('red', 'zap-off'),
  'surprised':         tone('amber', 'exclamation-mark'),
  'unconscious':       tone('gray', 'bed'),
  'weakened':          tone('green', 'trending-down'),
  'bloodied':          tone('red', 'droplet'),
  'ongoing-damage':    tone('red', 'repeat'),
  'regenerating':      tone('green', 'heart-plus'),
  'reacted':           tone('purple', 'reply'),
  // Class marks — fallback colors used when the source PC has no chip color set.
  // These are mid-tone colors in both themes, so the text stays dark.
  ...Object.fromEntries(CLASS_MARKS.map(m => [
    m.conditionId, { color: m.color, textColor: 'var(--on-warning)', icon: m.icon } as ConditionStyle,
  ])),
}

const DEFAULT_STYLE: ConditionStyle = tone('gray', 'circle')

// Damage-type colors (damage-types.ts) are light pastels in both themes
const DAMAGE_TEXT = 'var(--on-warning)'


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
