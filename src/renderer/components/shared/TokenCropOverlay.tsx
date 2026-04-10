import { useState, useRef, useCallback, useEffect } from 'react'

interface CropRegion {
  x: number  // center X as fraction of image width (0-1)
  y: number  // center Y as fraction of image height (0-1)
  size: number  // diameter as fraction of image width (0-1)
}

interface Props {
  imageUrl: string
  initialCrop?: CropRegion
  onCropChange: (crop: CropRegion, tokenDataUrl: string) => void
}

const DEFAULT_CROP: CropRegion = { x: 0.5, y: 0.2, size: 0.6 }

/** Interactive circular crop overlay for creating tokens from full-body artwork */
export function TokenCropOverlay({ imageUrl, initialCrop, onCropChange }: Props) {
  const [crop, setCrop] = useState<CropRegion>(initialCrop ?? DEFAULT_CROP)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 })

  // Track rendered image dimensions
  const updateDims = useCallback(() => {
    const img = imgRef.current
    if (img) setDims({ w: img.clientWidth, h: img.clientHeight })
  }, [])

  useEffect(() => {
    window.addEventListener('resize', updateDims)
    return () => window.removeEventListener('resize', updateDims)
  }, [updateDims])

  // Generate cropped token from canvas
  const generateToken = useCallback((c: CropRegion) => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return

    const canvas = document.createElement('canvas')
    const tokenSize = 256
    canvas.width = tokenSize
    canvas.height = tokenSize
    const ctx = canvas.getContext('2d')!

    // Source rectangle in image pixel space
    const srcSize = c.size * img.naturalWidth
    const srcX = c.x * img.naturalWidth - srcSize / 2
    const srcY = c.y * img.naturalHeight - srcSize / 2

    // Clip to circle
    ctx.beginPath()
    ctx.arc(tokenSize / 2, tokenSize / 2, tokenSize / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, tokenSize, tokenSize)

    onCropChange(c, canvas.toDataURL('image/png'))
  }, [onCropChange])

  // Debounced token generation
  const genTimer = useRef<ReturnType<typeof setTimeout>>()
  const scheduleGenerate = useCallback((c: CropRegion) => {
    clearTimeout(genTimer.current)
    genTimer.current = setTimeout(() => generateToken(c), 300)
  }, [generateToken])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y }
  }, [crop])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !dims) return
      const dx = (e.clientX - dragStart.current.x) / dims.w
      const dy = (e.clientY - dragStart.current.y) / dims.h
      const next = {
        ...crop,
        x: Math.max(0, Math.min(1, dragStart.current.cropX + dx)),
        y: Math.max(0, Math.min(1, dragStart.current.cropY + dy)),
      }
      setCrop(next)
      scheduleGenerate(next)
    }
    const handleMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [crop, dims, scheduleGenerate])

  // Attach wheel listener as non-passive so we can preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.05 : -0.05
      setCrop(prev => {
        const next = { ...prev, size: Math.max(0.1, Math.min(1.5, prev.size + delta)) }
        scheduleGenerate(next)
        return next
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [scheduleGenerate])

  // Generate initial token on mount
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const onLoad = () => {
      updateDims()
      generateToken(crop)
    }
    if (img.complete) onLoad()
    else img.addEventListener('load', onLoad, { once: true })
  }, [imageUrl])

  // Compute circle position in pixels for SVG
  const cx = dims ? crop.x * dims.w : 0
  const cy = dims ? crop.y * dims.h : 0
  const r = dims ? (crop.size * dims.w) / 2 : 0

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none' }}>
      <img ref={imgRef} src={imageUrl} style={{ width: '100%', display: 'block' }} alt=""
        crossOrigin="anonymous" draggable={false} />

      {dims && (
        <>
          {/* Dimmed overlay with circle cutout */}
          <svg style={{ position: 'absolute', inset: 0, width: dims.w, height: dims.h, pointerEvents: 'none' }}>
            <defs>
              <mask id="crop-mask">
                <rect width={dims.w} height={dims.h} fill="white" />
                <circle cx={cx} cy={cy} r={r} fill="black" />
              </mask>
            </defs>
            <rect width={dims.w} height={dims.h} fill="rgba(0,0,0,0.5)" mask="url(#crop-mask)" />
            <circle cx={cx} cy={cy} r={r}
              fill="none" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
          </svg>

          {/* Drag handle */}
          <div onMouseDown={handleMouseDown} style={{
            position: 'absolute',
            left: cx - r, top: cy - r,
            width: r * 2, height: r * 2,
            borderRadius: '50%', cursor: 'grab',
          }} />
        </>
      )}
    </div>
  )
}
