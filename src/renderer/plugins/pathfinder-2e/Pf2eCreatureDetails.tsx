import type { Creature, CreatureBuilderConfig } from '@common/types'
import { CreatureBuilder } from '@renderer/components/campaign/CreatureBuilder'
import { ActionEntryEditor } from '@renderer/components/campaign/ActionEntryEditor'
import { TagInput } from '@renderer/components/shared/TagInput'
import { Autocomplete } from '@renderer/components/shared/Autocomplete'
import { DamageEntryList } from '@renderer/components/shared/DamageEntryList'

// PF2e-specific action system constants
const PF2E_ACTION_TYPES = [
  { value: '1', label: '1 Action', icon: '\u25B6' },
  { value: '2', label: '2 Actions', icon: '\u25B6\u25B6' },
  { value: '3', label: '3 Actions', icon: '\u25B6\u25B6\u25B6' },
  { value: 'reaction', label: 'Reaction', icon: 'R' },
  { value: 'free', label: 'Free Action', icon: 'F' },
]
const PF2E_RANGE_TYPES = [
  { value: 'melee', label: 'Melee' },
  { value: 'ranged', label: 'Ranged' },
  { value: 'emanation', label: 'Emanation' },
  { value: 'burst', label: 'Burst' },
  { value: 'cone', label: 'Cone' },
  { value: 'line', label: 'Line' },
]
const PF2E_TARGET_DEFENSES = ['AC', 'Fortitude', 'Reflex', 'Will']
const PF2E_TRIGGERED = ['reaction', 'free']

interface Props {
  creature: Creature
  onSave: (updated: Creature) => void
  config: CreatureBuilderConfig
}

