import { useRef, useEffect, useCallback } from 'react'
import type { Creature, CreatureBuilderConfig } from '@common/types'
import { ActionEntryEditor } from '@renderer/components/campaign/ActionEntryEditor'
import { TagInput } from '@renderer/components/shared/TagInput'
import './statblock.css'

// XP by level (DMG p.56) — derived from level + modifier, not editable
const XP_BY_LEVEL: Record<number, number> = {
  1:100,2:125,3:150,4:175,5:200,6:250,7:300,8:350,9:400,10:500,
  11:600,12:700,13:800,14:1000,15:1200,16:1400,17:1600,18:2000,19:2400,20:2800,
  21:3200,22:4150,23:5100,24:6050,25:7000,26:9000,27:11000,28:13000,29:15000,30:19000,
}
const XP_MULT: Record<string, number> = { elite: 2, solo: 5 }
function xpForCreature(level: number, modifier?: string): number {
  const base = XP_BY_LEVEL[level] ?? XP_BY_LEVEL[30]
  return Math.round(base * (XP_MULT[modifier || ''] ?? 1))
}

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
const DND4E_LANGUAGES = [
  'Common', 'Abyssal', 'Deep Speech', 'Draconic', 'Dwarven',
  'Elven', 'Giant', 'Goblin', 'Primordial', 'Supernal',
]
const DND4E_ALIGNMENTS = ['Lawful Good', 'Good', 'Unaligned', 'Evil', 'Chaotic Evil']
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
const ORIGINS = ['aberrant', 'elemental', 'fey', 'immortal', 'natural', 'shadow']
const CREATURE_TYPES = ['animate', 'beast', 'humanoid', 'magical beast']
const CREATURE_SUBTYPES = [
  'air', 'angel', 'aquatic', 'blind', 'cold', 'construct',
  'demon', 'devil', 'dragon', 'dragonborn', 'drow',
  'dwarf', 'earth', 'eladrin', 'elf', 'fire',
  'giant', 'goblin', 'homunculus', 'human',
  'living construct', 'mount', 'ooze', 'orc',
  'plant', 'reptile', 'shapechanger', 'spider',
  'swarm', 'undead', 'water',
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

  // Traits structure: [origin, type, ...subtypes]
  const traits = Array.isArray(sb.traits) ? sb.traits as string[] : []
  const origin = traits[0] ?? ''
  const creatureType = traits[1] ?? ''
  const subtypes = traits.slice(2)

  const u = (key: string, val: unknown) => save({ ...creature, statBlock: { ...sb, [key]: val } })
  const setTraits = (newOrigin: string, newType: string, newSubtypes: string[]) => {
    u('traits', [newOrigin, newType, ...newSubtypes].filter(Boolean))
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
            style={{ color: 'inherit', fontWeight: 600 }} />
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
          <select className="ghost" value={origin} onChange={e => setTraits(e.target.value, creatureType, subtypes)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            <option value="">origin</option>
            {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>{' '}
          <select className="ghost" value={creatureType} onChange={e => setTraits(origin, e.target.value, subtypes)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            <option value="">type</option>
            {CREATURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {' '}
          <TagInput compact values={subtypes} onChange={st => setTraits(origin, creatureType, st)}
            suggestions={CREATURE_SUBTYPES} placeholder="(subtypes)" />
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>XP {xpForCreature(level, modifier)}</span>
      </div>

      {/* ── GROUP 1: Initiative, Senses, Saves/AP, Speed ── */}
      <div className="sb-row">
        <span><b className="sb-label">Initiative</b> <input className="ghost" type="number" value={(sb.initiative as number) ?? 0}
          onChange={e => u('initiative', Number(e.target.value))} /></span>
        <span>
          <b className="sb-label">Senses</b> Perception <input className="ghost" type="number" value={(sb.perception as number) ?? 0}
            onChange={e => u('perception', Number(e.target.value))} />;{' '}
          <input className="ghost" value={(sb.senses as string) ?? ''} onChange={e => u('senses', e.target.value)}
            placeholder="darkvision" />
        </span>
      </div>
      {(((sb.savingThrowBonus as number) ?? 0) > 0 || ((sb.actionPoints as number) ?? 0) > 0) && (
        <div className="sb-row">
          {((sb.savingThrowBonus as number) ?? 0) > 0 && (
            <span><b className="sb-label">Saving Throws</b>{' +'}
              <input className="ghost" type="number" value={(sb.savingThrowBonus as number) ?? 0}
                onChange={e => u('savingThrowBonus', Number(e.target.value))} /></span>
          )}
          {((sb.actionPoints as number) ?? 0) > 0 && (
            <span><b className="sb-label">Action Points</b>{' '}
              <input className="ghost" type="number" value={(sb.actionPoints as number) ?? 0}
                onChange={e => u('actionPoints', Number(e.target.value))} /></span>
          )}
        </div>
      )}
      <div className="sb-row sb-row-sep">
        <b className="sb-label">Speed</b>
        {config.speedTypes.map(({ key, label: speedLabel }) => {
          const speeds = (sb.speeds as Record<string, number> | undefined) ?? {}
          const val = key === 'land' ? ((sb.speed as number) ?? 0) : (speeds[key] ?? null)
          if (val === null) return null
          const justAdded = lastAddedSpeed.current === key
          if (justAdded) lastAddedSpeed.current = null
          return (
            <span key={key}>
              {key !== 'land' && <>{speedLabel.toLowerCase()} </>}
              <input className="ghost" type="number" min={0} value={val ?? ''}
                ref={justAdded ? focusRef : undefined}
                onChange={e => {
                  const v = e.target.value === '' ? 0 : Number(e.target.value)
                  if (key === 'land') u('speed', v)
                  else u('speeds', { ...speeds, [key]: v })
                }}
                onBlur={e => {
                  if (e.target.value === '') {
                    if (key === 'land') u('speed', 0)
                    else u('speeds', { ...speeds, [key]: 0 })
                  }
                }} />
              {key !== 'land' && (
                <button onClick={() => { const { [key]: _, ...rest } = speeds; u('speeds', rest) }}
                  style={{ fontSize: '9px', color: 'var(--color-text-muted)', padding: '0 2px' }}>x</button>
              )}
            </span>
          )
        })}
        {/* Add speed — dropdown that adds on select */}
        {(() => {
          const speeds = (sb.speeds as Record<string, number> | undefined) ?? {}
          const available = config.speedTypes.filter(({ key }) => key !== 'land' && !(key in speeds))
          if (available.length === 0) return null
          return (
            <select className="ghost" value=""
              onChange={e => { if (e.target.value) { lastAddedSpeed.current = e.target.value; u('speeds', { ...speeds, [e.target.value]: 0 }) } }}
              style={{ color: 'var(--color-text-muted)' }}>
              <option value="">+</option>
              {available.map(({ key, label: l }) => <option key={key} value={key}>{l}</option>)}
            </select>
          )
        })()}
      </div>

      {/* ── GROUP 2: AC, HP, Defenses, Immunities, Resistances, Weaknesses ── */}
      {(() => {
        const defs = (sb.defenses as Record<string, number>) ?? {}
        const uDef = (key: string, val: number) => u('defenses', { ...defs, [key]: val })
        return (
          <div className="sb-row">
            <span><b className="sb-label">AC</b> <input className="ghost" type="number" value={(sb.ac as number) ?? 10}
              onChange={e => u('ac', Number(e.target.value))} />;</span>
            <span><b className="sb-label">Fortitude</b> <input className="ghost" type="number" value={defs.fortitude ?? 10}
              onChange={e => uDef('fortitude', Number(e.target.value))} />,</span>
            <span><b className="sb-label">Reflex</b> <input className="ghost" type="number" value={defs.reflex ?? 10}
              onChange={e => uDef('reflex', Number(e.target.value))} />,</span>
            <span><b className="sb-label">Will</b> <input className="ghost" type="number" value={defs.will ?? 10}
              onChange={e => uDef('will', Number(e.target.value))} /></span>
          </div>
        )
      })()}
      <div className="sb-row">
        <span><b className="sb-label">HP</b>{' '}
        <input className="ghost" type="number" value={creature.hp}
          onChange={e => save({ ...creature, hp: Number(e.target.value), maxHp: Number(e.target.value) })} />;</span>
        <span><b className="sb-label">Bloodied</b> {Math.floor(creature.hp / 2)}</span>
      </div>
      <div className="sb-row sb-row-sep">
        <InlineEntryChips label="Immune" entries={Array.isArray(sb.immunities) ? sb.immunities as any[] : []}
          onChange={v => u('immunities', v)} suggestions={config.damageTypes} />
        <InlineEntryChips label="Resist" entries={Array.isArray(sb.resistances) ? sb.resistances as any[] : []}
          onChange={v => u('resistances', v)} suggestions={config.damageTypes} showValue />
        <InlineEntryChips label="Vulnerable" entries={Array.isArray(sb.weaknesses) ? sb.weaknesses as any[] : []}
          onChange={v => u('weaknesses', v)} suggestions={config.damageTypes} showValue />
      </div>

      {/* ── GROUP 4: Alignment, Languages, Skills, Equipment ── */}

      {/* Alignment */}
      <div className="sb-row">
        <b className="sb-label">Alignment</b>{' '}
        <select className="ghost" value={(sb.alignment as string) ?? ''} onChange={e => u('alignment', e.target.value)}
          style={{ fontSize: 'inherit' }}>
          <option value="">—</option>
          {DND4E_ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Languages */}
      <div className="sb-row">
        <b className="sb-label">Languages</b>
        <TagInput compact
          values={Array.isArray(sb.languages) ? sb.languages : ((sb.languages as string) ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)}
          onChange={languages => u('languages', languages)}
          suggestions={DND4E_LANGUAGES} placeholder="+ language" />
      </div>

      {/* Skills */}
      <div className="sb-row">
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
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 3px', background: 'var(--color-bg-hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
                    {cap(name)}<input className="ghost" type="number" value={mod ?? ''}
                      ref={justAdded ? focusRef : undefined}
                      onChange={ev => u('skills', { ...skills, [name]: ev.target.value === '' ? 0 : Number(ev.target.value) })}
                      onBlur={ev => { if (ev.target.value === '') u('skills', { ...skills, [name]: 0 }) }} />
                    <button onClick={() => { const { [name]: _, ...rest } = skills; u('skills', rest) }}
                      style={{ fontSize: '9px', color: 'var(--color-text-muted)', padding: '0 1px' }}>x</button>
                    {i < skillEntries.length - 1 && ','}
                  </span>
                )
              })}
              {availableSkills.length > 0 && (
                <select className="ghost" value=""
                  onChange={ev => { if (ev.target.value) { lastAddedSkill.current = ev.target.value.toLowerCase(); u('skills', { ...skills, [ev.target.value.toLowerCase()]: 0 }) } }}
                  style={{ color: 'var(--color-text-muted)' }}>
                  <option value="">+</option>
                  {availableSkills.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
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
        // Only show the primary picker for new creatures (no existing ability scores)
        const hasAbilities = Object.keys(abilities).length > 0
        return (
          <div className="sb-row-sep" style={{ padding: '2px 8px' }}>
            {!hasAbilities && (
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
            )}
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
                      onChange={e => u('abilities', { ...abilities, [ab]: Number(e.target.value) })} />
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

/** Compact inline chips for immunities/resistances/vulnerabilities */
function InlineEntryChips({ label, entries, onChange, suggestions, showValue }: {
  label: string
  entries: { type: string; value?: number }[]
  onChange: (entries: { type: string; value?: number }[]) => void
  suggestions: string[]
  showValue?: boolean
}) {
  const lastAdded = useRef<string | null>(null)
  const focusRef = useCallback((el: HTMLInputElement | null) => { if (el) { el.focus(); el.select() } }, [])
  const available = suggestions.filter(s => !entries.some(e => e.type === s))
  const remove = (i: number) => onChange(entries.filter((_, j) => j !== i))
  const updateVal = (i: number, val: number) => onChange(entries.map((e, j) => j === i ? { ...e, value: val } : e))

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <b className="sb-label">{label}</b>
      {entries.map((e, i) => {
        const justAdded = lastAdded.current === e.type
        if (justAdded) lastAdded.current = null
        return (
          <span key={e.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 3px', background: 'var(--color-bg-hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
            {e.type}
            {showValue && (
              <input className="ghost" type="number" value={e.value ?? ''}
                ref={justAdded ? focusRef : undefined}
                onChange={ev => updateVal(i, Number(ev.target.value))}
                onBlur={ev => { if (ev.target.value === '') updateVal(i, 0) }}
                style={{ borderBottom: '1px solid var(--color-border)' }} />
            )}
            <button onClick={() => remove(i)}
              style={{ fontSize: '9px', color: 'var(--color-text-muted)', padding: '0 1px' }}>x</button>
          </span>
        )
      })}
      {available.length > 0 && (
        <select className="ghost" value=""
          onChange={e => {
            if (e.target.value) {
              lastAdded.current = e.target.value
              onChange([...entries, { type: e.target.value, ...(showValue ? { value: 0 } : {}) }])
            }
          }}
          style={{ color: 'var(--color-text-muted)' }}>
          <option value="">+</option>
          {available.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {entries.length === 0 && available.length === 0 && <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>—</span>}
    </span>
  )
}
