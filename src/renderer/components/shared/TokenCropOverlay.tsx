import { useState, useRef, useCallback, useEffect } from 'react'

export interface CropRegion {
  x: number  // center X as fraction of image width (0-1)
  y: number  // center Y as fraction of image height (0-1)
  size: number  // diameter as fraction of image width (0-1)
}

interface Props {
  imageUrl: string
  initialCrop?: CropRegion
  onCropChange: (crop: CropRegion, tokenDataUrl: string) => void
  onConfirm?: () => void
}

const DEFAULT_CROP: CropRegion = { x: 0.5, y: 0.2, size: 0.6 }

// The cropper sizes itself to fill its parent's width. The token circle takes
// most of that space; a small dimmed margin shows surrounding image context.
const CIRCLE_RATIO = 0.85  // circle diameter as a fraction of container size

/** Interactive circular token cropper.
 *  The token circle is fixed in the center; the image translates/zooms beneath it.
 */
export function TokenCropOverlay({ imageUrl, initialCrop, onCropChange, onConfirm }: Props) {
  const [crop, setCrop] = useState<CropRegion>(initialCrop ?? DEFAULT_CROP)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [containerSize, setContainerSize] = useState<number>(200)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragging = useRef(false)
  const moved = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 })

  // Measure available width via ResizeObserver
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w > 0) setContainerSize(Math.max(120, w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const circleDiameter = Math.floor(containerSize * CIRCLE_RATIO)
  const circleCenter = containerSize / 2

  // Image is sized so the cropped square spans the circle diameter exactly.
  // Width (in screen px) = circleDiameter / crop.size, Height = width * aspectRatio.
  const aspect = natural ? natural.h / natural.w : 1
  const dispW = circleDiameter / crop.size
  const dispH = dispW * aspect
  // Position: the crop center maps to the circle center in container coords.
  const imgLeft = circleCenter - crop.x * dispW
  const imgTop = circleCenter - crop.y * dispH

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
    genTimer.current = setTimeout(() => generateToken(c), 200)
  }, [generateToken])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    moved.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y }
  }, [crop])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true
      const next = {
        ...crop,
        // Dragging right moves the image right under a fixed circle, which is
        // equivalent to moving the crop window left → decrease crop.x
        x: Math.max(0, Math.min(1, dragStart.current.cropX - dx / dispW)),
        y: Math.max(0, Math.min(1, dragStart.current.cropY - dy / dispH)),
      }
      setCrop(next)
      scheduleGenerate(next)
    }
    const handleMouseUp = () => {
      const wasDragging = dragging.current
      dragging.current = false
      // A click without drag confirms the current token and exits the cropper
      if (wasDragging && !moved.current && onConfirm) onConfirm()
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [crop, dispW, dispH, scheduleGenerate, onConfirm])

  // Esc also confirms (no destructive option since changes auto-save)
  useEffect(() => {
    if (!onConfirm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onConfirm() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm])

  // Wheel: scroll up zooms in (smaller crop.size), scroll down zooms out
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.06 : 1 / 1.06  // multiplicative for smooth zoom
      setCrop(prev => {
        const next = { ...prev, size: Math.max(0.05, Math.min(1.5, prev.size * factor)) }
        scheduleGenerate(next)
        return next
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [scheduleGenerate])

  // Track natural dimensions on load + initial token generation
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const onLoad = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      generateToken(crop)
    }
    if (img.complete && img.naturalWidth > 0) onLoad()
    else img.addEventListener('load', onLoad, { once: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl])

  return (
    <div ref={wrapperRef} style={{ width: '100%' }}>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        style={{
          position: 'relative',
          width: containerSize, height: containerSize,
          overflow: 'hidden',
          userSelect: 'none',
          cursor: dragging.current ? 'grabbing' : 'grab',
          background: 'var(--surface-raised)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          style={{
            position: 'absolute',
            left: imgLeft, top: imgTop,
            width: dispW, height: dispH,
            maxWidth: 'none', maxHeight: 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Dim everything outside the token circle, draw the circle outline */}
        <svg style={{ position: 'absolute', inset: 0, width: containerSize, height: containerSize, pointerEvents: 'none' }}>
          <defs>
            <mask id="crop-mask">
              <rect width={containerSize} height={containerSize} fill="white" />
              <circle cx={circleCenter} cy={circleCenter} r={circleDiameter / 2} fill="black" />
            </mask>
          </defs>
          <rect width={containerSize} height={containerSize} style={{ fill: 'var(--overlay)' }} mask="url(#crop-mask)" />
          <circle cx={circleCenter} cy={circleCenter} r={circleDiameter / 2}
            fill="none" style={{ stroke: 'var(--on-dark)' }} strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      </div>
      <div style={{
        marginTop: 4, textAlign: 'center',
        fontSize: 10, color: 'var(--muted)', fontStyle: 'italic',
      }}>
        drag to position · scroll to zoom · click to set token
      </div>
    </div>
  )
}
