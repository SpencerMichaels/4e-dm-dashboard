import { useEffect } from 'react'
import { initSyncListeners } from '../stores/sync-middleware'

export function useIpcSync(): void {
  useEffect(() => {
    const cleanup = initSyncListeners()
    return cleanup
  }, [])
}
