import { useRef, useEffect, useCallback } from 'react'
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
const DND4E_ALIGNMENTS = ['Lawful Good', 'Good', 'Unaligned', 'Evil', 'Chaotic Evil']
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
const ORIGINS = ['aberrant', 'elemental', 'fey', 'immortal', 'natural', 'shadow']
const CREATURE_TYPES = ['animate', 'beast', 'humanoid', 'magical beast']
const CREATURE_KEYWORDS = [
  'aquatic', 'blind', 'construct', 'demon', 'devil', 'dragon',
  'giant', 'goblin', 'homunculus', 'living construct',
  'mount', 'ooze', 'plant', 'reptile', 'shapechanger', 'spider', 'swarm', 'undead',
]

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

  // Traits structure: [origin, type, ...keywords]
  const traits = Array.isArray(sb.traits) ? sb.traits as string[] : []
  const origin = traits[0] ?? ''
  const creatureType = traits[1] ?? ''
  const keywords = traits.slice(2)

  const u = (key: string, val: unknown) => save({ ...creature, statBlock: { ...sb, [key]: val } })
  const setTraits = (newOrigin: string, newType: string, newKw: string[]) => {
    u('traits', [newOrigin, newType, ...newKw].filter(Boolean))
  }

  // Auto-focus: track last-added skill/speed to focus its input
  const lastAddedSkill = useRef<string | null>(null)
  const lastAddedSpeed = useRef<string | null>(null)
  const focusRef = useCallback((el: HTMLInputElement | null) => { if (el) { el.focus(); el.select() } }, [])
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>

    {/* ─── Left column: Stat block ─── */}
    <div className="stat-block-4e" style={{ flex: '1 1 380px', minWidth: 320 }}>

      {/* ── HEADER: Name + Level/Modifier/Role ── */}
      <div className="sb-header">
        <input className="ghost sb-name" value={creature.name}
          onChange={e => save({ ...creature, name: e.target.value })}
          placeholder="Creature Name" style={{ color: 'inherit', flex: 1 }} />
        <span style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 2 }}>
          Level
          <input className="ghost" type="number" value={level} min={config.minLevel} max={config.maxLevel}
            onChange={e => u('level', Number(e.target.value))}
            style={{ width: 32, textAlign: 'center', color: 'inherit', fontWeight: 600 }} />
          <select className="ghost" value={modifier} onChange={e => u('monsterModifier', e.target.value || undefined)}
            style={{ color: 'inherit', background: 'transparent', fontSize: 'inherit' }}>
            <option value="">—</option>
            <option value="elite">Elite</option>
            <option value="solo">Solo</option>
          </select>
          <select className="ghost" value={role} onChange={e => { u('role', e.target.value); }}
            style={{ color: 'inherit', background: 'transparent', fontSize: 'inherit', textTransform: 'capitalize' }}>
            <option value="">role</option>
            {(config.roles ?? []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </span>
      </div>
      <div className="sb-subheader">
        <span>
          {/* Size origin type (keywords) */}
          <select className="ghost" value={(sb.size as string) ?? 'Medium'} onChange={e => u('size', e.target.value)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>{' '}
          <select className="ghost" value={origin} onChange={e => setTraits(e.target.value, creatureType, keywords)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            <option value="">origin</option>
            {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>{' '}
          <select className="ghost" value={creatureType} onChange={e => setTraits(origin, e.target.value, keywords)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            <option value="">type</option>
            {CREATURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {' '}
          <TagInput values={keywords} onChange={kw => setTraits(origin, creatureType, kw)}
            suggestions={CREATURE_KEYWORDS} placeholder="(keywords)" />
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>XP <input className="ghost" type="number" value={(sb.xp as number) ?? 0}
          onChange={e => u('xp', Number(e.target.value))} style={{ color: 'inherit', width: 50 }} /></span>
      </div>

      {/* ── STATS ── */}
      {/* Initiative + Senses + Perception */}
      <div className="sb-row sb-row-sep">
        <span><b className="sb-label">Initiative</b> <input className="ghost" type="number" value={(sb.initiative as number) ?? 0}
          onChange={e => u('initiative', Number(e.target.value))} /></span>
        <span style={{ marginLeft: 'auto' }}>
          <b className="sb-label">Senses</b> Perception <input className="ghost" type="number" value={(sb.perception as number) ?? 0}
            onChange={e => u('perception', Number(e.target.value))} />;{' '}
          <input className="ghost" value={(sb.senses as string) ?? ''} onChange={e => u('senses', e.target.value)}
            placeholder="darkvision" style={{ width: 120 }} />
        </span>
      </div>

      {/* HP + Bloodied */}
      <div className="sb-row sb-row-sep">
        <b className="sb-label">HP</b>{' '}
        <input className="ghost" type="number" value={creature.hp}
          onChange={e => save({ ...creature, hp: Number(e.target.value), maxHp: Number(e.target.value) })} />
        ; <b className="sb-label">Bloodied</b> {Math.floor(creature.hp / 2)}
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
            <span><b className="sb-label">Saving Throws</b> +<input className="ghost" type="number" value={(sb.savingThrowBonus as number) ?? 0}
              onChange={e => u('savingThrowBonus', Number(e.target.value))} /></span>
          )}
          {(sb.actionPoints as number) > 0 && (
            <span><b className="sb-label">Action Points</b> <input className="ghost" type="number" value={(sb.actionPoints as number) ?? 0}
              onChange={e => u('actionPoints', Number(e.target.value))} /></span>
          )}
        </div>
      )}

      {/* Immune / Resist / Vulnerable */}
      {(() => {
        const defVal = config.resistWeakDefault?.[level]
        const hasImmune = Array.isArray(sb.immunities) && sb.immunities.length > 0
        const hasResist = Array.isArray(sb.resistances) && sb.resistances.length > 0
        const hasWeak = Array.isArray(sb.weaknesses) && sb.weaknesses.length > 0
        if (!hasImmune && !hasResist && !hasWeak) return null
        return (
          <div className="sb-row-sep" style={{ padding: '2px 8px' }}>
            {hasImmune && <div><b className="sb-label">Immune</b>{' '}
              <DamageEntryList entries={sb.immunities as any} onChange={v => u('immunities', v)}
                suggestions={config.damageTypes} showValue={false} placeholder="+ immunity" /></div>}
            {hasResist && <div><b className="sb-label">Resist</b>{' '}
              <DamageEntryList entries={sb.resistances as any} onChange={v => u('resistances', v)}
                suggestions={config.damageTypes} showValue={true} placeholder="+ resistance" defaultValue={defVal} /></div>}
            {hasWeak && <div><b className="sb-label">Vulnerable</b>{' '}
              <DamageEntryList entries={sb.weaknesses as any} onChange={v => u('weaknesses', v)}
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
          const justAdded = lastAddedSpeed.current === key
          if (justAdded) lastAddedSpeed.current = null
          return (
            <span key={key}>
              {key !== 'land' && <>{speedLabel.toLowerCase()} </>}
              <input className="ghost" type="number" min={0} value={val || ''}
                ref={justAdded ? focusRef : undefined}
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
        {config.speedTypes.filter(({ key }) => {
          if (key === 'land') return false
          return !((sb.speeds as Record<string, number> | undefined) ?? {})[key]
        }).map(({ key, label: speedLabel }) => (
          <button key={key} onClick={() => { lastAddedSpeed.current = key; u('speeds', { ...((sb.speeds as Record<string, number>) ?? {}), [key]: 0 }) }}
            style={{ fontSize: '9px', padding: '0 3px', border: '1px dashed var(--sb-separator)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', background: 'transparent', cursor: 'pointer' }}>
            +{speedLabel}
          </button>
        ))}
      </div>

      {/* ── FOOTER ── */}

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
              {skillEntries.map(([name, mod], i) => {
                const justAdded = lastAddedSkill.current === name
                if (justAdded) lastAddedSkill.current = null
                return (
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    {cap(name)} <input className="ghost" type="number" value={mod || ''}
                      ref={justAdded ? focusRef : undefined}
                      onChange={ev => u('skills', { ...skills, [name]: Number(ev.target.value) })}
                      style={{ width: 30, fontWeight: 600 }} />
                    <button onClick={() => { const { [name]: _, ...rest } = skills; u('skills', rest) }}
                      style={{ fontSize: '9px', color: 'var(--color-text-muted)', padding: '0 1px' }}>x</button>
                    {i < skillEntries.length - 1 && ','}
                  </span>
                )
              })}
              {availableSkills.length > 0 && (
                <Autocomplete options={availableSkills.map(s => ({ value: s.toLowerCase(), label: s }))} value=""
                  onChange={val => { if (val) { lastAddedSkill.current = val; u('skills', { ...skills, [val]: 0 }) } }}
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
            <div className="sb-abilities">
              {abConfig.names.map(ab => {
                const score = abilities[ab] ?? ((abConfig.defaultLow ?? 10) + halfLvl)
                const mod = Math.floor((score - 10) / 2)
                return (
                  <span key={ab}>
                    <b className="sb-label" style={{ color: ab === primaryAbility ? 'var(--color-accent)' : undefined }}>
                      {ab.charAt(0).toUpperCase() + ab.slice(1)}
                    </b>{' '}
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
      <div className="sb-row sb-row-sep">
        <b className="sb-label">Equipment</b>
        <input className="ghost" value={
          Array.isArray(sb.equipment) ? (sb.equipment as string[]).join(', ') : ((sb.equipment as string) ?? '')}
          onChange={e => u('equipment', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          placeholder="equipment..." style={{ flex: 1 }} />
      </div>

      {/* Description + Source at bottom */}
      {((sb.description as string) || sb.source) && (
        <div style={{ padding: '4px 8px', fontSize: '11px' }}>
          {(sb.description as string) && (
            <textarea className="ghost" value={(sb.description as string) ?? ''}
              onChange={e => u('description', e.target.value)}
              placeholder="Description..."
              style={{ width: '100%', fontStyle: 'italic', fontSize: '11px', color: 'var(--color-text-secondary)' }} />
          )}
          {sb.source && (
            <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 2 }}>
              {sb.source as string}
            </div>
          )}
        </div>
      )}
    </div>

    {/* ─── Right column: Powers ─── */}
    <div style={{ flex: '1 1 400px', minWidth: 340 }}>
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
