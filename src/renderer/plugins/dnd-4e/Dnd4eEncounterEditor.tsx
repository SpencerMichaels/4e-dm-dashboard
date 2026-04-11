import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { Encounter, Creature, CompendiumEntry, EncounterCreature } from '@common/types'
import { GhostNumberInput } from '@renderer/components/shared/GhostNumberInput'
import { MultiSelectDropdown } from '@renderer/components/shared/MultiSelectDropdown'
import { useImage } from '@renderer/hooks/use-image'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { useCompendium } from './use-compendium'
import { useGlossary } from './use-glossary'
import { XP_BY_LEVEL, xpForCreature, encounterBudget, encounterLevel, encounterDifficulty, ENCOUNTER_TEMPLATES, type EncounterTemplate } from './dnd4e-utils'
import { MONSTER_TEMPLATES, meetsPrerequisite, applyMonsterTemplate, type MonsterTemplate } from './monster-templates'
import { CreatureCompendiumList } from './CreatureCompendiumList'
import { Dnd4eCreatureViewer, type TemplateChip } from './Dnd4eCreatureViewer'
import { TemplateViewer } from './Dnd4eTemplateBrowser'
import { VirtualizedList } from './VirtualizedList'
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
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewCreature, setPreviewCreature] = useState<Creature | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const { tooltip } = useGlossary()
  // Lazy cache of compendium creature statblocks (so we can evaluate template prerequisites for compendium-only entries)
  const [compStatBlocks, setCompStatBlocks] = useState<Record<string, Record<string, unknown>>>({})
  // Template-application mode state
  const [templateModeKey, setTemplateModeKey] = useState<string | null>(null)
  const [previewTemplateName, setPreviewTemplateName] = useState<string | null>(null)
  const [templateInfoPopup, setTemplateInfoPopup] = useState<MonsterTemplate | null>(null)
  // Encounter row selection (click a row in the encounter list to preview it on the right)
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)

  // Party size and level are derived from active PCs and the campaign-wide level
  const playerCharacters = useCampaignStore(s => s.playerCharacters)
  const campaign = useCampaignStore(s => s.campaign)
  const partySize = playerCharacters.filter(pc => pc.active !== false).length
  const partyLevel = campaign?.partyLevel
  const partyReady = partySize > 0 && partyLevel != null && partyLevel > 0

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
      return { name: entry.name, level: entry.level, role: entry.role, modifier: entry.modifier, statBlock: compStatBlocks[ec.compendiumId] }
    }
    return null
  }, [creatures, comp.index, compStatBlocks])

  // Calculate total XP: 1 template = elite (2×), 2 templates = solo (5×), minion = standard / 4
  const totalXP = useMemo(() => {
    let xp = 0
    for (const ec of encounter.creatures) {
      const info = resolveInfo(ec)
      if (!info) continue
      if (ec.isMinion) {
        xp += Math.round(xpForCreature(info.level, '') / 4) * ec.count
        continue
      }
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
      // Auto-detect native minions by name suffix
      const entryName = campaignCreature?.name ?? comp.index?.find(e => e.id === entryId)?.name ?? ''
      const autoMinion = /\bminion\b/i.test(entryName)
      if (existing) {
        save({
          creatures: encounter.creatures.map(c =>
            ecMatches(c, entryId) ? { ...c, count: c.count + 1 } : c
          ),
        })
      } else if (campaignCreature) {
        // Custom/campaign creature — reference by creatureId
        save({ creatures: [...encounter.creatures, { creatureId: entryId, count: 1, isMinion: autoMinion || undefined }] })
      } else {
        // Compendium creature — reference by compendiumId (no import!)
        save({ creatures: [...encounter.creatures, { compendiumId: entryId, count: 1, isMinion: autoMinion || undefined }] })
      }
    } finally {
      setAdding(null)
    }
  }, [encounter, adding, creatures, comp.index])

  const selectPreview = useCallback(async (entryId: string) => {
    if (entryId === previewId) return
    setPreviewId(entryId)
    setSelectedRowKey(null)
    const campaignCreature = creatures.find(c => c.id === entryId)
    if (campaignCreature) {
      setPreviewCreature(campaignCreature)
    } else {
      const creature = await window.api.compendium.get('dnd-4e', entryId)
      setPreviewCreature(creature)
    }
    previewRef.current?.scrollTo(0, 0)
  }, [previewId, creatures])

  // Lazy-fetch compendium creature statblocks for any encounter creature missing one
  useEffect(() => {
    const missing = encounter.creatures
      .map(ec => ec.compendiumId)
      .filter((id): id is string => !!id && !compStatBlocks[id])
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map(async id => {
      const creature = await window.api.compendium.get('dnd-4e', id)
      // Patch hp into the cached statBlock so template merges have the correct base HP
      const sb = creature?.statBlock ? { ...creature.statBlock } : null
      if (sb && sb.hp == null) sb.hp = creature.maxHp ?? creature.hp
      return [id, sb] as const
    })).then(results => {
      if (cancelled) return
      setCompStatBlocks(prev => {
        const next = { ...prev }
        for (const [id, sb] of results) if (sb) next[id] = sb as Record<string, unknown>
        return next
      })
    })
    return () => { cancelled = true }
  }, [encounter.creatures, compStatBlocks])

  // Resolve the live (post-applied-templates) statBlock + name for an encounter row
  const resolveCurrentSb = useCallback((ec: EncounterCreature): { name: string; sb: Record<string, unknown> } | null => {
    let baseSb: Record<string, unknown> | undefined
    let name = ''
    if (ec.creatureId) {
      const c = creatures.find(x => x.id === ec.creatureId)
      if (!c) return null
      baseSb = { ...c.statBlock }
      // Imported creatures store HP on the wrapper, not in statBlock
      if (baseSb.hp == null) baseSb.hp = c.maxHp ?? c.hp
      name = c.name
    } else if (ec.compendiumId) {
      baseSb = compStatBlocks[ec.compendiumId]
      const entry = comp.index?.find(e => e.id === ec.compendiumId)
      name = entry?.name ?? ''
      if (!baseSb) return null
    } else return null
    let sb = { ...baseSb }
    const tNames = ec.monsterTemplates ?? []
    tNames.forEach((tName, i) => {
      const t = MONSTER_TEMPLATES.find(t => t.name === tName)
      if (t) sb = applyMonsterTemplate(sb, t, i)
    })
    return { name, sb }
  }, [creatures, compStatBlocks, comp.index])

  const toggleMinion = (key: string) => {
    save({
      creatures: encounter.creatures.map(c => {
        if (!ecMatches(c, key)) return c
        const next = !c.isMinion
        // Marking as minion clears templates (incompatible)
        return { ...c, isMinion: next || undefined, monsterTemplates: next ? undefined : c.monsterTemplates }
      }),
    })
  }

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

  // Delete/Backspace removes the selected encounter row
  useHotkeys([
    { key: 'Delete', handler: () => { if (selectedRowKey) { removeCreature(selectedRowKey); setSelectedRowKey(null) } } },
    { key: 'Backspace', handler: () => { if (selectedRowKey) { removeCreature(selectedRowKey); setSelectedRowKey(null) } } },
  ])

  const selectRow = (key: string) => {
    setSelectedRowKey(key === selectedRowKey ? null : key)
    setPreviewId(null)
    setPreviewCreature(null)
  }

  // Compute the maximum number of templates a creature can hold based on its base modifier
  const maxTemplatesFor = (info: { modifier: string }): number => {
    const m = info.modifier
    return m === 'solo' ? 0 : m === 'elite' ? 1 : 2
  }

  // Toggle template-mode on/off for a row
  const toggleTemplateMode = (key: string) => {
    if (templateModeKey === key) {
      setTemplateModeKey(null)
      setPreviewTemplateName(null)
    } else {
      setTemplateModeKey(key)
      setPreviewTemplateName(null)
      setPreviewId(null)
    }
  }

  const exitTemplateMode = () => {
    setTemplateModeKey(null)
    setPreviewTemplateName(null)
  }

  // Commit a template to the active row; auto-exit when no more slots remain
  const commitTemplate = (templateName: string) => {
    if (!templateModeKey) return
    const ec = encounter.creatures.find(c => ecMatches(c, templateModeKey))
    if (!ec) return
    const info = resolveInfo(ec)
    if (!info) return
    const currentCount = ec.monsterTemplates?.length ?? 0
    const max = maxTemplatesFor(info)
    if (currentCount >= max) return
    addMonsterTemplate(templateModeKey, templateName)
    setPreviewTemplateName(null)
    if (currentCount + 1 >= max) exitTemplateMode()
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

  // Template slot tracking — match by role (or altRole) AND modifier when both are set
  const templateSlotFill = useMemo(() => {
    if (!template) return null
    return template.slots.map(slot => {
      let filled = 0
      for (const ec of encounter.creatures) {
        const info = resolveInfo(ec)
        if (!info) continue
        const role = (info.role ?? '').toLowerCase()
        const modifier = (info.modifier ?? '').toLowerCase()
        let matches = true
        if (slot.role) {
          matches = role === slot.role || (slot.altRole != null && role === slot.altRole)
        }
        if (matches && slot.modifier) {
          matches = modifier === slot.modifier
        }
        if (matches) filled += ec.count
      }
      const targetLevel = encLevel != null ? encLevel + slot.levelOffset : undefined
      return { ...slot, filled: Math.min(filled, slot.count), targetLevel }
    })
  }, [template, encounter.creatures, encLevel, resolveInfo])

  // Click template slot → filter compendium to that role/modifier + level
  const filterBySlot = (slot: { role: string; altRole?: string; modifier?: string; targetLevel?: number }) => {
    const roles = slot.role
      ? (slot.altRole ? [slot.role, slot.altRole] : [slot.role])
      : []
    comp.updateFilter('role', roles)
    comp.updateFilter('modifier', slot.modifier ?? '')
    if (slot.targetLevel != null) {
      comp.updateFilter('level', String(slot.targetLevel))
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
      templates.forEach((tmpl, ti) => { sb = applyMonsterTemplate(sb, tmpl!, ti) })
      if (templates.length >= 2) {
        sb = { ...sb, monsterModifier: 'solo', savingThrowBonus: 5 }
      }
      if (ec.isMinion) {
        sb = { ...sb, hp: 1, isMinion: true }
      }
      const combatHp = ec.isMinion ? 1 : (ec.overrideHp ?? (sb.hp as number) ?? creature.maxHp)
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
      {/* ─── Left column: encounter (top) + search (bottom) ─── */}
      <div style={{ flex: '1 1 360px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minHeight: 0 }}>
      <div className="stat-block-4e" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12, lineHeight: 1.5 }}>
        {/* Header */}
        <div className="sb-header" style={{ gap: 6 }}>
          <input className="ghost sb-name" value={encounter.name}
            onChange={e => save({ name: e.target.value })}
            placeholder="Encounter Name"
            style={{ color: 'inherit', width: 'auto', fieldSizing: 'content' as any }} />
          {actualEL != null && (
            <span style={{ whiteSpace: 'nowrap' }}>Level {actualEL}</span>
          )}
        </div>

        {/* Subheader: party info + XP */}
        <div className="sb-subheader" style={{ gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            {partyReady
              ? <>Party of <b>{partySize}</b> at level <b>{partyLevel}</b></>
              : <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Set party level &amp; mark active PCs on the PCs page</span>}
          </span>
          {totalXP > 0 && (
            <span style={{ whiteSpace: 'nowrap' }}>
              {totalXP.toLocaleString()} XP
            </span>
          )}
        </div>

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
              const roleName = slot.role
                ? (slot.altRole ? `${cap(slot.role)}/${cap(slot.altRole)}` : cap(slot.role))
                : (slot.modifier ? cap(slot.modifier) : 'Any')
              const levelLabel = slot.targetLevel != null ? ` L${slot.targetLevel}` : ''
              const fraction = slot.filled / slot.count
              const done = fraction >= 1
              return (
                <button key={i} onClick={() => filterBySlot(slot)}
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

        {/* Creature list — column headers */}
        {encounter.creatures.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 24px 70px 50px 28px 50px 70px',
            gap: 'var(--space-2)', padding: '2px var(--space-2)',
            borderTop: '1px solid var(--sb-separator)',
            borderBottom: '1px solid var(--sb-separator, var(--color-border))',
            flexShrink: 0, color: 'var(--color-text-muted)', fontWeight: 600,
            fontSize: 'var(--font-size-xs)', userSelect: 'none',
          }}>
            <span>Name</span>
            <span>Lvl</span>
            <span>Role</span>
            <span>XP</span>
            <span>×</span>
            <span>Total</span>
            <span></span>
          </div>
        )}

        {/* Creature list */}
        <div style={{ borderTop: encounter.creatures.length === 0 ? '1px solid var(--sb-separator)' : 'none', flex: 1, overflow: 'auto', minHeight: 0 }}>
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
              const isMinion = !!ec.isMinion
              const creatureXP = isMinion
                ? Math.round(xpForCreature(level, '') / 4)
                : xpForCreature(level, effectiveModifier)
              const modLbl = isMinion
                ? ' (M)'
                : effectiveModifier === 'elite' ? ' (E)' : effectiveModifier === 'solo' ? ' (S)' : ''
              const levelDelta = partyLevel != null ? Math.abs(level - partyLevel) : 0
              const outOfRange = partyLevel != null && levelDelta > 4
              const appliedNames = ec.monsterTemplates ?? []
              // Template prerequisites — use statBlock if available (campaign creature), else skip
              const sb = info.statBlock
              const availableTemplates = sb ? MONSTER_TEMPLATES.filter(t => meetsPrerequisite(sb, t) && !appliedNames.includes(t.name)) : []
              const maxTemplates = baseModifier === 'solo' ? 0 : baseModifier === 'elite' ? 1 : 2
              const canAddTemplate = !isMinion && templateCount < maxTemplates && availableTemplates.length > 0
              const hasTemplates = appliedNames.length > 0
              // Minion toggle is incompatible with elite/solo (base or via templates)
              const canBeMinion = baseModifier !== 'elite' && baseModifier !== 'solo' && templateCount === 0

              const inTemplateMode = templateModeKey === key
              const templateBtnDisabled = isMinion || !sb || templateCount >= maxTemplates || availableTemplates.length === 0

              const handleNavigate = () => {
                if (ec.creatureId) onNavigate(ec.creatureId)
                // Compendium creatures — no navigation (could open preview in future)
              }

              const isRowSelected = selectedRowKey === key
              const ENC_ROW_COLS = '1fr 24px 70px 50px 28px 50px 70px'
              const xsStyle = { fontSize: 'var(--font-size-xs)' }
              const mutedCell: React.CSSProperties = { ...xsStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }
              return (
                <div key={key}
                  onClick={() => selectRow(key)}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
                    background: isRowSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : 'transparent',
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <div style={{
                    display: 'grid', gridTemplateColumns: ENC_ROW_COLS,
                    gap: 'var(--space-2)', alignItems: 'center',
                    padding: '4px var(--space-2)',
                    minHeight: 28,
                  }}>
                    <span style={{ ...xsStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isRowSelected ? 600 : 400 }}>
                      {outOfRange && <span title={`${levelDelta} levels from party — DMG recommends ±4`} style={{ color: '#c0392b', marginRight: 2 }}>⚠</span>}
                      {info.name}
                    </span>
                    <span style={mutedCell}>{level}</span>
                    <span style={mutedCell}>{effectiveRole}{modLbl}</span>
                    <span style={mutedCell}>{creatureXP.toLocaleString()}</span>
                    <span onClick={e => e.stopPropagation()}>
                      <GhostNumberInput value={ec.count || undefined} min={1}
                        onChange={v => updateCount(key, v ?? 1)}
                        style={{ width: 24, textAlign: 'left', ...xsStyle }} />
                    </span>
                    <span style={{ ...xsStyle, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      {(creatureXP * ec.count).toLocaleString()}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                      onClick={e => e.stopPropagation()}>
                      {(canBeMinion || isMinion) && (
                        <button
                          onClick={() => toggleMinion(key)}
                          title={isMinion ? 'Unmark as minion' : 'Mark as minion (HP 1, ¼ XP)'}
                          style={{
                            padding: '0 5px', borderRadius: 'var(--radius-sm)',
                            ...xsStyle, fontWeight: 600, cursor: 'pointer',
                            background: isMinion ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                            color: isMinion ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                            border: '1px solid var(--color-border)', lineHeight: 1.2,
                          }}
                        >M</button>
                      )}
                      <button
                        onClick={() => !templateBtnDisabled && toggleTemplateMode(key)}
                        disabled={templateBtnDisabled}
                        title={
                          templateBtnDisabled
                            ? (isMinion ? 'Minions can\'t take templates' :
                               templateCount >= maxTemplates ? 'No template slots remaining' :
                               !sb ? 'Loading creature data…' : 'No eligible templates')
                            : (inTemplateMode ? 'Exit template mode' : 'Add a functional template')
                        }
                        style={{
                          padding: '0 5px', borderRadius: 'var(--radius-sm)',
                          ...xsStyle, fontWeight: 600,
                          cursor: templateBtnDisabled ? 'not-allowed' : 'pointer',
                          background: inTemplateMode ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                          color: inTemplateMode ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                          border: '1px solid var(--color-border)',
                          opacity: templateBtnDisabled ? 0.4 : 1, lineHeight: 1.2,
                        }}
                      >T</button>
                      <button onClick={() => removeCreature(key)}
                        title="Remove from encounter"
                        style={{ color: 'var(--color-text-muted)', padding: '0 4px', lineHeight: 1, cursor: 'pointer', background: 'transparent', border: 'none' }}>×</button>
                    </span>
                  </div>
                  {hasTemplates && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 var(--space-2) 4px var(--space-4)', flexWrap: 'wrap', ...xsStyle }}
                    onClick={e => e.stopPropagation()}>
                    {appliedNames.map((tName, ti) => (
                      <span key={tName} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '0 5px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
                      }}>
                        {tName}
                        <button onClick={() => removeMonsterTemplate(key, ti)}
                          style={{ color: 'var(--color-text-muted)', padding: 0, lineHeight: 1, cursor: 'pointer', fontSize: '0.9em', background: 'transparent', border: 'none' }}>×</button>
                      </span>
                    ))}
                  </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Bottom toolbar: background image picker + start combat */}
        <div style={{
          padding: '4px var(--space-2)', borderTop: '1px solid var(--sb-separator)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0,
          fontSize: 'var(--font-size-xs)',
        }}>
          <BackgroundImagePicker
            imageId={encounter.backgroundImageId}
            onChange={id => save({ backgroundImageId: id || undefined })}
          />
          <span style={{ flex: 1 }} />
          {encounter.creatures.length > 0 && (
            <button onClick={startCombat}
              title="Start combat with this encounter"
              style={{
                padding: '3px 12px',
                background: 'var(--color-bg-active)',
                color: 'var(--color-text-primary)',
                borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
              }}>
              Start Combat ▶
            </button>
          )}
        </div>
      </div>{/* end encounter card */}

      {/* Bottom of left column: creature search OR template search */}
      {templateModeKey ? (() => {
        const targetEc = encounter.creatures.find(c => ecMatches(c, templateModeKey))
        const targetCurrent = targetEc ? resolveCurrentSb(targetEc) : null
        const appliedNames = targetEc?.monsterTemplates ?? []
        return (
          <TemplatePanel
            targetSb={targetCurrent?.sb ?? null}
            appliedNames={appliedNames}
            previewTemplateName={previewTemplateName}
            onSelect={setPreviewTemplateName}
            onActivate={commitTemplate}
            onShowInfo={setTemplateInfoPopup}
            onExit={exitTemplateMode}
          />
        )
      })() : (
        <CompendiumPanel comp={comp} onActivate={addCreature} onSelect={selectPreview}
          selectedId={previewId} maxCreatureXP={targetXP} />
      )}
      </div>{/* end left column */}

      {/* ─── Right column: preview ─── */}
      <div ref={previewRef} className="stat-block-4e" style={{ flex: '1 1 320px', minWidth: 280, overflow: 'auto', minHeight: 0, fontSize: 12 }}>
        {(() => {
          // Template mode: live merged preview of the target row + (optional) hovered template
          if (templateModeKey) {
            const targetEc = encounter.creatures.find(c => ecMatches(c, templateModeKey))
            const targetCurrent = targetEc ? resolveCurrentSb(targetEc) : null
            if (!targetCurrent) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: 'var(--space-4)', textAlign: 'center' }}>
                  Loading creature data…
                </div>
              )
            }
            let mergedSb = targetCurrent.sb
            const previewTemplate = previewTemplateName
              ? MONSTER_TEMPLATES.find(t => t.name === previewTemplateName) ?? null
              : null
            if (previewTemplate) {
              const previewIndex = (targetEc?.monsterTemplates?.length ?? 0)
              mergedSb = applyMonsterTemplate(mergedSb, previewTemplate, previewIndex)
            }
            const synthetic: Creature = {
              id: 'preview', name: targetCurrent.name,
              hp: (mergedSb.hp as number) ?? 0, maxHp: (mergedSb.hp as number) ?? 0,
              statBlock: mergedSb, createdAt: '', updatedAt: '',
            }
            const chips: TemplateChip[] = []
            ;(targetEc?.monsterTemplates ?? []).forEach((name, slot) => {
              chips.push({ name, slot })
            })
            if (previewTemplate) {
              chips.push({ name: previewTemplate.name, slot: chips.length, preview: true })
            }
            return <Dnd4eCreatureViewer creature={synthetic} tooltip={tooltip}
              templateChips={chips}
              onTemplateChipClick={(name) => {
                const t = MONSTER_TEMPLATES.find(t => t.name === name)
                if (t) setTemplateInfoPopup(t)
              }} />
          }
          // Selected encounter row: show its current merged stat block (no template overlay)
          if (selectedRowKey) {
            const targetEc = encounter.creatures.find(c => ecMatches(c, selectedRowKey))
            const targetCurrent = targetEc ? resolveCurrentSb(targetEc) : null
            if (targetCurrent) {
              const synthetic: Creature = {
                id: 'selected', name: targetCurrent.name,
                hp: (targetCurrent.sb.hp as number) ?? 0, maxHp: (targetCurrent.sb.hp as number) ?? 0,
                statBlock: targetCurrent.sb, createdAt: '', updatedAt: '',
              }
              const chips: TemplateChip[] = (targetEc?.monsterTemplates ?? []).map((name, slot) => ({ name, slot }))
              return <Dnd4eCreatureViewer creature={synthetic} tooltip={tooltip}
                templateChips={chips.length > 0 ? chips : undefined}
                onTemplateChipClick={(name) => {
                  const t = MONSTER_TEMPLATES.find(t => t.name === name)
                  if (t) setTemplateInfoPopup(t)
                }} />
            }
          }
          if (previewCreature) {
            return (
              <Dnd4eCreatureViewer creature={previewCreature} tooltip={tooltip}
                imageId={previewId ? annotations[previewId]?.imageId : undefined} />
            )
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: 'var(--space-4)', textAlign: 'center' }}>
              Click a creature in the search or encounter list to preview.<br/>Double-click in search to add. Press Delete on a selected encounter row to remove.
            </div>
          )
        })()}
      </div>

      {/* Floating popup: a template's own stat block */}
      {templateInfoPopup && (
        <DraggableTemplateWindow template={templateInfoPopup} onClose={() => setTemplateInfoPopup(null)} />
      )}
    </div>
  )
}

