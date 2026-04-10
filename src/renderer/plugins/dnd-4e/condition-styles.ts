/** Visual styling for D&D 4e conditions — colors and icons for pills/badges */
import { getDamageTypeStyle } from './damage-types'

export interface ConditionStyle {
  color: string     // background color for pill (or first color for split)
  color2?: string   // second color for split background
  textColor: string // text color (usually white or dark)
  icon: string      // single emoji/unicode icon
  icon2?: string    // second icon for multi-type
}

export const CONDITION_STYLES: Record<string, ConditionStyle> = {
  'combat-advantage':  { color: '#8b5cf6', textColor: '#fff', icon: '⚠' },
  'blinded':           { color: '#1e3a5f', textColor: '#fff', icon: '🕶' },
  'dazed':             { color: '#d97706', textColor: '#fff', icon: '💫' },
  'dominated':         { color: '#9333ea', textColor: '#fff', icon: '🧠' },
  'dying':             { color: '#450a0a', textColor: '#fff', icon: '💀' },
  'helpless':          { color: '#78716c', textColor: '#fff', icon: '🪢' },
  'immobilized':       { color: '#0369a1', textColor: '#fff', icon: '⛓' },
  'marked':            { color: '#dc2626', textColor: '#fff', icon: '🎯' },
  'petrified':         { color: '#78716c', textColor: '#fff', icon: '🪨' },
  'prone':             { color: '#92400e', textColor: '#fff', icon: '⤵' },
  'restrained':        { color: '#0e7490', textColor: '#fff', icon: '🕸' },
  'slowed':            { color: '#2563eb', textColor: '#fff', icon: '🐌' },
  'stunned':           { color: '#b91c1c', textColor: '#fff', icon: '⚡' },
  'surprised':         { color: '#a16207', textColor: '#fff', icon: '❗' },
  'unconscious':       { color: '#374151', textColor: '#fff', icon: '😵' },
  'weakened':          { color: '#65a30d', textColor: '#fff', icon: '📉' },
  'bloodied':          { color: '#991b1b', textColor: '#fff', icon: '🩸' },
  'ongoing-damage':    { color: '#be123c', textColor: '#fff', icon: '🔄' },
}

const DEFAULT_STYLE: ConditionStyle = { color: '#6b7280', textColor: '#fff', icon: '●' }

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
