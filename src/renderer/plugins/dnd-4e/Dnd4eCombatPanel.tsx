import { useState, useEffect } from 'react'
import type { PluginCombatPanelProps } from '../plugin-types'
import type { PowerEntry } from './PowerEntryEditor'
import { PowerCardView, type PowerCardEntry } from './PowerCardView'
import { USAGE_COLORS, sign } from './dnd4e-utils'
import { detectConditions, type DetectedCondition } from './condition-detection'
import { ConditionPill, buildConditionLabel } from './ConditionPill'
import './statblock.css'

/** Extract max uses for a power: 1 for normal encounter, N for "N/Encounter" in keywords, Infinity for at-will */
function getMaxUses(p: PowerEntry): number {
  const kw = Array.isArray(p.keywords) ? p.keywords : []
  for (const k of kw) {
    const m = String(k).match(/^(\d+)\/encounter$/i)
    if (m) return parseInt(m[1])
    const m2 = String(k).match(/^at-will\s*\((\d+)\/\w+\)$/i)
    if (m2) return parseInt(m2[1])
  }
  if (p.usage === 'encounter') return 1
  if (p.usage === 'recharge') return 1
  return Infinity  // at-will
}

/** Convert a PowerEntry from the stat block into a PowerCardEntry for display */
function toPowerCardEntry(p: PowerEntry): PowerCardEntry {
  // keywords may be string[] (from editor) or string (from imported data)
  let kw = Array.isArray(p.keywords) ? [...p.keywords]
    : typeof p.keywords === 'string' ? (p.keywords as string).split(',').map(k => k.trim()).filter(Boolean)
    : undefined

  // Extract "X/Encounter" or "X/round" from keywords → override usage (keep keyword for display)
  let usage = p.usage || 'at-will'
  if (kw) {
    const hasEncounterKw = kw.some(k => /^\d+\/encounter$/i.test(String(k).trim()))
    if (hasEncounterKw) usage = 'encounter'
  }

  return {
    name: p.name,
    usage,
    actionType: p.actionType,
    rechargeValue: p.rechargeCondition ? (parseInt(p.rechargeCondition) || undefined) : undefined,
    rechargeCondition: p.rechargeCondition && isNaN(parseInt(p.rechargeCondition)) ? p.rechargeCondition : undefined,
    keywords: kw?.length ? kw : undefined,
    rangeType: (p as any).range ?? p.rangeType,
    rangeValue: p.rangeValue,
    target: p.target,
    attackBonus: p.attackBonus ?? null,
    defense: p.defense,
    damage: p.damage,
    hit: p.hit,
    critical: (p as any).critical,
    miss: p.miss,
    effect: p.effect,
    trigger: p.trigger,
    requirement: p.requirement,
    sustain: p.sustain,
    text: (p as any).text,
    levelScaling: (p as any).levelScaling,
  }
}