// ─── Helpers ───

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ─── Draggable Template Window ───

function DraggableTemplateWindow({ template, onClose }: { template: MonsterTemplate; onClose: () => void }) {
  const [pos, setPos] = useState({ x: window.innerWidth - 460, y: 80 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  return (
    <div style={{
      position: 'fixed',
      left: pos.x, top: pos.y,
      zIndex: 1000,
      width: 420, maxHeight: '85vh', overflow: 'hidden',
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div onMouseDown={onMouseDown}
        style={{
          padding: '4px 8px',
          background: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border)',
          cursor: dragging ? 'grabbing' : 'grab',
          fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          userSelect: 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        <span>📄 Template — {template.name}</span>
        <button onClick={onClose} title="Close"
          style={{
            background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
            cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
          }}>×</button>
      </div>
      <div style={{ overflow: 'auto', padding: 'var(--space-2)' }}>
        <TemplateViewer template={template} />
      </div>
    </div>
  )
}

// ─── Template Panel (replaces compendium panel during template-mode) ───

function TemplatePanel({ targetSb, appliedNames, previewTemplateName, onSelect, onActivate, onShowInfo, onExit }: {
  targetSb: Record<string, unknown> | null
  appliedNames: string[]
  previewTemplateName: string | null
  onSelect: (name: string | null) => void
  onActivate: (name: string) => void
  onShowInfo: (template: MonsterTemplate) => void
  onExit: () => void
}) {
  const [search, setSearch] = useState('')
  const [eligibleOnly, setEligibleOnly] = useState(true)
  const [roleFilter, setRoleFilter] = useState<string[]>([])

  const allRoles = useMemo(
    () => [...new Set(MONSTER_TEMPLATES.map(t => t.role))].sort(),
    []
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return MONSTER_TEMPLATES.filter(t => {
      if (appliedNames.includes(t.name)) return false
      if (q && !t.name.toLowerCase().includes(q) && !t.role.toLowerCase().includes(q) && !t.prerequisite.toLowerCase().includes(q)) return false
      if (roleFilter.length > 0 && !roleFilter.includes(t.role)) return false
      if (eligibleOnly && targetSb && !meetsPrerequisite(targetSb, t)) return false
      return true
    })
  }, [search, eligibleOnly, roleFilter, targetSb, appliedNames])

  const total = MONSTER_TEMPLATES.length - appliedNames.length

  const GRID_COLS = '1fr 50px 70px 1fr'
  const xs = { fontSize: 'var(--font-size-xs)' }

  return (
    <div className="stat-block-4e" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12 }}>
      {/* Header */}
      <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0, gap: 6 }}>
        <button onClick={onExit} className="ghost"
          title="Back to creature search"
          style={{ color: 'inherit', font: 'inherit' }}>← creatures</button>
        <input className="ghost sb-name" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates..."
          style={{ color: 'inherit', flex: 1, minWidth: 0 }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <MultiSelectDropdown className="ghost"
            options={allRoles}
            selected={roleFilter}
            onChange={setRoleFilter}
            placeholder="role" />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11 }}
            title="Show only templates whose prerequisites are met">
            <input type="checkbox" checked={eligibleOnly} onChange={e => setEligibleOnly(e.target.checked)}
              style={{ cursor: 'pointer' }} />
            eligible
          </label>
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: GRID_COLS,
        gap: 'var(--space-2)', padding: '2px var(--space-2)',
        borderBottom: '1px solid var(--sb-separator, var(--color-border))',
        flexShrink: 0, color: 'var(--color-text-muted)', fontWeight: 600, ...xs, userSelect: 'none',
      }}>
        <span>Name</span>
        <span>Source</span>
        <span>Role</span>
        <span>Prerequisite</span>
      </div>

      {/* List */}
      <VirtualizedList items={filtered} renderRow={(t) => {
        const isSelected = previewTemplateName === t.name
        return (
          <div
            onClick={() => onSelect(isSelected ? null : t.name)}
            onDoubleClick={() => onActivate(t.name)}
            title="Click to preview, double-click to apply"
            style={{
              display: 'grid', gridTemplateColumns: GRID_COLS, height: '100%',
              gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
              borderBottom: '1px solid var(--color-border-subtle, rgba(128,128,128,0.1))',
              background: isSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : 'transparent',
              cursor: 'pointer', userSelect: 'none', ...xs,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
              {t.name}
              {t.leader && <span title="Leader" style={{ color: 'var(--color-accent)', marginLeft: 3 }}>L</span>}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{t.source}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{t.role}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{t.prerequisite}</span>
          </div>
        )
      }} />

      {/* Status */}
      <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2)', flexShrink: 0, fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>{filtered.length.toLocaleString()} of {total.toLocaleString()}</span>
        {previewTemplateName && (
          <button onClick={() => onShowInfo(MONSTER_TEMPLATES.find(t => t.name === previewTemplateName)!)}
            className="ghost" style={{ color: 'inherit', font: 'inherit' }}>
            view base template
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Compendium Panel (right side) ───

function CompendiumPanel({ comp, onActivate, onSelect, selectedId, maxCreatureXP }: {
  comp: ReturnType<typeof useCompendium>
  onActivate: (monsterId: string) => void
  onSelect: (monsterId: string) => void
  selectedId: string | null
  maxCreatureXP?: number
}) {
  const { filters, filtered: allFiltered, filterOptions, updateFilter, resetFilters, hasActiveFilters, searchRef, totalCount, loading, filtering } = comp

  const filtered = useMemo(() => {
    if (maxCreatureXP == null) return allFiltered
    return allFiltered.filter(c => xpForCreature(c.level, c.modifier) <= maxCreatureXP)
  }, [allFiltered, maxCreatureXP])

  return (
    <div className="stat-block-4e" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12 }}>
      {/* Search header */}
      <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0 }}>
        <input className="ghost sb-name" ref={searchRef} value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          placeholder="Search..."
          style={{ color: 'inherit', width: 'auto', fieldSizing: 'content' as any }} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <span>Level <input className="ghost" value={filters.level}
            onChange={e => updateFilter('level', e.target.value.replace(/-/g, '–'))}
            placeholder="1–30" style={{ width: 40, color: 'inherit', textAlign: 'center' }} /></span>
          <select className="ghost" value={filters.modifier} onChange={e => updateFilter('modifier', e.target.value)}
            style={{ color: 'inherit' }}>
            <option value="">modifier</option>
            <option value="standard">standard</option>
            <option value="elite">elite</option>
            <option value="solo">solo</option>
          </select>
          <MultiSelectDropdown className="ghost"
            options={filterOptions.roles}
            selected={filters.role}
            onChange={(roles) => updateFilter('role', roles)}
            placeholder="role" />
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
        <CreatureCompendiumList items={filtered} onSelect={onSelect} onActivate={onActivate} selectedId={selectedId} />
      )}

      {/* Status */}
      <div style={{ color: 'var(--color-text-muted)', padding: 'var(--space-2)', flexShrink: 0, opacity: filtering ? 0.5 : 1, fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span>{loading ? '\u00A0' : `${filtered.length.toLocaleString()} of ${totalCount.toLocaleString()}`}</span>
        <button onClick={resetFilters} disabled={!hasActiveFilters}
          title={hasActiveFilters ? 'Clear all filters' : 'No filters active'}
          style={{
            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: hasActiveFilters ? 'var(--color-bg-active)' : 'transparent',
            color: hasActiveFilters ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            cursor: hasActiveFilters ? 'pointer' : 'default',
            opacity: hasActiveFilters ? 1 : 0.4,
            fontSize: 'var(--font-size-xs)', fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>
          ✕ Clear filters
        </button>
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

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={handleUpload}
        title={imageId
          ? `Player-screen background set${imageUrl ? ' — click to replace' : ''}`
          : 'Set a background image for the player display'}
        style={{
          padding: '3px 12px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          background: imageId ? 'var(--color-bg-active)' : 'transparent',
          color: imageId ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          fontWeight: 600, fontSize: 'var(--font-size-xs)',
          cursor: 'pointer', lineHeight: 1.2,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        🖼 {imageId ? 'Background' : 'Add background'}
      </button>
      {imageUrl && (
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <img src={imageUrl} alt=""
            title="Player-screen background preview"
            style={{ width: 28, height: 18, objectFit: 'cover', borderRadius: 2, border: '1px solid var(--color-border)', display: 'block' }} />
        </span>
      )}
      {imageId && (
        <button onClick={() => onChange(undefined)}
          title="Clear background image"
          style={{
            background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
            cursor: 'pointer', fontSize: 'var(--font-size-xs)', padding: 0, lineHeight: 1,
          }}>×</button>
      )}
    </span>
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
