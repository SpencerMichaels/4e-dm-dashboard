import type { Creature, CreatureBuilderConfig } from '@common/types'
import { CreatureBuilder } from '@renderer/components/campaign/CreatureBuilder'
import { ActionEntryEditor } from '@renderer/components/campaign/ActionEntryEditor'
import { TagInput } from '@renderer/components/shared/TagInput'
import { Autocomplete } from '@renderer/components/shared/Autocomplete'
import { DamageEntryList } from '@renderer/components/shared/DamageEntryList'
import './statblock.css'

// 4e-specific constants
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
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']

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
  const sb = creature.statBlock
  const role = (sb.role as string) ?? ''
  const modifier = (sb.monsterModifier as string) ?? ''
  const roleLabel = (modifier ? modifier.charAt(0).toUpperCase() + modifier.slice(1) + ' ' : '') +
    (role ? role.charAt(0).toUpperCase() + role.slice(1) : '')

  const u = (key: string, val: unknown) => save({ ...creature, statBlock: { ...sb, [key]: val } })
  const gI = (key: string) => <input className="ghost" type="number" value={(sb[key] as number) ?? 0}
    onChange={e => u(key, Number(e.target.value))} />

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>

    {/* ─── Left column: Stat block ─── */}
    <div className="stat-block-4e" style={{ flex: '1 1 380px', minWidth: 320 }}>

      {/* ── HEADER: Name + Level/Role ── */}
      <div className="sb-header">
        <span className="sb-name">{creature.name || 'Unnamed'}</span>
        <span>Level {level} {roleLabel}</span>
      </div>
      <div className="sb-subheader">
        <span>
          {/* Size + type selectors */}
          <select className="ghost" value={(sb.size as string) ?? 'Medium'} onChange={e => u('size', e.target.value)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {' '}
          <TagInput values={Array.isArray(sb.traits) ? sb.traits : []}
            onChange={traits => u('traits', traits)}
            suggestions={config.creatureTraits} placeholder="origin type..." />
        </span>
        <span>XP {gI('xp')}</span>
      </div>

      {/* ── Description (flavor) ── */}
      {(sb.description as string) && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          <textarea className="ghost" value={(sb.description as string) ?? ''}
            onChange={e => u('description', e.target.value)}
            style={{ width: '100%', fontStyle: 'italic', fontSize: '11px', color: 'inherit' }} />
        </div>
      )}

      {/* ── STATS ── */}
      {/* Initiative + Senses + Perception */}
      <div className="sb-row sb-row-sep">
        <span><b className="sb-label">Initiative</b> {gI('initiative')}</span>
        <span style={{ marginLeft: 'auto' }}>
          <b className="sb-label">Senses</b> Perception {gI('perception')};{' '}
          <input className="ghost" value={(sb.senses as string) ?? ''} onChange={e => u('senses', e.target.value)}
            placeholder="darkvision" style={{ width: 120 }} />
        </span>
      </div>

      {/* HP + Bloodied */}
      <div className="sb-row sb-row-sep">
        <span><b className="sb-label">HP</b>{' '}
          <input className="ghost" type="number" value={creature.hp}
            onChange={e => save({ ...creature, hp: Number(e.target.value), maxHp: Number(e.target.value) })} />
        </span>
        <span>; <b className="sb-label">Bloodied</b> {Math.floor(creature.hp / 2)}</span>
      </div>

      {/* AC + Defenses — from CreatureBuilder */}
      <div style={{ padding: '0 8px' }}>
        <CreatureBuilder statBlock={sb} hp={creature.hp} maxHp={creature.maxHp}
          onUpdate={(statBlock, hp, maxHp) => save({ ...creature, statBlock, hp, maxHp })}
          config={config} />
      </div>

      {/* Saving throw bonus + action points (elite/solo) */}
      {(sb.savingThrowBonus || sb.actionPoints || modifier) && (
        <div className="sb-row sb-row-sep" style={{ fontSize: '11px' }}>
          {(sb.savingThrowBonus as number) > 0 && (
            <span><b className="sb-label">Saving Throws</b> +{gI('savingThrowBonus')}</span>
          )}
          {(sb.actionPoints as number) > 0 && (
            <span><b className="sb-label">Action Points</b> {gI('actionPoints')}</span>
          )}
        </div>
      )}

      {/* Immune / Resist / Vulnerable */}
      {(() => {
        const lvl = level
        const defVal = config.resistWeakDefault?.[lvl]
        const hasImmune = Array.isArray(sb.immunities) && sb.immunities.length > 0
        const hasResist = Array.isArray(sb.resistances) && sb.resistances.length > 0
        const hasWeak = Array.isArray(sb.weaknesses) && sb.weaknesses.length > 0
        if (!hasImmune && !hasResist && !hasWeak) return null
        return (
          <div className="sb-row-sep" style={{ padding: '2px 8px' }}>
            {hasImmune && <div><b className="sb-label">Immune</b>{' '}
              <DamageEntryList entries={sb.immunities as any} onChange={immunities => u('immunities', immunities)}
                suggestions={config.damageTypes} showValue={false} placeholder="+ immunity" /></div>}
            {hasResist && <div><b className="sb-label">Resist</b>{' '}
              <DamageEntryList entries={sb.resistances as any} onChange={resistances => u('resistances', resistances)}
                suggestions={config.damageTypes} showValue={true} placeholder="+ resistance" defaultValue={defVal} /></div>}
            {hasWeak && <div><b className="sb-label">Vulnerable</b>{' '}
              <DamageEntryList entries={sb.weaknesses as any} onChange={weaknesses => u('weaknesses', weaknesses)}
                suggestions={config.damageTypes} showValue={true} placeholder="+ vulnerability" defaultValue={defVal} /></div>}
          </div>
        )
      })()}

      {/* Speed */}
      <div className="sb-row sb-row-sep">
        <b className="sb-label">Speed</b>
        {config.speedTypes.map(({ key, label: speedLabel }) => {
          const speeds = (sb.speeds as Record<string, number> | undefined) ?? {}
          const val = key === 'land' ? ((sb.speed as number) ?? 0) : (speeds[key] ?? 0)
          if (val === 0 && key !== 'land') return null
          return (
            <span key={key}>
              {key !== 'land' && <>{speedLabel.toLowerCase()} </>}
              <input className="ghost" type="number" min={0} value={val}
                onChange={e => {
                  if (key === 'land') u('speed', Number(e.target.value))
                  else u('speeds', { ...speeds, [key]: Number(e.target.value) })
                }} />
              {key !== 'land' && (
                <button onClick={() => { const { [key]: _, ...rest } = speeds; u('speeds', rest) }}
                  style={{ fontSize: '9px', color: 'var(--color-text-muted)', padding: '0 2px' }}>x</button>
              )}
            </span>
          )
        })}
        {/* Add speed buttons for unused types */}
        {config.speedTypes.filter(({ key }) => {
          if (key === 'land') return false
          const speeds = (sb.speeds as Record<string, number> | undefined) ?? {}
          return !speeds[key]
        }).map(({ key, label: speedLabel }) => {
          const speeds = (sb.speeds as Record<string, number> | undefined) ?? {}
          return (
            <button key={key} onClick={() => u('speeds', { ...speeds, [key]: 6 })}
              style={{ fontSize: '9px', padding: '0 3px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', background: 'transparent', cursor: 'pointer' }}>
              +{speedLabel}
            </button>
          )
        })}
      </div>

      {/* Modifier buttons (standard/elite/solo) */}
      <div className="sb-row sb-row-sep">
        <b className="sb-label">Type</b>
        <div style={{ display: 'flex', gap: 1 }}>
          {DND4E_MONSTER_MODIFIERS.map(t => (
            <button key={t.value}
              onClick={() => u('monsterModifier', t.value === 'standard' ? undefined : t.value)}
              style={{
                padding: '1px 5px', fontSize: '10px',
                fontWeight: (modifier || 'standard') === t.value ? 700 : 400,
                background: (modifier || 'standard') === t.value ? 'var(--sb-header-bg)' : 'transparent',
                color: (modifier || 'standard') === t.value ? '#fff' : 'var(--color-text-muted)',
                border: (modifier || 'standard') === t.value ? 'none' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── FOOTER: Alignment, Languages, Skills, Abilities, Equipment ── */}

      {/* Alignment + Languages */}
      <div className="sb-row sb-row-sep">
        <span>
          <b className="sb-label">Alignment</b>{' '}
          <select className="ghost" value={(sb.alignment as string) ?? ''} onChange={e => u('alignment', e.target.value)}
            style={{ fontSize: 'inherit' }}>
            <option value="">—</option>
            {DND4E_ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <b className="sb-label">Languages</b>{' '}
          <input className="ghost" value={(sb.languages as string) ?? ''} onChange={e => u('languages', e.target.value)}
            style={{ width: 160 }} />
        </span>
      </div>

      {/* Skills */}
      <div className="sb-row sb-row-sep">
        <b className="sb-label">Skills</b>
        {(() => {
          const skills = (sb.skills as Record<string, number>) ?? {}
          const skillEntries = Object.entries(skills)
          const availableSkills = (config.skills ?? []).filter(s => !skills[s.toLowerCase()])
          return (
            <>
              {skillEntries.map(([name, mod]) => (
                <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  {name} <input className="ghost" type="number" value={mod}
                    onChange={ev => u('skills', { ...skills, [name]: Number(ev.target.value) })}
                    style={{ width: 30, fontWeight: 600 }} />
                  <button onClick={() => { const { [name]: _, ...rest } = skills; u('skills', rest) }}
                    style={{ fontSize: '9px', color: 'var(--color-text-muted)', padding: '0 1px' }}>x</button>
                  {','}
                </span>
              ))}
              {availableSkills.length > 0 && (
                <Autocomplete options={availableSkills.map(s => ({ value: s.toLowerCase(), label: s }))} value=""
                  onChange={val => { if (val) u('skills', { ...skills, [val]: 0 }) }}
                  placeholder="+ skill" />
              )}
            </>
          )
        })()}
      </div>

      {/* Ability Scores — 3x2 grid matching DMG layout */}
      {abConfig && (() => {
        const primaryAbility = (sb.primaryAbility as string) ?? ''
        const avgScore = (abConfig.defaultSecondary ?? 13) + halfLvl
        const primaryScore = (abConfig.defaultPrimary ?? 16) + halfLvl
        const lowScore = (abConfig.defaultLow ?? 10) + halfLvl
        const pairs = abConfig.pairs ?? []

        return (
          <div className="sb-row-sep" style={{ padding: '2px 8px' }}>
            {/* Primary picker */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2, fontSize: '10px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Primary:</span>
              {abConfig.names.map(ab => (
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
                    padding: '0 3px', fontSize: '10px', textTransform: 'uppercase',
                    fontWeight: primaryAbility === ab ? 700 : 400,
                    background: primaryAbility === ab ? 'var(--sb-header-bg)' : 'transparent',
                    color: primaryAbility === ab ? '#fff' : 'var(--color-text-muted)',
                    border: primaryAbility === ab ? 'none' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  }}>{ab}</button>
              ))}
            </div>
            {/* Scores in 3-column grid: Str 14 (+2)  Dex 17 (+3)  Wis 19 (+4) */}
            <div className="sb-abilities">
              {abConfig.names.map(ab => {
                const score = abilities[ab] ?? ((abConfig.defaultLow ?? 10) + halfLvl)
                const mod = Math.floor((score - 10) / 2)
                return (
                  <span key={ab}>
                    <b className="sb-label" style={{ color: ab === primaryAbility ? 'var(--color-accent)' : undefined }}>{ab.charAt(0).toUpperCase() + ab.slice(1)}</b>{' '}
                    <input className="ghost" type="number" value={score}
                      onChange={e => u('abilities', { ...abilities, [ab]: Number(e.target.value) })}
                      style={{ width: 30 }} />
                    {' '}({mod >= 0 ? '+' : ''}{mod})
                  </span>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Equipment */}
      <div className="sb-row">
        <b className="sb-label">Equipment</b>
        <TagInput
          values={Array.isArray(sb.equipment) ? sb.equipment : ((sb.equipment as string) ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)}
          onChange={equipment => u('equipment', equipment)}
          suggestions={[]} placeholder="equipment..." />
      </div>

      {/* Source */}
      {sb.source && (
        <div style={{ padding: '2px 8px', fontSize: '10px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {sb.source as string}
        </div>
      )}
    </div>

    {/* ─── Right column: Powers ─── */}
    <div style={{ flex: '1 1 400px', minWidth: 340 }}>
      <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)' }}>Powers</h3>
      <ActionEntryEditor
        entries={Array.isArray(sb.actions) ? sb.actions : []}
        onChange={actions => u('actions', actions)}
        config={actionConfig}
        level={level}
        statBlock={sb}
      />
    </div>

    </div>
  )
}
