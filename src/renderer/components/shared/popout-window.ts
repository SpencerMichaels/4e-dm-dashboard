// A real OS window for a floating panel. The DM window opens a blank child window (main allows
// `popout:` frame names, see src/main/windows.ts) and React renders the panel into it through a portal,
// so it shares this window's stores, handlers, and window.api. Styles and the theme are copied over,
// unhandled keys are forwarded so global hotkeys keep working, and the window's bounds are remembered.

import { useEffect, useRef, useState } from 'react'

const boundsKey = (key: string) => `popout-bounds:${key}`

interface Bounds { left: number; top: number; width: number; height: number }

function savedBounds(key: string): Bounds | undefined {
  try {
    const b = JSON.parse(localStorage.getItem(boundsKey(key)) ?? 'null')
    return b && [b.left, b.top, b.width, b.height].every(Number.isFinite) ? b : undefined
  } catch { return undefined }
}

function saveBounds(key: string, w: Window) {
  try {
    localStorage.setItem(boundsKey(key), JSON.stringify({ left: w.screenX, top: w.screenY, width: w.innerWidth, height: w.innerHeight }))
  } catch { /* convenience only */ }
}

/** Copies stylesheets (and later ones: Vite injects styles in dev) and the theme attribute into the child. */
function mirrorDocument(child: Document): () => void {
  const copy = (node: Node) => {
    if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === 'stylesheet')) {
      child.head.appendChild(child.importNode(node, true))
    }
  }
  document.head.childNodes.forEach(copy)
  const headObserver = new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(copy)))
  headObserver.observe(document.head, { childList: true })

  const syncTheme = () => {
    const theme = document.documentElement.getAttribute('data-theme')
    if (theme) child.documentElement.setAttribute('data-theme', theme)
    else child.documentElement.removeAttribute('data-theme')
  }
  syncTheme()
  const themeObserver = new MutationObserver(syncTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => { headObserver.disconnect(); themeObserver.disconnect() }
}

/** Keys the popout's own elements didn't handle go to the DM window, where the hotkeys listen. */
function forwardKeys(child: Window): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && e.key !== 'Escape') return
    const forwarded = new KeyboardEvent('keydown', {
      key: e.key, code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
      repeat: e.repeat, bubbles: true, cancelable: true,
    })
    window.dispatchEvent(forwarded)
    if (forwarded.defaultPrevented) e.preventDefault()
  }
  child.addEventListener('keydown', onKey)
  return () => child.removeEventListener('keydown', onKey)
}

/**
 * While `open`, keeps an OS window for `key` and returns the element to portal into (null until ready).
 * `onClosed` runs when the DM closes the window (not when `open` turns false).
 */
export function usePopoutWindow(key: string, open: boolean, opts: { title: string; width?: number; height?: number; onClosed: () => void; boundsKey?: string }): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const { title, width = 420, height = 600, onClosed } = opts
  // Several windows of one sort (stat blocks) share where the last one was.
  const place = opts.boundsKey ?? key
  // The latest callback: the window outlives renders.
  const closedRef = useRef(onClosed)
  closedRef.current = onClosed

  useEffect(() => {
    if (!open) return
    const b = savedBounds(place) ?? { left: window.screenX + 80, top: window.screenY + 80, width, height }
    const child = window.open('', `popout:${key}`, `popup,left=${b.left},top=${b.top},width=${b.width},height=${b.height}`)
    if (!child) { closedRef.current(); return }
    const doc = child.document
    doc.title = title
    doc.body.replaceChildren()
    doc.body.style.margin = '0'
    doc.body.className = 'popout-window'
    const root = doc.createElement('div')
    root.style.cssText = 'height: 100vh; overflow: auto;'
    doc.body.appendChild(root)
    const stopMirror = mirrorDocument(doc)
    const stopKeys = forwardKeys(child)

    let closing = false
    const onUnload = () => {
      saveBounds(place, child)
      if (!closing) closedRef.current()
    }
    child.addEventListener('pagehide', onUnload)
    // The DM window going away closes its popouts.
    const closeChild = () => child.close()
    window.addEventListener('beforeunload', closeChild)
    setContainer(root)

    return () => {
      closing = true
      setContainer(null)
      stopMirror()
      stopKeys()
      window.removeEventListener('beforeunload', closeChild)
      if (!child.closed) { saveBounds(place, child); child.close() }
    }
    // Title changes are applied below without reopening the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open])

  useEffect(() => {
    if (container) container.ownerDocument.title = title
  }, [container, title])

  return container
}
