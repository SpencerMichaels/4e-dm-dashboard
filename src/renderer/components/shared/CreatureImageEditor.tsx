import { useCallback, useState } from 'react'
import { useImage } from '../../hooks/use-image'
import { TokenCropOverlay, type CropRegion } from './TokenCropOverlay'
import { useRecordHome } from './record-home'

interface Props {
  imageId?: string
  tokenImageId?: string
  tokenCrop?: CropRegion
  onImageChange: (imageId: string) => void
  onTokenChange?: (tokenImageId: string, crop: CropRegion) => void
}

export function CreatureImageEditor({ imageId, tokenImageId, tokenCrop, onImageChange, onTokenChange }: Props) {
  const imageUrl = useImage(imageId)
  const tokenUrl = useImage(tokenImageId)
  const [cropping, setCropping] = useState(false)
  const home = useRecordHome()

  const handleUpload = useCallback(async () => {
    const newImageId = await window.api.image.importDialog(home)
    if (newImageId) onImageChange(newImageId)
  }, [onImageChange, home])

  const handleCropDone = useCallback(async (crop: CropRegion, tokenDataUrl: string) => {
    if (!onTokenChange) return
    // Extract base64 data from data URL
    const base64 = tokenDataUrl.split(',')[1]
    const newTokenId = await window.api.image.saveData(base64, 'png', home)
    onTokenChange(newTokenId, crop)
  }, [onTokenChange, home])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex' }}>
      {cropping && imageUrl ? (
        <div style={{ width: '100%' }}>
          <TokenCropOverlay imageUrl={imageUrl} initialCrop={tokenCrop}
            onCropChange={handleCropDone}
            onConfirm={() => setCropping(false)} />
        </div>
      ) : (
        <div
          onClick={handleUpload}
          style={{
            width: '100%', height: '100%', minHeight: 100,
            background: 'transparent', border: '2px dashed var(--border)',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative',
          }}
          title="Click to upload creature image"
        >
          {imageUrl ? (
            <img src={imageUrl} alt="Creature" style={{
              maxWidth: '100%', maxHeight: '100%',
              width: 'auto', height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }} />
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-3)', color: 'var(--muted)', fontSize: 11 }}>
              Click to upload image
            </div>
          )}

          {/* Token: overlaps the bottom-right corner of the image */}
          {imageUrl && (
            <div
              onClick={(e) => { e.stopPropagation(); if (onTokenChange) setCropping(true) }}
              title={onTokenChange ? 'Click to crop token' : 'Token'}
              style={{
                position: 'absolute', bottom: 6, right: 6,
                width: 48, height: 48, borderRadius: '50%',
                border: '2px solid var(--border)',
                overflow: 'hidden', cursor: onTokenChange ? 'pointer' : 'default',
                background: 'var(--surface-raised)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <img
                src={tokenUrl ?? imageUrl}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                alt="Token"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
