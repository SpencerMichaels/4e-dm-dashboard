/** D&D 4e damage type colors and icons — shared across the 4e plugin */

export interface DamageTypeStyle {
  color: string
  icon: string // Lucide icon name, drawn with <Glyph>
}

export const DAMAGE_TYPE_STYLES: Record<string, DamageTypeStyle> = {
  'acid':      { color: '#b8cc85', icon: 'flask-conical' },
  'cold':      { color: '#9fd0e3', icon: 'snowflake' },
  'fire':      { color: '#dc9494', icon: 'flame' },
  'force':     { color: '#caa8de', icon: 'sparkles' },
  'lightning': { color: '#dccd8e', icon: 'zap' },
  'necrotic':  { color: '#a88ab8', icon: 'bone' },
  'poison':    { color: '#9fcfa8', icon: 'biohazard' },
  'psychic':   { color: '#dca5c1', icon: 'brain' },
  'radiant':   { color: '#dcc592', icon: 'sun' },
  'thunder':   { color: '#a8aedc', icon: 'audio-waveform' },
}

const DEFAULT_STYLE: DamageTypeStyle = { color: '#d489a0', icon: 'repeat' }

export function getDamageTypeStyle(type: string): DamageTypeStyle {
  return DAMAGE_TYPE_STYLES[type.toLowerCase()] ?? DEFAULT_STYLE
}

export const DAMAGE_TYPE_NAMES = Object.keys(DAMAGE_TYPE_STYLES)