export function Pf2eCreatureDetails({ creature, onSave: save, config }: Props) {
  const actionConfig: CreatureBuilderConfig = {
    ...config,
    actionTypes: PF2E_ACTION_TYPES,
    rangeTypes: PF2E_RANGE_TYPES,
    targetDefenses: PF2E_TARGET_DEFENSES,
    triggeredActionTypes: PF2E_TRIGGERED,
    useGroupedActions: true,
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
    {/* ─── Left column: Stats ─── */}
    <div style={{ flex: '1 1 340px', minWidth: 300 }}>
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

      {/* Details */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Details</h3>

        {/* Traits */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Traits</span>
          <TagInput
            values={Array.isArray(creature.statBlock.traits) ? creature.statBlock.traits : []}
            onChange={(traits) => save({ ...creature, statBlock: { ...creature.statBlock, traits } })}
            suggestions={config.creatureTraits}
            placeholder="Type to add traits..."
          />
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
                    if (key === 'land') save({ ...creature, statBlock: { ...creature.statBlock, speed: 25 } })
                    else save({ ...creature, statBlock: { ...creature.statBlock, speeds: { ...speeds, [key]: 25 } } })
                  }}
                    style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                    + {label}
                  </button>
                )
              }
              return (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 36 }}>{label}</span>
                  <input type="number" min={0} step={5} value={val}
                    onChange={(e) => {
                      if (key === 'land') save({ ...creature, statBlock: { ...creature.statBlock, speed: Number(e.target.value) } })
                      else save({ ...creature, statBlock: { ...creature.statBlock, speeds: { ...speeds, [key]: Number(e.target.value) } } })
                    }}
                    style={{ width: 50 }}
                  />
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
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, perception: Number(e.target.value) } })}
              style={{ width: '100%' }} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Initiative</span>
            <input type="number" value={(creature.statBlock.initiative as number) ?? 0}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, initiative: Number(e.target.value) } })}
              style={{ width: '100%' }} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>XP</span>
            <input type="number" value={(creature.statBlock.xp as number) ?? 0}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, xp: Number(e.target.value) } })}
              style={{ width: '100%' }} />
          </label>
        </div>

        {/* Senses, Languages */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Senses</span>
            <input value={(creature.statBlock.senses as string) ?? ''}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, senses: e.target.value } })}
              placeholder="darkvision, tremorsense 10"
              style={{ width: '100%' }} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Languages</span>
            <input value={(creature.statBlock.languages as string) ?? ''}
              onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, languages: e.target.value } })}
              style={{ width: '100%' }} />
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
                  <Autocomplete
                    options={availableSkills.map(s => ({ value: s.toLowerCase(), label: s }))}
                    value=""
                    onChange={(val) => { if (val) save({ ...creature, statBlock: { ...creature.statBlock, skills: { ...skills, [val]: 0 } } }) }}
                    placeholder="+ Add skill..."
                  />
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
            suggestions={[]}
            placeholder="Add equipment..."
          />
        </div>

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
          const range = config.resistWeakRange?.[lvl]
          const hint = range ? ` (${range.min}–${range.max} for level)` : ''
          const resists = creature.statBlock.resistances as any
          const isAllExcept = resists && !Array.isArray(resists) && resists.allExcept
          return (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  Resistances{hint}
                </span>
                <button
                  onClick={() => {
                    if (isAllExcept) save({ ...creature, statBlock: { ...creature.statBlock, resistances: [] } })
                    else save({ ...creature, statBlock: { ...creature.statBlock, resistances: { allExcept: true, value: range?.min ?? 5, except: [] } } })
                  }}
                  style={{
                    padding: '1px 6px', fontSize: 'var(--font-size-xs)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: isAllExcept ? 'var(--color-accent)' : 'transparent',
                    color: isAllExcept ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                    border: isAllExcept ? 'none' : '1px solid var(--color-border)',
                  }}
                >all except</button>
              </div>
              {isAllExcept ? (
                <div style={{ padding: 'var(--space-2)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>Resist all damage</span>
                    <input type="number" value={resists.value} onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, resistances: { ...resists, value: Number(e.target.value) } } })}
                      style={{ width: 50 }} />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>except:</span>
                  </div>
                  <TagInput values={resists.except ?? []} onChange={(except) => save({ ...creature, statBlock: { ...creature.statBlock, resistances: { ...resists, except } } })}
                    suggestions={config.damageTypes} placeholder="Types that bypass resistance..." />
                  {resists.note && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', fontStyle: 'italic' }}>{resists.note}</div>}
                </div>
              ) : (
                <DamageEntryList entries={Array.isArray(resists) ? resists : []}
                  onChange={(resistances) => save({ ...creature, statBlock: { ...creature.statBlock, resistances } })}
                  suggestions={config.damageTypes} showValue={true} placeholder="Type to add resistances..."
                  valueRange={range} />
              )}
            </div>
          )
        })()}

        {/* Weaknesses */}
        {(() => {
          const lvl = (creature.statBlock.level as number) ?? 1
          const range = config.resistWeakRange?.[lvl]
          const hint = range ? ` (${range.min}–${range.max} for level)` : ''
          return (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                Weaknesses{hint}
              </span>
              <DamageEntryList entries={Array.isArray(creature.statBlock.weaknesses) ? creature.statBlock.weaknesses : []}
                onChange={(weaknesses) => save({ ...creature, statBlock: { ...creature.statBlock, weaknesses } })}
                suggestions={config.damageTypes} showValue={true} placeholder="Type to add weaknesses..."
                valueRange={range} />
            </div>
          )
        })()}

      </div>
    </div>

    {/* ─── Right column: Abilities & Spells ─── */}
    <div style={{ flex: '1 1 400px', minWidth: 340 }}>
      {/* Abilities */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Abilities</h3>
        <ActionEntryEditor
          entries={Array.isArray(creature.statBlock.actions) ? creature.statBlock.actions : []}
          onChange={(actions) => save({ ...creature, statBlock: { ...creature.statBlock, actions } })}
          config={actionConfig}
          level={(creature.statBlock.level as number) ?? 1}
          statBlock={creature.statBlock}
        />
      </div>

      {/* Spells */}
      <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Spells</span>
        <textarea value={(creature.statBlock.spells as string) ?? ''}
          onChange={e => save({ ...creature, statBlock: { ...creature.statBlock, spells: e.target.value } })}
          rows={3} style={{ width: '100%', resize: 'vertical' }} />
      </label>

      {/* Description & Source */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>Description</span>
        <textarea value={(creature.statBlock.description as string) ?? ''}
          onChange={(e) => save({ ...creature, statBlock: { ...creature.statBlock, description: e.target.value } })}
          placeholder="Creature description..."
          style={{ width: '100%', fieldSizing: 'content' } as React.CSSProperties} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
        {(creature.statBlock.rarity && creature.statBlock.rarity !== 'common') && (
          <span>Rarity: {creature.statBlock.rarity as string}</span>
        )}
        {creature.statBlock.source && (
          <span>Source: {creature.statBlock.source as string}</span>
        )}
      </div>
    </div>

    </div>
  )
}
