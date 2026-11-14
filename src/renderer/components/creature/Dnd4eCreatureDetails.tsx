import { useRef, useEffect, useCallback, useState, useSyncExternalStore } from 'react'
import type { Creature, CreatureBuilderConfig } from '@common/types'
import { PowerEntryEditor, TraitRow, AuraRow, emptyPower } from './PowerEntryEditor'
import type { PowerEntry } from './PowerEntryEditor'
import { TagInput } from '@renderer/components/shared/TagInput'
import { Icon } from '../shared/Icon'
import { RecordHeaderActions } from '../shared/record-header'
import { CreatureImageEditor } from '@renderer/components/shared/CreatureImageEditor'
import { getPastedPower, getClipboardPowerName, onClipboardChange } from './power-clipboard'
import { xpForCreature } from './dnd4e-utils'
import { capitalize } from '@common/utils/format'
import { normalizeStringArray } from '@common/utils/arrays'
import { Annotation } from './annotations'
import { powerEditorConfig } from './power-config'
import { initiativeFor, monsterHp, rankAdjustments, standardHp } from '@common/rules/benchmarks'

const isRole = (r: string): r is Parameters<typeof standardHp>[1] => ['skirmisher', 'brute', 'soldier', 'lurker', 'controller', 'artillery'].includes(r)
import './statblock.css'

// 4e-specific constants
const DND4E_SENSES = [
  'Darkvision', 'Low-light vision', 'Blindsight 5', 'Blindsight 10', 'Blindsight 20',
  'Tremorsense 5', 'Tremorsense 10', 'Tremorsense 20',
  'Truesight 6', 'Truesight 10', 'All-around vision',
]
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
  compact?: boolean
  showImages?: boolean
}

/** Clickable benchmark hint — shows expected value when actual differs */
function Hint({ value, benchmark, onClick, tooltip }: {
  value: number | undefined; benchmark: number | undefined
  onClick?: () => void; tooltip?: string
}) {
  if (benchmark == null || value === benchmark) return null
  return (
    <span onClick={onClick} title={tooltip ?? `Expected: ${benchmark}. Click to set.`}
      style={{ color: 'var(--muted)', cursor: onClick ? 'pointer' : 'default', fontSize: '0.85em', marginLeft: 2 }}>
      ({benchmark})
    </span>
  )
}

/** Tooltip showing benchmark context */
function tierTooltip(table: { [level: number]: Record<string, string | number> } | undefined, level: number, label?: string, benchmark?: number): string {
  const parts: string[] = []
  if (label && benchmark != null) parts.push(`${label}: ${benchmark}`)
  if (table) {
    const row = table[level]
    if (row) parts.push(Object.entries(row).map(([tier, val]) => `${tier}: ${val}`).join(', '))
  }
  return parts.join('\n')
}

