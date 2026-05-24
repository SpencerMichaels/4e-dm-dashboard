import { useState, useEffect, useRef, useCallback } from 'react'
import type { CombatState, CombatantState } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { generateId } from '@common/utils/id'
import { rollD20 } from '@common/utils/dice'
import { CombatToken } from './CombatToken'

interface Props {
  combat: CombatState
}

const MINI_COLORS = [
  { name: 'Red', value: '#e03131' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#2f9e44' },
  { name: 'Yellow', value: '#f59f00' },
  { name: 'Purple', value: '#9c36b5' },
  { name: 'Orange', value: '#e8590c' },
  { name: 'White', value: '#e0e0e0' },
  { name: 'Black', value: '#333333' },
]

/** Derive a human-readable color name from a hex value. Preset colors use
 *  their known name; custom colors map by hue/lightness. */
function colorNameFromHex(hex: string): string {
  const preset = MINI_COLORS.find(c => c.value.toLowerCase() === hex.toLowerCase())
  if (preset) return preset.name
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (l > 0.85) return 'White'
  if (l < 0.15) return 'Black'
  let h = 0
  if (max !== min) {
    const d = max - min
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  if (h < 15 || h >= 345) return 'Red'
  if (h < 45) return 'Orange'
  if (h < 70) return 'Yellow'
  if (h < 160) return 'Green'
  if (h < 200) return 'Cyan'
  if (h < 260) return 'Blue'
  if (h < 300) return 'Purple'
  return 'Pink'
}

/** Build the display name for a monster: "Blue Goblin 3 (bow)", "Goblin 1", "Red Goblin", or just "Goblin". */
function buildMonsterDisplayName(baseName: string, color?: string, miniNumber?: number, descriptor?: string): string {
  const colorWord = color ? colorNameFromHex(color) : ''
  let name = colorWord ? `${colorWord} ${baseName}` : baseName
  if (miniNumber != null) name += ` ${miniNumber}`
  if (descriptor) name += ` (${descriptor})`
  return name
}

export function InitiativeEntry({ combat }: Props) {
  const playerCharacters = useCampaignStore((s) => s.playerCharacters)
  const [groupInitiative, setGroupInitiative] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [surpriseEnabled, setSurpriseEnabled] = useState(false)
  const [surpriseActorIds, setSurpriseActorIds] = useState<Set<string>>(new Set())
  const toggleSurpriseActor = (...ids: string[]) => {
    setSurpriseActorIds(prev => {
      const next = new Set(prev)
      // If all given ids are already actors, remove them all; otherwise add them all
      const allPresent = ids.every(id => next.has(id))
      for (const id of ids) { allPresent ? next.delete(id) : next.add(id) }
      return next
    })
  }
  const [recentColors, setRecentColors] = useState<string[]>([])
  const addRecentColor = (hex: string) => {
    setRecentColors(prev => {
      const filtered = prev.filter(c => c !== hex)
      return [hex, ...filtered].slice(0, 4)
    })
  }

  // Sort combatants: PCs first (alphabetical), then monsters (alphabetical)
  const sortedIds = Object.keys(combat.combatants).sort((a, b) => {
    const ca = combat.combatants[a], cb = combat.combatants[b]
    if (ca.isPC !== cb.isPC) return ca.isPC ? -1 : 1
    // Sort by baseName (original name) so assigning colors/numbers doesn't reorder the list
    return (ca.baseName ?? ca.name).localeCompare(cb.baseName ?? cb.name)
  })

  const pcIds = sortedIds.filter(id => combat.combatants[id].isPC)
  const monsterIds = sortedIds.filter(id => !combat.combatants[id].isPC)

  // Build monster groups from initiativeGroupId
  type MonsterGroup = { groupId: string | null; baseName: string; memberIds: string[] }
  const monsterGroups: MonsterGroup[] = []
  const seenGroups = new Map<string, number>()
  for (const id of monsterIds) {
    const c = combat.combatants[id]
    const gid = c.initiativeGroupId
    if (gid && seenGroups.has(gid)) {
      monsterGroups[seenGroups.get(gid)!].memberIds.push(id)
    } else {
      const idx = monsterGroups.length
      if (gid) seenGroups.set(gid, idx)
      monsterGroups.push({ groupId: gid ?? null, baseName: c.baseName ?? c.name, memberIds: [id] })
    }
  }

  // ── Phase 1: PC initiative entry ──
  // Track which PC we're currently prompting
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [pcIndex, setPcIndex] = useState(0)
  const allPcsDone = pcIds.every(id => combat.combatants[id].initiative != null)
  const currentPcId = !allPcsDone ? pcIds[pcIndex] : null

  // Broadcast focus to player display during PC entry
  useEffect(() => {
    if (currentPcId) window.api.combat.setInitiativeFocus(currentPcId)
    else if (allPcsDone) window.api.combat.setInitiativeFocus(null)
  }, [currentPcId, allPcsDone])

  // Auto-focus the input when current PC changes
  useEffect(() => {
    setInputValue('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [pcIndex])

  const handlePcSubmit = useCallback(async () => {
    if (!currentPcId || !inputValue.trim()) return
    const num = Number(inputValue)
    if (isNaN(num)) return
    await window.api.combat.setInitiative(currentPcId, num)
    setPcIndex(prev => prev + 1)
  }, [currentPcId, inputValue])

  const handlePcKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      handlePcSubmit()
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      if (pcIndex > 0) setPcIndex(pcIndex - 1)
    }
  }

  // ── Phase 2: Staging (after all PCs have initiatives) ──
  const handleStartCombat = useCallback(async () => {
    if (groupInitiative) {
      // Roll once per group, apply to all members
      for (const group of monsterGroups) {
        const first = combat.combatants[group.memberIds[0]]
        if (first?.initiative != null) continue // already has initiative (manually entered)
        const bonus = (first?.statBlock?.initiative as number) ?? 0
        const roll = rollD20() + bonus
        for (const id of group.memberIds) {
          await window.api.combat.setInitiative(id, roll)
        }
      }
    } else {
      // Roll individually for each creature without initiative
      for (const id of monsterIds) {
        const c = combat.combatants[id]
        if (c.initiative == null) {
          const bonus = (c.statBlock?.initiative as number) ?? 0
          await window.api.combat.setInitiative(id, rollD20() + bonus)
        }
      }
    }
    // Also roll for any PCs missing initiative (shouldn't happen, but safe)
    for (const id of pcIds) {
      if (combat.combatants[id].initiative == null) {
        await window.api.combat.setInitiative(id, rollD20())
      }
    }
    if (surpriseEnabled && surpriseActorIds.size > 0) {
      await window.api.combat.setSurprise(true, [...surpriseActorIds])
    }
    await window.api.combat.start()
  }, [sortedIds, combat.combatants, groupInitiative, monsterGroups, monsterIds, pcIds, surpriseEnabled, surpriseActorIds])

  // Auto-add all active PCs that aren't already in combat
  const addedPcIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const presentEntityIds = new Set(
      Object.values(combat.combatants).map(c => c.entityId).filter(Boolean) as string[]
    )
    for (const id of [...addedPcIdsRef.current]) {
      if (presentEntityIds.has(id)) addedPcIdsRef.current.delete(id)
    }
    const missing = playerCharacters.filter(
      (pc) => pc.active !== false
        && !presentEntityIds.has(pc.id)
        && !addedPcIdsRef.current.has(pc.id)
    )
    if (missing.length === 0) return
    for (const pc of missing) addedPcIdsRef.current.add(pc.id)
    ;(async () => {
      for (const pc of missing) {
        await window.api.combat.addCombatant({
          id: generateId(),
          name: pc.name,
          isPC: true,
          playerName: pc.playerName,
          hp: 0,
          maxHp: 0,
          imageId: pc.imageId,
          tokenImageId: pc.tokenImageId,
          color: pc.color,
          entityId: pc.id,
        })
      }
    })()
  }, [playerCharacters, combat.combatants])

  const sectionHeader = (text: string, extra?: string) => (
    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0 2px', marginTop: 8 }}>
      {text}{extra && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> {extra}</span>}
    </div>
  )

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', margin: 0 }}>
          {allPcsDone ? 'Prepare for Combat' : 'Roll Initiative'}
        </h1>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={surpriseEnabled} onChange={e => {
            setSurpriseEnabled(e.target.checked)
            if (!e.target.checked) setSurpriseActorIds(new Set())
          }} />
          Surprise round
        </label>
      </div>

      {sortedIds.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No combatants yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* ── PCs ── */}
          {pcIds.length > 0 && sectionHeader('Players')}
          {pcIds.map((id, idx) => {
            const c = combat.combatants[id]
            const isCurrent = !allPcsDone && idx === pcIndex
            const isDone = c.initiative != null
            return (
              <CombatantRow key={id} c={c} isCurrent={isCurrent} isDone={isDone} isStaging={allPcsDone}
                leading={surpriseEnabled ? (
                  <input type="checkbox" checked={surpriseActorIds.has(id)} onChange={() => toggleSurpriseActor(id)}
                    title="Acts in surprise round" />
                ) : undefined}>
                {isCurrent ? (
                  <input
                    ref={inputRef}
                    type="number"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handlePcKeyDown}
                    placeholder="Init"
                    style={{
                      width: 60, textAlign: 'center', padding: '2px 4px',
                      borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.15)', color: 'inherit',
                      fontSize: 'var(--font-size-base)', fontWeight: 600,
                    }}
                  />
                ) : isDone ? (
                  <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    {c.initiative}
                  </span>
                ) : (
                  <span style={{ minWidth: 30, textAlign: 'center', color: 'var(--color-text-muted)' }}>—</span>
                )}
              </CombatantRow>
            )
          })}

          {/* ── Monsters ── */}
          {monsterIds.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 8 }}>
              {sectionHeader('Monsters', `(${monsterIds.length})`)}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={groupInitiative} onChange={e => setGroupInitiative(e.target.checked)} />
                Group initiative
              </label>
            </div>
          )}
          {groupInitiative ? (
            /* ── Grouped display ── */
            monsterGroups.map(group => {
              const isMulti = group.memberIds.length > 1
              const expanded = expandedGroups.has(group.groupId ?? '')
              const firstC = combat.combatants[group.memberIds[0]]
              const allHidden = group.memberIds.every(id => combat.combatants[id].hidden)

              const setGroupInitiativeValue = async (val: number) => {
                for (const id of group.memberIds) {
                  await window.api.combat.setInitiative(id, val)
                }
              }

              const toggleGroupHidden = () => {
                const newHidden = !allHidden
                for (const id of group.memberIds) {
                  window.api.combat.updateCombatant(id, { hidden: newHidden })
                }
              }

              return (
                <div key={group.groupId ?? group.memberIds[0]}>
                  {/* Group header row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    opacity: allHidden ? 0.4 : 1,
                  }}>
                    {surpriseEnabled && (
                      <input type="checkbox"
                        checked={group.memberIds.every(id => surpriseActorIds.has(id))}
                        onChange={() => toggleSurpriseActor(...group.memberIds)}
                        title="Acts in surprise round" />
                    )}
                    {/* Expand/collapse for multi-member groups */}
                    {isMulti && (
                      <button onClick={() => setExpandedGroups(prev => {
                        const next = new Set(prev)
                        const key = group.groupId ?? ''
                        next.has(key) ? next.delete(key) : next.add(key)
                        return next
                      })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {expanded ? '▼' : '▶'}
                      </button>
                    )}
                    <CombatToken name={firstC.name} imageId={firstC.imageId} tokenImageId={firstC.tokenImageId}
                      hp={firstC.hp} maxHp={firstC.maxHp} size={24}
                      hideHpRing={!!firstC.color} solidRingColor={firstC.color} />
                    <span style={{ flex: 1, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {group.baseName}
                      {isMulti && <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>×{group.memberIds.length}</span>}
                      {allHidden && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 4 }}>(hidden)</span>}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={toggleGroupHidden}
                        title={allHidden ? 'Hidden — click to reveal all' : 'Visible — click to hide all'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 14, opacity: allHidden ? 0.4 : 0.8 }}>
                        {allHidden ? '🚫' : '👁'}
                      </button>
                      <input
                        type="number"
                        value={firstC.initiative ?? ''}
                        onChange={e => {
                          const v = e.target.value ? Number(e.target.value) : undefined
                          if (v != null && !isNaN(v)) setGroupInitiativeValue(v)
                        }}
                        placeholder="auto"
                        style={{
                          width: 48, textAlign: 'center', padding: '1px 2px',
                          fontSize: 'var(--font-size-xs)', borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Expanded: individual creature sub-rows for color/number */}
                  {expanded && group.memberIds.map(id => {
                    const c = combat.combatants[id]
                    return (
                      <div key={id} style={{ marginLeft: 24 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                          padding: '2px var(--space-3)',
                          borderLeft: '2px solid var(--color-border)',
                          opacity: c.hidden ? 0.4 : 1,
                        }}>
                          <CombatToken name={c.name} imageId={c.imageId} tokenImageId={c.tokenImageId}
                            hp={c.hp} maxHp={c.maxHp} size={20}
                            hideHpRing={!!c.color} solidRingColor={c.color} miniNumber={c.miniNumber} />
                          <span style={{ flex: 1, fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name}
                          </span>
                          <button onClick={() => window.api.combat.updateCombatant(id, { hidden: !c.hidden })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 12, opacity: c.hidden ? 0.4 : 0.8 }}>
                            {c.hidden ? '🚫' : '👁'}
                          </button>
                        </div>
                        <MonsterIdentityRow combatantId={id} combatant={c} recentColors={recentColors} onCustomColor={addRecentColor} />
                      </div>
                    )
                  })}

                  {/* For single-member groups, show identity row directly */}
                  {!isMulti && (
                    <MonsterIdentityRow combatantId={group.memberIds[0]} combatant={firstC} recentColors={recentColors} onCustomColor={addRecentColor} />
                  )}
                </div>
              )
            })
          ) : (
            /* ── Ungrouped display (original behavior) ── */
            monsterIds.map(id => {
              const c = combat.combatants[id]
              return (
                <div key={id}>
                  <CombatantRow c={c} isCurrent={false} isDone={c.initiative != null} isStaging={true} isHidden={c.hidden}
                    leading={surpriseEnabled ? (
                      <input type="checkbox" checked={surpriseActorIds.has(id)} onChange={() => toggleSurpriseActor(id)}
                        title="Acts in surprise round" />
                    ) : undefined}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => window.api.combat.updateCombatant(id, { hidden: !c.hidden })}
                        title={c.hidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 14, opacity: c.hidden ? 0.4 : 0.8 }}>
                        {c.hidden ? '🚫' : '👁'}
                      </button>
                      <input
                        type="number"
                        value={c.initiative ?? ''}
                        onChange={e => {
                          const v = e.target.value ? Number(e.target.value) : undefined
                          if (v != null && !isNaN(v)) window.api.combat.setInitiative(id, v)
                        }}
                        placeholder="auto"
                        style={{
                          width: 48, textAlign: 'center', padding: '1px 2px',
                          fontSize: 'var(--font-size-xs)', borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                          color: 'var(--color-text-primary)',
                        }}
                      />
                    </div>
                  </CombatantRow>
                  <MonsterIdentityRow combatantId={id} combatant={c} recentColors={recentColors} onCustomColor={addRecentColor} />
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Start Combat button — shown once all PCs have initiatives */}
      {allPcsDone && sortedIds.length > 0 && (
        <button
          onClick={handleStartCombat}
          style={{
            display: 'block', width: '100%', marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-base)',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
          }}
        >
          Start Combat
        </button>
      )}
    </div>
  )
}

