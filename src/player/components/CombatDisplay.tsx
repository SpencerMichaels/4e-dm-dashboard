import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import type { PlayerCombatState, PlayerCombatantState, PlayerTurnItem } from '@common/types'
import { ConditionPill, buildConditionLabel } from '@renderer/plugins/dnd-4e/ConditionPill'
import { getConditionStyle } from '@renderer/plugins/dnd-4e/condition-styles'
import { getDamageTypeStyle } from '@renderer/plugins/dnd-4e/damage-types'
import { CombatToken } from '@renderer/components/combat/CombatToken'
import { useImage } from '@renderer/hooks/use-image'

interface Props {
  combat: PlayerCombatState
  backgroundImageId?: string
}

/** Get the ring color for a combatant: PCs use their chip color (or green/red bloodied fallback), monsters use HP descriptor color */
function getRingColor(c: PlayerCombatantState): string {
  if (c.isPC) {
    if (c.color) return c.color
    const bloodied = c.conditions.some(cond => cond.conditionId === 'bloodied')
    return bloodied ? '#e03131' : '#2f9e44'
  }
  return c.hpColor ?? '#888'
}

export function CombatDisplay({ combat: incomingCombat, backgroundImageId }: Props) {
  // Buffer state transitions out of 'end-of-turn-done' to give time for the result animation
  const [combat, setCombat] = useState(incomingCombat)
  const prevPhaseRef = useRef(incomingCombat.turnPhase)

  useEffect(() => {
    // If the previous phase was end-of-turn-done and the new one isn't, hold the old state briefly
    if (prevPhaseRef.current === 'end-of-turn-done' && incomingCombat.turnPhase !== 'end-of-turn-done') {
      const timer = setTimeout(() => {
        setCombat(incomingCombat)
        prevPhaseRef.current = incomingCombat.turnPhase
      }, 1200)
      return () => clearTimeout(timer)
    }
    setCombat(incomingCombat)
    prevPhaseRef.current = incomingCombat.turnPhase
  }, [incomingCombat])

  const currentId = combat.initiativeOrder[combat.turnIndex]
  const backgroundUrl = useImage(backgroundImageId)

  if (combat.phase === 'initiative-entry') {
    // If everyone has an initiative, sort by initiative descending (final order).
    // Otherwise keep PCs first, then monsters alphabetical (entry order).
    const allRolled = Object.values(combat.combatants).every(c => c.initiative != null)
    const initSorted = Object.keys(combat.combatants).sort((a, b) => {
      const ca = combat.combatants[a], cb = combat.combatants[b]
      if (allRolled) return (cb.initiative ?? 0) - (ca.initiative ?? 0)
      if (ca.isPC !== cb.isPC) return ca.isPC ? -1 : 1
      return ca.name.localeCompare(cb.name)
    })
    const focusedId = combat.activeInitiativeId
    const focusedCombatant = focusedId ? combat.combatants[focusedId] : null

    return (
      <div style={{
        height: '100vh', display: 'flex',
        background: '#111', color: '#eee',
        position: 'relative', overflow: 'hidden',
      }}>
        {backgroundUrl && <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: 0.15,
        }} />}

        {/* Left: Initiative list */}
        <div style={{
          width: 540, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          padding: '1.5rem 1rem',
          position: 'relative', zIndex: 1,
          background: 'rgba(0,0,0,0.4)',
          borderRight: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            fontSize: '1.1rem', color: '#888', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            marginBottom: '1rem',
          }}>
            Roll Initiative
          </div>
          <InitiativeEntryList sortedIds={initSorted} combatants={combat.combatants} focusedId={focusedId} />
        </div>

        {/* Right: Creature spotlight */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', zIndex: 1,
          padding: '2rem',
        }}>
          {focusedCombatant ? (
            <CreatureSpotlight combatant={focusedCombatant} />
          ) : (
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#555' }}>
              Roll Initiative!
            </div>
          )}
        </div>
      </div>
    )
  }

  // Build display order: current creature at top, then remaining, then next round
  const order = combat.initiativeOrder
  const turnIdx = combat.turnIndex
  const waiting = order.slice(turnIdx)
  const acted = order.slice(0, turnIdx)

  const currentCombatant = currentId ? combat.combatants[currentId] : null

  return (
    <div style={{
      height: '100vh', display: 'flex',
      background: '#111', color: '#eee',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background image */}
      {backgroundUrl && <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.15,
      }} />}

      {/* Left: Initiative tracker */}
      <div style={{
        width: 540, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        padding: '1.5rem 1rem',
        position: 'relative', zIndex: 1,
        background: 'rgba(0,0,0,0.4)',
        borderRight: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          fontSize: '1.1rem', color: '#888', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginBottom: '1rem',
        }}>
          Round {combat.round}
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <AnimatedList
            waiting={waiting}
            acted={acted}
            combatants={combat.combatants}
            currentId={currentId}
            round={combat.round}
          />
        </div>
      </div>

      {/* Right: Creature spotlight + turn info sidebar */}
      <div style={{
        flex: 1, display: 'flex',
        position: 'relative', zIndex: 1,
        overflow: 'hidden',
      }}>
        {currentCombatant && (
          <>
            {/* Center: creature image/name */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '2rem',
            }}>
              <CreatureSpotlight combatant={currentCombatant} />
            </div>

            {/* Right sidebar: turn info */}
            <TurnInfoSidebar
              combatant={currentCombatant}
              turnItems={combat.turnItems}
              stepperIndex={combat.stepperIndex}
            />
          </>
        )}
      </div>
    </div>
  )
}

