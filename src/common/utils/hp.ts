import type { HpDescriptor } from '../types/system-plugin'

export function resolveHpDescriptor(
  hp: number,
  maxHp: number,
  descriptors: HpDescriptor[]
): { label: string; color: string } {
  if (maxHp <= 0) return { label: 'Unknown', color: '#888' }

  const pct = (hp / maxHp) * 100

  for (const desc of descriptors) {
    if (pct >= desc.minPercent && pct < desc.maxPercent) {
      return { label: desc.label, color: desc.color }
    }
  }

  // Fallback
  if (hp <= 0) return { label: 'Down', color: '#c00' }
  return { label: 'Healthy', color: '#0a0' }
}
