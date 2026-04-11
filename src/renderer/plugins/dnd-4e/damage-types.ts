/** D&D 4e damage type colors and icons — shared across the 4e plugin */

export interface DamageTypeStyle {
  color: string
  icon: string
}

export const DAMAGE_TYPE_STYLES: Record<string, DamageTypeStyle> = {
  'acid':      { color: '#b8cc85', icon: '🧪' },
  'cold':      { color: '#9fd0e3', icon: '❄' },
  'fire':      { color: '#dc9494', icon: '🔥' },
  'force':     { color: '#caa8de', icon: '✦' },
  'lightning': { color: '#dccd8e', icon: '⚡' },
  'necrotic':  { color: '#a88ab8', icon: '💀' },
  'poison':    { color: '#9fcfa8', icon: '☠' },
  'psychic':   { color: '#dca5c1', icon: '🧠' },
  'radiant':   { color: '#dcc592', icon: '☀' },
  'thunder':   { color: '#a8aedc', icon: '💥' },
}

const DEFAULT_STYLE: DamageTypeStyle = { color: '#d489a0', icon: '🔄' }

export function getDamageTypeStyle(type: string): DamageTypeStyle {
  return DAMAGE_TYPE_STYLES[type.toLowerCase()] ?? DEFAULT_STYLE
}

export const DAMAGE_TYPE_NAMES = Object.keys(DAMAGE_TYPE_STYLES)