// ─── Shared row component ──────────────────────────────────────────────────

function CombatantRow({ c, isCurrent, isDone, isStaging, isHidden, leading, children }: {
  c: CombatantState
  isCurrent: boolean
  isDone: boolean
  isStaging: boolean
  isHidden?: boolean
  leading?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-3)',
      background: isCurrent ? 'var(--color-accent)' : 'var(--color-bg-surface)',
      color: isCurrent ? 'var(--color-accent-text)' : undefined,
      border: isCurrent ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      opacity: isHidden ? 0.4 : (!isDone && !isCurrent && !isStaging) ? 0.5 : 1,
    }}>
      {leading}
      <CombatToken name={c.name} imageId={c.imageId} tokenImageId={c.tokenImageId}
        hp={c.hp} maxHp={c.maxHp} size={24}
        hideHpRing={!!c.color}
        solidRingColor={c.color}
        miniNumber={c.miniNumber} />
      <span style={{
        flex: 1, fontWeight: isCurrent || c.isPC ? 600 : 400,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textDecoration: isHidden ? 'line-through' : undefined,
      }}>
        {c.name}
        {isHidden && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 4 }}>(hidden)</span>}
      </span>
      {children}
    </div>
  )
}

// ─── Monster identity row (color swatches + number) ────────────────────────