export function Dnd4eCreatureDetails({ creature, onSave: save, config, compact, showImages = true }: Props) {
  // Subscribe to power clipboard changes so the paste button re-renders
  const clipboardName = useSyncExternalStore(onClipboardChange, getClipboardPowerName)

  const actionConfig = powerEditorConfig(config)

  const abConfig = config.abilityScores
  const abilities = (creature.statBlock.abilities as Record<string, number>) ?? {}
  const level = (creature.statBlock.level as number) ?? 1
  const halfLvl = Math.floor(level / 2)
  const sb = creature.statBlock
  const role = (sb.role as string) ?? ''
  const modifier = (sb.monsterModifier as string) ?? ''
  const roleLabel = (modifier ? capitalize(modifier) + ' ' : '') +
    (role ? capitalize(role) : '')

  const origin = (sb.origin as string) ?? ''
  const creatureType = (sb.creatureType as string) ?? ''
  const subtypes = Array.isArray(sb.subtypes) ? sb.subtypes as string[] : []

  // Benchmark lookups: role-based tables from statDefs, adjusted for rank (rules/benchmarks.ts)
  const rank = modifier === 'elite' || modifier === 'solo' ? modifier : sb.isMinion ? 'minion' : 'standard'
  const benchmarks: Record<string, number | undefined> = {}
  if (role) {
    for (const def of config.statDefs) {
      if (def.key === 'initiative') continue // initiative is Dex-based, not role-based
      const row = def.table[level]
      if (row && row[role] != null) {
        let val = row[role]
        if (def.key === 'hp') {
          // This creature's Con (the table assumes 14); elite x2, solo x4, minion 1.
          if (isRole(role)) val = monsterHp(level, role, rank, abilities.con ?? 14)
        } else if (def.key === 'ac') {
          val += rankAdjustments(rank).defenses
        }
        benchmarks[def.key] = val
      }
    }
  }
  // Initiative benchmark = Dex mod + half level + role bonus (lurker 4, skirmisher/soldier 2)
  const dexMod = Math.floor(((abilities.dex ?? 10) - 10) / 2)
  benchmarks.initiative = isRole(role) ? initiativeFor(level, role, abilities.dex ?? 10) : dexMod + halfLvl
  const initRoleBonus = benchmarks.initiative - dexMod - halfLvl
  // Defense benchmarks: base = level + 12; no rank bonus since DMG2 p. 133
  // (DMG p.184: "Other defenses = Level + 12" — no ability modifier added;
  // the DM adjusts ±1 per 2 points of ability deviation from average, but
  // the benchmark is just the flat baseline)
  const defBenchmarks: Record<string, number> = {}
  if (abConfig?.defensePairs) {
    const defBonus = rankAdjustments(rank).defenses
    for (const { defense, baseOffset } of abConfig.defensePairs) {
      defBenchmarks[defense.toLowerCase()] = (baseOffset ?? 12) + level + defBonus
    }
  }

  const u = (key: string, val: unknown) => save({ ...creature, statBlock: { ...sb, [key]: val } })
  const setTraits = (newOrigin: string, newType: string, newSubtypes: string[]) => {
    save({ ...creature, statBlock: { ...sb, origin: newOrigin, creatureType: newType, subtypes: newSubtypes } })
  }

  // Auto-focus: track last-added skill/speed to focus its input
  const lastAddedSkill = useRef<string | null>(null)
  const lastAddedSpeed = useRef<string | null>(null)
  const focusRef = useCallback((el: HTMLInputElement | null) => { if (el) { el.focus(); el.select() } }, [])

  return (
    <div className={compact ? '' : 'sb-two-col'} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-start' }}>

    {/* ─── Left column: Stat block ─── */}
    <div className="stat-block-4e sb-left" style={{ flex: '1 1 380px', minWidth: 320 }}>

      {/* ── HEADER: Name + Level/Modifier/Role ── */}
      <div className="sb-header">
        <Annotation anchor={{ kind: 'stat', key: 'header' }} />
        <input className="ghost sb-name" value={creature.name}
          onChange={e => save({ ...creature, name: e.target.value })}
          placeholder="Creature Name" style={{ color: 'inherit' }} />
        <RecordHeaderActions />
        <span style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 2 }}>
          Level
          <input className="ghost" type="number" value={level} min={config.minLevel} max={config.maxLevel}
            onChange={e => u('level', Number(e.target.value))}
            style={{ color: 'inherit', fontWeight: 600 }} />
          <select className="ghost" value={modifier} onChange={e => u('monsterModifier', e.target.value || undefined)}
            style={{ color: 'inherit', background: 'transparent', fontSize: 'inherit', textTransform: 'capitalize' }}>
            <option value="">standard</option>
            <option value="elite">elite</option>
            <option value="solo">solo</option>
            <option value="minion">minion</option>
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
          {subtypes.length > 0 && <> (</>}
          <TagInput compact values={subtypes} onChange={st => setTraits(origin, creatureType, st)}
            suggestions={CREATURE_SUBTYPES} placeholder={subtypes.length > 0 ? '' : '(subtypes)'} />
          {subtypes.length > 0 && <>)</>}
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>XP {xpForCreature(level, modifier)}</span>
      </div>

      {/* ── Body: stats left, image right ── */}
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>

      {/* ── GROUP 1: Initiative, Senses, Speed, Saves/AP ── */}
      <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'senses' }} />
        <span title={`Expected: Dex mod (${dexMod}) + half level (${halfLvl})${initRoleBonus ? ` + ${role} bonus (${initRoleBonus})` : ''} = ${benchmarks.initiative}`}>
          <b className="sb-label">Initiative</b> <input className="ghost" type="number" value={(sb.initiative as number) ?? 0}
          onChange={e => u('initiative', Number(e.target.value))} />
          <Hint value={(sb.initiative as number)} benchmark={benchmarks.initiative} onClick={() => benchmarks.initiative != null && u('initiative', benchmarks.initiative)} />;</span>
        <span>
          <b className="sb-label">Senses</b> Perception <input className="ghost" type="number" value={(sb.perception as number) ?? 0}
            onChange={e => u('perception', Number(e.target.value))} />;{' '}
          <TagInput compact
            values={normalizeStringArray(sb.senses)}
            onChange={senses => u('senses', senses)}
            suggestions={DND4E_SENSES} placeholder="+ sense" />
        </span>
      </div>
      {(() => {
        const speeds = (sb.speeds as Record<string, number> | undefined) ?? {}
        const landSpeed = (sb.speed as number) ?? 0
        const available = config.speedTypes.filter(({ key }) => key !== 'land' && !(key in speeds))
        return (
          <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'speed' }} />
            <b className="sb-label">Speed</b>
            {/* Land speed chip — deletable when other speeds exist */}
            {(landSpeed > 0 || Object.keys(speeds).length === 0) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 3px', background: 'var(--hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
                <input className="ghost" type="number" min={0} value={landSpeed || ''}
                  onChange={e => u('speed', e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={e => { if (e.target.value === '' || e.target.value === '0') u('speed', 0) }} />
                {Object.keys(speeds).length > 0 && (
                  <button onClick={() => u('speed', 0)}
                    style={{ color: 'var(--muted)', padding: '0 1px', lineHeight: 1, display: 'inline-flex' }} aria-label="Remove"><Icon name="x" /></button>
                )}
              </span>
            )}
            {/* Other speed chips */}
            {config.speedTypes.filter(({ key }) => key !== 'land' && key in speeds).map(({ key, label: speedLabel }) => {
              const val = speeds[key] ?? 0
              const justAdded = lastAddedSpeed.current === key
              if (justAdded) lastAddedSpeed.current = null
              return (
                <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 3px', background: 'var(--hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
                  {speedLabel.toLowerCase()}
                  <input className="ghost" type="number" min={0} value={val || ''}
                    ref={justAdded ? focusRef : undefined}
                    onChange={e => u('speeds', { ...speeds, [key]: e.target.value === '' ? '' : Number(e.target.value) })}
                    onBlur={e => { if (!e.target.value) u('speeds', { ...speeds, [key]: 0 }) }} />
                  <button onClick={() => { const { [key]: _, ...rest } = speeds; u('speeds', rest) }}
                    style={{ color: 'var(--muted)', padding: '0 1px', lineHeight: 1, display: 'inline-flex' }} aria-label="Remove"><Icon name="x" /></button>
                </span>
              )
            })}
            {available.length > 0 && (
              <select className="ghost-add" value=""
                onChange={e => { if (e.target.value) { lastAddedSpeed.current = e.target.value; u('speeds', { ...speeds, [e.target.value]: 0 }) } }}>
                <option value="" disabled hidden>+</option>
                {available.map(({ key, label: l }) => <option key={key} value={key}>{l.toLowerCase()}</option>)}
              </select>
            )}
          </div>
        )
      })()}
      {(((sb.savingThrowBonus as number) ?? 0) > 0 || ((sb.actionPoints as number) ?? 0) > 0) && (
        <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'saves' }} />
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

      {/* ── GROUP 2: HP, AC, Defenses, Immunities, Resistances, Weaknesses ── */}
      <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'hp' }} />
        <span title={tierTooltip(config.statDefs.find(d => d.key === 'hp')?.table, level)}>
          <b className="sb-label">HP</b>{' '}
          <input className="ghost" type="number" value={creature.hp}
            onChange={e => save({ ...creature, hp: Number(e.target.value), maxHp: Number(e.target.value) })} />
          <Hint value={creature.hp} benchmark={benchmarks.hp}
            onClick={() => benchmarks.hp != null && save({ ...creature, hp: benchmarks.hp!, maxHp: benchmarks.hp! })} />;</span>
        <span><b className="sb-label">Bloodied</b> {Math.floor(creature.hp / 2)}</span>
      </div>
      {(() => {
        const defs = (sb.defenses as Record<string, number>) ?? {}
        const uDef = (key: string, val: number) => u('defenses', { ...defs, [key]: val })
        return (
          <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'defenses' }} />
            <span title={tierTooltip(config.statDefs.find(d => d.key === 'ac')?.table, level)}>
              <b className="sb-label">AC</b> <input className="ghost" type="number" value={(sb.ac as number) ?? 10}
              onChange={e => u('ac', Number(e.target.value))} />
              <Hint value={(sb.ac as number)} benchmark={benchmarks.ac} onClick={() => benchmarks.ac != null && u('ac', benchmarks.ac)} /></span>;{' '}
            <span><b className="sb-label">Fortitude</b> <input className="ghost" type="number" value={defs.fortitude ?? 10}
              onChange={e => uDef('fortitude', Number(e.target.value))} />
              <Hint value={defs.fortitude} benchmark={defBenchmarks.fortitude} onClick={() => uDef('fortitude', defBenchmarks.fortitude)} />,</span>
            <span><b className="sb-label">Reflex</b> <input className="ghost" type="number" value={defs.reflex ?? 10}
              onChange={e => uDef('reflex', Number(e.target.value))} />
              <Hint value={defs.reflex} benchmark={defBenchmarks.reflex} onClick={() => uDef('reflex', defBenchmarks.reflex)} />,</span>
            <span><b className="sb-label">Will</b> <input className="ghost" type="number" value={defs.will ?? 10}
              onChange={e => uDef('will', Number(e.target.value))} />
              <Hint value={defs.will} benchmark={defBenchmarks.will} onClick={() => uDef('will', defBenchmarks.will)} /></span>
          </div>
        )
      })()}
      <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'resistances' }} />
        <InlineEntryChips label="Immune" entries={Array.isArray(sb.immunities) ? sb.immunities as any[] : []}
          onChange={v => u('immunities', v)} suggestions={config.damageTypes} />
        <span>;</span>
        <InlineEntryChips label="Resist" entries={Array.isArray(sb.resistances) ? sb.resistances as any[] : []}
          onChange={v => u('resistances', v)} suggestions={config.damageTypes} showValue />
        <span>;</span>
        <InlineEntryChips label="Vulnerable" entries={Array.isArray(sb.weaknesses) ? sb.weaknesses as any[] : []}
          onChange={v => u('weaknesses', v)} suggestions={config.damageTypes} showValue />
      </div>

      {/* ── GROUP 4: Alignment, Languages, Skills, Equipment ── */}

      {/* Alignment */}
      <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'alignment' }} />
        <b className="sb-label">Alignment</b>{' '}
        {(() => {
          // Normalize alignment to title case for matching
          const raw = (sb.alignment as string) ?? 'Unaligned'
          const normalized = raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
          const value = DND4E_ALIGNMENTS.includes(normalized) ? normalized : raw
          return (
            <select className="ghost" value={value} onChange={e => u('alignment', e.target.value)}
              style={{ fontSize: 'inherit' }}>
              {DND4E_ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )
        })()}
      </div>

      {/* Languages */}
      <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'languages' }} />
        <b className="sb-label">Languages</b>
        <TagInput compact
          values={normalizeStringArray(sb.languages)}
          onChange={languages => u('languages', languages)}
          suggestions={DND4E_LANGUAGES} placeholder="+ language" />
      </div>

      {/* Skills */}
      <div className="sb-row">
        <Annotation anchor={{ kind: 'stat', key: 'skills' }} />
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
                  <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 3px', background: 'var(--hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
                    {capitalize(name)} +<input className="ghost" type="number" value={mod ?? ''}
                      ref={justAdded ? focusRef : undefined}
                      onChange={ev => u('skills', { ...skills, [name]: ev.target.value === '' ? '' : Number(ev.target.value) })}
                      onBlur={ev => { if (ev.target.value === '') u('skills', { ...skills, [name]: 0 }) }} />
                    <button onClick={() => { const { [name]: _, ...rest } = skills; u('skills', rest) }}
                      style={{ color: 'var(--muted)', padding: '0 1px', lineHeight: 1, display: 'inline-flex' }} aria-label="Remove"><Icon name="x" /></button>
                  </span>
                )
              })}
              {availableSkills.length > 0 && (
                <select className="ghost-add" value=""
                  onChange={ev => { if (ev.target.value) { lastAddedSkill.current = ev.target.value.toLowerCase(); u('skills', { ...skills, [ev.target.value.toLowerCase()]: 0 }) } }}>
                  <option value="" disabled hidden>+</option>
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
          <div style={{ padding: '2px 8px' }}>
            {!hasAbilities && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2, fontSize: '10px' }}>
                <span style={{ color: 'var(--muted)' }}>Primary:</span>
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
                      color: primaryAbility === ab ? 'var(--on-dark)' : 'var(--muted)',
                      border: primaryAbility === ab ? 'none' : '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    }}>{ab}</button>
                ))}
              </div>
            )}
            <div className="sb-abilities">
              <Annotation anchor={{ kind: 'stat', key: 'abilities' }} />
              {abConfig.names.map(ab => {
                const score = abilities[ab] ?? ((abConfig.defaultLow ?? 10) + halfLvl)
                const mod = Math.floor((score - 10) / 2)
                return (
                  <span key={ab}>
                    <b className="sb-label" style={{ color: !hasAbilities && ab === primaryAbility ? 'var(--accent)' : undefined }}>
                      {capitalize(ab)}
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
        <Annotation anchor={{ kind: 'stat', key: 'equipment' }} />
        <b className="sb-label">Equipment</b>
        <input className="ghost" value={
          Array.isArray(sb.equipment) ? (sb.equipment as string[]).join(', ') : ((sb.equipment as string) ?? '')}
          onChange={e => u('equipment', e.target.value)}
          onBlur={e => u('equipment', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          placeholder="equipment..." style={{ flex: 1 }} />
      </div>

      {/* Traits + Auras */}
      {(() => {
        const actions = Array.isArray(sb.actions) ? sb.actions as PowerEntry[] : []
        const traitEntries = actions.map((e, i) => ({ e, i })).filter(({ e }) => e.entryType === 'trait')
        const auraEntries = actions.map((e, i) => ({ e, i })).filter(({ e }) => e.entryType === 'aura')
        const updateAction = (idx: number, patch: Partial<PowerEntry>) => {
          const updated = actions.map((e, i) => i === idx ? { ...e, ...patch } : e)
          u('actions', updated)
        }
        const removeAction = (idx: number) => u('actions', actions.filter((_, i) => i !== idx))
        const moveAction = (idx: number, dir: -1 | 1) => {
          const j = idx + dir
          if (j < 0 || j >= actions.length) return
          const arr = [...actions]
          ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
          u('actions', arr)
        }
        const addEntry = (type: PowerEntry['entryType']) => u('actions', [emptyPower(actionConfig, type), ...actions])
        const gutterBtn = { color: 'var(--muted)', padding: '0', lineHeight: 1, fontSize: '10px', display: 'block' as const }
        const addBtn = { color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 4px', background: 'transparent', cursor: 'pointer' }
        return (
          <>
            <div style={{ display: 'flex', gap: 4, padding: '8px 8px 4px', flexWrap: 'wrap' }}>
              <button onClick={() => addEntry('trait')} style={addBtn}>+ Trait</button>
              <button onClick={() => addEntry('aura')} style={addBtn}>+ Aura</button>
              {clipboardName && (
                <button onClick={() => { const p = getPastedPower(); if (p) u('actions', [p, ...actions]) }}
                  style={{ ...addBtn, color: 'var(--success)', borderColor: 'var(--success)' }}
                  title={`Paste "${clipboardName}" from clipboard`}>
                  Paste: {clipboardName}
                </button>
              )}
            </div>
            {traitEntries.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {traitEntries.map(({ e, i }) => (
                  <div key={i}  style={{ display: 'flex' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 3px 0', gap: 1, opacity: 0.5, minWidth: 14 }}>
                      <button onClick={() => moveAction(i, -1)} style={gutterBtn} title="Move up" aria-label="Move up"><Icon name="chevron-up" size={10} /></button>
                      <span style={{ cursor: 'grab', color: 'var(--muted)', display: 'inline-flex' }} title="Drag to reorder"><Icon name="grip-vertical" size={10} /></span>
                      <button onClick={() => moveAction(i, 1)} style={gutterBtn} title="Move down" aria-label="Move down"><Icon name="chevron-down" size={10} /></button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TraitRow entry={e} idx={i} onUpdate={updateAction} onRemove={removeAction} />
                      <Annotation anchor={{ kind: 'entry', entry: e }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {auraEntries.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {auraEntries.map(({ e, i }) => (
                  <div key={i}  style={{ display: 'flex' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 3px 0', gap: 1, opacity: 0.5, minWidth: 14 }}>
                      <button onClick={() => moveAction(i, -1)} style={gutterBtn} title="Move up" aria-label="Move up"><Icon name="chevron-up" size={10} /></button>
                      <span style={{ cursor: 'grab', color: 'var(--muted)', display: 'inline-flex' }} title="Drag to reorder"><Icon name="grip-vertical" size={10} /></span>
                      <button onClick={() => moveAction(i, 1)} style={gutterBtn} title="Move down" aria-label="Move down"><Icon name="chevron-down" size={10} /></button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <AuraRow entry={e} idx={i} onUpdate={updateAction} onRemove={removeAction} />
                      <Annotation anchor={{ kind: 'entry', entry: e }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      })()}

      {/* Description + Source at bottom */}
      <div style={{ padding: '4px 8px', fontSize: '11px' }}>
        <textarea className="ghost" value={(sb.description as string) ?? ''}
          onChange={e => u('description', e.target.value)}
          placeholder="Description..."
          style={{ width: '100%', fontStyle: 'italic', fontSize: '11px', color: 'var(--text-secondary)' }} />
        <div style={{ color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
          <input className="ghost" value={(sb.source as string) ?? ''}
            onChange={e => u('source', e.target.value)}
            placeholder="Source..."
            style={{ fontStyle: 'italic', color: 'inherit', fontSize: 'inherit', width: '100%' }} />
        </div>
      </div>

      </div>{/* end stats column */}

      {/* ── Creature Image ── */}
      {showImages && <div style={{
        flexShrink: 0, alignSelf: 'stretch',
        width: 200, minHeight: 140, maxHeight: 320,
        display: 'flex', padding: 6,
      }}>
        <CreatureImageEditor
          imageId={creature.imageId}
          tokenImageId={creature.tokenImageId}
          tokenCrop={creature.tokenCrop}
          onImageChange={imageId => save({ ...creature, imageId })}
          onTokenChange={(tokenImageId, crop) => save({ ...creature, tokenImageId, tokenCrop: crop })}
        />
      </div>}

      </div>{/* end body flex row */}
    </div>

    {/* ─── Right column: Powers ─── */}
    <div className="stat-block-4e" style={{ flex: '1 1 400px', minWidth: 340 }}>
      <PowerEntryEditor
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <b className="sb-label">{label}</b>
      {entries.map((e, i) => {
        const justAdded = lastAdded.current === e.type
        if (justAdded) lastAdded.current = null
        return (
          <span key={e.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 3px', background: 'var(--hover)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>
            {e.type}
            {showValue && (
              <input className="ghost" type="number" value={e.value ?? ''}
                ref={justAdded ? focusRef : undefined}
                onChange={ev => updateVal(i, Number(ev.target.value))}
                onBlur={ev => { if (ev.target.value === '') updateVal(i, 0) }}
                style={{ borderBottom: '1px solid var(--border)' }} />
            )}
            <button onClick={() => remove(i)}
              style={{ color: 'var(--muted)', padding: '0 1px', lineHeight: 1, display: 'inline-flex' }} aria-label="Remove"><Icon name="x" /></button>
          </span>
        )
      })}
      {available.length > 0 && (
        <select className="ghost-add" value=""
          onChange={e => {
            if (e.target.value) {
              lastAdded.current = e.target.value
              onChange([...entries, { type: e.target.value, ...(showValue ? { value: 0 } : {}) }])
            }
          }}>
          <option value="" disabled hidden>+</option>
          {available.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {entries.length === 0 && available.length === 0 && <span style={{ fontSize: '9px', color: 'var(--muted)' }}>—</span>}
    </span>
  )
}
