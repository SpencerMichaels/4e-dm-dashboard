import { useImage } from '../../hooks/use-image'
import { tokenColorFromName } from '@common/utils/token-color'
import { hpPercentage, hpColor } from '../../utils/combat-utils'

interface Props {
  name: string
  baseName?: string          // Original creature name without color/number — token bg color derived from this
  imageId?: string
  tokenImageId?: string
  hp: number
  maxHp: number
  isDead?: boolean
  size?: number
  hideHpRing?: boolean       // When true, no HP pie slice — use solidRingColor for the ring
  solidRingColor?: string    // Solid ring color (used with hideHpRing)
  miniNumber?: number        // Numbered marker badge shown at bottom-right
}

export function CombatToken({ name, baseName, imageId, tokenImageId, hp, maxHp, isDead, size = 36, hideHpRing, solidRingColor, miniNumber }: Props) {
  const tokenUrl = useImage(tokenImageId ?? imageId)
  // Ring width scales with token size — ~6% of size, min 2px
  const ringWidth = Math.max(2, Math.round(size * 0.06))
  const hpPct = hpPercentage(hp, maxHp)
  const hpCol = isDead ? 'var(--color-hp-down)' : hpColor(hpPct)
  const hpAngle = isDead ? 0 : (hpPct / 100) * 360

  const bgColor = tokenColorFromName(baseName ?? name)
  const initial = name.charAt(0).toUpperCase()

  const ringBg = isDead ? 'var(--color-token-badge-bg)'
    : hideHpRing ? (solidRingColor ?? 'rgba(128,128,128,0.5)')
    : `conic-gradient(${hpCol} ${hpAngle}deg, rgba(128,128,128,0.3) ${hpAngle}deg)`

  const badgeSize = Math.max(12, Math.round(size * 0.38))

  return (
    <div style={{
      position: 'relative',
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: ringBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: size - ringWidth * 2, height: size - ringWidth * 2, borderRadius: '50%',
        background: bgColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text-on-dark)', fontSize: size * 0.4, fontWeight: 700,
        overflow: 'hidden',
      }}>
        {tokenUrl ? (
          <img src={tokenUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          isDead ? '✕' : initial
        )}
      </div>
      {miniNumber != null && (
        <div style={{
          position: 'absolute', bottom: -1, right: -1,
          width: badgeSize, height: badgeSize, borderRadius: '50%',
          background: 'var(--color-token-badge-bg)', border: '1.5px solid var(--color-token-badge-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-on-dark)', fontSize: badgeSize * 0.65, fontWeight: 700,
          lineHeight: 1,
        }}>
          {miniNumber}
        </div>
      )}
    </div>
  )
}
