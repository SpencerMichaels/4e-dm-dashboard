import { useState, useMemo, useCallback } from 'react'
import type { Encounter, Creature, CompendiumEntry, EncounterCreature } from '@common/types'
import { GhostNumberInput } from '@renderer/components/shared/GhostNumberInput'
import { useImage } from '@renderer/hooks/use-image'
import { useCompendium } from './use-compendium'
import { XP_BY_LEVEL, xpForCreature, encounterBudget, encounterLevel, encounterDifficulty, ENCOUNTER_TEMPLATES, type EncounterTemplate } from './dnd4e-utils'
import { MONSTER_TEMPLATES, meetsPrerequisite, applyMonsterTemplate } from './monster-templates'
import { CreatureCompendiumList } from './CreatureCompendiumList'
import { useUiStore } from '@renderer/stores/ui-store'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { generateId } from '@common/utils/id'
import './statblock.css'


/** Get a unique key for an encounter creature entry */
function ecKey(ec: EncounterCreature): string {
  return ec.creatureId ?? ec.compendiumId ?? ''
}

/** Check if an encounter creature matches a given key */
function ecMatches(ec: EncounterCreature, key: string): boolean {
  return ec.creatureId === key || ec.compendiumId === key
}

interface Props {
  encounter: Encounter
  onSave: (updated: Encounter) => void
  creatures: Creature[]
  onNavigate: (creatureId: string) => void
}

