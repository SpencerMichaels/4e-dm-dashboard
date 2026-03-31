import { useEffect } from 'react'

type KeyHandler = (e: KeyboardEvent) => void

interface HotkeyDef {
  key: string           // e.g. 'k', 'Enter', 'Escape'
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  handler: KeyHandler
}

export function useHotkeys(hotkeys: HotkeyDef[]): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Only allow Escape to pass through
        if (e.key !== 'Escape') return
      }

      for (const hk of hotkeys) {
        const ctrlMatch = hk.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey)
        const shiftMatch = hk.shift ? e.shiftKey : !e.shiftKey
        const altMatch = hk.alt ? e.altKey : !e.altKey

        if (e.key === hk.key && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault()
          hk.handler(e)
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hotkeys])
}
