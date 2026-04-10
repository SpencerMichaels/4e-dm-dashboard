import { useImage } from '../../hooks/use-image'

interface Props {
  name: string
  imageId?: string
  tokenImageId?: string
  hp: number
  maxHp: number
  isDead?: boolean
  size?: number
  hideHpRing?: boolean       // When true, no HP pie slice — use solidRingColor for the ring
  solidRingColor?: string    // Solid ring color (used with hideHpRing)
}

export function CombatToken({ name, imageId, tokenImageId, hp, maxHp, isDead, size = 36, hideHpRing, solidRingColor }: Props) {
  const tokenUrl = useImage(tokenImageId ?? imageId)
  const ringWidth = 2
  const hpPct = maxHp > 0 ? (hp / maxHp) * 100 : 0
  const hpColor = isDead ? '#555' : hpPct > 50 ? '#0a0' : hpPct > 25 ? '#c90' : '#c00'
  const hpAngle = isDead ? 0 : (hpPct / 100) * 360

  // Deterministic color from name
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  const bgColor = `hsl(${hue}, 40%, 35%)`
  const initial = name.charAt(0).toUpperCase()

  const ringBg = isDead ? '#333'
    : hideHpRing ? (solidRingColor ?? 'rgba(128,128,128,0.5)')
    : `conic-gradient(${hpColor} ${hpAngle}deg, rgba(128,128,128,0.3) ${hpAngle}deg)`

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: ringBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: size - ringWidth * 2, height: size - ringWidth * 2, borderRadius: '50%',
        background: bgColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: size * 0.4, fontWeight: 700,
        overflow: 'hidden',
      }}>
        {tokenUrl ? (
          <img src={tokenUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          isDead ? '✕' : initial
        )}
      </div>
    </div>
  )
}
