import type { Creature, CreatureBuilderConfig } from '@common/types'
import { CreatureBuilder } from '@renderer/components/campaign/CreatureBuilder'
import { ActionEntryEditor } from '@renderer/components/campaign/ActionEntryEditor'
import { TagInput } from '@renderer/components/shared/TagInput'
import { Autocomplete } from '@renderer/components/shared/Autocomplete'
import { DamageEntryList } from '@renderer/components/shared/DamageEntryList'

// 4e-specific action system constants
const DND4E_ACTION_TYPES = [
  { value: 'standard', label: 'Standard Action', icon: 'Std' },
  { value: 'move', label: 'Move Action', icon: 'Mov' },
  { value: 'minor', label: 'Minor Action', icon: 'Min' },
  { value: 'free', label: 'Free Action', icon: 'Free' },
  { value: 'immediate-interrupt', label: 'Immediate Interrupt', icon: 'Int' },
  { value: 'immediate-reaction', label: 'Immediate Reaction', icon: 'Rcn' },
]
const DND4E_USAGE_TYPES = [
  { value: 'at-will', label: 'At-Will' },
  { value: 'encounter', label: 'Encounter' },
  { value: 'recharge', label: 'Recharge', hasDetail: true, detailPlaceholder: '5-6, when bloodied, etc.' },
]
const DND4E_RANGE_TYPES = [
  { value: 'melee', label: 'Melee' },
  { value: 'ranged', label: 'Ranged' },
  { value: 'close-burst', label: 'Close burst' },
  { value: 'close-blast', label: 'Close blast' },
  { value: 'area-burst', label: 'Area burst' },
  { value: 'area-wall', label: 'Area wall' },
  { value: 'personal', label: 'Personal' },
]
const DND4E_TARGET_DEFENSES = ['AC', 'Fortitude', 'Reflex', 'Will']
const DND4E_TRIGGERED = ['immediate-interrupt', 'immediate-reaction']
const DND4E_MONSTER_MODIFIERS = [
  { value: 'standard', label: 'Std' },
  { value: 'elite', label: 'Elite' },
  { value: 'solo', label: 'Solo' },
]
const DND4E_ALIGNMENTS = ['Lawful Good', 'Good', 'Unaligned', 'Evil', 'Chaotic Evil']

interface Props {
  creature: Creature
  onSave: (updated: Creature) => void
  config: CreatureBuilderConfig
}

