import { useState, useEffect } from 'react'

const imageCache = new Map<string, string>()

/** Load a campaign image by imageId, returning a data URL. Caches results. */
export function useImage(imageId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(imageId ? imageCache.get(imageId) ?? null : null)

  useEffect(() => {
    if (!imageId) { setUrl(null); return }
    if (imageCache.has(imageId)) { setUrl(imageCache.get(imageId)!); return }

    let cancelled = false
    window.api.image.get(imageId).then(dataUrl => {
      if (cancelled || !dataUrl) return
      imageCache.set(imageId, dataUrl)
      setUrl(dataUrl)
    })
    return () => { cancelled = true }
  }, [imageId])

  return url
}
