import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import type { PlayerCombatState, PlayerCombatantState, PlayerTurnItem, CombatNotification } from '@common/types'
import { ConditionPill, buildConditionLabel } from '@renderer/components/combat/ConditionPill'
import { getConditionStyle } from '@renderer/components/combat/condition-styles'
import { getDamageTypeStyle } from '@renderer/components/combat/damage-types'
import { CombatToken } from '@renderer/components/combat/CombatToken'
import { useImage } from '@renderer/hooks/use-image'
import { tokenColorFromName } from '@common/utils/token-color'
import { withAlpha } from '../../renderer/utils/color'
import { Glyph, Icon } from '../../renderer/components/shared/Icon'

interface Props {
  combat: PlayerCombatState
  backgroundImageId?: string
}

/** Get the ring color for a combatant: PCs use their chip color (or green/red bloodied fallback),
 *  monsters use their assigned mini color if set, otherwise HP descriptor color */
function getRingColor(c: PlayerCombatantState): string {
  if (c.isPC) {
    if (c.color) return c.color
    const bloodied = c.conditions.some(cond => cond.conditionId === 'bloodied')
    return bloodied ? 'var(--hp-low)' : 'var(--hp-full)'
  }
  if (c.color) return c.color
  return c.hpColor ?? 'var(--muted)'
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
        background: 'var(--background)', color: 'var(--text)',
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
          background: 'var(--player-panel)',
          borderRight: '1px solid var(--player-divider)',
        }}>
          <div style={{
            fontSize: '1.1rem', color: 'var(--muted)', fontWeight: 600,
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
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, color: 'var(--muted)' }}>
              Roll Initiative!
            </div>
          )}
        </div>
      </div>
    )
  }

  // Build display order: current creature at top, then delayed, then remaining waiting, then next round
  const order = combat.initiativeOrder
  const turnIdx = combat.turnIndex
  const delayedSet = new Set(combat.delayedIds ?? [])
  const waiting: string[] = []
  const acted: string[] = []
  for (let i = 0; i < order.length; i++) {
    const id = order[i]
    if (delayedSet.has(id)) continue
    if (i >= turnIdx) waiting.push(id)
    else acted.push(id)
  }
  const delayedSorted = [...(combat.delayedIds ?? [])]
    .filter(id => combat.combatants[id])
    .sort((a, b) => (combat.combatants[b]?.initiative ?? 0) - (combat.combatants[a]?.initiative ?? 0))
  const readiedSorted = [...(combat.readiedIds ?? [])]
    .filter(id => combat.combatants[id])
    .sort((a, b) => (combat.combatants[b]?.initiative ?? 0) - (combat.combatants[a]?.initiative ?? 0))

  const currentCombatant = currentId ? combat.combatants[currentId] : null

  return (
    <div style={{
      height: '100vh', display: 'flex',
      background: 'var(--background)', color: 'var(--text)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background image */}
      {backgroundUrl && <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center',
      }} />}

      {/* Left: Initiative tracker */}
      <div style={{
        width: 540, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        padding: '1.5rem 1rem',
        position: 'relative', zIndex: 1,
        background: 'var(--player-panel)',
        borderRight: '1px solid var(--player-divider)',
      }}>
        <div style={{
          fontSize: '1.1rem', color: 'var(--muted)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginBottom: '1rem',
        }}>
          {combat.round === 0 ? 'Surprise Round' : `Round ${combat.round}`}
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <AnimatedList
            waiting={waiting}
            delayed={delayedSorted}
            readied={readiedSorted}
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

      {/* Floating notification toasts (damage/heal/condition/death). Layered
          over the spotlight column, between the initiative list and the turn
          info sidebar. */}
      <NotificationToasts notifications={combat.notifications ?? []} combatants={combat.combatants} />
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
            background: isFocused ? 'var(--player-card-current)' : 'var(--player-card)',
            border: isFocused ? '2px solid var(--player-card-border-current)' : '1px solid var(--player-card-border)',
            borderRadius: '34px 10px 10px 34px',
            opacity: !hasInit && !isFocused ? 0.4 : 1,
          }}>
            <div style={{ marginLeft: 5, flexShrink: 0 }}>
              <CombatToken name={c.name} baseName={c.baseName} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={100} maxHp={100} size={56} hideHpRing solidRingColor={getRingColor(c)} miniNumber={c.miniNumber} />
            </div>
            <span style={{
              flex: 1, minWidth: 0,
              fontFamily: 'var(--font-card)',
              fontSize: isFocused ? '1.5rem' : '1.3rem',
              fontWeight: 700,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.name}
            </span>
            <span style={{
              fontSize: '1.1rem', fontWeight: 600, minWidth: 32, textAlign: 'center',
              color: hasInit ? 'var(--text)' : 'var(--muted)',
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
  const hpColor = c.hpColor ?? 'var(--hp-full)'

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
        <CombatToken name={c.name} baseName={c.baseName} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={hpPct} maxHp={100} size={160} hideHpRing solidRingColor={getRingColor(c)} />
      )}

      <div style={{
        fontFamily: 'var(--font-card)',
        fontSize: '2.5rem', fontWeight: 700,
        textAlign: 'center', textShadow: '0 2px 8px var(--player-text-shadow)',
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

function AnimatedList({ waiting, delayed, readied, acted, combatants, currentId, round }: {
  waiting: string[]
  delayed: string[]
  readied: string[]
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
      {/* Order: readied → current → delayed → rest of waiting → header → acted */}
      {readied.map(id => {
        const c = combatants[id]
        if (!c) return null
        return <div key={id} data-flip-key={id} style={{ marginLeft: 24 }}><PlayerCard combatant={c} isCurrent={false} isReadied /></div>
      })}

      {waiting.length > 0 && (() => {
        const c = combatants[waiting[0]]
        if (!c) return null
        return <div key={waiting[0]} data-flip-key={waiting[0]}><PlayerCard combatant={c} isCurrent={waiting[0] === currentId} /></div>
      })()}

      {delayed.map(id => {
        const c = combatants[id]
        if (!c) return null
        return <div key={id} data-flip-key={id} style={{ marginLeft: 24 }}><PlayerCard combatant={c} isCurrent={false} isDelayed /></div>
      })}

      {waiting.slice(1).map(id => {
        const c = combatants[id]
        if (!c) return null
        return <div key={id} data-flip-key={id}><PlayerCard combatant={c} isCurrent={false} /></div>
      })}

      {acted.length > 0 && (
        <div data-flip-key="__next_round__" style={{
          fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginTop: '1rem', marginBottom: '0.25rem',
          borderTop: '1px solid var(--player-divider)', paddingTop: '0.75rem',
        }}>
          {round === 0 ? 'Round 1' : `Round ${round + 1}`}
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

function PlayerCard({ combatant: c, isCurrent, isDelayed, isReadied }: { combatant: PlayerCombatantState; isCurrent: boolean; isDelayed?: boolean; isReadied?: boolean }) {
  const hpPct = c.hpPct ?? 100
  const hpColor = c.hpColor ?? 'var(--hp-full)'
  const isDead = c.dead === true || (!c.isPC && hpPct === 0)
  const isDying = c.isPC && (c.conditions.some(co => co.conditionId === 'dying') || (c.deathSaveFailures != null && c.deathSaveFailures > 0))

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '6px 1rem 6px 0',
      minHeight: 67,
      background: isCurrent ? 'var(--player-card-current)' : 'var(--player-card)',
      border: isCurrent ? '2px solid var(--player-card-border-current)' : '1px solid var(--player-card-border)',
      borderRadius: '34px 10px 10px 34px',
      opacity: isDead || isDelayed || isReadied ? 0.5 : 1,
    }}>
      <div style={{ marginLeft: 5, flexShrink: 0 }}>
        <CombatToken name={c.name} baseName={c.baseName} imageId={c.imageId} tokenImageId={c.tokenImageId} hp={hpPct} maxHp={100} size={56} hideHpRing solidRingColor={getRingColor(c)} isDead={isDead} miniNumber={c.miniNumber} />
      </div>

      {/* Name + conditions */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-card)',
          fontSize: '1.3rem',
          fontWeight: 700,
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isDead ? 'line-through' : 'none' }}>{c.name}</span>
          {isDying && (
            <span style={{ display: 'inline-flex', gap: 2, fontSize: '1rem', flexShrink: 0 }}>
              {[0, 1, 2].map(i => {
                const filled = (c.deathSaveFailures ?? 0) > i
                return <span key={i} style={{ opacity: filled ? 1 : 0.3, display: 'inline-flex' }}><Icon name="skull" label={filled ? 'Failed death save' : undefined} /></span>
              })}
            </span>
          )}
        </div>
        {isReadied && c.readiedAction && (
          <div style={{ fontSize: '0.85rem', color: 'var(--readied)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Readied: {c.readiedAction}
          </div>
        )}
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
                customColor={cond.customColor}
                customIcon={cond.customIcon}
                style={{ fontSize: 13, lineHeight: '20px', padding: '0 8px', borderRadius: 10 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* HP descriptor (monsters) or player name (PCs) */}
      <div style={{
        color: c.isPC ? 'var(--text-secondary)' : hpColor,
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
      fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '8px 0 4px',
      borderBottom: '1px solid var(--player-divider)',
      marginBottom: 6,
    }}>{text}</div>
  )

  return (
    <div style={{
      width: 360, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      padding: '1.5rem 1rem',
      background: 'var(--player-panel)',
      borderLeft: '1px solid var(--player-divider)',
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
      {nonOngoingConditions.length > 0 && (() => {
        // Build a set of conditionIds whose expiration is already listed in
        // the start-of-turn or end-of-turn sections — used to avoid showing
        // a duplicate "till end of X's next turn" line on the condition card.
        const expireIdsAlreadyShown = new Set<string>()
        for (const it of turnItems) {
          if ((it.kind === 'sont-expire' || it.kind === 'eont-expire') && it.conditionId) {
            expireIdsAlreadyShown.add(it.conditionId)
          }
        }
        return (
          <>
            {sectionHeader('Conditions')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {nonOngoingConditions.map((cond, i) => (
                <ConditionCard key={i} condition={cond} carrierName={c.name}
                  hideExpiresLine={expireIdsAlreadyShown.has(cond.conditionId)} />
              ))}
            </div>
          </>
        )
      })()}

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
  const itemColor = isDeathSave ? 'var(--danger)' : isRecharge ? 'var(--accent)' : (condStyle?.color ?? dmgStyle?.color ?? 'var(--muted)')
  // Lucide names (or a custom condition's own text), drawn with <Glyph>
  const itemIcon = isDeathSave ? 'skull' : isRecharge ? 'rotate-cw' : isDamage ? (dmgStyle?.icon ?? 'repeat') : (condStyle?.icon ?? '')

  const isSaveOrRecharge = item.kind === 'save' || item.kind === 'recharge'
  const isPending = !resolved && !isActive

  // Card states:
  // Damage: pending=muted, active=full color, taken=gray
  // Save:   pending=muted, active=full color, saved=green, failed=red
  let bg: string, border: string, iconFilter: string, textColor: string
  let displayIcon = itemIcon

  // Shared looks: success/fail results, a neutral (done/expired) card, and the
  // item's own color when active (strong) or pending (faint)
  const successBg = withAlpha('var(--success)', 0.2), successBorder = `1px solid ${withAlpha('var(--success)', 0.5)}`
  const failBg = withAlpha('var(--danger)', 0.2), failBorder = `1px solid ${withAlpha('var(--danger)', 0.5)}`
  const activeBg = withAlpha(itemColor, 0.25), activeBorder = `2px solid ${withAlpha(itemColor, 0.6)}`
  const pendingBg = withAlpha(itemColor, 0.08), pendingBorder = `1px solid ${withAlpha(itemColor, 0.25)}`

  if (isDamage) {
    if (resolved) {
      bg = withAlpha('var(--text)', 0.05); border = `1px solid ${withAlpha('var(--text)', 0.1)}`
      iconFilter = 'grayscale(1) opacity(0.5)'; textColor = 'var(--muted)'
    } else if (isActive) {
      bg = activeBg; border = activeBorder
      iconFilter = 'none'; textColor = 'var(--text)'
    } else {
      bg = pendingBg; border = pendingBorder
      iconFilter = 'opacity(0.5)'; textColor = 'var(--muted)'
    }
  } else if (isDeathSave) {
    if (isSuccess) {
      bg = successBg; border = successBorder
      iconFilter = 'none'; textColor = 'var(--success)'; displayIcon = 'check'
    } else if (isFail) {
      bg = failBg; border = failBorder
      iconFilter = 'none'; textColor = 'var(--danger)'; displayIcon = 'x'
    } else if (isNone) {
      bg = withAlpha('var(--text)', 0.05); border = `1px solid ${withAlpha('var(--text)', 0.15)}`
      iconFilter = 'grayscale(1) opacity(0.6)'; textColor = 'var(--muted)'; displayIcon = 'minus'
    } else if (isActive) {
      bg = activeBg; border = activeBorder
      iconFilter = 'none'; textColor = 'var(--text)'
    } else {
      bg = pendingBg; border = pendingBorder
      iconFilter = 'opacity(0.5)'; textColor = 'var(--muted)'
    }
  } else if (isSaveOrRecharge) {
    if (isSuccess) {
      bg = successBg; border = successBorder
      iconFilter = 'none'; textColor = 'var(--success)'; displayIcon = 'check'
    } else if (isFail) {
      bg = failBg; border = failBorder
      iconFilter = 'none'; textColor = 'var(--danger)'; displayIcon = 'x'
    } else if (isActive) {
      bg = activeBg; border = activeBorder
      iconFilter = 'none'; textColor = 'var(--text)'
    } else {
      bg = pendingBg; border = pendingBorder
      iconFilter = 'opacity(0.5)'; textColor = 'var(--muted)'
    }
  } else {
    // Expire items
    bg = withAlpha('var(--text)', 0.04); border = `1px solid ${withAlpha('var(--text)', 0.1)}`
    iconFilter = 'none'; textColor = 'var(--muted)'
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
        color: isSuccess ? 'var(--success)' : isFail ? 'var(--danger)' : undefined,
        fontWeight: resolved && (isSaveOrRecharge || isDeathSave) ? 700 : undefined,
      }}>
        {displayIcon && <Glyph icon={displayIcon} />}
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

function ConditionCard({ condition: cond, carrierName, hideExpiresLine }: {
  condition: PlayerCombatantState['conditions'][0]
  carrierName?: string
  hideExpiresLine?: boolean
}) {
  const style = getConditionStyle(cond.conditionId, cond.damageType, cond.customColor, cond.customIcon)
  const label = buildConditionLabel({
    conditionId: cond.conditionId, name: cond.name, value: cond.value,
    customDescription: cond.customDescription, damageType: cond.damageType,
    durationType: cond.durationType, expiresOnName: cond.expiresOnName,
  })

  // Surface the SONT/EONT expiration so the affected player knows when relief comes.
  // Self-bound conditions ("till the end of YOUR next turn") use the carrier name
  // ("yours") in place of someone else's. The line is hidden when an explicit
  // expiration item is already listed in the sidebar to avoid duplication.
  const isSontEont = cond.durationType === 'eont' || cond.durationType === 'sont'
  const isSelfBound = cond.expiresOnName === carrierName
  const expiresLine = !hideExpiresLine && isSontEont && cond.expiresOnName
    ? `till ${cond.durationType === 'sont' ? 'start' : 'end'} of ${isSelfBound ? '' : `${cond.expiresOnName}'s `}next turn`
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
      padding: '0.5rem 0.6rem',
      background: `linear-gradient(135deg, ${withAlpha(style.color, 0.35)}, ${withAlpha(style.color, 0.15)})`,
      border: `1px solid ${withAlpha(style.color, 0.7)}`,
      borderRadius: 8,
    }}>
      <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>
        <Glyph icon={style.icon} />{style.icon2 && <Glyph icon={style.icon2} />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, marginBottom: 2 }}>
          {label}
        </div>
        {cond.description && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
            {cond.description}
          </div>
        )}
        {expiresLine && (
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.3, marginTop: 2 }}>
            {expiresLine}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification toasts
// ─────────────────────────────────────────────────────────────────────────────

const TOAST_HOLD_MS = 6500
const TOAST_FADE_MS = 500
const TOAST_MAX_VISIBLE = 5

interface ToastEntry {
  notification: CombatNotification
  enteredAt: number
  exiting: boolean
}

/** Resolve the subject (target) creature's color: PCs use chip color,
 *  monsters use the deterministic token-name color. */
function getSubjectColor(combatant: PlayerCombatantState | undefined, name: string): string {
  if (combatant?.isPC && combatant.color) return combatant.color
  return tokenColorFromName(combatant?.baseName ?? combatant?.name ?? name)
}

/** Per-condition phrasing for application notifications. Keyed by the display
 *  name (matches what `conditionName` carries — for defender class marks this
 *  is the customName like "Challenged"; for strikers it's the short name like
 *  "Quarried"; for vanilla conditions it's the def name). The "attack" form is
 *  used when there's a distinct source; "self" is used when the source is
 *  unknown or equals the target. Conditions not in the map fall through to a
 *  generic "Y applied X to T" / "T became X" default. */
type CondPhrasing = {
  attack: (target: string, source: string) => string
  self: (target: string) => string
}
const CONDITION_PHRASING: Record<string, CondPhrasing> = {
  // ── Standard 4e conditions ───────────────────────────────────────────────
  Blinded: {
    attack: (t, s) => `${s} blinded ${t}!`,
    self: (t) => `${t} was Blinded!`,
  },
  Dazed: {
    attack: (t, s) => `${s} dazed ${t}!`,
    self: (t) => `${t} became Dazed!`,
  },
  Dominated: {
    attack: (t, s) => `${s} dominated ${t}!`,
    self: (t) => `${t} became Dominated!`,
  },
  Dying: {
    attack: (t, s) => `${s} dropped ${t}!`,
    self: (t) => `${t} is Dying!`,
  },
  Helpless: {
    attack: (t, s) => `${s} left ${t} helpless!`,
    self: (t) => `${t} became Helpless!`,
  },
  Immobilized: {
    attack: (t, s) => `${s} immobilized ${t}!`,
    self: (t) => `${t} became Immobilized!`,
  },
  Petrified: {
    attack: (t, s) => `${s} petrified ${t}!`,
    self: (t) => `${t} became Petrified!`,
  },
  Prone: {
    attack: (t, s) => `${s} knocked ${t} prone!`,
    self: (t) => `${t} fell prone!`,
  },
  Restrained: {
    attack: (t, s) => `${s} restrained ${t}!`,
    self: (t) => `${t} became Restrained!`,
  },
  Slowed: {
    attack: (t, s) => `${s} slowed ${t}!`,
    self: (t) => `${t} became Slowed!`,
  },
  Stunned: {
    attack: (t, s) => `${s} stunned ${t}!`,
    self: (t) => `${t} became Stunned!`,
  },
  Surprised: {
    attack: (t, s) => `${s} surprised ${t}!`,
    self: (t) => `${t} was Surprised!`,
  },
  Unconscious: {
    attack: (t, s) => `${s} knocked ${t} unconscious!`,
    self: (t) => `${t} fell unconscious!`,
  },
  Weakened: {
    attack: (t, s) => `${s} weakened ${t}!`,
    self: (t) => `${t} became Weakened!`,
  },
  // ── Marks (vanilla + defender class-mark customName overrides) ───────────
  Marked: {
    attack: (t, s) => `${s} marked ${t}!`,
    self: (t) => `${t} became Marked!`,
  },
  Challenged: {
    attack: (t, s) => `${s} challenged ${t}!`,
    self: (t) => `${t} was Challenged!`,
  },
  Aegis: {
    attack: (t, s) => `${s} placed an Aegis on ${t}!`,
    self: (t) => `${t} was placed under an Aegis!`,
  },
  Demanded: {
    attack: (t, s) => `${s} singled out ${t}!`,
    self: (t) => `${t} was singled out!`,
  },
  // ── Striker designations (dedicated mark-* conditionIds) ─────────────────
  Quarried: {
    attack: (t, s) => `${s} chose ${t} as their quarry!`,
    self: (t) => `${t} was Quarried!`,
  },
  Cursed: {
    attack: (t, s) => `${s} cursed ${t}!`,
    self: (t) => `${t} was Cursed!`,
  },
  Oathbound: {
    attack: (t, s) => `${s} swore enmity against ${t}!`,
    self: (t) => `${t} was sworn against!`,
  },
  Shrouded: {
    attack: (t, s) => `${s} placed a shroud on ${t}!`,
    self: (t) => `${t} was Shrouded!`,
  },
}

function phraseCondition(targetName: string, sourceName: string | undefined, conditionName: string): string {
  const phrasing = CONDITION_PHRASING[conditionName]
  if (phrasing) {
    return sourceName ? phrasing.attack(targetName, sourceName) : phrasing.self(targetName)
  }
  // Generic fallback for unknown / custom conditions.
  return sourceName
    ? `${sourceName} applied ${conditionName} to ${targetName}!`
    : `${targetName} became ${conditionName}!`
}

/** Build the toast text from a structured notification. */
function buildToastText(n: CombatNotification): { text: string } {
  const targetName = n.combatantName ?? '?'
  const sourceName = n.sourceName
  if (n.type === 'damage') {
    if (n.ongoing) {
      const dt = n.damageType ? ` ${n.damageType}` : ''
      const fromSrc = sourceName ? ` from ${sourceName}` : ''
      if (n.becameBloodied) {
        return { text: `${targetName} was bloodied by ${n.amount}${dt} ongoing damage${fromSrc}!` }
      }
      return { text: `${targetName} took ${n.amount}${dt} ongoing damage${fromSrc}!` }
    }
    // Bloodying hit gets a dedicated phrasing so the subject of "bloodied" is
    // unambiguous (the target, not the attacker).
    if (n.becameBloodied) {
      return {
        text: sourceName
          ? `${sourceName} bloodied ${targetName} with ${n.amount} damage!`
          : `${targetName} took ${n.amount} damage and was bloodied!`,
      }
    }
    return {
      text: sourceName
        ? `${sourceName} hit ${targetName} for ${n.amount} damage!`
        : `${targetName} took ${n.amount} damage!`,
    }
  }
  if (n.type === 'heal') {
    return {
      text: sourceName
        ? `${targetName} was healed for ${n.amount} by ${sourceName}!`
        : `${targetName} was healed for ${n.amount}!`,
    }
  }
  if (n.type === 'death') {
    return {
      text: sourceName ? `${targetName} was slain by ${sourceName}!` : `${targetName} was slain!`,
    }
  }
  if (n.type === 'condition') {
    // Ongoing damage gets a dedicated "applied" phrasing — distinct from the
    // generic per-condition phrasing used for everything else.
    if (n.conditionId === 'ongoing-damage') {
      const dt = n.damageType ? ` ${n.damageType}` : ''
      const fromSrc = sourceName ? ` from ${sourceName}` : ''
      return { text: `${targetName} started taking ${n.amount}${dt} ongoing damage${fromSrc}!` }
    }
    return { text: phraseCondition(targetName, sourceName, n.conditionName ?? '?') }
  }
  if (n.type === 'save-success') {
    return { text: `${targetName} saved vs ${n.conditionName ?? '?'}!` }
  }
  if (n.type === 'save-fail') {
    return { text: `${targetName} failed save vs ${n.conditionName ?? '?'}!` }
  }
  return { text: n.message ?? '' }
}

function NotificationToasts({ notifications, combatants }: {
  notifications: CombatNotification[]
  combatants: Record<string, PlayerCombatantState>
}) {
  // Local state: which toasts are currently visible (with their entry time and
  // exiting flag). Driven by an effect that watches the incoming buffer for
  // new ids since last render.
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const seenIdsRef = useRef<Set<string>>(new Set())

  // On mount, mark every existing notification as already-seen so we don't
  // animate in a backlog when the player window first connects to a
  // mid-combat state.
  useEffect(() => {
    for (const n of notifications) if (n.id) seenIdsRef.current.add(n.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watch for new notifications.
  useEffect(() => {
    const fresh: ToastEntry[] = []
    for (const n of notifications) {
      if (!n.id || seenIdsRef.current.has(n.id)) continue
      seenIdsRef.current.add(n.id)
      fresh.push({ notification: n, enteredAt: Date.now(), exiting: false })
    }
    if (fresh.length > 0) {
      setToasts(prev => {
        const next = [...prev, ...fresh]
        // Cap visible toasts: oldest non-exiting drops first
        if (next.length > TOAST_MAX_VISIBLE) return next.slice(next.length - TOAST_MAX_VISIBLE)
        return next
      })
    }
  }, [notifications])

  // Schedule fade-out and removal for each toast.
  useEffect(() => {
    if (toasts.length === 0) return
    const timers: number[] = []
    for (const t of toasts) {
      if (t.exiting) continue
      const elapsed = Date.now() - t.enteredAt
      const remaining = Math.max(0, TOAST_HOLD_MS - elapsed)
      timers.push(window.setTimeout(() => {
        setToasts(prev => prev.map(p => p.notification.id === t.notification.id ? { ...p, exiting: true } : p))
      }, remaining))
      timers.push(window.setTimeout(() => {
        setToasts(prev => prev.filter(p => p.notification.id !== t.notification.id))
      }, remaining + TOAST_FADE_MS))
    }
    return () => { for (const t of timers) window.clearTimeout(t) }
  }, [toasts.length])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'absolute',
      bottom: 80,
      left: 540,        // matches the initiative column width
      right: 360,       // matches the turn-info sidebar width
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      pointerEvents: 'none',
      zIndex: 50,
    }}>
      {toasts.map(t => {
        const n = t.notification
        const targetCombatant = combatants[n.combatantId]
        const sourceCombatant = n.sourceId ? combatants[n.sourceId] : undefined
        const subjectColor = getSubjectColor(targetCombatant, n.combatantName ?? '')
        const sourceColor = sourceCombatant
          ? getSubjectColor(sourceCombatant, n.sourceName ?? '')
          : undefined
        const { text } = buildToastText(n)
        const renderToken = (c: PlayerCombatantState | undefined, fallbackName: string, ringColor: string) => (
          <div style={{ flexShrink: 0 }}>
            <CombatToken
              name={c?.name ?? fallbackName}
              baseName={c?.baseName}
              imageId={c?.imageId}
              tokenImageId={c?.tokenImageId}
              hp={100}
              maxHp={100}
              size={48}
              hideHpRing
              solidRingColor={ringColor}
            />
          </div>
        )
        // Two-token notifications get a diagonal gradient border (attacker → target),
        // mirroring the 2-damage-type ongoing damage pills. Single-token notifications
        // get a flat subject-colored border.
        const borderGradient = sourceColor
          ? `linear-gradient(135deg, ${sourceColor} 45%, ${subjectColor} 55%)`
          : null
        const glowColor = sourceColor ?? subjectColor
        return (
          <div key={n.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 10px',
            // Gradient-border trick: opaque inner background on padding-box,
            // gradient (or solid) on border-box. Border is transparent so the
            // border-box layer shows through.
            background: borderGradient
              ? `linear-gradient(var(--surface), var(--surface)) padding-box, ${borderGradient} border-box`
              : 'var(--surface)',
            border: borderGradient
              ? '2px solid transparent'
              : `2px solid ${subjectColor}`,
            borderRadius: 36,
            boxShadow: `var(--shadow-lg), 0 0 24px ${withAlpha(glowColor, 0.27)}`,
            fontFamily: 'var(--font-card)',
            fontSize: '1.2rem',
            color: 'var(--text)',
            opacity: t.exiting ? 0 : 1,
            transform: t.exiting ? 'translateY(-8px)' : 'translateY(0)',
            transition: `opacity ${TOAST_FADE_MS}ms ease-out, transform ${TOAST_FADE_MS}ms ease-out`,
            maxWidth: '100%',
          }}>
            {/* Attacker on the left if present, otherwise the lone subject token. */}
            {sourceCombatant
              ? renderToken(sourceCombatant, n.sourceName ?? '?', getSubjectColor(sourceCombatant, n.sourceName ?? ''))
              : renderToken(targetCombatant, n.combatantName ?? '?', subjectColor)}
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3, padding: '0 4px' }}>{text}</span>
            {/* Target on the right when there's a distinct attacker. */}
            {sourceCombatant && renderToken(targetCombatant, n.combatantName ?? '?', subjectColor)}
          </div>
        )
      })}
    </div>
  )
}