export function Dnd4eEncounterEditor({ encounter, onSave, creatures, onNavigate }: Props) {
  const { setView } = useUiStore()
  const comp = useCompendium()
  const [template, setTemplate] = useState<EncounterTemplate | null>(null)
  const [targetDelta, setTargetDelta] = useState(0)
  const [adding, setAdding] = useState<string | null>(null)

  const partySize = encounter.partySize
  const partyLevel = encounter.partyLevel
  const partyReady = partySize != null && partySize > 0 && partyLevel != null && partyLevel > 0

  const save = (patch: Partial<Encounter>) => {
    onSave({ ...encounter, ...patch })
  }


  // Resolve creature info from campaign creatures or compendium index
  const resolveInfo = useCallback((ec: EncounterCreature): { name: string; level: number; role: string; modifier: string; imageId?: string; statBlock?: Record<string, unknown> } | null => {
    if (ec.creatureId) {
      const creature = creatures.find(c => c.id === ec.creatureId)
      if (!creature) return null
      const sb = creature.statBlock
      return { name: creature.name, level: (sb.level as number) ?? 1, role: (sb.role as string) ?? '', modifier: (sb.monsterModifier as string) ?? '', imageId: creature.imageId, statBlock: sb }
    }
    if (ec.compendiumId && comp.index) {
      const entry = comp.index.find(e => e.id === ec.compendiumId)
      if (!entry) return null
      return { name: entry.name, level: entry.level, role: entry.role, modifier: entry.modifier }
    }
    return null
  }, [creatures, comp.index])

  // Calculate total XP: 1 template = elite (2×), 2 templates = solo (5×)
  const totalXP = useMemo(() => {
    let xp = 0
    for (const ec of encounter.creatures) {
      const info = resolveInfo(ec)
      if (!info) continue
      const templateCount = ec.monsterTemplates?.length ?? 0
      const baseMod = info.modifier
      const baseIdx = baseMod === 'solo' ? 3 : baseMod === 'elite' ? 2 : 1
      const effIdx = Math.min(baseIdx + templateCount, 3)
      const modifier = effIdx >= 3 ? 'solo' : effIdx >= 2 ? 'elite' : ''
      xp += xpForCreature(info.level, modifier) * ec.count
    }
    return xp
  }, [encounter.creatures, resolveInfo])

  // Actual encounter level from creatures currently added
  const actualEL = partyReady && totalXP > 0 ? encounterLevel(totalXP, partySize!) : undefined
  // Target EL from difficulty selector
  const encLevel = partyLevel != null ? partyLevel + targetDelta : undefined

  const budget = partyReady ? encounterBudget(partySize!, partyLevel!) : undefined
  const difficulty = partyReady ? encounterDifficulty(totalXP, partySize!, partyLevel!) : undefined

  // Target XP based on desired EL
  const targetXP = partyReady && encLevel != null
    ? partySize! * (XP_BY_LEVEL[Math.max(1, Math.min(30, encLevel))] ?? XP_BY_LEVEL[1])
    : undefined

  // Add creature from unified compendium list
  const addCreature = useCallback(async (entryId: string) => {
    if (adding) return
    setAdding(entryId)
    try {
      // Check if this is a campaign creature (Custom) or a compendium entry
      const campaignCreature = creatures.find(c => c.id === entryId)
      const existing = encounter.creatures.find(c => ecMatches(c, entryId))
      if (existing) {
        save({
          creatures: encounter.creatures.map(c =>
            ecMatches(c, entryId) ? { ...c, count: c.count + 1 } : c
          ),
        })
      } else if (campaignCreature) {
        // Custom/campaign creature — reference by creatureId
        save({ creatures: [...encounter.creatures, { creatureId: entryId, count: 1 }] })
      } else {
        // Compendium creature — reference by compendiumId (no import!)
        save({ creatures: [...encounter.creatures, { compendiumId: entryId, count: 1 }] })
      }
    } finally {
      setAdding(null)
    }
  }, [encounter, adding, creatures])

  const addMonsterTemplate = (key: string, templateName: string) => {
    save({
      creatures: encounter.creatures.map(c => {
        if (!ecMatches(c, key)) return c
        const templates = [...(c.monsterTemplates ?? [])]
        if (templates.length < 2 && !templates.includes(templateName)) templates.push(templateName)
        return { ...c, monsterTemplates: templates }
      }),
    })
  }

  const removeMonsterTemplate = (key: string, idx: number) => {
    save({
      creatures: encounter.creatures.map(c => {
        if (!ecMatches(c, key)) return c
        const templates = [...(c.monsterTemplates ?? [])]
        templates.splice(idx, 1)
        return { ...c, monsterTemplates: templates.length > 0 ? templates : undefined }
      }),
    })
  }

  const removeCreature = (key: string) => {
    save({ creatures: encounter.creatures.filter(c => !ecMatches(c, key)) })
  }

  const updateCount = (key: string, count: number) => {
    save({
      creatures: encounter.creatures.map(c =>
        ecMatches(c, key) ? { ...c, count } : c
      ),
    })
  }

  // Template slot tracking
  const templateSlotFill = useMemo(() => {
    if (!template) return null
    const roleCounts: Record<string, number> = {}
    for (const ec of encounter.creatures) {
      const info = resolveInfo(ec)
      if (!info) continue
      const role = (info.role ?? '').toLowerCase()
      roleCounts[role] = (roleCounts[role] ?? 0) + ec.count
    }
    return template.slots.map(slot => {
      const filled = (roleCounts[slot.role] ?? 0) + (slot.altRole ? (roleCounts[slot.altRole] ?? 0) : 0)
      const targetLevel = encLevel != null ? encLevel + slot.levelOffset : undefined
      return { ...slot, filled: Math.min(filled, slot.count), targetLevel }
    })
  }, [template, encounter.creatures, creatures, encLevel])

  // Click template slot → filter compendium to that role + level
  const filterBySlot = (role: string, altRole?: string, targetLevel?: number) => {
    comp.updateFilter('role', role)
    if (targetLevel != null) {
      const lo = Math.max(1, targetLevel - 1)
      const hi = Math.min(30, targetLevel + 1)
      comp.updateFilter('level', `${lo}–${hi}`)
    }
  }

  const annotations = useCampaignStore(s => s.annotations)

  const startCombat = async () => {
    await window.api.combat.init(encounter.id)

    // First pass: build all combatant entries with base names
    const pending: { baseName: string; hp: number; maxHp: number; sb: any; imageId?: string; tokenImageId?: string; entityId?: string }[] = []
    for (const ec of encounter.creatures) {
      let creature: Creature | null = null

      if (ec.creatureId) {
        creature = creatures.find(c => c.id === ec.creatureId) ?? null
      } else if (ec.compendiumId) {
        // Resolve from compendium — check for campaign override first
        const override = creatures.find(c => c.compendiumId === ec.compendiumId)
        if (override) {
          creature = override
        } else {
          creature = await window.api.compendium.resolve('dnd-4e', ec.compendiumId)
          // Apply annotation image if present
          const ann = annotations[ec.compendiumId]
          if (ann?.imageId && creature) creature.imageId = ann.imageId
        }
      }
      if (!creature) continue

      const templateNames = ec.monsterTemplates ?? []
      const templates = templateNames.map(n => MONSTER_TEMPLATES.find(t => t.name === n)).filter(Boolean)
      // Ensure statBlock.hp is set before applying templates (imported creatures store HP on creature, not statBlock)
      let sb = { ...creature.statBlock }
      if (sb.hp == null) sb.hp = creature.maxHp ?? creature.hp
      for (const tmpl of templates) sb = applyMonsterTemplate(sb, tmpl!)
      if (templates.length >= 2) {
        sb = { ...sb, monsterModifier: 'solo', savingThrowBonus: 5 }
      }
      const combatHp = ec.overrideHp ?? (sb.hp as number) ?? creature.maxHp
      const baseName = creature.name

      for (let i = 0; i < ec.count; i++) {
        pending.push({ baseName, hp: combatHp, maxHp: combatHp, sb, imageId: creature.imageId, tokenImageId: creature.tokenImageId, entityId: creature.id })
      }
    }

    // Second pass: detect duplicate names and suffix with letters
    const nameCounts = new Map<string, number>()
    for (const p of pending) nameCounts.set(p.baseName, (nameCounts.get(p.baseName) ?? 0) + 1)
    const nameIndexes = new Map<string, number>()

    for (const p of pending) {
      const total = nameCounts.get(p.baseName)!
      let name = p.baseName
      let indicator: string | undefined
      if (total > 1) {
        const idx = nameIndexes.get(p.baseName) ?? 0
        nameIndexes.set(p.baseName, idx + 1)
        indicator = String.fromCharCode(65 + idx)
        name = `${p.baseName} ${indicator}`
      }
      await window.api.combat.addCombatant({
        id: generateId(),
        name, isPC: false, hp: p.hp, maxHp: p.maxHp,
        miniIndicator: indicator, statBlock: p.sb,
        imageId: p.imageId, tokenImageId: p.tokenImageId, entityId: p.entityId,
      })
    }

    setView({ type: 'combat' })
  }

  return (
    <div style={{ height: 'calc(100vh - var(--header-height) - 2 * var(--space-6))', display: 'flex', gap: 'var(--space-3)' }}>
      {/* ─── Left: Encounter State ─── */}
      <div className="stat-block-4e" style={{ flex: '1 1 320px', minWidth: 280, display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12, lineHeight: 1.5 }}>
        {/* Header */}
        <div className="sb-header">
          <input className="ghost sb-name" value={encounter.name}
            onChange={e => save({ name: e.target.value })}
            placeholder="Encounter Name" style={{ color: 'inherit' }} />
          {actualEL != null && (
            <span style={{ whiteSpace: 'nowrap' }}>Level {actualEL}</span>
          )}
        </div>

        {/* Subheader: party info + XP */}
        <div className="sb-subheader" style={{ gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            Party of{' '}
            <GhostNumberInput value={partySize} min={1}
              onChange={v => save({ partySize: v })}
              placeholder="5"
              style={{ width: 28, color: 'inherit', textAlign: 'center', fontWeight: 600 }} />
            {' '}at level{' '}
            <GhostNumberInput value={partyLevel} min={1} max={30}
              onChange={v => save({ partyLevel: v })}
              placeholder="1"
              style={{ width: 28, color: 'inherit', textAlign: 'center', fontWeight: 600 }} />
          </span>
          {totalXP > 0 && (
            <span style={{ whiteSpace: 'nowrap' }}>
              {totalXP.toLocaleString()} XP
            </span>
          )}
        </div>

        {/* Background image */}
        <BackgroundImagePicker
          imageId={encounter.backgroundImageId}
          onChange={id => save({ backgroundImageId: id || undefined })}
        />

        {/* Difficulty bar */}
        {partyReady && difficulty ? (
          <DifficultyBar totalXP={totalXP} partySize={partySize!} partyLevel={partyLevel!}
            difficulty={difficulty} targetXP={targetXP} targetDelta={targetDelta} onSetTarget={setTargetDelta} />
        ) : (
          <div style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: 11, fontStyle: 'italic' }}>
            Set party size and level to see difficulty.
          </div>
        )}

        {/* Template + XP tally */}
        <div className="sb-row" style={{ borderTop: '1px solid var(--sb-separator)', justifyContent: 'space-between' }}>
          <select className="ghost" value={template?.name ?? ''}
            onChange={e => setTemplate(ENCOUNTER_TEMPLATES.find(t => t.name === e.target.value) ?? null)}>
            <option value="">Freeform</option>
            {ENCOUNTER_TEMPLATES.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap' }}>
            {totalXP.toLocaleString()}
            {targetXP != null && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> / {targetXP.toLocaleString()}</span>}
            {' '}XP
          </span>
        </div>

        {/* Template slots */}
        {templateSlotFill && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 8px' }}>
            {templateSlotFill.map((slot, i) => {
              const roleName = slot.altRole
                ? `${cap(slot.role)}/${cap(slot.altRole)}`
                : cap(slot.role)
              const levelLabel = slot.targetLevel != null ? ` L${slot.targetLevel}` : ''
              const fraction = slot.filled / slot.count
              const done = fraction >= 1
              return (
                <button key={i} onClick={() => filterBySlot(slot.role, slot.altRole, slot.targetLevel)}
                  title={`Click to filter compendium to ${roleName}${levelLabel}`}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: 'var(--font-size-xs)', fontWeight: 600,
                    background: 'var(--color-bg-hover)',
                    color: done ? 'var(--color-text-primary)' : 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                  }}>
                  {/* Progress fill */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${fraction * 100}%`,
                    background: done ? 'var(--color-accent)' : 'rgba(92, 124, 250, 0.25)',
                    transition: 'width 0.2s',
                  }} />
                  <span style={{ position: 'relative' }}>
                    {slot.filled}/{slot.count} {roleName}{levelLabel}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Creature list */}
        <div style={{ borderTop: '1px solid var(--sb-separator)', flex: 1, overflow: 'auto', minHeight: 0 }}>
          {encounter.creatures.length === 0 ? (
            <div className="sb-row" style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              Add creatures from the compendium →
            </div>
          ) : (
            encounter.creatures.map((ec) => {
              const key = ecKey(ec)
              const info = resolveInfo(ec)
              if (!info) return null
              const level = info.level
              const baseRole = info.role
              const baseModifier = info.modifier
              const templates = (ec.monsterTemplates ?? []).map(n => MONSTER_TEMPLATES.find(t => t.name === n)).filter(Boolean)
              const effectiveRole = templates.length > 0 ? templates[templates.length - 1]!.role : baseRole
              const templateCount = templates.length
              const modifierLevels = ['', 'standard', 'elite', 'solo']
              const baseIdx = baseModifier === 'solo' ? 3 : baseModifier === 'elite' ? 2 : 1
              const effectiveIdx = Math.min(baseIdx + templateCount, 3)
              const effectiveModifier = modifierLevels[effectiveIdx] === 'standard' ? '' : modifierLevels[effectiveIdx]
              const creatureXP = xpForCreature(level, effectiveModifier)
              const modLbl = effectiveModifier === 'elite' ? ' (E)' : effectiveModifier === 'solo' ? ' (S)' : ''
              const levelDelta = partyLevel != null ? Math.abs(level - partyLevel) : 0
              const outOfRange = partyLevel != null && levelDelta > 4
              const appliedNames = ec.monsterTemplates ?? []
              // Template prerequisites — use statBlock if available (campaign creature), else skip
              const sb = info.statBlock
              const availableTemplates = sb ? MONSTER_TEMPLATES.filter(t => meetsPrerequisite(sb, t) && !appliedNames.includes(t.name)) : []
              const maxTemplates = baseModifier === 'solo' ? 0 : baseModifier === 'elite' ? 1 : 2
              const canAddTemplate = templateCount < maxTemplates && availableTemplates.length > 0
              const hasTemplates = appliedNames.length > 0

              const addTemplateSelect = canAddTemplate ? (
                <select className="ghost" value=""
                  onChange={e => { if (e.target.value) addMonsterTemplate(key, e.target.value) }}
                  style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  <option value="">+ template</option>
                  {availableTemplates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              ) : null

              const handleNavigate = () => {
                if (ec.creatureId) onNavigate(ec.creatureId)
                // Compendium creatures — no navigation (could open preview in future)
              }

              return (
                <div key={key} style={{ borderBottom: '1px solid var(--sb-separator, rgba(128,128,128,0.1))' }}>
                  <div className="sb-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    <span style={{ flex: 1, cursor: ec.creatureId ? 'pointer' : 'default', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      onClick={handleNavigate}>
                      {outOfRange && <span title={`${levelDelta} levels from party — DMG recommends ±4`} style={{ color: '#c0392b', marginRight: 2 }}>⚠</span>}
                      <b>{info.name}</b>
                      <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>
                        L{level} {effectiveRole}{modLbl}
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {!hasTemplates && addTemplateSelect}
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', minWidth: 35, textAlign: 'right' }}>
                        {creatureXP.toLocaleString()}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)' }}>×</span>
                      <GhostNumberInput value={ec.count || undefined} min={1}
                        onChange={v => updateCount(key, v ?? 1)}
                        style={{ width: 24, textAlign: 'center' }} />
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600, minWidth: 40, textAlign: 'right', fontSize: 'var(--font-size-xs)' }}>
                        = {(creatureXP * ec.count).toLocaleString()}
                      </span>
                      <button onClick={() => removeCreature(key)}
                        style={{ color: 'var(--color-text-muted)', padding: '0 3px', lineHeight: 1, cursor: 'pointer' }}>×</button>
                    </span>
                  </div>
                  {hasTemplates && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 8px 2px 16px', fontSize: 'var(--font-size-xs)' }}>
                    {appliedNames.map((tName, ti) => (
                      <span key={tName} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '0 4px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
                      }}>
                        {tName}
                        <button onClick={() => removeMonsterTemplate(key, ti)}
                          style={{ color: 'var(--color-text-muted)', padding: 0, lineHeight: 1, cursor: 'pointer', fontSize: '0.9em' }}>×</button>
                      </span>
                    ))}
                    {addTemplateSelect}
                  </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Start combat */}
        {encounter.creatures.length > 0 && (
          <div style={{ padding: '8px', borderTop: '1px solid var(--sb-separator)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
            <button onClick={startCombat} style={{
              padding: 'var(--space-2) var(--space-6)',
              background: 'var(--color-danger)', color: '#fff',
              borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer',
            }}>
              Start Combat
            </button>
          </div>
        )}
      </div>

      {/* ─── Right: Creature Compendium Browser ─── */}
      <CompendiumPanel comp={comp} onAdd={addCreature} adding={adding}
        maxCreatureXP={targetXP} />
    </div>
  )
}

// ─── Helpers ───

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ─── Compendium Panel (right side) ───

function CompendiumPanel({ comp, onAdd, adding, maxCreatureXP }: {
  comp: ReturnType<typeof useCompendium>
  onAdd: (monsterId: string) => void
  adding: string | null
  maxCreatureXP?: number
}) {
  const { filters, filtered: allFiltered, filterOptions, updateFilter, searchRef, totalCount, loading, filtering } = comp

  const filtered = useMemo(() => {
    if (maxCreatureXP == null) return allFiltered
    return allFiltered.filter(c => xpForCreature(c.level, c.modifier) <= maxCreatureXP)
  }, [allFiltered, maxCreatureXP])

  return (
    <div className="stat-block-4e" style={{ flex: '1 1 300px', minWidth: 250, display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12 }}>
      {/* Search header */}
      <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0 }}>
        <input className="ghost sb-name" ref={searchRef} value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          placeholder="Search..."
          style={{ color: 'inherit', flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
          Level <input className="ghost" value={filters.level}
            onChange={e => updateFilter('level', e.target.value.replace(/-/g, '–'))}
            placeholder="1–30" style={{ width: 40, color: 'inherit', textAlign: 'center' }} />
          <select className="ghost" value={filters.modifier} onChange={e => updateFilter('modifier', e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">modifier</option>
            <option value="standard">standard</option>
            <option value="elite">elite</option>
            <option value="solo">solo</option>
          </select>
          <select className="ghost" value={filters.role} onChange={e => updateFilter('role', e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">role</option>
            {filterOptions.roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </span>
      </div>
      <div className="sb-subheader" style={{ flexShrink: 0, marginBottom: 0 }}>
        <span style={{ display: 'flex', gap: 4 }}>
          <select className="ghost" value={filters.size} onChange={e => updateFilter('size', e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">size</option>
            {filterOptions.sizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="ghost" value={filters.origin} onChange={e => updateFilter('origin', e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">origin</option>
            {filterOptions.origins.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="ghost" value={filters.type} onChange={e => updateFilter('type', e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">type</option>
            {filterOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="ghost" value={filters.source} onChange={e => updateFilter('source', e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">source</option>
            {filterOptions.sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
          Loading...
        </div>
      ) : (
        <CreatureCompendiumList items={filtered} onAdd={onAdd} addingId={adding} addTitle="Add to encounter" />
      )}

      {/* Status */}
      <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2)', flexShrink: 0, opacity: filtering ? 0.5 : 1, fontSize: 'var(--font-size-xs)' }}>
        {loading ? '\u00A0' : `${filtered.length.toLocaleString()} of ${totalCount.toLocaleString()}`}
      </div>
    </div>
  )
}

// ─── Difficulty Bar ───

// Each level cell in the bar: delta from party level, which difficulty zone it belongs to
const LEVEL_CELLS: { delta: number; label: string; color: string }[] = [
  { delta: -4, label: 'Trivial', color: '#888' },
  { delta: -3, label: 'Trivial', color: '#888' },
  { delta: -2, label: 'Easy', color: '#4a7a5a' },
  { delta: -1, label: 'Easy', color: '#4a7a5a' },
  { delta: 0, label: 'Standard', color: '#4a6a8a' },
  { delta: 1, label: 'Standard', color: '#4a6a8a' },
  { delta: 2, label: 'Hard', color: '#b8860b' },
  { delta: 3, label: 'Hard', color: '#b8860b' },
  { delta: 4, label: 'Hard', color: '#b8860b' },
  { delta: 5, label: 'Deadly', color: '#7b241c' },
  { delta: 6, label: 'Deadly', color: '#7b241c' },
]

function BackgroundImagePicker({ imageId, onChange }: { imageId?: string; onChange: (id: string | undefined) => void }) {
  const imageUrl = useImage(imageId)

  const handleUpload = useCallback(async () => {
    const newId = await window.api.image.importDialog()
    if (newId) onChange(newId)
  }, [onChange])

  if (!imageId) {
    return (
      <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--sb-separator)' }}>
        <button onClick={handleUpload} style={{
          fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)',
          cursor: 'pointer', background: 'none', border: 'none', padding: 0,
        }}>
          + Background image
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: '4px 8px', borderBottom: '1px solid var(--sb-separator)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div onClick={handleUpload} style={{
        width: 60, height: 34, borderRadius: 3, overflow: 'hidden',
        cursor: 'pointer', flexShrink: 0,
      }}>
        {imageUrl && <img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
      </div>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flex: 1 }}>Background</span>
      <button onClick={() => onChange(undefined)} style={{
        fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)',
        cursor: 'pointer', background: 'none', border: 'none',
      }}>×</button>
    </div>
  )
}

function DifficultyBar({ totalXP, partySize, partyLevel, difficulty, targetXP, targetDelta, onSetTarget }: {
  totalXP: number
  partySize: number
  partyLevel: number
  difficulty: { encounterLevel: number; label: string; color: string }
  targetXP?: number
  targetDelta: number
  onSetTarget: (delta: number) => void
}) {
  // Map XP to a fractional position across the bar (0-1 over 11 cells)
  const xpToPos = (xp: number) => {
    const perPC = xp / partySize
    const barStart = partyLevel - 4
    for (let lvl = 1; lvl <= 30; lvl++) {
      const xpThis = XP_BY_LEVEL[lvl] ?? 0
      if (perPC <= xpThis) {
        const xpPrev = XP_BY_LEVEL[lvl - 1] ?? 0
        const frac = xpPrev < xpThis ? (perPC - xpPrev) / (xpThis - xpPrev) : 0
        const fracLevel = (lvl - 1) + frac
        return Math.max(0, Math.min(1, (fracLevel - barStart) / LEVEL_CELLS.length)) * 100
      }
    }
    return 100
  }

  const markerPos = totalXP > 0 ? xpToPos(totalXP) : 0
  const targetPos = targetXP != null ? xpToPos(targetXP) : null

  // Group cells by label for category headers
  const categories: { label: string; color: string; count: number }[] = []
  for (const cell of LEVEL_CELLS) {
    const last = categories[categories.length - 1]
    if (last && last.label === cell.label) last.count++
    else categories.push({ label: cell.label, color: cell.color, count: 1 })
  }

  return (
    <div style={{ padding: '4px 8px' }}>
      {/* Category labels above */}
      <div style={{ display: 'flex', fontSize: 9, fontWeight: 600, marginBottom: 1 }}>
        {categories.map(c => (
          <div key={c.label} style={{
            width: `${(c.count / LEVEL_CELLS.length) * 100}%`,
            textAlign: 'center', color: c.color,
          }}>
            {c.label}
          </div>
        ))}
      </div>

      {/* Level cells */}
      <div style={{ position: 'relative', display: 'flex', height: 22, borderRadius: 3, overflow: 'hidden' }}>
        {LEVEL_CELLS.map((cell) => {
          const isTarget = cell.delta === targetDelta
          return (
            <div key={cell.delta} onClick={() => onSetTarget(cell.delta)}
              title={`PL${cell.delta >= 0 ? '+' : ''}${cell.delta}`}
              style={{
                flex: 1, background: cell.color, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                borderRight: '1px solid rgba(0,0,0,0.15)',
                outline: isTarget ? '2px solid #fff' : 'none',
                outlineOffset: -2,
                zIndex: isTarget ? 1 : 0,
              }}>
              {cell.delta >= 0 ? '+' : ''}{cell.delta}
            </div>
          )
        })}
        {/* Target line */}
        {targetPos != null && (
          <div style={{
            position: 'absolute', left: `${targetPos}%`, top: 0, bottom: 0,
            width: 2, background: '#fff', opacity: 0.8,
            transform: 'translateX(-1px)', pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Marker */}
      {totalXP > 0 && (
        <div style={{ position: 'relative', height: 10 }}>
          <div style={{
            position: 'absolute', left: `${markerPos}%`, top: 0,
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderBottom: `8px solid ${difficulty.color}`,
          }} />
        </div>
      )}

    </div>
  )
}
