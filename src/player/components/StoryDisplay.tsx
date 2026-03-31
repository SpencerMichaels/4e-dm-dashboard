import type { SceneState } from '@common/types'

interface Props {
  scene: SceneState
}

export function StoryDisplay({ scene }: Props) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#111',
      color: '#eee',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background image placeholder — imageId loading is v2 */}

      <h1 style={{
        fontSize: '4rem',
        fontWeight: 700,
        textAlign: 'center',
        textShadow: '0 2px 20px rgba(0,0,0,0.8)',
        zIndex: 1,
      }}>
        {scene.title || 'Tabletop Dashboard'}
      </h1>
    </div>
  )
}
