import { useState, useEffect, useRef, useCallback } from 'react'
import type { MapData, MapPin, Location } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { useUiStore } from '../../stores/ui-store'
import { useImage } from '../../hooks/use-image'
import { generateId } from '@common/utils/id'
import { confirmDelete } from '../shared/confirm-delete'

interface Props {
  mapId?: string
}

export function MapEditor({ mapId }: Props) {
  const [map, setMap] = useState<MapData | null>(null)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const mapImageRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const locationNameRef = useRef<HTMLInputElement>(null)
  // Pan/zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // Interaction state: 'idle' | 'panning' | 'dragging-pin'
  const interaction = useRef<'idle' | 'panning' | 'dragging-pin'>('idle')
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const dragPinId = useRef<string | null>(null)
  const dragMoved = useRef(false)
  const DRAG_THRESHOLD = 4
  const { saveEntity, createLocation } = useCampaignActions()
  const { setView } = useUiStore()
  const locations = useCampaignStore(s => s.locations)
  const encounters = useCampaignStore(s => s.encounters)

  const mapImageUrl = useImage(map?.imageId)

  // Load map data
  useEffect(() => {
    if (!mapId) return
    window.api.entity.get('map', mapId).then((m: MapData | null) => {
      if (m) setMap(m)
    })
  }, [mapId])

  // Load selected pin's location
  useEffect(() => {
    if (!selectedPinId || !map) { setSelectedLocation(null); return }
    const pin = map.pins.find(p => p.id === selectedPinId)
    if (!pin?.linkedEntityId) { setSelectedLocation(null); return }
    window.api.entity.get('location', pin.linkedEntityId).then((loc: Location | null) => {
      setSelectedLocation(loc)
      // Focus name field when opening sidebar for a new pin
      setTimeout(() => locationNameRef.current?.focus(), 50)
    })
  }, [selectedPinId, map])

  const saveMap = useCallback(async (updated: MapData) => {
    const toSave = { ...updated, updatedAt: new Date().toISOString() }
    setMap(toSave)
    await saveEntity('map', toSave)
  }, [saveEntity])

  const saveLocation = useCallback(async (updated: Location) => {
    const toSave = { ...updated, updatedAt: new Date().toISOString() }
    setSelectedLocation(toSave)
    await saveEntity('location', toSave)
  }, [saveEntity])

  // ── Pan/zoom/drag handlers ─────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.min(10, Math.max(0.2, z * delta)))
  }, [])

  /** Convert screen coordinates to normalized map coordinates (0–1). */
  const screenToMap = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!mapImageRef.current) return null
    const rect = mapImageRef.current.getBoundingClientRect()
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    e.preventDefault()
    dragMoved.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }

    // Check if the pointer is on a pin — if so, start dragging the pin
    const pinEl = (e.target as HTMLElement).closest('[data-pin-id]')
    if (pinEl && e.button === 0) {
      interaction.current = 'dragging-pin'
      dragPinId.current = (pinEl as HTMLElement).dataset.pinId!
    } else {
      interaction.current = 'panning'
    }
    viewportRef.current?.setPointerCapture(e.pointerId)
  }, [pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (interaction.current === 'idle') return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (!dragMoved.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    dragMoved.current = true

    if (interaction.current === 'panning') {
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy })
    } else if (interaction.current === 'dragging-pin' && map && dragPinId.current) {
      const pos = screenToMap(e.clientX, e.clientY)
      if (!pos) return
      const clamped = { x: Math.max(0, Math.min(1, pos.x)), y: Math.max(0, Math.min(1, pos.y)) }
      setMap(prev => prev ? {
        ...prev,
        pins: prev.pins.map(p => p.id === dragPinId.current ? { ...p, x: clamped.x, y: clamped.y } : p),
      } : prev)
    }
  }, [map, screenToMap])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const wasInteraction = interaction.current
    const wasDragPin = dragPinId.current
    interaction.current = 'idle'
    dragPinId.current = null
    viewportRef.current?.releasePointerCapture(e.pointerId)

    if (wasInteraction === 'dragging-pin' && dragMoved.current && map && wasDragPin) {
      // Save the pin's new position
      saveMap(map)
    }
    if (wasInteraction === 'dragging-pin' && !dragMoved.current && wasDragPin) {
      // Click (no drag) on a pin = select/deselect
      setSelectedPinId(prev => prev === wasDragPin ? null : wasDragPin)
    }
  }, [map, saveMap])

  // Double-click on empty map area to create a new pin
  const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
    if (!map) return
    if ((e.target as HTMLElement).closest('[data-pin-id]')) return
    const pos = screenToMap(e.clientX, e.clientY)
    if (!pos) return

    const loc = await createLocation('New Location')
    const pin: MapPin = {
      id: generateId(),
      x: pos.x, y: pos.y,
      label: loc.name,
      linkedEntityType: 'location',
      linkedEntityId: loc.id,
    }
    const updated = { ...map, pins: [...map.pins, pin] }
    await saveMap(updated)
    setSelectedPinId(pin.id)
  }, [map, createLocation, saveMap, screenToMap])

  // Delete a pin (and optionally its linked location)
  const handleDeletePin = useCallback(async (pinId: string) => {
    if (!map) return
    const pin = map.pins.find(p => p.id === pinId)
    const updated = { ...map, pins: map.pins.filter(p => p.id !== pinId) }
    await saveMap(updated)
    if (pin?.linkedEntityId) {
      await window.api.entity.delete('location', pin.linkedEntityId)
    }
    if (selectedPinId === pinId) {
      setSelectedPinId(null)
      setSelectedLocation(null)
    }
  }, [map, selectedPinId, saveMap])

  // Update pin label when location name changes
  const handleLocationNameChange = useCallback(async (name: string) => {
    if (!selectedLocation || !map || !selectedPinId) return
    await saveLocation({ ...selectedLocation, name })
    // Sync pin label
    const updated = {
      ...map,
      pins: map.pins.map(p => p.id === selectedPinId ? { ...p, label: name } : p),
    }
    await saveMap(updated)
  }, [selectedLocation, map, selectedPinId, saveLocation, saveMap])

  // Delete key removes selected pin
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if focus is in an input/textarea
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (selectedPinId) {
          const pin = map?.pins.find(p => p.id === selectedPinId)
          if (pin && confirmDelete(pin.label || 'this location', 'Location')) handleDeletePin(selectedPinId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedPinId, handleDeletePin])

  if (!map) {
    return <div style={{ padding: 'var(--space-4)', color: 'var(--color-text-muted)' }}>Loading map...</div>
  }

  const selectedPin = map.pins.find(p => p.id === selectedPinId)
  const sidebarOpen = !!selectedPinId

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {/* Map header: name — floats at top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-4)',
        background: 'var(--color-bg-primary)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <input
          ref={nameInputRef}
          value={map.name}
          onChange={e => saveMap({ ...map, name: e.target.value })}
          placeholder="Map name"
          style={{
            flex: 1, fontSize: 'var(--font-size-xl)', fontWeight: 700,
            background: 'transparent', border: 'none', color: 'var(--color-text-primary)',
            padding: 'var(--space-1) 0',
          }}
        />
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {map.pins.length} pin{map.pins.length !== 1 ? 's' : ''}
          {zoom !== 1 && ` · ${Math.round(zoom * 100)}%`}
        </span>
      </div>

      {/* Map viewport — fills entire area, handles pan/zoom */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={e => e.preventDefault()}
        style={{
          position: 'absolute', inset: 0,
          paddingTop: 44,  // header height
          overflow: 'hidden',
          background: 'var(--color-bg-primary)',
          cursor: interaction.current === 'panning' ? 'grabbing'
            : interaction.current === 'dragging-pin' ? 'grabbing'
            : 'grab',
        }}
      >
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div
            ref={mapImageRef}
            style={{
              position: 'relative',
              lineHeight: 0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {mapImageUrl ? (
              <img
                src={mapImageUrl}
                alt={map.name}
                draggable={false}
                style={{ maxWidth: '80vw', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <div style={{
                width: 600, height: 400,
                background: 'var(--color-bg-surface)',
                border: '2px dashed var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-muted)',
              }}>
                Loading map image...
              </div>
            )}

            {/* Pin markers — scale inversely so they stay a constant screen size */}
            {map.pins.map(pin => {
              const isSelected = pin.id === selectedPinId
              return (
                <div
                  key={pin.id}
                  data-pin-id={pin.id}
                  title={pin.label}
                  style={{
                    position: 'absolute',
                    left: `${pin.x * 100}%`,
                    top: `${pin.y * 100}%`,
                    transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                    transformOrigin: 'bottom center',
                    cursor: 'pointer',
                    fontSize: 24,
                    filter: isSelected ? 'drop-shadow(0 0 6px rgba(92,124,250,0.8))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                    transition: 'filter 0.15s',
                    zIndex: isSelected ? 10 : 1,
                  }}
                >
                  📍
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--color-text-on-dark)',
                    textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)',
                    pointerEvents: 'none',
                    marginTop: 2,
                  }}>
                    {pin.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right sidebar: floats over the map */}
      {sidebarOpen && selectedLocation && (
        <div style={{
          position: 'absolute', top: 44, right: 0, bottom: 0, zIndex: 30,
          boxShadow: '-4px 0 16px rgba(0,0,0,0.2)',
        }}>
          <LocationSidebar
            location={selectedLocation}
            locationNameRef={locationNameRef}
            encounters={encounters}
            onNameChange={handleLocationNameChange}
            onSave={saveLocation}
            onFullscreen={() => setView({ type: 'location', locationId: selectedLocation.id })}
            onNavigateEncounter={(id) => setView({ type: 'encounter', encounterId: id })}
            onShowToPlayers={() => {
              window.api.scene.set({
                mode: 'story',
                locationId: selectedLocation.id,
                backgroundImageId: selectedLocation.sceneImageId,
                title: selectedLocation.name,
              })
            }}
            onDelete={() => handleDeletePin(selectedPinId!)}
            onClose={() => setSelectedPinId(null)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Location Sidebar ───────────────────────────────────────────────────────

function LocationSidebar({ location, locationNameRef, encounters, onNameChange, onSave, onFullscreen, onNavigateEncounter, onShowToPlayers, onDelete, onClose }: {
  location: Location
  locationNameRef: React.RefObject<HTMLInputElement | null>
  encounters: { id: string; name: string }[]
  onNameChange: (name: string) => void
  onSave: (loc: Location) => void
  onFullscreen: () => void
  onNavigateEncounter: (id: string) => void
  onShowToPlayers: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const sceneImageUrl = useImage(location.sceneImageId)
  const [addingEncounter, setAddingEncounter] = useState(false)

  // Encounters linked to this location
  const linkedEncounters = (location.encounterIds ?? [])
    .map(id => encounters.find(e => e.id === id))
    .filter(Boolean) as { id: string; name: string }[]

  const unlinkedEncounters = encounters.filter(e => !(location.encounterIds ?? []).includes(e.id))

  const addEncounter = async (encounterId: string) => {
    onSave({ ...location, encounterIds: [...(location.encounterIds ?? []), encounterId] })
    const enc = encounters.find(e => e.id === encounterId)
    if (enc) await window.api.entity.save('encounter', { ...enc, locationId: location.id })
    setAddingEncounter(false)
  }

  const removeEncounter = async (encounterId: string) => {
    onSave({ ...location, encounterIds: (location.encounterIds ?? []).filter(id => id !== encounterId) })
    const enc = encounters.find(e => e.id === encounterId)
    if (enc) await window.api.entity.save('encounter', { ...enc, locationId: undefined })
  }

  const handleImageUpload = async () => {
    const imageId = await window.api.image.importDialog()
    if (imageId) onSave({ ...location, sceneImageId: imageId })
  }

  return (
    <div style={{
      width: 340, height: '100%',
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--color-border)',
      background: 'var(--color-bg-surface)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16 }}>📍</span>
        <span style={{ flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Location
        </span>
        <button onClick={onShowToPlayers} title="Show to players"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)', padding: 2 }}>
          👁
        </button>
        <button onClick={onFullscreen} title="Open fullscreen"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)', padding: 2, fontWeight: 700 }}>
          ↗
        </button>
        <button onClick={onClose} title="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--color-text-muted)', padding: 2 }}>
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* Name */}
        <input
          ref={locationNameRef}
          value={location.name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Location name"
          style={{
            fontSize: 'var(--font-size-lg)', fontWeight: 700,
            background: 'transparent', border: 'none', color: 'var(--color-text-primary)',
            padding: 0, width: '100%',
          }}
        />

        {/* Background image */}
        <div>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Background Image
          </span>
          {sceneImageUrl ? (
            <div style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <img src={sceneImageUrl} style={{ width: '100%', display: 'block', borderRadius: 'var(--radius-sm)' }} alt="" />
              <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
                <button onClick={handleImageUpload} title="Replace image"
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-overlay-bg)', color: 'var(--color-text-on-dark)', border: 'none', cursor: 'pointer' }}>
                  Replace
                </button>
                <button onClick={() => onSave({ ...location, sceneImageId: undefined })} title="Remove image"
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-overlay-bg)', color: 'var(--color-text-on-dark)', border: 'none', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button onClick={handleImageUpload}
              style={{
                width: '100%', padding: 'var(--space-3)',
                background: 'var(--color-bg-hover)', border: '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)',
              }}>
              + Add background image
            </button>
          )}
        </div>

        {/* Description / notes */}
        <div>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Notes
          </span>
          <textarea
            value={location.description}
            onChange={e => onSave({ ...location, description: e.target.value })}
            placeholder="Notes about this location..."
            rows={6}
            style={{
              width: '100%', resize: 'vertical',
              fontSize: 'var(--font-size-sm)',
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>

        {/* Encounters */}
        <div>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
            Encounters
          </span>
          {linkedEncounters.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
              {linkedEncounters.map(enc => (
                <div key={enc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  padding: 'var(--space-1) var(--space-2)',
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-sm)',
                }}>
                  <span style={{ fontSize: 12 }}>⚔️</span>
                  <button onClick={() => onNavigateEncounter(enc.id)}
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 'inherit', fontWeight: 500, padding: 0 }}>
                    {enc.name}
                  </button>
                  <button onClick={() => removeEncounter(enc.id)} title="Unlink"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 10, padding: 2 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {addingEncounter ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {unlinkedEncounters.length === 0 ? (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>No encounters available</div>
              ) : (
                unlinkedEncounters.map(enc => (
                  <button key={enc.id} onClick={() => addEncounter(enc.id)}
                    style={{
                      textAlign: 'left', padding: 'var(--space-1) var(--space-2)',
                      background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)',
                    }}>
                    ⚔️ {enc.name}
                  </button>
                ))
              )}
              <button onClick={() => setAddingEncounter(false)}
                style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--space-1)' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingEncounter(true)}
              style={{
                padding: 'var(--space-1) var(--space-2)',
                background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)',
              }}>
              + Link encounter
            </button>
          )}
        </div>

        {/* Delete pin */}
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-3)' }}>
          <button onClick={() => confirmDelete(location.name, 'Location') && onDelete()}
            style={{
              width: '100%', padding: 'var(--space-2)',
              background: 'transparent', border: '1px solid var(--color-danger)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)',
            }}>
            Delete Pin & Location
          </button>
        </div>
      </div>
    </div>
  )
}
