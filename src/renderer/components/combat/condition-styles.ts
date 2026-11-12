/** Visual styling for D&D 4e conditions — colors and icons for pills/badges */
import { getDamageTypeStyle } from './damage-types'
import { CLASS_MARKS } from '../../../common/rules/class-marks'

export interface ConditionStyle {
  color: string     // background color for pill (or first color for split)
  color2?: string   // second color for split background
  textColor: string // text color (usually white or dark)
  icon: string      // single emoji/unicode icon
  icon2?: string    // second icon for multi-type
}

// Muted pastel palette — light enough that dark text reads cleanly on all of them
export const CONDITION_STYLES: Record<string, ConditionStyle> = {
  'combat-advantage':  { color: '#c4b0e4', textColor: '#1a1a1a', icon: '⚠' },
  'blinded':           { color: '#a3b8d1', textColor: '#1a1a1a', icon: '🕶' },
  'dazed':             { color: '#e0bd8c', textColor: '#1a1a1a', icon: '💫' },
  'dominated':         { color: '#caa8de', textColor: '#1a1a1a', icon: '🧠' },
  'dead':              { color: '#8a7070', textColor: '#f0f0f0', icon: '💀' },
  'dying':             { color: '#c08585', textColor: '#1a1a1a', icon: '☠' },
  'grabbed':           { color: '#c9a878', textColor: '#1a1a1a', icon: '✊' },
  'helpless':          { color: '#bbb3a9', textColor: '#1a1a1a', icon: '🪢' },
  'immobilized':       { color: '#9bb8cc', textColor: '#1a1a1a', icon: '⛓' },
  'invisible':         { color: '#d9d9e0', textColor: '#1a1a1a', icon: '👁' },
  'marked':            { color: '#dc9a9a', textColor: '#1a1a1a', icon: '🎯' },
  'petrified':         { color: '#bbb3a9', textColor: '#1a1a1a', icon: '🪨' },
  'prone':             { color: '#cba072', textColor: '#1a1a1a', icon: '⤵' },
  'restrained':        { color: '#92c0cc', textColor: '#1a1a1a', icon: '🕸' },
  'slowed':            { color: '#9fb8de', textColor: '#1a1a1a', icon: '🐌' },
  'stunned':           { color: '#dc9494', textColor: '#1a1a1a', icon: '⚡' },
  'surprised':         { color: '#d6b372', textColor: '#1a1a1a', icon: '❗' },
  'unconscious':       { color: '#a0a6ad', textColor: '#1a1a1a', icon: '😵' },
  'weakened':          { color: '#b8cc85', textColor: '#1a1a1a', icon: '📉' },
  'bloodied':          { color: '#cc7e7e', textColor: '#1a1a1a', icon: '🩸' },
  'ongoing-damage':    { color: '#d489a0', textColor: '#1a1a1a', icon: '🔄' },
  'regenerating':      { color: '#6ebe6e', textColor: '#1a1a1a', icon: '💚' },
  'reacted':           { color: '#8a7aaa', textColor: '#fff', icon: '↻' },
  // Class marks — fallback colors used when the source PC has no chip color set
  ...Object.fromEntries(CLASS_MARKS.map(m => [
    m.conditionId, { color: m.color, textColor: '#1a1a1a', icon: m.icon } as ConditionStyle,
  ])),
}

const DEFAULT_STYLE: ConditionStyle = { color: '#b5b9c0', textColor: '#1a1a1a', icon: '●' }

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
        return { color: dt1.color, color2: dt2.color, textColor: '#fff', icon: dt1.icon, icon2: dt2.icon }
      }
      const dtStyle = getDamageTypeStyle(damageType)
      return { color: dtStyle.color, textColor: '#fff', icon: dtStyle.icon }
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
