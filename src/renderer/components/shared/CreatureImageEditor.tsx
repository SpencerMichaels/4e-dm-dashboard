import { useCallback, useState } from 'react'
import { useImage } from '../../hooks/use-image'
import { TokenCropOverlay } from './TokenCropOverlay'

interface Props {
  imageId?: string
  tokenImageId?: string
  onImageChange: (imageId: string) => void
  onTokenChange?: (tokenImageId: string) => void
}

export function CreatureImageEditor({ imageId, tokenImageId, onImageChange, onTokenChange }: Props) {
  const imageUrl = useImage(imageId)
  const tokenUrl = useImage(tokenImageId)
  const [cropping, setCropping] = useState(false)

  const handleUpload = useCallback(async () => {
    const newImageId = await window.api.image.importDialog()
    if (newImageId) onImageChange(newImageId)
  }, [onImageChange])

  const handleCropDone = useCallback(async (_crop: any, tokenDataUrl: string) => {
    if (!onTokenChange) return
    // Extract base64 data from data URL
    const base64 = tokenDataUrl.split(',')[1]
    const newTokenId = await window.api.image.saveData(base64, 'png')
    onTokenChange(newTokenId)
  }, [onTokenChange])

  return (
    <div style={{ position: 'relative', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
      {cropping && imageUrl ? (
        <div style={{ width: '100%', maxWidth: 280 }}>
          <TokenCropOverlay imageUrl={imageUrl} onCropChange={handleCropDone} />
          <button onClick={() => setCropping(false)} style={{
            marginTop: 'var(--space-2)', padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-accent)', color: 'var(--color-accent-text)',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontSize: 'var(--font-size-xs)', fontWeight: 600,
          }}>Done</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
          {/* Full-body image */}
          <div
            onClick={handleUpload}
            style={{
              width: '100%', maxWidth: 200, height: imageUrl ? 'auto' : 80,
              background: 'var(--color-bg-surface)', border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', position: 'relative',
            }}
            title="Click to upload creature image"
          >
            {imageUrl ? (
              <img src={imageUrl} style={{ width: '100%', display: 'block' }} alt="Creature" />
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: 11 }}>
                Click to upload image
              </div>
            )}
          </div>

          {/* Token preview + crop button */}
          {imageUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
              <div
                onClick={() => onTokenChange && setCropping(true)}
                title="Click to crop token"
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: '2px solid var(--color-border)',
                  overflow: 'hidden', cursor: onTokenChange ? 'pointer' : 'default',
                  background: 'var(--color-bg-surface)',
                }}
              >
                <img
                  src={tokenUrl ?? imageUrl}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  alt="Token"
                />
              </div>
              {onTokenChange && (
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  onClick={() => setCropping(true)}>
                  crop
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
