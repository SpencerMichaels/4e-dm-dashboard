/** D&D 4e damage type colors and icons — shared across the 4e plugin */

export interface DamageTypeStyle {
  color: string
  icon: string
}

export const DAMAGE_TYPE_STYLES: Record<string, DamageTypeStyle> = {
  'acid':      { color: '#65a30d', icon: '🧪' },
  'cold':      { color: '#0ea5e9', icon: '❄' },
  'fire':      { color: '#ef4444', icon: '🔥' },
  'force':     { color: '#a855f7', icon: '✦' },
  'lightning': { color: '#eab308', icon: '⚡' },
  'necrotic':  { color: '#6b21a8', icon: '💀' },
  'poison':    { color: '#22c55e', icon: '☠' },
  'psychic':   { color: '#ec4899', icon: '🧠' },
  'radiant':   { color: '#f59e0b', icon: '☀' },
  'thunder':   { color: '#6366f1', icon: '💥' },
}

const DEFAULT_STYLE: DamageTypeStyle = { color: '#be123c', icon: '🔄' }

export function getDamageTypeStyle(type: string): DamageTypeStyle {
  return DAMAGE_TYPE_STYLES[type.toLowerCase()] ?? DEFAULT_STYLE
}

export const DAMAGE_TYPE_NAMES = Object.keys(DAMAGE_TYPE_STYLES)
