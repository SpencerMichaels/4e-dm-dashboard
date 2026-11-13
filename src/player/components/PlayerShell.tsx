import { useEffect } from 'react'
import { usePlayerStore } from '../stores/player-store'
import { CombatDisplay } from './CombatDisplay'
import { StoryDisplay } from './StoryDisplay'
import { initThemeSync } from '../../renderer/theme'

declare global {
  interface Window {
    api: import('../../preload/player').PlayerApi
  }
}

export function PlayerShell() {
  const { combat, scene, setCombat, setScene } = usePlayerStore()

  useEffect(() => {
    const unsubs = [
      window.api.on.playerState((state) => setCombat(state)),
      window.api.on.sceneState((state) => setScene(state)),
    ]
    // The Player window follows the DM's theme preference
    unsubs.push(initThemeSync({ get: window.api.settings.get, subscribe: window.api.on.appSettings }))
    // Request current state on mount — covers race where broadcasts arrive before listeners
    window.api.requestState?.()
    return () => unsubs.forEach(fn => fn())
  }, [])

  if (combat && combat.phase !== 'ended') {
    return <CombatDisplay combat={combat} backgroundImageId={scene.backgroundImageId} />
  }

  return <StoryDisplay scene={scene} />
}
