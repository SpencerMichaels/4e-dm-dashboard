import { toPowerCardEntry } from '../creature/power-card-entry'
import { useState, useEffect } from 'react'
import type { PluginCombatPanelProps } from './panel-types'
import type { PowerEntry } from '../creature/PowerEntryEditor'
import { PowerCardView, type PowerCardEntry } from '../creature/PowerCardView'
import { USAGE_COLORS, sign } from '../creature/dnd4e-utils'
import { detectConditions, detectDiseases, type DetectedCondition } from './condition-detection'
import { useDiseaseNames } from '../disease/disease-refs'
import { ConditionPill, buildConditionLabel } from './ConditionPill'
import { capitalize } from '@common/utils/format'
import { combatStatBlock } from './combat-view'
import { normalizeStringArray } from '@common/utils/arrays'
import { hpPercentage, hpColor, formatConditionName } from '@renderer/utils/combat-utils'
import '../creature/statblock.css'

/** Extract max uses for a power: 1 for normal encounter, N for "N/Encounter" in keywords, Infinity for at-will */
function getMaxUses(p: PowerEntry): number {
  const uses = (p as any).encounterUses
  if (typeof uses === 'number' && uses > 0) return uses
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


export function Dnd4eCombatPanel({
  combatant: c, combat, isCurrent, isDelayed,
  onUsePower, onUnusePower, onQuickDamage,
  onDamage, onHeal, onAddCondition, onAddEffect, onDelay, onUndelay, onRemove,
  conditions: conditionDefs, notifications, onPinCard, pinnedKeys, onApplyConditionToTargets, onApplyDiseaseToTargets,
  onPopoutStatblock, hideMainActionPowers, onToggleDisabled,
}: PluginCombatPanelProps) {
  const sb = combatStatBlock(c)
  const isTrap = c.kind === 'trap'
  const actions = Array.isArray(sb.actions) ? sb.actions as PowerEntry[] : []
  const diseaseNames = useDiseaseNames()
  /** Condition keywords and disease names in a power's text; both highlight and apply to targets. */
  const detect = (pow: PowerEntry): DetectedCondition[] => {
    const conditions = detectConditions({ hit: pow.hit, effect: pow.effect, miss: pow.miss, target: pow.target })
    return [...conditions, ...detectDiseases(pow, diseaseNames, conditions)]
  }
  /** A highlighted condition or disease clicked in a card: pick targets to apply it to. */
  const applyDetection = (det: DetectedCondition, multi: boolean) => {
    if (det.disease) { onApplyDiseaseToTargets?.(det.disease, det.conditionName, multi); return }
    const condData: any = { conditionId: det.conditionId, value: det.value, customDescription: det.damageType, sourceId: c.id, duration: det.duration }
    // Marked: "by <source>".
    if (det.conditionId === 'marked') condData.customDescription = `by ${c.name}`
    // Regenerating lasts the encounter and has no damage type.
    if (det.conditionId === 'regenerating') {
      condData.duration = det.duration ?? { type: 'encounter' }
      condData.customDescription = undefined
    }
    // Grants combat advantage: the recipient and its label suffix; the source is the power's owner.
    if (det.conditionId === 'combat-advantage') {
      const recipient = det.grantsCATo ?? 'all'
      condData.grantsCATo = recipient
      condData.customDescription = recipient === 'source' ? `to ${c.name}` : recipient === 'source-allies' ? `to ${c.name}'s allies` : undefined
    }
    onApplyConditionToTargets(condData, multi)
  }
  const hpPct = hpPercentage(c.hp, c.maxHp)
  const usedPowers = c.usedPowers ?? {}

  // Extract stat block fields
  const abilities = (sb.abilities as Record<string, number>) ?? {}
  const skills = (sb.skills as Record<string, number>) ?? {}
  const speeds = (sb.speeds as Record<string, number>) ?? {}
  const immunities = Array.isArray(sb.immunities) ? sb.immunities as { type: string }[] : []
  const resistances = Array.isArray(sb.resistances) ? sb.resistances as { type: string; value?: number }[] : []
  const weaknesses = Array.isArray(sb.weaknesses) ? sb.weaknesses as { type: string; value?: number }[] : []
  const languages = normalizeStringArray(sb.languages)
  const senses = Array.isArray(sb.senses)
    ? (sb.senses as any[]).map(s => typeof s === 'string' ? s : s?.name).filter(Boolean)
    : typeof sb.senses === 'string' ? (sb.senses as string).split(',').map(s => s.trim()).filter(Boolean) : []
  const equipment = normalizeStringArray(sb.equipment)

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
          const mod = sb.monsterModifier as string | undefined
          const role = sb.role as string | undefined
          return (mod ? capitalize(mod) + ' ' : '') + (role ? capitalize(role) : '')
        })()}</span>
      </div>

      {/* HP + AP line */}
      <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--sb-separator)' }}>
        <b style={{ fontSize: 11 }}>HP</b>
        {sb.noHitPoints
          // Traps without hit points are stopped by countermeasures (Disable), not damage.
          ? <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{sb.hpText || 'none'}{c.dead ? ' (disabled)' : ''}</span>
          : <>
            <span style={{ fontWeight: 700, fontSize: 13, color: hpPct > 0 ? hpColor(hpPct) : 'var(--color-text-muted)' }}>{c.hp}</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>/ {c.maxHp}</span>
          </>}
        {c.tempHp > 0 && <span style={{ color: 'var(--color-temp-hp)', fontSize: 11, fontWeight: 600 }}>+{c.tempHp} temp</span>}
        {hpPct <= 50 && hpPct > 0 && <span style={{ color: 'var(--color-hp-low)', fontSize: 10, fontWeight: 700 }}>BLOODIED</span>}
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
                <span key={i} style={{ fontSize: 14, color: i < remainingAP ? 'var(--color-action-point)' : 'var(--color-text-muted)', opacity: i < remainingAP ? 1 : 0.3 }}>
                  {i < remainingAP ? '●' : '○'}
                </span>
              ))}
            </div>
          </>
        )}
        {c.kind === 'trap' && onToggleDisabled && (
          <>
            <div style={{ flex: 1 }} />
            <button style={btnStyle} onClick={onToggleDisabled}
              title={c.dead ? 'The trap works again' : 'A countermeasure stopped the trap'}>{c.dead ? 'Re-arm' : 'Disable'}</button>
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
            const name = formatConditionName(cond.conditionId, conditionDefs, cond.customName)
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
      {/* Traps print only what they have: often no initiative, senses, or defenses. */}
      {isTrap ? (sb.initiative !== undefined && (
        <div className="sb-row" style={{ fontSize: 11 }}><span><b className="sb-label">Initiative</b> {sign(sb.initiative as number)}</span></div>
      )) : (
      <div className="sb-row" style={{ fontSize: 11 }}>
        <span><b className="sb-label">Initiative</b> {sign((sb.initiative as number) ?? 0)}</span>;{' '}
        <span><b className="sb-label">Senses</b> Perception {sign((sb.perception as number) ?? 0)}
          {senses.length > 0 && <>; {senses.join(', ')}</>}</span>
      </div>
      )}
      {((sb.speed as number) > 0 || Object.keys(speeds).length > 0) && (
        <div className="sb-row" style={{ fontSize: 11 }}>
          <b className="sb-label">Speed</b>{' '}
          {(sb.speed as number) > 0 && <span>{sb.speed as number}</span>}
          {Object.entries(speeds).map(([key, val], i) => (
            <span key={key}>{((sb.speed as number) > 0 || i > 0) && ', '}{key.replace(/_/g, ' ')} {val}</span>
          ))}
        </div>
      )}
      {(!isTrap || sb.ac !== undefined || Object.keys(defs).length > 0) && <div className="sb-row" style={{ fontSize: 11 }}>
        <span><b className="sb-label">AC</b> {sb.ac ?? 10};</span>
        <span><b className="sb-label">Fortitude</b> {defs.fortitude ?? 10},</span>
        <span><b className="sb-label">Reflex</b> {defs.reflex ?? 10},</span>
        <span><b className="sb-label">Will</b> {defs.will ?? 10}</span>
      </div>}
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

      {/* Traits and auras: the same card as powers, pinned from its header */}
      {(traitEntries.length > 0 || auraEntries.length > 0) && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {[...traitEntries, ...auraEntries].map(t => {
            const idx = actions.indexOf(t)
            const key = `${c.id}:${t.entryType}:${idx}`
            const entry = toPowerCardEntry(t.entryType === 'aura' ? { ...t, rangeType: 'aura', rangeValue: String((t as any).auraSize ?? (t as any).auraRange ?? t.rangeValue ?? 1) } : t)
            return <PowerCardView key={key} entry={entry} detectedConditions={detect(t)} onConditionClick={applyDetection}
              pinned={pinnedKeys.has(key)} onPin={() => onPinCard({ combatantName: c.name, title: t.name, content: entry, key })} />
          })}
        </div>
      )}

      {/* Powers: click to use, right-click to restore; a spent power collapses and says so in its chip */}
      {powerEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {powerEntries.map(pow => {
            const globalIdx = actions.indexOf(pow)
            const timesUsed = usedPowers[globalIdx] ?? 0
            const maxUses = getMaxUses(pow)
            const entry = toPowerCardEntry(pow)
            const key = `${c.id}:power:${globalIdx}`
            return <PowerCardView key={globalIdx} entry={entry} detectedConditions={detect(pow)} onConditionClick={applyDetection}
              uses={{ used: timesUsed, max: maxUses }}
              onUse={maxUses !== Infinity ? () => onUsePower(globalIdx) : undefined}
              onRestore={timesUsed > 0 ? () => onUnusePower(globalIdx) : undefined}
              pinned={pinnedKeys.has(key)} onPin={() => onPinCard({ combatantName: c.name, title: pow.name, content: entry, key })} />
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
          <div className="sb-row"><b className="sb-label">Skills</b> {Object.entries(skills).map(([name, mod]) => `${capitalize(name)} ${sign(mod)}`).join(', ')}</div>
        )}
        {Object.keys(abilities).length > 0 && (
          <div className="sb-abilities">
            {['str', 'dex', 'wis', 'con', 'int', 'cha'].filter(ab => abilities[ab] != null).map(ab => {
              const score = abilities[ab]
              const mod = Math.floor((score - 10) / 2)
              return <span key={ab}><b className="sb-label">{capitalize(ab)}</b> {score} ({mod >= 0 ? '+' : ''}{mod})</span>
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