function MonsterIdentityRow({ combatantId, combatant: c, recentColors, onCustomColor }: {
  combatantId: string
  combatant: CombatantState
  recentColors: string[]
  onCustomColor: (hex: string) => void
}) {
  const colorPickerRef = useRef<HTMLInputElement>(null)
  const base = c.baseName ?? c.name

  const setIdentity = (color?: string, miniNumber?: number, descriptor?: string) => {
    const name = buildMonsterDisplayName(base, color, miniNumber, descriptor)
    window.api.combat.updateCombatant(combatantId, { color, miniNumber, miniDescriptor: descriptor || undefined, name })
  }

  const presetValues = new Set(MINI_COLORS.map(mc => mc.value.toLowerCase()))
  const extraColors = recentColors.filter(rc => !presetValues.has(rc.toLowerCase()))

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      paddingLeft: 36, marginTop: 2, marginBottom: 2,
    }}>
      {MINI_COLORS.map(mc => {
        const isActive = c.color?.toLowerCase() === mc.value.toLowerCase()
        return (
          <div key={mc.value} title={mc.name}
            onClick={() => setIdentity(isActive ? undefined : mc.value, c.miniNumber, c.miniDescriptor)}
            style={{
              width: 14, height: 14, borderRadius: '50%', background: mc.value,
              border: isActive ? '2px solid #fff' : '1px solid rgba(128,128,128,0.4)',
              cursor: 'pointer', boxShadow: isActive ? `0 0 4px ${mc.value}` : 'none',
            }}
          />
        )
      })}
      {extraColors.map(hex => {
        const isActive = c.color?.toLowerCase() === hex.toLowerCase()
        return (
          <div key={hex} title={colorNameFromHex(hex)}
            onClick={() => setIdentity(isActive ? undefined : hex, c.miniNumber, c.miniDescriptor)}
            style={{
              width: 14, height: 14, borderRadius: '50%', background: hex,
              border: isActive ? '2px solid #fff' : '1px dashed rgba(128,128,128,0.5)',
              cursor: 'pointer', boxShadow: isActive ? `0 0 4px ${hex}` : 'none',
            }}
          />
        )
      })}
      <div title="Pick custom color"
        onClick={() => colorPickerRef.current?.click()}
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
          border: '1px solid rgba(128,128,128,0.4)', cursor: 'pointer',
        }}
      />
      <input ref={colorPickerRef} type="color" value={c.color ?? '#888888'}
        onChange={e => { onCustomColor(e.target.value); setIdentity(e.target.value, c.miniNumber, c.miniDescriptor) }}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 4 }}>#</span>
      <input type="number" min={1} max={99} value={c.miniNumber ?? ''}
        onChange={e => { const v = e.target.value ? parseInt(e.target.value) : undefined; setIdentity(c.color, v, c.miniDescriptor) }}
        style={{
          width: 28, textAlign: 'center', padding: '1px 2px', fontSize: 11, borderRadius: 'var(--radius-sm)',
          background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      />
      <input
        value={c.miniDescriptor ?? ''}
        onChange={e => setIdentity(c.color, c.miniNumber, e.target.value)}
        placeholder="desc"
        style={{
          width: 60, padding: '1px 4px', fontSize: 11, borderRadius: 'var(--radius-sm)',
          background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)', marginLeft: 4,
        }}
      />
    </div>
  )
}