function InitiativeEntryList({ sortedIds, combatants, focusedId }: {
  sortedIds: string[]
  combatants: Record<string, PlayerCombatantState>
  focusedId?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const posCache = useRef<Map<string, number>>(new Map())

  const snapshotPositions = () => {
    if (!containerRef.current) return
    const map = new Map<string, number>()
    for (let i = 0; i < containerRef.current.children.length; i++) {
      const el = containerRef.current.children[i] as HTMLElement
      const key = el.dataset.flipKey
      if (key) map.set(key, el.getBoundingClientRect().top)
    }
    posCache.current = map
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const old = posCache.current
    if (old.size === 0) { snapshotPositions(); return }
    for (let i = 0; i < containerRef.current.children.length; i++) {
      const el = containerRef.current.children[i] as HTMLElement
      const key = el.dataset.flipKey
      if (!key || !old.has(key)) continue
      const delta = old.get(key)! - el.getBoundingClientRect().top
      if (Math.abs(delta) < 1) continue
      el.style.transform = `translateY(${delta}px)`
      el.style.transition = 'none'
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        el.style.transform = ''
        el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
      })
    }
    snapshotPositions()
  })
  snapshotPositions()

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sortedIds.map(id => {
        const c = combatants[id]
        if (!c) return null
        const isFocused = id === focusedId
        const hasInit = c.initiative != null
        return (
          <div key={id} data-flip-key={id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0 1rem 0 0',
            minHeight: 67,
            background: isFocused ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
            border: isFocused ? '2px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.2)',
            borderRadius: '34px 10px 10px 34px',
            opacity: !hasInit && !isFocused ? 0.4 : 1,
          }}>
            <div style={{ marginLeft: 5, flexShrink: 0 }}>
              <CombatToken name={c.name} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={100} maxHp={100} size={56} hideHpRing solidRingColor={getRingColor(c)} />
            </div>
            <span style={{
              flex: 1, minWidth: 0,
              fontFamily: "'MentorSans', 'Mentor', sans-serif",
              fontSize: isFocused ? '1.5rem' : '1.3rem',
              fontWeight: 700,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.name}
            </span>
            <span style={{
              fontSize: '1.1rem', fontWeight: 600, minWidth: 32, textAlign: 'center',
              color: hasInit ? '#eee' : '#555',
            }}>
              {hasInit ? c.initiative : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CreatureSpotlight({ combatant: c }: { combatant: PlayerCombatantState }) {
  const imageUrl = useImage(c.imageId)
  const [fadeIn, setFadeIn] = useState(false)

  useEffect(() => {
    setFadeIn(false)
    const t = requestAnimationFrame(() => setFadeIn(true))
    return () => cancelAnimationFrame(t)
  }, [c.name])

  const hpPct = c.hpPct ?? 100
  const hpColor = c.hpColor ?? '#0a0'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '1.5rem', maxWidth: 500,
      opacity: fadeIn ? 1 : 0,
      transform: fadeIn ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
    }}>
      {imageUrl ? (
        <div style={{
          width: '100%', height: '50vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={imageUrl} style={{
            display: 'block', maxWidth: '100%', maxHeight: '100%',
            width: 'auto', height: '100%',
            objectFit: 'contain',
          }} alt="" />
        </div>
      ) : (
        <CombatToken name={c.name} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={hpPct} maxHp={100} size={160} hideHpRing solidRingColor={getRingColor(c)} />
      )}

      <div style={{
        fontFamily: "'MentorSans', 'Mentor', sans-serif",
        fontSize: '2.5rem', fontWeight: 700,
        textAlign: 'center', textShadow: '0 2px 8px rgba(0,0,0,0.5)',
      }}>
        {c.name}
      </div>

      <div style={{
        fontSize: '1.2rem', fontWeight: 600,
        color: hpColor,
      }}>
        {c.hpDescriptor}
      </div>
    </div>
  )
}

function AnimatedList({ waiting, acted, combatants, currentId, round }: {
  waiting: string[]
  acted: string[]
  combatants: Record<string, PlayerCombatantState>
  currentId: string
  round: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const posCache = useRef<Map<string, number>>(new Map())

  const snapshotPositions = () => {
    if (!containerRef.current) return
    const map = new Map<string, number>()
    for (let i = 0; i < containerRef.current.children.length; i++) {
      const el = containerRef.current.children[i] as HTMLElement
      const key = el.dataset.flipKey
      if (key) map.set(key, el.getBoundingClientRect().top)
    }
    posCache.current = map
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const old = posCache.current
    if (old.size === 0) { snapshotPositions(); return }
    for (let i = 0; i < containerRef.current.children.length; i++) {
      const el = containerRef.current.children[i] as HTMLElement
      const key = el.dataset.flipKey
      if (!key || !old.has(key)) continue
      const delta = old.get(key)! - el.getBoundingClientRect().top
      if (Math.abs(delta) < 1) continue
      if (delta < 0) continue // skip downward (wrap-around)
      el.style.transform = `translateY(${delta}px)`
      el.style.transition = 'none'
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.25s ease-out'
        el.style.transform = ''
        el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
      })
    }
    snapshotPositions()
  })
  snapshotPositions()

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {waiting.map(id => {
        const c = combatants[id]
        if (!c) return null
        return <div key={id} data-flip-key={id}><PlayerCard combatant={c} isCurrent={id === currentId} /></div>
      })}

      {acted.length > 0 && (
        <div data-flip-key="__next_round__" style={{
          fontSize: '0.9rem', color: '#555', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginTop: '1rem', marginBottom: '0.25rem',
          borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.75rem',
        }}>
          Round {round + 1}
        </div>
      )}

      {acted.map(id => {
        const c = combatants[id]
        if (!c) return null
        return <div key={id} data-flip-key={id}><PlayerCard combatant={c} isCurrent={false} /></div>
      })}
    </div>
  )
}