// Shared inline styles
const lbl = { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' as const }
const sep = { borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-2)', paddingBottom: 'var(--space-2)' }
const row = { display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 'var(--space-2)' }
const numInput = { width: 45, textAlign: 'center' as const }

export function Dnd4eCreatureDetails({ creature, onSave: save, config }: Props) {
  const actionConfig: CreatureBuilderConfig = {
    ...config,
    actionTypes: DND4E_ACTION_TYPES,
    usageTypes: DND4E_USAGE_TYPES,
    rangeTypes: DND4E_RANGE_TYPES,
    targetDefenses: DND4E_TARGET_DEFENSES,
    triggeredActionTypes: DND4E_TRIGGERED,
    useGroupedActions: true,
  }

  const abConfig = config.abilityScores
  const abilities = (creature.statBlock.abilities as Record<string, number>) ?? {}
  const level = (creature.statBlock.level as number) ?? 1
  const halfLvl = Math.floor(level / 2)
  const sb = creature.statBlock

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
    {/* ─── Left column: Stats ─── */}
    <div style={{ flex: '1 1 340px', minWidth: 300, fontSize: 'var(--font-size-sm)' }}>

      {/* Description (flavor text, near top) */}
      {(sb.description as string) && (
        <div style={{ marginBottom: 'var(--space-3)', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
          <textarea value={(sb.description as string) ?? ''} onChange={(e) => save({ ...creature, statBlock: { ...sb, description: e.target.value } })}
            style={{ width: '100%', fontStyle: 'italic', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fieldSizing: 'content', border: 'none', background: 'transparent', resize: 'none', padding: 0 } as React.CSSProperties} />
        </div>
      )}

      {/* Row: Size + Modifier + Level */}
      <div style={{ ...row, ...sep }}>
        {config.sizes && (
          <div style={{ display: 'flex', gap: 1 }}>
            {config.sizes.map((s) => (
              <button key={s} onClick={() => save({ ...creature, statBlock: { ...sb, size: s } })}
                style={{
                  padding: '1px 5px', fontSize: '10px',
                  fontWeight: (sb.size ?? 'Medium') === s ? 700 : 400,
                  background: (sb.size ?? 'Medium') === s ? 'var(--color-accent)' : 'transparent',
                  color: (sb.size ?? 'Medium') === s ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                  border: (sb.size ?? 'Medium') === s ? 'none' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}>{s}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 1 }}>
          {DND4E_MONSTER_MODIFIERS.map((t) => (
            <button key={t.value}
              onClick={() => save({ ...creature, statBlock: { ...sb, monsterModifier: t.value === 'standard' ? undefined : t.value } })}
              style={{
                padding: '1px 5px', fontSize: '10px',
                fontWeight: (sb.monsterModifier ?? 'standard') === t.value ? 700 : 400,
                background: (sb.monsterModifier ?? 'standard') === t.value ? 'var(--color-accent)' : 'transparent',
                color: (sb.monsterModifier ?? 'standard') === t.value ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                border: (sb.monsterModifier ?? 'standard') === t.value ? 'none' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }}>{t.label}</button>
          ))}
        </div>
        <span style={lbl}>XP</span>
        <input type="number" value={(sb.xp as number) ?? 0}
          onChange={(e) => save({ ...creature, statBlock: { ...sb, xp: Number(e.target.value) } })} style={numInput} />
      </div>

      {/* Row: Initiative + Perception + Senses */}
      <div style={{ ...row, ...sep }}>
        <span style={lbl}>Initiative</span>
        <input type="number" value={(sb.initiative as number) ?? 0}
          onChange={(e) => save({ ...creature, statBlock: { ...sb, initiative: Number(e.target.value) } })} style={numInput} />
        <span style={lbl}>Perception</span>
        <input type="number" value={(sb.perception as number) ?? 0}
          onChange={(e) => save({ ...creature, statBlock: { ...sb, perception: Number(e.target.value) } })} style={numInput} />
        <span style={lbl}>Senses</span>
        <input value={(sb.senses as string) ?? ''} onChange={(e) => save({ ...creature, statBlock: { ...sb, senses: e.target.value } })}
          placeholder="darkvision" style={{ flex: 1, minWidth: 80, fontSize: 'var(--font-size-xs)' }} />
      </div>

      {/* Stat builder (AC, defenses, HP — compact tier picker) */}
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <CreatureBuilder
          statBlock={sb} hp={creature.hp} maxHp={creature.maxHp}
          onUpdate={(statBlock, hp, maxHp) => save({ ...creature, statBlock, hp, maxHp })}
          config={config}
        />
      </div>

      {/* Row: Saving Throws + Action Points (elite/solo only) */}
      {(sb.savingThrowBonus || sb.actionPoints || sb.monsterModifier) && (
        <div style={{ ...row, ...sep }}>
          <span style={lbl}>Saving Throws</span>
          <input type="number" value={(sb.savingThrowBonus as number) ?? 0}
            onChange={(e) => save({ ...creature, statBlock: { ...sb, savingThrowBonus: Number(e.target.value) } })} style={numInput} />
          <span style={lbl}>Action Points</span>
          <input type="number" value={(sb.actionPoints as number) ?? 0}
            onChange={(e) => save({ ...creature, statBlock: { ...sb, actionPoints: Number(e.target.value) } })} style={numInput} />
        </div>
      )}

      {/* Immunities / Resistances / Vulnerabilities — inline */}
      {(() => {
        const lvl = level
        const defVal = config.resistWeakDefault?.[lvl]
        return (
          <div style={{ ...sep }}>
            <div style={{ marginBottom: 'var(--space-1)' }}>
              <span style={lbl}>Immune </span>
              <DamageEntryList entries={Array.isArray(sb.immunities) ? sb.immunities : []}
                onChange={(immunities) => save({ ...creature, statBlock: { ...sb, immunities } })}
                suggestions={config.damageTypes} showValue={false} placeholder="+ immunity" />
            </div>
            <div style={{ marginBottom: 'var(--space-1)' }}>
              <span style={lbl}>Resist </span>
              <DamageEntryList entries={Array.isArray(sb.resistances) ? sb.resistances : []}
                onChange={(resistances) => save({ ...creature, statBlock: { ...sb, resistances } })}
                suggestions={config.damageTypes} showValue={true} placeholder="+ resistance" defaultValue={defVal} />
            </div>
            <div>
              <span style={lbl}>Vulnerable </span>
              <DamageEntryList entries={Array.isArray(sb.weaknesses) ? sb.weaknesses : []}
                onChange={(weaknesses) => save({ ...creature, statBlock: { ...sb, weaknesses } })}
                suggestions={config.damageTypes} showValue={true} placeholder="+ vulnerability" defaultValue={defVal} />
            </div>
          </div>
        )
      })()}

      {/* Row: Speed */}
      <div style={{ ...row, ...sep }}>
        <span style={lbl}>Speed</span>
        {config.speedTypes.map(({ key, label: speedLabel }) => {
          const speeds = (sb.speeds as Record<string, number> | undefined) ?? {}
          const val = key === 'land' ? ((sb.speed as number) ?? 0) : (speeds[key] ?? 0)
          if (val === 0) {
            return (
              <button key={key} onClick={() => {
                if (key === 'land') save({ ...creature, statBlock: { ...sb, speed: 6 } })
                else save({ ...creature, statBlock: { ...sb, speeds: { ...speeds, [key]: 6 } } })
              }}
                style={{ padding: '1px 4px', fontSize: '10px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                +{speedLabel}
              </button>
            )
          }
          return (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{speedLabel}</span>
              <input type="number" min={0} value={val}
                onChange={(e) => {
                  if (key === 'land') save({ ...creature, statBlock: { ...sb, speed: Number(e.target.value) } })
                  else save({ ...creature, statBlock: { ...sb, speeds: { ...speeds, [key]: Number(e.target.value) } } })
                }} style={{ width: 40, fontSize: 'var(--font-size-xs)' }} />
              {key !== 'land' && <button onClick={() => { const { [key]: _, ...rest } = speeds; save({ ...creature, statBlock: { ...sb, speeds: rest } }) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '10px', padding: 0 }}>x</button>}
            </label>
          )
        })}
      </div>

      {/* Ability Scores — inline row */}
      {abConfig && (() => {
        const primaryAbility = (sb.primaryAbility as string) ?? ''
        const avgScore = (abConfig.defaultSecondary ?? 13) + halfLvl
        const primaryScore = (abConfig.defaultPrimary ?? 16) + halfLvl
        const lowScore = (abConfig.defaultLow ?? 10) + halfLvl
        const pairs = abConfig.pairs ?? []

        const getDefaultScore = (ab: string): number => {
          if (ab === primaryAbility) return primaryScore
          const pair = pairs.find(p => p.includes(ab))
          if (pair && pair.includes(primaryAbility)) return avgScore
          if (pair && pair[0] === ab) return avgScore
          return lowScore
        }

        return (
          <div style={{ ...sep }}>
            {/* Primary ability picker */}
            <div style={{ ...row, marginBottom: 'var(--space-1)' }}>
              <span style={lbl}>Primary</span>
              <div style={{ display: 'flex', gap: 1 }}>
                {abConfig.names.map((ab) => (
                  <button key={ab} onClick={() => {
                    const newAb: Record<string, number> = {}
                    for (const a of abConfig.names) {
                      if (a === ab) newAb[a] = primaryScore
                      else {
                        const pair = pairs.find(p => p.includes(a))
                        if (pair && pair.includes(ab)) newAb[a] = avgScore
                        else if (pair && pair[0] === a) newAb[a] = avgScore
                        else newAb[a] = lowScore
                      }
                    }
                    save({ ...creature, statBlock: { ...sb, primaryAbility: ab, abilities: newAb } })
                  }}
                    style={{
                      padding: '1px 4px', fontSize: '10px', textTransform: 'uppercase',
                      fontWeight: primaryAbility === ab ? 700 : 400,
                      background: primaryAbility === ab ? 'var(--color-accent)' : 'transparent',
                      color: primaryAbility === ab ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                      border: primaryAbility === ab ? 'none' : '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    }}>{ab}</button>
                ))}
              </div>
            </div>
            {/* Scores inline */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              {abConfig.names.map((ab) => {
                const score = abilities[ab] ?? getDefaultScore(ab)
                const mod = Math.floor((score - 10) / 2)
                return (
                  <label key={ab} style={{ textAlign: 'center', flex: '0 0 auto' }}>
                    <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: ab === primaryAbility ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: ab === primaryAbility ? 700 : 400 }}>{ab}</span>
                    <input type="number" value={score} onChange={(e) => save({ ...creature, statBlock: { ...sb, abilities: { ...abilities, [ab]: Number(e.target.value) } } })}
                      style={{ width: 40, textAlign: 'center', fontSize: 'var(--font-size-xs)' }} />
                    <span style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-muted)' }}>{mod >= 0 ? '+' : ''}{mod}</span>
                  </label>
                )
              })}
            </div>
            {/* Defense summary from abilities */}
            {abConfig.defensePairs && (
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {abConfig.defensePairs.map(({ defense, abilities: [a1, a2] }) => {
                  const s1 = abilities[a1] ?? getDefaultScore(a1)
                  const s2 = abilities[a2] ?? getDefaultScore(a2)
                  const bestMod = Math.floor((Math.max(s1, s2) - 10) / 2)
                  return <span key={defense}>{defense}: {10 + halfLvl + bestMod}</span>
                })}
                <span>Bloodied: {Math.floor(creature.hp / 2)}</span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Traits */}
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <TagInput values={Array.isArray(sb.traits) ? sb.traits : []}
          onChange={(traits) => save({ ...creature, statBlock: { ...sb, traits } })}
          suggestions={config.creatureTraits} placeholder="Traits..." />
      </div>

      {/* Skills */}
      {(() => {
        const skills = (sb.skills as Record<string, number>) ?? {}
        const skillEntries = Object.entries(skills)
        const availableSkills = (config.skills ?? []).filter(s => !skills[s.toLowerCase()])
        return (
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 2 }}>
              {skillEntries.map(([name, mod]) => (
                <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 1, padding: '1px 4px', background: 'var(--color-bg-hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
                  {name}
                  <input type="number" value={mod}
                    onChange={(ev) => save({ ...creature, statBlock: { ...sb, skills: { ...skills, [name]: Number(ev.target.value) } } })}
                    style={{ width: 35, textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 600, fontSize: 'var(--font-size-xs)' }} />
                  <button onClick={() => { const { [name]: _, ...rest } = skills; save({ ...creature, statBlock: { ...sb, skills: rest } }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '10px', padding: 0 }}>x</button>
                </span>
              ))}
            </div>
            {availableSkills.length > 0 && (
              <Autocomplete options={availableSkills.map(s => ({ value: s.toLowerCase(), label: s }))} value=""
                onChange={(val) => { if (val) save({ ...creature, statBlock: { ...sb, skills: { ...skills, [val]: 0 } } }) }}
                placeholder="+ skill" />
            )}
          </div>
        )
      })()}

      {/* Row: Alignment + Languages */}
      <div style={{ ...row, ...sep }}>
        <span style={lbl}>Align</span>
        <select value={(sb.alignment as string) ?? ''} onChange={(e) => save({ ...creature, statBlock: { ...sb, alignment: e.target.value } })}
          style={{ fontSize: 'var(--font-size-xs)', padding: '1px 2px' }}>
          <option value="">—</option>
          {DND4E_ALIGNMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={lbl}>Languages</span>
        <input value={(sb.languages as string) ?? ''} onChange={(e) => save({ ...creature, statBlock: { ...sb, languages: e.target.value } })}
          style={{ flex: 1, minWidth: 80, fontSize: 'var(--font-size-xs)' }} />
      </div>

      {/* Equipment */}
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <TagInput
          values={Array.isArray(sb.equipment) ? sb.equipment : ((sb.equipment as string) ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)}
          onChange={(equipment) => save({ ...creature, statBlock: { ...sb, equipment } })}
          suggestions={[]} placeholder="Equipment..." />
      </div>

      {/* Source */}
      {(sb.source) && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {sb.source as string}
        </div>
      )}
    </div>

    {/* ─── Right column: Powers ─── */}
    <div style={{ flex: '1 1 400px', minWidth: 340 }}>
      <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Powers</h3>
      <ActionEntryEditor
        entries={Array.isArray(sb.actions) ? sb.actions : []}
        onChange={(actions) => save({ ...creature, statBlock: { ...sb, actions } })}
        config={actionConfig}
        level={level}
        statBlock={sb}
      />
    </div>

    </div>
  )
}
