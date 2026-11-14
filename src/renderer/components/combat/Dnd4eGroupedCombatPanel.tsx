import { isDefeated } from '@common/combat/facts'
import { toPowerCardEntry } from '../creature/power-card-entry'
import type { GroupedCombatPanelProps } from './panel-types'
import type { PowerEntry } from '../creature/PowerEntryEditor'
import type { CombatantState } from '@common/types'
import { combatStatBlock } from './combat-view'
import { PowerCardView, type PowerCardEntry } from '../creature/PowerCardView'
import { sign } from '../creature/dnd4e-utils'
import { detectConditions } from './condition-detection'
import { ConditionPill, buildConditionLabel } from './ConditionPill'
import { capitalize } from '@common/utils/format'
import { normalizeStringArray } from '@common/utils/arrays'
import { hpPercentage, hpColor, formatConditionName } from '@renderer/utils/combat-utils'
import styles from './Dnd4eGroupedCombatPanel.module.css'
import '../creature/statblock.css'


/** Derive a short designator label for a grouped creature.
 *  Strips the baseName to show only the distinguishing parts:
 *  "green orc darkblade 2" → "Green 2", "orc darkblade" → the full name.
 *  If the name doesn't follow the [color] [baseName] [number] pattern
 *  (i.e. was manually renamed), show the full custom name. */
function getDesignator(c: CombatantState): string {
  const base = c.baseName ?? ''
  if (!base || c.name === base) return c.name

  // Check if the name follows the standard pattern: [prefix] baseName [suffix]
  const idx = c.name.indexOf(base)
  if (idx < 0) {
    // Name doesn't contain baseName at all — it's a custom name
    return c.name
  }

  const prefix = c.name.slice(0, idx).trim()   // e.g. "green" (color word)
  const rawSuffix = c.name.slice(idx + base.length).trim() // e.g. "2" or "(bow)"
  // Strip parentheses from descriptor — "(bow)" → "bow"
  const suffix = rawSuffix.replace(/^\((.+)\)$/, '$1')

  const parts: string[] = []
  if (prefix) parts.push(capitalize(prefix))
  if (suffix) parts.push(suffix)

  return parts.length > 0 ? parts.join(' ') : c.name
}

/** Naive English pluralization for creature names */
function pluralize(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z') || lower.endsWith('sh') || lower.endsWith('ch')) return name + 'es'
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies'
  return name + 's'
}

/** Default designator color when combatant has no color assigned (constant in both themes, under white text) */
const DEFAULT_DESIGNATOR_BG = 'var(--tone-neutral)'

export function Dnd4eGroupedCombatPanel({
  combatants, combat, conditions: conditionDefs, notifications,
  onDamage, onHeal, onAddCondition, onAddEffect,
  hideMainActionPowers, onPinCard, pinnedKeys, onPopoutStatblock,
}: GroupedCombatPanelProps) {
  // Use the first combatant as the reference for the shared stat block
  const ref = combatants[0]
  if (!ref) return null

  const sb = combatStatBlock(ref)
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


  return (
    <div className={`stat-block-4e ${styles.container}`}>

      {/* Header: pluralized base name and level/role */}
      <div className="sb-header">
        <span className="sb-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {pluralize(baseName)} ({'\u00D7'}{combatants.length})
        </span>
        <span>Level {sb.level} {(() => {
          const mod = sb.monsterModifier as string | undefined
          const role = sb.role as string | undefined
          return (mod ? capitalize(mod) + ' ' : '') + (role ? capitalize(role) : '')
        })()}</span>
      </div>

      {/* Individual state rows */}
      <div className="striped-rows">
        {combatants.map(c => {
          const hpPct = hpPercentage(c.hp, c.maxHp)
          const designator = getDesignator(c)
          const chipBg = c.color ?? DEFAULT_DESIGNATOR_BG
          const isDead = isDefeated(c)

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
                    background: hpPct > 0 ? hpColor(hpPct) : 'var(--muted)',
                  }}
                />
              </div>

              {/* HP numbers */}
              <div className={styles.hpInfo}>
                <span className={styles.hpCurrent} style={{ color: hpPct > 0 ? hpColor(hpPct) : 'var(--muted)' }}>
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
      <div className="sb-row" style={{ fontSize: 11 }}>
        <span><b className="sb-label">AC</b> {sb.ac ?? 10};</span>
        <span><b className="sb-label">Fortitude</b> {defs.fortitude ?? 10},</span>
        <span><b className="sb-label">Reflex</b> {defs.reflex ?? 10},</span>
        <span><b className="sb-label">Will</b> {defs.will ?? 10}</span>
      </div>
      {(immunities.length > 0 || resistances.length > 0 || weaknesses.length > 0) && (
        <div className="sb-row" style={{ fontSize: 11 }}>
          {immunities.length > 0 && <span><b className="sb-label">Immune</b> {immunities.map(e => e.type).join(', ')}</span>}
          {immunities.length > 0 && (resistances.length > 0 || weaknesses.length > 0) && <>; </>}
          {resistances.length > 0 && <span><b className="sb-label">Resist</b> {resistances.map(e => e.value != null && e.value !== '' ? `${e.type} ${e.value}` : e.type).join(', ')}</span>}
          {resistances.length > 0 && weaknesses.length > 0 && <>; </>}
          {weaknesses.length > 0 && <span><b className="sb-label">Vulnerable</b> {weaknesses.map(e => e.value != null && e.value !== '' ? `${e.type} ${e.value}` : e.type).join(', ')}</span>}
        </div>
      )}
      {saveBonus > 0 && (
        <div className="sb-row" style={{ fontSize: 11 }}>
          <span><b className="sb-label">Saving Throws</b> +{saveBonus}</span>
        </div>
      )}

      {/* Traits, auras, and powers: the same card, read-only here (no use tracking), pinned from its header */}
      {actions.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {[...traitEntries, ...auraEntries, ...powerEntries].map(a => {
            const idx = actions.indexOf(a)
            const key = `grouped:${baseName}:${a.entryType}:${idx}`
            const entry = toPowerCardEntry(a.entryType === 'aura' ? { ...a, rangeType: 'aura', rangeValue: String((a as any).auraSize ?? (a as any).auraRange ?? a.rangeValue ?? 1) } : a)
            return <PowerCardView key={key} entry={entry}
              detectedConditions={a.entryType === 'action' ? detectConditions({ hit: a.hit, effect: a.effect, miss: a.miss, target: a.target }) : undefined}
              pinned={pinnedKeys.has(key)} onPin={() => onPinCard({ combatantName: baseName, title: a.name, content: entry, key })} />
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
