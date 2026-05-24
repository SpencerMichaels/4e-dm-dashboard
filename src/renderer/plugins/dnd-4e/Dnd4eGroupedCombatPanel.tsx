import type { GroupedCombatPanelProps } from '../plugin-types'
import type { PowerEntry } from './PowerEntryEditor'
import type { CombatantState } from '@common/types'
import { PowerCardView, type PowerCardEntry } from './PowerCardView'
import { sign } from './dnd4e-utils'
import { detectConditions } from './condition-detection'
import { ConditionPill, buildConditionLabel } from './ConditionPill'
import { capitalize } from '@common/utils/format'
import { normalizeStringArray } from '@common/utils/arrays'
import { hpPercentage, hpColor, formatConditionName } from '@renderer/utils/combat-utils'
import styles from './Dnd4eGroupedCombatPanel.module.css'
import './statblock.css'

/** Convert a PowerEntry to a PowerCardEntry for read-only display */
function toPowerCardEntry(p: PowerEntry): PowerCardEntry {
  let kw: string[] | undefined = normalizeStringArray(p.keywords)
  if (kw.length === 0) kw = undefined

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

/** Derive a short designator label from the combatant's name, stripping the baseName prefix */
function getDesignator(c: CombatantState): string {
  const base = c.baseName ?? ''
  if (base && c.name.startsWith(base)) {
    const suffix = c.name.slice(base.length).trim()
    if (suffix) return suffix
  }
  // Fallback: use miniNumber or the full name
  if (c.miniNumber != null) return `#${c.miniNumber}`
  return c.name
}

/** Default designator color when combatant has no color assigned */
const DEFAULT_DESIGNATOR_BG = '#666'

export function Dnd4eGroupedCombatPanel({
  combatants, combat, conditions: conditionDefs, notifications,
  onDamage, onHeal, onAddCondition, onAddEffect,
  hideMainActionPowers, onPinCard, pinnedKeys, onPopoutStatblock,
}: GroupedCombatPanelProps) {
  // Use the first combatant as the reference for the shared stat block
  const ref = combatants[0]
  if (!ref) return null

  const sb = (ref.statBlock ?? {}) as Record<string, any>
  const baseName = ref.baseName ?? ref.name
  const actions = Array.isArray(sb.actions) ? sb.actions as PowerEntry[] : []

  // Shared stat block fields
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
  const defs = (sb.defenses ?? {}) as Record<string, number>
  const saveBonus = (sb.savingThrowBonus as number) ?? 0

  // Separate action types
  const hiddenActionTypes = new Set(['standard', 'move', 'minor'])
  const traitEntries = actions.filter(a => a.entryType === 'trait')
  const auraEntries = actions.filter(a => a.entryType === 'aura')
  const powerEntries = actions.filter(a => a.entryType === 'action' && !(hideMainActionPowers && hiddenActionTypes.has(a.actionType)))
  const usageOrder: Record<string, number> = { 'at-will': 0, 'encounter': 1, 'recharge': 2 }
  powerEntries.sort((a, b) => (usageOrder[a.usage] ?? 3) - (usageOrder[b.usage] ?? 3))

  const pinBtn = (key: string, title: string, content: any) => {
    const isPinned = pinnedKeys.has(key)
    return (
      <button
        onClick={() => onPinCard({ combatantName: baseName, title, content, key })}
        title={isPinned ? 'Unpin' : 'Pin to overlay'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
          fontSize: 10, color: isPinned ? 'var(--color-action-point)' : 'var(--color-text-muted)',
          opacity: isPinned ? 1 : 0.5,
        }}
      >
        {'\u{1F4CC}'}
      </button>
    )
  }

  return (
    <div className={`stat-block-4e ${styles.container}`}>

      {/* Header: base name with count and level/role */}
      <div className="sb-header">
        <span className="sb-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {baseName} ({'\u00D7'}{combatants.length})
        </span>
        <span>Level {sb.level} {(() => {
          const mod = sb.monsterModifier as string | undefined
          const role = sb.role as string | undefined
          return (mod ? capitalize(mod) + ' ' : '') + (role ? capitalize(role) : '')
        })()}</span>
      </div>

      {/* Individual state rows */}
      <div>
        {combatants.map(c => {
          const hpPct = hpPercentage(c.hp, c.maxHp)
          const designator = getDesignator(c)
          const chipBg = c.color ?? DEFAULT_DESIGNATOR_BG
          const isDead = c.dead || c.hp <= 0

          return (
            <div key={c.id} className={styles.stateRow} style={isDead ? { opacity: 0.45 } : undefined}>
              {/* Designator chip */}
              <span className={styles.designator} style={{ background: chipBg }}>
                {designator}
              </span>

              {/* HP bar */}
              <div className={styles.hpBarTrack}>
                <div
                  className={styles.hpBarFill}
                  style={{
                    width: `${Math.max(0, Math.min(100, hpPct))}%`,
                    background: hpPct > 0 ? hpColor(hpPct) : 'var(--color-text-muted)',
                  }}
                />
              </div>

              {/* HP numbers */}
              <div className={styles.hpInfo}>
                <span className={styles.hpCurrent} style={{ color: hpPct > 0 ? hpColor(hpPct) : 'var(--color-text-muted)' }}>
                  {c.hp}
                </span>
                <span className={styles.hpMax}>/ {c.maxHp}</span>
                {c.tempHp > 0 && <span className={styles.hpTemp}>+{c.tempHp}</span>}
              </div>

              {/* Status tags */}
              {isDead && <span className={styles.deadTag}>DEAD</span>}
              {!isDead && hpPct <= 50 && hpPct > 0 && <span className={styles.bloodiedTag}>BLOODIED</span>}

              {/* Condition pills */}
              <div className={styles.conditionPills}>
                {c.conditions.map(cond => {
                  const name = formatConditionName(cond.conditionId, conditionDefs, cond.customName)
                  const expiresOnName = cond.duration?.expiresOnId ? combat.combatants[cond.duration.expiresOnId]?.name : undefined
                  const pillLabel = buildConditionLabel({
                    conditionId: cond.conditionId, name, value: cond.value,
                    customDescription: cond.customDescription, damageType: cond.customDescription,
                    durationType: cond.duration?.type, expiresOnName,
                  })
                  return (
                    <ConditionPill
                      key={cond.conditionId}
                      conditionId={cond.conditionId}
                      label={pillLabel}
                      damageType={cond.customDescription}
                      customColor={cond.customColor}
                      customIcon={cond.customIcon}
                      title={name}
                      onClick={() => window.api.combat.removeCondition(c.id, cond.conditionId)}
                      style={{ fontSize: 9, lineHeight: '14px', cursor: 'pointer' }}
                    />
                  )
                })}
              </div>

              {/* Per-creature action buttons */}
              <div className={styles.rowActions}>
                <button className={styles.btnDamage} onClick={() => onDamage(c.id)} title="Damage">D</button>
                <button className={styles.btnHeal} onClick={() => onHeal(c.id)} title="Heal">H</button>
                <button className={styles.rowBtn} onClick={() => onAddCondition(c.id)} title="Add condition">+C</button>
                <button className={styles.rowBtn} onClick={() => onAddEffect(c.id)} title="Add effect">+E</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Divider between individual state and shared stat block */}
      <hr className={styles.divider} />

      {/* Shared stat block — rendered once from the reference combatant */}
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
            const key = `grouped:${baseName}:trait:${i}`
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
            const key = `grouped:${baseName}:aura:${i}`
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

      {/* Powers — read-only reference (no usage tracking) */}
      {powerEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {powerEntries.map((pow, i) => {
            const globalIdx = actions.indexOf(pow)
            const entry = toPowerCardEntry(pow)
            const pinKey = `grouped:${baseName}:power:${globalIdx}`

            return (
              <div key={globalIdx} style={{ marginTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <PowerCardView entry={entry}
                      detectedConditions={detectConditions({ hit: pow.hit, effect: pow.effect, miss: pow.miss, target: pow.target })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
                    {pinBtn(pinKey, pow.name, entry)}
                  </div>
                </div>
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