function PlayerCard({ combatant: c, isCurrent }: { combatant: PlayerCombatantState; isCurrent: boolean }) {
  const hpPct = c.hpPct ?? 100
  const hpColor = c.hpColor ?? '#0a0'
  const isDead = c.dead === true || (!c.isPC && hpPct === 0)
  const isDying = c.isPC && (c.conditions.some(co => co.conditionId === 'dying') || (c.deathSaveFailures != null && c.deathSaveFailures > 0))

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '6px 1rem 6px 0',
      minHeight: 67,
      background: isCurrent ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
      border: isCurrent ? '2px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.2)',
      borderRadius: '34px 10px 10px 34px',
      opacity: isDead ? 0.5 : 1,
    }}>
      <div style={{ marginLeft: 5, flexShrink: 0 }}>
        <CombatToken name={c.name} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={hpPct} maxHp={100} size={56} hideHpRing solidRingColor={getRingColor(c)} isDead={isDead} />
      </div>

      {/* Name + conditions */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: "'MentorSans', 'Mentor', sans-serif",
          fontSize: '1.3rem',
          fontWeight: 700,
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isDead ? 'line-through' : 'none' }}>{c.name}</span>
          {isDying && (
            <span style={{ display: 'inline-flex', gap: 2, fontSize: '1rem', flexShrink: 0 }}>
              {[0, 1, 2].map(i => {
                const filled = (c.deathSaveFailures ?? 0) > i
                return <span key={i} style={{ opacity: filled ? 1 : 0.3 }}>💀</span>
              })}
            </span>
          )}
        </div>
        {c.conditions.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {c.conditions.map((cond, i) => (
              <ConditionPill
                key={i}
                conditionId={cond.conditionId}
                label={buildConditionLabel({
                  conditionId: cond.conditionId, name: cond.name, value: cond.value,
                  customDescription: cond.customDescription, damageType: cond.damageType,
                  durationType: cond.durationType, expiresOnName: cond.expiresOnName,
                })}
                damageType={cond.damageType}
                style={{ fontSize: 13, lineHeight: '20px', padding: '0 8px', borderRadius: 10 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* HP descriptor (monsters) or player name (PCs) */}
      <div style={{
        color: c.isPC ? '#ccc' : hpColor,
        fontWeight: 600,
        fontSize: '1rem', whiteSpace: 'nowrap',
      }}>
        {c.isPC ? c.playerName : c.hpDescriptor}
      </div>
    </div>
  )
}

function TurnInfoSidebar({ combatant: c, turnItems, stepperIndex }: {
  combatant: PlayerCombatantState
  turnItems: PlayerTurnItem[]
  stepperIndex: number
}) {
  const startItems = turnItems.filter(i => i.phase === 'start')
  const endItems = turnItems.filter(i => i.phase === 'end')
  const nonOngoingConditions = c.conditions.filter(co => !co.conditionId.startsWith('ongoing-damage'))
  const hasContent = startItems.length > 0 || nonOngoingConditions.length > 0 || endItems.length > 0

  if (!hasContent) return null

  const sectionHeader = (text: string) => (
    <div style={{
      fontSize: '0.9rem', color: '#666', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '8px 0 4px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      marginBottom: 6,
    }}>{text}</div>
  )

  return (
    <div style={{
      width: 360, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      padding: '1.5rem 1rem',
      background: 'rgba(0,0,0,0.3)',
      borderLeft: '1px solid rgba(255,255,255,0.1)',
      overflow: 'auto',
    }}>
      {/* ── START OF TURN ── */}
      {startItems.length > 0 && (
        <>
          {sectionHeader('Start of Turn')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {startItems.map(item => (
              <TurnItemRow key={item.id} item={item} isActive={turnItems.indexOf(item) === stepperIndex} />
            ))}
          </div>
        </>
      )}

      {/* ── CONDITIONS ── */}
      {nonOngoingConditions.length > 0 && (
        <>
          {sectionHeader('Conditions')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {nonOngoingConditions.map((cond, i) => (
              <ConditionCard key={i} condition={cond} />
            ))}
          </div>
        </>
      )}

      {/* ── END OF TURN ── */}
      {endItems.length > 0 && (
        <>
          {sectionHeader('End of Turn')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {endItems.map(item => (
              <TurnItemRow key={item.id} item={item} isActive={turnItems.indexOf(item) === stepperIndex} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TurnItemRow({ item, isActive }: { item: PlayerTurnItem; isActive: boolean }) {
  const resolved = item.result != null
  const isSuccess = item.result === 'success'
  const isFail = item.result === 'fail'
  const isNone = item.result === 'none'
  const isDamage = item.kind === 'ongoing-damage'
  const isExpire = item.kind === 'sont-expire' || item.kind === 'eont-expire'
  const isDeathSave = item.kind === 'death-save'
  const isRecharge = item.kind === 'recharge'

  // Get condition/damage styling
  const condStyle = item.conditionId ? getConditionStyle(item.conditionId, item.damageType) : null
  const dmgStyle = item.damageType ? getDamageTypeStyle(item.damageType.trim().split(/\s+and\s+/)[0]) : null
  const itemColor = isDeathSave ? '#d9534f' : isRecharge ? '#5c9ee8' : (condStyle?.color ?? dmgStyle?.color ?? '#888')
  const itemIcon = isDeathSave ? '💀' : isRecharge ? '↻' : isDamage ? (dmgStyle?.icon ?? '🔄') : (condStyle?.icon ?? '')

  const isSaveOrRecharge = item.kind === 'save' || item.kind === 'recharge'
  const isPending = !resolved && !isActive

  // Card states:
  // Damage: pending=muted, active=full color, taken=gray
  // Save:   pending=muted, active=full color, saved=green, failed=red
  let bg: string, border: string, iconFilter: string, textColor: string
  let displayIcon = itemIcon

  if (isDamage) {
    if (resolved) {
      bg = 'rgba(255,255,255,0.05)'; border = '1px solid rgba(255,255,255,0.1)'
      iconFilter = 'grayscale(1) opacity(0.5)'; textColor = '#666'
    } else if (isActive) {
      bg = `${itemColor}25`; border = `2px solid ${itemColor}66`
      iconFilter = 'none'; textColor = '#ddd'
    } else {
      bg = `${itemColor}10`; border = `1px solid ${itemColor}22`
      iconFilter = 'opacity(0.5)'; textColor = '#888'
    }
  } else if (isDeathSave) {
    if (isSuccess) {
      bg = 'rgba(40,167,69,0.2)'; border = '1px solid rgba(40,167,69,0.5)'
      iconFilter = 'none'; textColor = '#5cb85c'; displayIcon = '✓'
    } else if (isFail) {
      bg = 'rgba(220,53,69,0.2)'; border = '1px solid rgba(220,53,69,0.5)'
      iconFilter = 'none'; textColor = '#d9534f'; displayIcon = '✗'
    } else if (isNone) {
      bg = 'rgba(255,255,255,0.05)'; border = '1px solid rgba(255,255,255,0.15)'
      iconFilter = 'grayscale(1) opacity(0.6)'; textColor = '#888'; displayIcon = '—'
    } else if (isActive) {
      bg = `${itemColor}25`; border = `2px solid ${itemColor}66`
      iconFilter = 'none'; textColor = '#ddd'
    } else {
      bg = `${itemColor}10`; border = `1px solid ${itemColor}22`
      iconFilter = 'opacity(0.5)'; textColor = '#888'
    }
  } else if (isSaveOrRecharge) {
    if (isSuccess) {
      bg = 'rgba(40,167,69,0.2)'; border = '1px solid rgba(40,167,69,0.5)'
      iconFilter = 'none'; textColor = '#5cb85c'; displayIcon = '✓'
    } else if (isFail) {
      bg = 'rgba(220,53,69,0.2)'; border = '1px solid rgba(220,53,69,0.5)'
      iconFilter = 'none'; textColor = '#d9534f'; displayIcon = '✗'
    } else if (isActive) {
      bg = `${itemColor}25`; border = `2px solid ${itemColor}66`
      iconFilter = 'none'; textColor = '#ddd'
    } else {
      bg = `${itemColor}10`; border = `1px solid ${itemColor}22`
      iconFilter = 'opacity(0.5)'; textColor = '#888'
    }
  } else {
    // Expire items
    bg = 'rgba(255,255,255,0.04)'; border = '1px solid rgba(255,255,255,0.1)'
    iconFilter = 'none'; textColor = '#888'
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0.5rem 0.75rem',
      borderRadius: 8,
      background: bg, border,
      transition: 'all 0.2s',
    }}>
      <span style={{
        fontSize: resolved && (isSaveOrRecharge || isDeathSave) ? '1.5rem' : '1.3rem',
        flexShrink: 0,
        filter: iconFilter,
        transition: 'filter 0.2s',
        color: isSuccess ? '#5cb85c' : isFail ? '#d9534f' : undefined,
        fontWeight: resolved && (isSaveOrRecharge || isDeathSave) ? 700 : undefined,
      }}>
        {displayIcon}
      </span>

      <span style={{
        fontSize: '1.1rem', fontWeight: 600, flex: 1,
        color: textColor,
        textDecoration: isSuccess && item.kind === 'save' ? 'line-through' : undefined,
      }}>
        {item.label}
      </span>

    </div>
  )
}

function ConditionCard({ condition: cond }: { condition: PlayerCombatantState['conditions'][0] }) {
  const style = getConditionStyle(cond.conditionId, cond.damageType)
  const label = buildConditionLabel({
    conditionId: cond.conditionId, name: cond.name, value: cond.value,
    customDescription: cond.customDescription, damageType: cond.damageType,
    durationType: cond.durationType, expiresOnName: cond.expiresOnName,
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
      padding: '0.5rem 0.6rem',
      background: `linear-gradient(135deg, ${style.color}22, ${style.color}11)`,
      border: `1px solid ${style.color}44`,
      borderRadius: 8,
    }}>
      <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>
        {style.icon}{style.icon2 ?? ''}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ddd', lineHeight: 1.2, marginBottom: 2 }}>
          {label}
        </div>
        {cond.description && (
          <div style={{ fontSize: '0.8rem', color: '#999', lineHeight: 1.3 }}>
            {cond.description}
          </div>
        )}
      </div>
    </div>
  )
}