export function Dnd4eCombatPanel({
  combatant: c, combat, isCurrent, isDelayed,
  onUsePower, onUnusePower, onQuickDamage,
  onDamage, onHeal, onAddCondition, onAddEffect, onDelay, onUndelay, onRemove,
  conditions: conditionDefs, notifications, onPinCard, pinnedKeys, onApplyConditionToTargets,
  onPopoutStatblock, hideMainActionPowers,
}: PluginCombatPanelProps) {
  const sb = (c.statBlock ?? {}) as Record<string, any>
  const actions = Array.isArray(sb.actions) ? sb.actions as PowerEntry[] : []
  const hpPct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0
  const usedPowers = c.usedPowers ?? {}
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

  // Extract stat block fields
  const abilities = (sb.abilities as Record<string, number>) ?? {}
  const skills = (sb.skills as Record<string, number>) ?? {}
  const speeds = (sb.speeds as Record<string, number>) ?? {}
  const immunities = Array.isArray(sb.immunities) ? sb.immunities as { type: string }[] : []
  const resistances = Array.isArray(sb.resistances) ? sb.resistances as { type: string; value?: number }[] : []
  const weaknesses = Array.isArray(sb.weaknesses) ? sb.weaknesses as { type: string; value?: number }[] : []
  const languages = Array.isArray(sb.languages) ? sb.languages as string[] : typeof sb.languages === 'string' ? (sb.languages as string).split(',').map(s => s.trim()).filter(Boolean) : []
  const senses = Array.isArray(sb.senses)
    ? (sb.senses as any[]).map(s => typeof s === 'string' ? s : s?.name).filter(Boolean)
    : typeof sb.senses === 'string' ? (sb.senses as string).split(',').map(s => s.trim()).filter(Boolean) : []
  const equipment = Array.isArray(sb.equipment) ? sb.equipment as string[] : typeof sb.equipment === 'string' ? (sb.equipment as string).split(',').map(s => s.trim()).filter(Boolean) : []

  // Separate action types
  const hiddenActionTypes = new Set(['standard', 'move', 'minor'])
  const traitEntries = actions.filter(a => a.entryType === 'trait')
  const auraEntries = actions.filter(a => a.entryType === 'aura')
  const powerEntries = actions.filter(a => a.entryType === 'action' && !(hideMainActionPowers && hiddenActionTypes.has(a.actionType)))
  const usageOrder: Record<string, number> = { 'at-will': 0, 'encounter': 1, 'recharge': 2 }
  powerEntries.sort((a, b) => (usageOrder[a.usage] ?? 3) - (usageOrder[b.usage] ?? 3))

  // Notification auto-dismiss

  const defs = (sb.defenses ?? {}) as Record<string, number>
  const saveBonus = (sb.savingThrowBonus as number) ?? 0
  const totalAP = (sb.actionPoints as number) ?? 0
  const usedAP = c.usedActionPoints ?? 0
  const remainingAP = Math.max(0, totalAP - usedAP)

  const pinBtn = (key: string, title: string, content: any) => {
    const isPinned = pinnedKeys.has(key)
    return (
      <button
        onClick={() => onPinCard({ combatantName: c.name, title, content, key })}
        title={isPinned ? 'Unpin' : 'Pin to overlay'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
          fontSize: 10, color: isPinned ? '#e8a020' : 'var(--color-text-muted)',
          opacity: isPinned ? 1 : 0.5,
        }}
      >
        📌
      </button>
    )
  }

  const btnStyle = {
    padding: '3px 10px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)', cursor: 'pointer',
    fontSize: 'var(--font-size-xs)', background: 'var(--color-bg-surface)',
  }

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5, overflow: 'auto' }}>

      {/* Header: name + badges */}
      <div className="sb-header">
        <span className="sb-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {c.name}
          {onPopoutStatblock && (
            <button onClick={() => onPopoutStatblock(c.id)}
              title="Pop out full stat block as a floating window"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'inherit', padding: 2, fontSize: 12, lineHeight: 1,
                display: 'inline-flex', alignItems: 'center',
              }}>↗</button>
          )}
        </span>
        <span>Level {sb.level} {(() => {
          const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
          const mod = sb.monsterModifier as string | undefined
          const role = sb.role as string | undefined
          return (mod ? cap(mod) + ' ' : '') + (role ? cap(role) : '')
        })()}</span>
      </div>

      {/* HP + AP line */}
      <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--sb-separator)' }}>
        <b style={{ fontSize: 11 }}>HP</b>
        <span style={{ fontWeight: 700, fontSize: 13, color: hpPct > 50 ? '#0a0' : hpPct > 25 ? '#c90' : hpPct > 0 ? '#c00' : 'var(--color-text-muted)' }}>{c.hp}</span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>/ {c.maxHp}</span>
        {c.tempHp > 0 && <span style={{ color: '#09f', fontSize: 11, fontWeight: 600 }}>+{c.tempHp} temp</span>}
        {hpPct <= 50 && hpPct > 0 && <span style={{ color: '#c00', fontSize: 10, fontWeight: 700 }}>BLOODIED</span>}
        {totalAP > 0 && (
          <>
            <div style={{ flex: 1 }} />
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => {
                if (remainingAP > 0) window.api.combat.updateCombatant(c.id, { usedActionPoints: usedAP + 1 })
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (usedAP > 0) window.api.combat.updateCombatant(c.id, { usedActionPoints: usedAP - 1 })
              }}
              title="Left click: spend AP · Right click: restore AP"
            >
              <b style={{ fontSize: 11 }}>AP</b>
              {Array.from({ length: totalAP }, (_, i) => (
                <span key={i} style={{ fontSize: 14, color: i < remainingAP ? '#e8a020' : 'var(--color-text-muted)', opacity: i < remainingAP ? 1 : 0.3 }}>
                  {i < remainingAP ? '●' : '○'}
                </span>
              ))}
            </div>
          </>
        )}
      </div>




      {/* Active conditions strip */}
      {c.conditions.length > 0 && (
        <div style={{
          padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
          borderBottom: '1px solid var(--sb-separator)',
          background: 'rgba(0,0,0,0.15)',
        }}>
          {c.conditions.map(cond => {
            const def = conditionDefs.find(d => d.id === cond.conditionId)
              ?? (cond.conditionId.startsWith('ongoing-damage') ? conditionDefs.find(d => d.id === 'ongoing-damage') : undefined)
            const name = cond.customName
              ?? (cond.conditionId.startsWith('ongoing-damage') ? 'Ongoing Damage'
                : def?.name ?? cond.conditionId.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()))
            const expiresOnName = cond.duration?.expiresOnId ? combat.combatants[cond.duration.expiresOnId]?.name : undefined
            const pillLabel = buildConditionLabel({
              conditionId: cond.conditionId, name, value: cond.value,
              customDescription: cond.customDescription, damageType: cond.customDescription,
              durationType: cond.duration?.type, expiresOnName,
            })
            const tooltipParts = [name, cond.customDescription ?? def?.description].filter(Boolean)
            if (cond.duration?.type) {
              const durLabels: Record<string, string> = {
                'save-ends': 'save ends',
                'sont': `SONT ${expiresOnName ?? '?'}`,
                'eont': `EONT ${expiresOnName ?? '?'}`,
                'encounter': 'encounter',
                'rounds': cond.duration.remaining != null ? `${cond.duration.remaining}rd` : 'rounds',
              }
              const durLabel = durLabels[cond.duration.type]
              if (durLabel) tooltipParts.push(`(${durLabel})`)
            }
            return (
              <ConditionPill
                key={cond.conditionId}
                conditionId={cond.conditionId}
                label={pillLabel}
                damageType={cond.customDescription}
                customColor={cond.customColor}
                customIcon={cond.customIcon}
                title={tooltipParts.join(' — ')}
                onClick={() => window.api.combat.removeCondition(c.id, cond.conditionId)}
                style={{ fontSize: 10, lineHeight: '16px', cursor: 'pointer' }}
              />
            )
          })}
        </div>
      )}

      {/* Full stat block */}
      <div className="sb-row" style={{ fontSize: 11 }}>
        <span><b className="sb-label">Initiative</b> {sign((sb.initiative as number) ?? 0)}</span>;{' '}
        <span><b className="sb-label">Senses</b> Perception {sign((sb.perception as number) ?? 0)}
          {senses.length > 0 && <>; {senses.join(', ')}</>}</span>
      </div>
      {((sb.speed as number) > 0 || Object.keys(speeds).length > 0) && (
        <div className="sb-row" style={{ fontSize: 11 }}>
          <b className="sb-label">Speed</b>{' '}
          {(sb.speed as number) > 0 && <span>{sb.speed as number}</span>}
          {Object.entries(speeds).map(([key, val], i) => (
            <span key={key}>{((sb.speed as number) > 0 || i > 0) && ', '}{key.replace(/_/g, ' ')} {val}</span>
          ))}
        </div>
      )}
      <div className="sb-row" style={{ fontSize: 11, borderTop: '1px solid var(--sb-separator)' }}>
        <span><b className="sb-label">AC</b> {sb.ac ?? 10};</span>
        <span><b className="sb-label">Fortitude</b> {defs.fortitude ?? 10},</span>
        <span><b className="sb-label">Reflex</b> {defs.reflex ?? 10},</span>
        <span><b className="sb-label">Will</b> {defs.will ?? 10}</span>
      </div>
      {(immunities.length > 0 || resistances.length > 0 || weaknesses.length > 0) && (
        <div className="sb-row" style={{ fontSize: 11 }}>
          {immunities.length > 0 && <span><b className="sb-label">Immune</b> {immunities.map(e => e.type).join(', ')}</span>}
          {immunities.length > 0 && (resistances.length > 0 || weaknesses.length > 0) && <>; </>}
          {resistances.length > 0 && <span><b className="sb-label">Resist</b> {resistances.map(e => `${e.type} ${e.value ?? ''}`).join(', ').trim()}</span>}
          {resistances.length > 0 && weaknesses.length > 0 && <>; </>}
          {weaknesses.length > 0 && <span><b className="sb-label">Vulnerable</b> {weaknesses.map(e => `${e.type} ${e.value ?? ''}`).join(', ').trim()}</span>}
        </div>
      )}
      {saveBonus > 0 && (
        <div className="sb-row" style={{ fontSize: 11 }}>
          <span><b className="sb-label">Saving Throws</b> +{saveBonus}</span>
        </div>
      )}

      {/* Traits */}
      {traitEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {traitEntries.map((t, i) => {
            const key = `${c.id}:trait:${i}`
            const body = t.effect || t.text || (t as any).description || ''
            return (
              <div key={i} style={{ marginTop: 2, display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: 1 }}>
                  <div style={{ padding: '2px 8px', background: '#7a6f5e', color: '#fff' }}>
                    <b>{t.name}</b>
                  </div>
                  {body && <div style={{ padding: '1px 8px 2px 16px' }}>{body}</div>}
                </div>
                <div style={{ paddingTop: 2 }}>{pinBtn(key, t.name, body)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Auras */}
      {auraEntries.length > 0 && (
        <div style={{ paddingTop: 2 }}>
          {auraEntries.map((a, i) => {
            const key = `${c.id}:aura:${i}`
            const auraRange = (a as any).auraRange ?? a.rangeValue ?? 1
            const body = a.effect || a.text || (a as any).description || ''
            return (
              <div key={i} style={{ marginTop: 2, display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: 1 }}>
                  <div style={{ padding: '2px 8px', background: '#7a6f5e', color: '#fff' }}>
                    <b>{a.name}</b>
                    <span style={{ color: 'rgba(255,255,255,0.8)' }}> (aura {auraRange})</span>
                  </div>
                  {body && <div style={{ padding: '1px 8px 2px 16px' }}>{body}</div>}
                </div>
                <div style={{ paddingTop: 2 }}>{pinBtn(key, a.name, `aura ${auraRange}; ${body}`)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Powers — interactive */}
      {powerEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {powerEntries.map((pow, i) => {
            const globalIdx = actions.indexOf(pow)
            const timesUsed = usedPowers[globalIdx] ?? 0
            const maxUses = getMaxUses(pow)
            const isFullyUsed = maxUses !== Infinity && timesUsed >= maxUses
            const canToggleUsed = maxUses !== Infinity
            const entry = toPowerCardEntry(pow)
            const pinKey = `${c.id}:power:${globalIdx}`

            return (
              <div key={globalIdx} style={{
                marginTop: 2, position: 'relative',
                opacity: isFullyUsed ? 0.4 : 1,
                transition: 'opacity 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div
                    onClick={canToggleUsed ? () => {
                      if (isFullyUsed) onUnusePower(globalIdx)
                      else onUsePower(globalIdx)
                    } : undefined}
                    onContextMenu={canToggleUsed ? (e) => {
                      e.preventDefault()
                      if (timesUsed > 0) onUnusePower(globalIdx)
                    } : undefined}
                    style={{ cursor: canToggleUsed ? 'pointer' : 'default', flex: 1, position: 'relative' }}
                    title={canToggleUsed ? 'Left click: use · Right click: restore' : undefined}
                  >
                    <PowerCardView entry={entry}
                      detectedConditions={detectConditions({ hit: pow.hit, effect: pow.effect, miss: pow.miss, target: pow.target })}
                      onConditionClick={(det, multi) => {
                        const condData: any = {
                          conditionId: det.conditionId,
                          value: det.value,
                          customDescription: det.damageType,
                          sourceId: c.id,
                          duration: det.duration,
                        }
                        // For marked conditions from power cards, add the "by" description
                        if (det.conditionId === 'marked') {
                          condData.customDescription = `by ${c.name}`
                        }
                        // For Regenerating, set encounter duration and clear damageType description
                        if (det.conditionId === 'regenerating') {
                          condData.duration = det.duration ?? { type: 'encounter' }
                          condData.customDescription = undefined
                        }
                        // For Grants CA, set the recipient enum + preformatted label suffix.
                        // Source name resolves to the power's owner (`c.name`).
                        if (det.conditionId === 'combat-advantage') {
                          const recipient = det.grantsCATo ?? 'all'
                          condData.grantsCATo = recipient
                          if (recipient === 'source') condData.customDescription = `to ${c.name}`
                          else if (recipient === 'source-allies') condData.customDescription = `to ${c.name}'s allies`
                          else condData.customDescription = undefined  // 'all' has no suffix
                        }
                        onApplyConditionToTargets(condData, multi)
                      }}
                    />
                    {/* Usage counter overlaid on header — only for multi-use powers */}
                    {maxUses > 1 && maxUses !== Infinity && (
                      <div style={{
                        position: 'absolute', top: 2, right: 8,
                        fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
                      }}>
                        {timesUsed}/{maxUses}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
                    {pinBtn(pinKey, pow.name, entry)}
                  </div>
                </div>
                {isFullyUsed && (
                  <div style={{
                    position: 'absolute', top: 0, left: 8, right: 8, height: '1.5em',
                    display: 'flex', alignItems: 'center', pointerEvents: 'none',
                  }}>
                    <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.5)' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom stats: alignment, languages, skills, abilities, equipment */}
      <div style={{ borderTop: '1px solid var(--sb-separator)', fontSize: 11 }}>
        {(sb.alignment as string) && (
          <div className="sb-row"><b className="sb-label">Alignment</b> {sb.alignment as string}</div>
        )}
        {languages.length > 0 && (
          <div className="sb-row"><b className="sb-label">Languages</b> {languages.join(', ')}</div>
        )}
        {Object.keys(skills).length > 0 && (
          <div className="sb-row"><b className="sb-label">Skills</b> {Object.entries(skills).map(([name, mod]) => `${cap(name)} ${sign(mod)}`).join(', ')}</div>
        )}
        {Object.keys(abilities).length > 0 && (
          <div className="sb-abilities">
            {['str', 'dex', 'wis', 'con', 'int', 'cha'].filter(ab => abilities[ab] != null).map(ab => {
              const score = abilities[ab]
              const mod = Math.floor((score - 10) / 2)
              return <span key={ab}><b className="sb-label">{cap(ab)}</b> {score} ({mod >= 0 ? '+' : ''}{mod})</span>
            })}
          </div>
        )}
        {equipment.length > 0 && (
          <div className="sb-row"><b className="sb-label">Equipment</b> {equipment.join(', ')}</div>
        )}
      </div>

    </div>
  )
}
