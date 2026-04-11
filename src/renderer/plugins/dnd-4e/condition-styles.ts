/** Visual styling for D&D 4e conditions — colors and icons for pills/badges */
import { getDamageTypeStyle } from './damage-types'

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
  'dying':             { color: '#c08585', textColor: '#1a1a1a', icon: '💀' },
  'helpless':          { color: '#bbb3a9', textColor: '#1a1a1a', icon: '🪢' },
  'immobilized':       { color: '#9bb8cc', textColor: '#1a1a1a', icon: '⛓' },
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
}

const DEFAULT_STYLE: ConditionStyle = { color: '#b5b9c0', textColor: '#1a1a1a', icon: '●' }

export function getConditionStyle(conditionId: string, damageType?: string): ConditionStyle {
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
  return CONDITION_STYLES[conditionId] ?? DEFAULT_STYLE
}
