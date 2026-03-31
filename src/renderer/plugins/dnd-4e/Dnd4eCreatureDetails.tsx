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
  { value: 'standard', label: 'Standard' },
  { value: 'elite', label: 'Elite', description: 'Saves +2, 1 AP, 2x HP' },
  { value: 'solo', label: 'Solo', description: 'Saves +5, 2 AP, ~5x HP' },
]
const DND4E_ALIGNMENTS = ['Lawful Good', 'Good', 'Unaligned', 'Evil', 'Chaotic Evil']

interface Props {
  creature: Creature
  onSave: (updated: Creature) => void
  config: CreatureBuilderConfig
}

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

  return (
    <>
      {/* Size */}
      {config.sizes && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Size</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {config.sizes.map((s) => (
              <button key={s} onClick={() => save({ ...creature, statBlock: { ...creature.statBlock, size: s } })}
                style={{
                  padding: '3px 8px', fontSize: 'var(--font-size-xs)',
                  fontWeight: (creature.statBlock.size ?? 'Medium') === s ? 700 : 400,
                  background: (creature.statBlock.size ?? 'Medium') === s ? 'var(--color-accent)' : 'transparent',
                  color: (creature.statBlock.size ?? 'Medium') === s ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                  border: (creature.statBlock.size ?? 'Medium') === s ? 'none' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Monster modifier (standard/elite/solo) */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Type</span>
        {DND4E_MONSTER_MODIFIERS.map((t) => (
          <button key={t.value}
            onClick={() => save({ ...creature, statBlock: { ...creature.statBlock, monsterModifier: t.value === 'standard' ? undefined : t.value } })}
            style={{
              padding: '3px 10px', fontSize: 'var(--font-size-xs)',
              fontWeight: (creature.statBlock.monsterModifier ?? 'standard') === t.value ? 700 : 400,
              background: (creature.statBlock.monsterModifier ?? 'standard') === t.value ? 'var(--color-accent)' : 'transparent',
              color: (creature.statBlock.monsterModifier ?? 'standard') === t.value ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
              border: (creature.statBlock.monsterModifier ?? 'standard') === t.value ? 'none' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >{t.label}</button>
        ))}
        {(() => {
          const active = DND4E_MONSTER_MODIFIERS.find(t => t.value === creature.statBlock.monsterModifier)
          return active?.description ? <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{active.description}</span> : null
        })()}
      </div>

      {/* Saving Throw Bonus & Action Points */}
      {(creature.statBlock.savingThrowBonus || creature.statBlock.actionPoints || creature.statBlock.monsterModifier) && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Saving Throws</span>
            <input type="number" value={(creature.statBlock.savingThrowBonus as number) ?? 0}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, savingThrowBonus: Number(e.target.value) } })}
              style={{ width: 45 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Action Points</span>
            <input type="number" value={(creature.statBlock.actionPoints as number) ?? 0}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, actionPoints: Number(e.target.value) } })}
              style={{ width: 45 }} />
          </label>
        </div>
      )}

      {/* Stat builder */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Creature Builder</h3>
        <CreatureBuilder
          statBlock={creature.statBlock}
          hp={creature.hp}
          maxHp={creature.maxHp}
          onUpdate={(statBlock, hp, maxHp) => save({ ...creature, statBlock, hp, maxHp })}
          config={config}
        />
      </div>

      {/* Ability Scores */}
      {abConfig && (() => {
        const primaryAbility = (creature.statBlock.primaryAbility as string) ?? ''
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

        const updateAbility = (key: string, val: number) => {
          save({ ...creature, statBlock: { ...creature.statBlock, abilities: { ...abilities, [key]: val } } })
        }

        const setPrimary = (ab: string) => {
          const newAbilities: Record<string, number> = {}
          for (const a of abConfig.names) {
            if (a === ab) newAbilities[a] = primaryScore
            else {
              const pair = pairs.find(p => p.includes(a))
              if (pair && pair.includes(ab)) newAbilities[a] = avgScore
              else if (pair && pair[0] === a) newAbilities[a] = avgScore
              else newAbilities[a] = lowScore
            }
          }
          save({ ...creature, statBlock: { ...creature.statBlock, primaryAbility: ab, abilities: newAbilities } })
        }

        return (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Primary Ability</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {abConfig.names.map((ab) => (
                  <button key={ab} onClick={() => setPrimary(ab)}
                    style={{
                      padding: '2px 6px', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase',
                      fontWeight: primaryAbility === ab ? 700 : 400,
                      background: primaryAbility === ab ? 'var(--color-accent)' : 'transparent',
                      color: primaryAbility === ab ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                      border: primaryAbility === ab ? 'none' : '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    }}
                  >{ab}</button>
                ))}
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>= {primaryScore}, avg = {avgScore}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-2)' }}>
              {abConfig.names.map((ab) => {
                const score = abilities[ab] ?? getDefaultScore(ab)
                const mod = Math.floor((score - 10) / 2)
                const isPrimary = ab === primaryAbility
                return (
                  <label key={ab} style={{ textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: isPrimary ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: isPrimary ? 700 : 400 }}>{ab}</span>
                    <input type="number" value={score} onChange={(e) => updateAbility(ab, Number(e.target.value))} style={{ width: '100%', textAlign: 'center' }} />
                    <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{mod >= 0 ? '+' : ''}{mod}</span>
                  </label>
                )
              })}
            </div>

            {abConfig.defensePairs && (
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)' }}>
                {abConfig.defensePairs.map(({ defense, abilities: [a1, a2] }) => {
                  const s1 = abilities[a1] ?? getDefaultScore(a1)
                  const s2 = abilities[a2] ?? getDefaultScore(a2)
                  const bestMod = Math.floor((Math.max(s1, s2) - 10) / 2)
                  const defVal = 10 + halfLvl + bestMod
                  return <span key={defense} style={{ fontWeight: 500 }}>{defense}: {defVal}</span>
                })}
                <span style={{ color: 'var(--color-text-muted)' }}>Bloodied: {Math.floor(creature.hp / 2)}</span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Details */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Details</h3>

        {/* Traits */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Traits</span>
          <TagInput values={Array.isArray(creature.statBlock.traits) ? creature.statBlock.traits : []}
            onChange={(traits) => save({ ...creature, statBlock: { ...creature.statBlock, traits } })}
            suggestions={config.creatureTraits} placeholder="Type to add traits..." />
        </div>

        {/* Speeds */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Speed</span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {config.speedTypes.map(({ key, label }) => {
              const speeds = (creature.statBlock.speeds as Record<string, number> | undefined) ?? {}
              const val = key === 'land' ? ((creature.statBlock.speed as number) ?? 0) : (speeds[key] ?? 0)
              if (val === 0) {
                return (
                  <button key={key} onClick={() => {
                    if (key === 'land') save({ ...creature, statBlock: { ...creature.statBlock, speed: 6 } })
                    else save({ ...creature, statBlock: { ...creature.statBlock, speeds: { ...speeds, [key]: 6 } } })
                  }}
                    style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                    + {label}
                  </button>
                )
              }
              return (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 36 }}>{label}</span>
                  <input type="number" min={0} step={1} value={val}
                    onChange={(e) => {
                      if (key === 'land') save({ ...creature, statBlock: { ...creature.statBlock, speed: Number(e.target.value) } })
                      else save({ ...creature, statBlock: { ...creature.statBlock, speeds: { ...speeds, [key]: Number(e.target.value) } } })
                    }}
                    style={{ width: 50 }} />
                  <button onClick={() => {
                    if (key === 'land') save({ ...creature, statBlock: { ...creature.statBlock, speed: 0 } })
                    else { const { [key]: _, ...rest } = speeds; save({ ...creature, statBlock: { ...creature.statBlock, speeds: rest } }) }
                  }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', padding: 0 }}>x</button>
                </label>
              )
            })}
          </div>
        </div>

        {/* Perception, Initiative, XP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Perception</span>
            <input type="number" value={(creature.statBlock.perception as number) ?? 0}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, perception: Number(e.target.value) } })} style={{ width: '100%' }} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Initiative</span>
            <input type="number" value={(creature.statBlock.initiative as number) ?? 0}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, initiative: Number(e.target.value) } })} style={{ width: '100%' }} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>XP</span>
            <input type="number" value={(creature.statBlock.xp as number) ?? 0}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, xp: Number(e.target.value) } })} style={{ width: '100%' }} />
          </label>
        </div>

        {/* Senses, Languages */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Senses</span>
            <input value={(creature.statBlock.senses as string) ?? ''}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, senses: e.target.value } })}
              placeholder="darkvision" style={{ width: '100%' }} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Languages</span>
            <input value={(creature.statBlock.languages as string) ?? ''}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, languages: e.target.value } })} style={{ width: '100%' }} />
          </label>
        </div>

        {/* Skills */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>Skills</span>
          {(() => {
            const skills = (creature.statBlock.skills as Record<string, number>) ?? {}
            const skillEntries = Object.entries(skills)
            const availableSkills = (config.skills ?? []).filter(s => !skills[s.toLowerCase()])
            return (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  {skillEntries.map(([name, mod]) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 6px', background: 'var(--color-bg-hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)' }}>
                      <span>{name}</span>
                      <input type="number" value={mod}
                        onChange={(ev) => save({ ...creature, statBlock: { ...creature.statBlock, skills: { ...skills, [name]: Number(ev.target.value) } } })}
                        style={{ width: 45, textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 600 }} />
                      <button onClick={() => { const { [name]: _, ...rest } = skills; save({ ...creature, statBlock: { ...creature.statBlock, skills: rest } }) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', padding: 0 }}>x</button>
                    </div>
                  ))}
                </div>
                {availableSkills.length > 0 && (
                  <Autocomplete options={availableSkills.map(s => ({ value: s.toLowerCase(), label: s }))} value=""
                    onChange={(val) => { if (val) save({ ...creature, statBlock: { ...creature.statBlock, skills: { ...skills, [val]: 0 } } }) }}
                    placeholder="+ Add skill..." />
                )}
              </div>
            )
          })()}
        </div>

        {/* Equipment */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>Equipment</span>
          <TagInput
            values={Array.isArray(creature.statBlock.equipment) ? creature.statBlock.equipment : ((creature.statBlock.equipment as string) ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)}
            onChange={(equipment) => save({ ...creature, statBlock: { ...creature.statBlock, equipment } })}
            suggestions={[]} placeholder="Add equipment..." />
        </div>

        {/* Alignment */}
        <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Alignment</span>
          <select value={(creature.statBlock.alignment as string) ?? ''}
            onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, alignment: e.target.value } })}
            style={{ width: 200 }}>
            <option value="">—</option>
            {DND4E_ALIGNMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        {/* Immunities */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Immunities</span>
          <DamageEntryList entries={Array.isArray(creature.statBlock.immunities) ? creature.statBlock.immunities : []}
            onChange={(immunities) => save({ ...creature, statBlock: { ...creature.statBlock, immunities } })}
            suggestions={config.damageTypes} showValue={false} placeholder="Type to add immunities..." />
        </div>

        {/* Resistances */}
        {(() => {
          const lvl = (creature.statBlock.level as number) ?? 1
          const defVal = config.resistWeakDefault?.[lvl]
          const hint = defVal != null ? ` (${defVal} for tier)` : ''
          return (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                Resistances{hint}
              </span>
              <DamageEntryList entries={Array.isArray(creature.statBlock.resistances) ? creature.statBlock.resistances : []}
                onChange={(resistances) => save({ ...creature, statBlock: { ...creature.statBlock, resistances } })}
                suggestions={config.damageTypes} showValue={true} placeholder="Type to add resistances..."
                defaultValue={defVal} />
            </div>
          )
        })()}

        {/* Vulnerabilities */}
        {(() => {
          const lvl = (creature.statBlock.level as number) ?? 1
          const defVal = config.resistWeakDefault?.[lvl]
          const hint = defVal != null ? ` (${defVal} for tier)` : ''
          return (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                Vulnerabilities{hint}
              </span>
              <DamageEntryList entries={Array.isArray(creature.statBlock.weaknesses) ? creature.statBlock.weaknesses : []}
                onChange={(weaknesses) => save({ ...creature, statBlock: { ...creature.statBlock, weaknesses } })}
                suggestions={config.damageTypes} showValue={true} placeholder="Type to add vulnerabilities..."
                defaultValue={defVal} />
            </div>
          )
        })()}

        {/* Powers */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Powers</span>
          <ActionEntryEditor
            entries={Array.isArray(creature.statBlock.actions) ? creature.statBlock.actions : []}
            onChange={(actions) => save({ ...creature, statBlock: { ...creature.statBlock, actions } })}
            config={actionConfig}
            level={level}
            statBlock={creature.statBlock}
          />
        </div>

        {/* Description & Source */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Description</span>
          <textarea value={(creature.statBlock.description as string) ?? ''}
            onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, description: e.target.value } })}
            placeholder="Monster description..."
            style={{ width: '100%', fieldSizing: 'content' } as React.CSSProperties} />
        </div>
        {(creature.statBlock.source) && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Source: {creature.statBlock.source as string}
          </div>
        )}
      </div>
    </>
  )
}
