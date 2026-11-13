import type { SceneState } from '@common/types'
import { useImage } from '@renderer/hooks/use-image'

interface Props {
  scene: SceneState
}

export function StoryDisplay({ scene }: Props) {
  const bgUrl = useImage(scene.backgroundImageId)

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--background)',
      color: 'var(--text)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {bgUrl && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${bgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} />
      )}

      {scene.title && (
        <h1 style={{
          fontSize: '4rem',
          fontWeight: 700,
          textAlign: 'center',
          textShadow: '0 2px 20px var(--player-text-shadow)',
          zIndex: 1,
        }}>
          {scene.title}
        </h1>
      )}
    </div>
  )
}
