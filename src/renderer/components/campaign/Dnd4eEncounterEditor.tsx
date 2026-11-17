import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { Encounter, Creature, CreatureRecord, CompendiumEntry, EncounterCreature, EncounterRowPreview, EncounterTrap, RecordArt } from '@common/types'
import { GhostNumberInput } from '@renderer/components/shared/GhostNumberInput'
import { MultiSelectDropdown } from '@renderer/components/shared/MultiSelectDropdown'
import { useImage } from '@renderer/hooks/use-image'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { useCompendium } from '../compendium/use-compendium'
import { useGlossary } from '../compendium/use-glossary'
import { XP_BY_LEVEL, xpForCreature, encounterBudget, encounterLevel, encounterDifficulty, ENCOUNTER_TEMPLATES, type EncounterTemplate, DIFFICULTY_COLORS, THEME_COLOR, LEVEL_ADJUST_COLOR, templateColor } from '../creature/dnd4e-utils'
import { Icon } from '../shared/Icon'
import { withAlpha } from '../../utils/color'
import type { MonsterTemplate } from '../creature/template-types'
import { parseSkillModifications, type MonsterTheme, type ThemePower } from '../creature/template-types'
import { findByRef, useTemplateCatalog } from '../creature/template-catalog'
import { kitViewCreature } from '../creature/kit-view'
import { EncounterTraps, trapKey, useTrapRows } from './EncounterTraps'
import { TreasureSection } from '../treasure/TreasureSection'
import { EncounterVariants } from './EncounterVariants'
import { useTrap, useTraps } from '../trap/trap-refs'
import { EncounterDiseases } from '../disease/disease-refs'
import { contentText } from '@common/rules/diseases'
import { TrapStatblock } from '../trap/TrapStatblock'
import { CompendiumSearchPanel } from '../compendium/CompendiumSearchPanel'
import { Dnd4eCreatureViewer, type TemplateChip } from '../creature/Dnd4eCreatureViewer'
import { TemplateViewer } from '../creature/TemplateViewer'
import { VirtualizedList } from '../shared/VirtualizedList'
import { FloatingPanel } from '@renderer/components/shared/FloatingPanel'
import { useUiStore } from '@renderer/stores/ui-store'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { useLibraryStore } from '@renderer/stores/library-store'
import { capitalize } from '@common/utils/format'
import { isActivePc, partyLevel as derivePartyLevel } from '@common/rules/party'
import '../creature/statblock.css'


/** Get a unique key for an encounter creature entry */
function ecKey(ec: EncounterCreature): string {
  return ec.creatureId ?? ec.libraryId ?? ec.compendiumId ?? ''
}

/** Check if an encounter creature matches a given key */
function ecMatches(ec: EncounterCreature, key: string): boolean {
  return ec.creatureId === key || ec.libraryId === key || ec.compendiumId === key
}


type RowTheme = { name: string; attackPower: string; utilityPower: string; skillChoice?: number } | null

/** Each row as main resolves it (kit monster plus adjustments), refreshed when the rows or anything they use changes. */
function useRowPreviews(rows: EncounterCreature[], creatures: CreatureRecord[]): Record<string, EncounterRowPreview | null> {
  const [previews, setPreviews] = useState<Record<string, EncounterRowPreview | null>>({})
  const templates = useCampaignStore(s => s.templates)
  const themes = useCampaignStore(s => s.themes)
  const annotations = useCampaignStore(s => s.annotations)
  // Library entries are used live: a change to one refreshes the rows that use it.
  const library = useLibraryStore()
  useEffect(() => {
    let cancelled = false
    Promise.all(rows.map(async ec => [ecKey(ec), await window.api.combat.previewRow(ec) as EncounterRowPreview | null] as const))
      .then(results => { if (!cancelled) setPreviews(Object.fromEntries(results)) })
    return () => { cancelled = true }
  }, [rows, creatures, templates, themes, annotations, library.creatures, library.templates, library.themes])
  return previews
}

/** One row with changes not yet saved (an extra template, a theme being picked); undefined without a row. */
function useRowPreview(row: EncounterCreature | undefined, theme?: RowTheme): EncounterRowPreview | null | undefined {
  const [preview, setPreview] = useState<EncounterRowPreview | null | undefined>(undefined)
  const key = row ? JSON.stringify([row, theme]) : ''
  useEffect(() => {
    setPreview(undefined)
    if (!row) return
    let cancelled = false
    window.api.combat.previewRow(row, theme).then((p: EncounterRowPreview | null) => { if (!cancelled) setPreview(p) })
    return () => { cancelled = true }
  }, [key])
  return preview
}

/** The selected trap row's stat block. */
function TrapPreview({ row }: { row: EncounterTrap | undefined }) {
  const trap = useTrap(row)
  if (!trap) return null
  return <TrapStatblock trap={row?.overrideName ? { ...trap, name: row.overrideName } : trap} />
}

interface Props {
  encounter: Encounter
  onSave: (updated: Encounter) => void
  creatures: CreatureRecord[]
  onNavigate: (creatureId: string) => void
}

export function Dnd4eEncounterEditor({ encounter, onSave, creatures, onNavigate }: Props) {
  const { setView } = useUiStore()
  const comp = useCompendium()
  const catalog = useTemplateCatalog()
  const [template, setTemplate] = useState<EncounterTemplate | null>(null)
  const [targetDelta, setTargetDelta] = useState(0)
  const [adding, setAdding] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewCreature, setPreviewCreature] = useState<Creature | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const { tooltip } = useGlossary()
  // Each row resolved by main: the kit monster with the row's templates, theme, and level adjustment.
  const rowPreviews = useRowPreviews(encounter.creatures, creatures)
  // Popped-out stat block panels
  const [poppedOut, setPoppedOut] = useState<{ id: string; creature: Creature }[]>([])
  // Template-application mode state
  const [templateModeKey, setTemplateModeKey] = useState<string | null>(null)
  const [previewTemplateName, setPreviewTemplateName] = useState<string | null>(null)
  const [templateInfoPopup, setTemplateInfoPopup] = useState<MonsterTemplate | null>(null)
  // Theme-application mode state
  const [themePickerKey, setThemePickerKey] = useState<string | null>(null)
  // Live preview of in-progress theme selections (before "Apply" is clicked)
  const [pendingTheme, setPendingTheme] = useState<{ name: string; attackPower: string; utilityPower: string; skillChoice?: number } | null>(null)
  // Inline rename state
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Encounter row selection (click a row in the encounter list to preview it on the right)
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)
  // The header's variant button opens the form for a level variant
  const [variantFormOpen, setVariantFormOpen] = useState(false)

  // The Library's creatures (shared by every campaign): rows use them by libraryId, live.
  const libraryCreatures = useLibraryStore(s => s.creatures)
  // Party size is the active PCs'; the level is the encounter's own (set when it was made), else the active PCs' most common level.
  const playerCharacters = useCampaignStore(s => s.playerCharacters)
  const partySize = playerCharacters.filter(isActivePc).length
  const currentPartyLevel = derivePartyLevel(playerCharacters)
  // The budget's level: the level the encounter is planned for (its level frame), else the party's level now.
  const partyLevel = encounter.level ?? currentPartyLevel
  const partyReady = partySize > 0 && partyLevel != null && partyLevel > 0

  const save = (patch: Partial<Encounter>) => {
    onSave({ ...encounter, ...patch })
  }


  // Resolve creature info from campaign creatures or compendium index
  const resolveInfo = useCallback((ec: EncounterCreature): { name: string; level: number; role: string; modifier: string; imageId?: string; preview?: EncounterRowPreview | null } | null => {
    if (ec.creatureId || ec.libraryId) {
      const record = ec.creatureId ? creatures.find(c => c.id === ec.creatureId) : libraryCreatures.find(c => c.id === ec.libraryId)
      if (!record) return null
      const m = record.content
      const modifier = m.rank === 'elite' || m.rank === 'solo' ? m.rank : ''
      return { name: ec.overrideName || m.name, level: m.level + (ec.levelAdjust ?? 0), role: m.role ?? '', modifier, imageId: record.art?.imageId, preview: rowPreviews[ecKey(ec)] }
    }
    if (ec.compendiumId && comp.index) {
      const entry = comp.index.find(e => e.id === ec.compendiumId)
      if (!entry) return null
      return { name: ec.overrideName || entry.name, level: entry.level + (ec.levelAdjust ?? 0), role: entry.role, modifier: entry.modifier, preview: rowPreviews[ecKey(ec)] }
    }
    return null
  }, [creatures, libraryCreatures, comp.index, rowPreviews])

  // Traps noted on the encounter's location join its combat too (once; the encounter's own row wins).
  const locations = useCampaignStore(s => s.locations)
  const location = encounter.locationId ? locations.find(l => l.id === encounter.locationId) : undefined
  const locationTraps = useMemo(() => (location?.traps ?? []).filter(r => !(encounter.traps ?? []).some(t => trapKey(t) === trapKey(r))), [location, encounter.traps])
  const allTraps = useMemo<EncounterTrap[]>(() => [...(encounter.traps ?? []), ...locationTraps.map(r => ({ ...r, count: 1 }))], [encounter.traps, locationTraps])
  const trapRows = useTrapRows(allTraps)
  // Where the encounter's diseases come from: its creatures (as adjusted) and its traps.
  const encounterTraps = useTraps(allTraps)
  const diseaseSources = useMemo(() => [
    ...encounter.creatures.flatMap(ec => { const p = rowPreviews[ecKey(ec)]; return p ? [{ from: ec.overrideName || p.monster.name, text: contentText(p.monster) }] : [] }),
    ...encounterTraps.map(t => ({ from: t.name, text: contentText(t) })),
  ], [encounter.creatures, rowPreviews, encounterTraps])
  const [selectedTrapKey, setSelectedTrapKey] = useState<string | null>(null)

  // Calculate total XP: 1 template = elite (2×), 2 templates = solo (5×), minion = standard / 4
  const totalXP = useMemo(() => {
    let xp = 0
    for (const ec of encounter.creatures) {
      const info = resolveInfo(ec)
      if (!info) continue
      // A block printed with no XP (a companion, a set piece) adds none.
      if (info.preview?.monster.xp === 0) continue
      if (ec.isMinion || info.preview?.baseRank === 'minion') {
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
    // Traps count like monsters of their level and rank (their XP is printed).
    for (const et of allTraps) xp += (trapRows.find(r => r.key === trapKey(et))?.xp ?? 0) * et.count
    return xp
  }, [encounter.creatures, allTraps, resolveInfo, trapRows])

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
      // A campaign creature (Custom), a Library one (shared, used live), or a compendium entry
      const campaignCreature = creatures.find(c => c.id === entryId)
      const libraryCreature = campaignCreature ? undefined : libraryCreatures.find(c => c.id === entryId)
      const record = campaignCreature ?? libraryCreature
      const existing = encounter.creatures.find(c => ecMatches(c, entryId))
      // Auto-detect native minions by name suffix
      const entryName = record?.content.name ?? comp.index?.find(e => e.id === entryId)?.name ?? ''
      // Auto-detect minions by name or the custom creature's rank; printed minions are minions by rank anyway
      const autoMinion = /\bminion\b/i.test(entryName) || record?.content.rank === 'minion'
      if (existing) {
        save({
          creatures: encounter.creatures.map(c =>
            ecMatches(c, entryId) ? { ...c, count: c.count + 1 } : c
          ),
        })
      } else if (campaignCreature) {
        // Custom/campaign creature — reference by creatureId
        save({ creatures: [...encounter.creatures, { creatureId: entryId, count: 1, isMinion: autoMinion || undefined }] })
      } else if (libraryCreature) {
        // Library creature — reference by libraryId (live, like a published one)
        save({ creatures: [...encounter.creatures, { libraryId: entryId, count: 1, isMinion: autoMinion || undefined }] })
      } else {
        // Compendium creature — reference by compendiumId (no import!)
        save({ creatures: [...encounter.creatures, { compendiumId: entryId, count: 1, isMinion: autoMinion || undefined }] })
      }
    } finally {
      setAdding(null)
    }
  }, [encounter, adding, creatures, libraryCreatures, comp.index])

  const selectPreview = useCallback(async (entryId: string) => {
    if (entryId === previewId) return
    setPreviewId(entryId)
    setSelectedRowKey(null)
    setSelectedTrapKey(null)
    const record = creatures.find(c => c.id === entryId) ?? libraryCreatures.find(c => c.id === entryId)
    if (record) {
      setPreviewCreature(kitViewCreature(record.content, undefined, { ...record.art }))
    } else {
      const m = await window.api.compendium.kitGet('monster', entryId)
      setPreviewCreature(m ? kitViewCreature(m, undefined, { compendiumId: entryId }) : null)
    }
    previewRef.current?.scrollTo(0, 0)
  }, [previewId, creatures, libraryCreatures])

  // A campaign creature's artwork lives on its record.
  const saveCreatureArt = async (id: string, art: RecordArt) => {
    const record = creatures.find(c => c.id === id)
    if (record) await window.api.entity.save('creature', { ...record, art: { ...record.art, ...art }, updatedAt: new Date().toISOString() })
  }

  // Previews that differ from the saved rows: the template being considered in template mode, and the
  // theme being picked before it is applied.
  const templateTarget = templateModeKey ? encounter.creatures.find(c => ecMatches(c, templateModeKey)) : undefined
  const hoverPreview = useRowPreview(templateTarget && previewTemplateName
    ? { ...templateTarget, monsterTemplates: [...(templateTarget.monsterTemplates ?? []), previewTemplateName] } : undefined)
  const selectedEc = selectedRowKey ? encounter.creatures.find(c => ecMatches(c, selectedRowKey)) : undefined
  const themePreview = useRowPreview(selectedEc && themePickerKey === selectedRowKey ? selectedEc : undefined, pendingTheme)

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
    setSelectedTrapKey(null)
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

  const setTheme = (key: string, theme: { name: string; attackPower: string; utilityPower: string } | undefined) => {
    save({
      creatures: encounter.creatures.map(c =>
        ecMatches(c, key) ? { ...c, monsterTheme: theme } : c
      ),
    })
  }

  const renameCreature = (key: string, name: string | undefined) => {
    save({
      creatures: encounter.creatures.map(c =>
        ecMatches(c, key) ? { ...c, overrideName: name || undefined } : c
      ),
    })
  }

  const setLevelAdjust = (key: string, delta: number | undefined) => {
    save({
      creatures: encounter.creatures.map(c =>
        ecMatches(c, key) ? { ...c, levelAdjust: delta || undefined } : c
      ),
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
    // Main adds the encounter's creatures as kit monsters with each row's adjustments applied.
    await window.api.combat.init(encounter.id)
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
          <span className="sb-header-actions">
            <button className="sb-icon-btn" onClick={() => setVariantFormOpen(o => !o)} aria-pressed={variantFormOpen} aria-label="New level variant"
              title="Make a variant of this encounter for another party level"><Icon name="layers" /></button>
          </span>
          {actualEL != null && (
            <span style={{ whiteSpace: 'nowrap' }}>Level {actualEL}</span>
          )}
        </div>

        {/* Subheader: party info + XP */}
        <div className="sb-subheader" style={{ gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            {partySize > 0
              ? <>Party of <b>{partySize}</b> at level</>
              : <span style={{ fontStyle: 'italic', opacity: 0.7 }}>No active PCs (mark them on the PCs page); planned for level</span>}
            <input className="ghost header-input encounter-level" type="number" min={1} max={30} value={encounter.level ?? ''} placeholder={currentPartyLevel != null ? String(currentPartyLevel) : '–'}
              onChange={e => { const l = Number(e.target.value); save({ level: Number.isInteger(l) && l >= 1 && l <= 30 ? l : undefined }) }}
              aria-label="Planned for party level" title="The party level this encounter is planned for: its budget and difficulty use it (empty: the party's level now)"
              style={{ width: '3ch', color: 'inherit', fontWeight: 700, textAlign: 'center', fieldSizing: 'fixed' } as React.CSSProperties} />
            {encounter.level != null && currentPartyLevel != null && encounter.level !== currentPartyLevel && (
              <span className="encounter-level-note" title="Difficulty is for the level this encounter is planned for">(the party is level {currentPartyLevel})</span>
            )}
          </span>
          {totalXP > 0 && (
            <span style={{ whiteSpace: 'nowrap' }}>
              {totalXP.toLocaleString()} XP
            </span>
          )}
        </div>

        <EncounterVariants encounter={encounter} frame={partyLevel} partyLevel={currentPartyLevel} formOpen={variantFormOpen}
          onCloseForm={() => setVariantFormOpen(false)} onSave={save} />

        {/* Difficulty bar */}
        {partyReady && difficulty ? (
          <DifficultyBar totalXP={totalXP} partySize={partySize!} partyLevel={partyLevel!}
            difficulty={difficulty} targetXP={targetXP} targetDelta={targetDelta} onSetTarget={setTargetDelta} />
        ) : (
          <div style={{ padding: '8px', color: 'var(--muted)', fontSize: 11, fontStyle: 'italic' }}>
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
            {targetXP != null && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> / {targetXP.toLocaleString()}</span>}
            {' '}XP
          </span>
        </div>

        {/* Template slots */}
        {templateSlotFill && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 8px' }}>
            {templateSlotFill.map((slot, i) => {
              const roleName = slot.role
                ? (slot.altRole ? `${capitalize(slot.role)}/${capitalize(slot.altRole)}` : capitalize(slot.role))
                : (slot.modifier ? capitalize(slot.modifier) : 'Any')
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
                    background: 'var(--hover)',
                    color: done ? 'var(--text)' : 'var(--text)',
                    border: '1px solid var(--border)',
                  }}>
                  {/* Progress fill */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${fraction * 100}%`,
                    background: done ? 'var(--accent)' : withAlpha('var(--accent)', 0.25),
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
            borderBottom: '1px solid var(--sb-separator, var(--border))',
            flexShrink: 0, color: 'var(--muted)', fontWeight: 600,
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
        <div className="striped-rows" style={{ borderTop: encounter.creatures.length === 0 ? '1px solid var(--sb-separator)' : 'none', flex: 1, overflowX: 'hidden', overflowY: 'auto', minHeight: 0 }}>
          {encounter.creatures.length === 0 ? (
            <div className="sb-row" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
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
              const templates = (ec.monsterTemplates ?? []).map(n => findByRef(catalog.templates, n)).filter(Boolean)
              const effectiveRole = templates.length > 0 ? templates[templates.length - 1]!.role : baseRole
              const templateCount = templates.length
              // Template prerequisites are checked by main against the row's adjusted monster.
              const preview = info.preview
              const modifierLevels = ['', 'standard', 'elite', 'solo']
              const baseIdx = baseModifier === 'solo' ? 3 : baseModifier === 'elite' ? 2 : 1
              const effectiveIdx = Math.min(baseIdx + templateCount, 3)
              const effectiveModifier = modifierLevels[effectiveIdx] === 'standard' ? '' : modifierLevels[effectiveIdx]
              const nativeMinion = preview?.baseRank === 'minion'
              const isMinion = !!ec.isMinion || nativeMinion
              const creatureXP = preview?.monster.xp === 0 ? 0 : isMinion
                ? Math.round(xpForCreature(level, '') / 4)
                : xpForCreature(level, effectiveModifier)
              const modLbl = isMinion
                ? ' (M)'
                : effectiveModifier === 'elite' ? ' (E)' : effectiveModifier === 'solo' ? ' (S)' : ''
              const levelDelta = partyLevel != null ? Math.abs(level - partyLevel) : 0
              const outOfRange = partyLevel != null && levelDelta > 4
              const appliedNames = ec.monsterTemplates ?? []
              const availableTemplates = preview ? catalog.templates.filter(t => preview.eligible.includes(t.ref) && !appliedNames.includes(t.ref)) : []
              const maxTemplates = baseModifier === 'solo' ? 0 : baseModifier === 'elite' ? 1 : 2
              const canAddTemplate = !isMinion && templateCount < maxTemplates && availableTemplates.length > 0
              const hasTemplates = appliedNames.length > 0
              // Minion toggle is incompatible with elite/solo (base or via templates)
              const canBeMinion = !nativeMinion && baseModifier !== 'elite' && baseModifier !== 'solo' && templateCount === 0

              const inTemplateMode = templateModeKey === key
              const templateBtnDisabled = isMinion || !preview || templateCount >= maxTemplates || availableTemplates.length === 0

              const handleNavigate = () => {
                if (ec.creatureId || ec.libraryId) onNavigate((ec.creatureId ?? ec.libraryId)!)
                // Compendium creatures — no navigation (could open preview in future)
              }

              const isRowSelected = selectedRowKey === key
              const ENC_ROW_COLS = 'minmax(0, 1fr) 40px 60px 46px 28px 46px auto'
              const xsStyle = { fontSize: 'var(--font-size-xs)' }
              const mutedCell: React.CSSProperties = { ...xsStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }
              return (
                <div key={key}
                  onClick={() => selectRow(key)}
                  style={{
                    background: isRowSelected ? 'var(--active)' : undefined,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <div style={{
                    display: 'grid', gridTemplateColumns: ENC_ROW_COLS,
                    gap: 'var(--space-2)', alignItems: 'center',
                    padding: '4px var(--space-2)',
                    minHeight: 28,
                  }}>
                    <span style={{ ...xsStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isRowSelected ? 600 : 400, minWidth: 0 }}
                      onDoubleClick={(e) => { e.stopPropagation(); setRenamingKey(key); setRenameValue(ec.overrideName || info.name) }}>
                      {outOfRange && <span title={`${levelDelta} levels from party — DMG recommends ±4`} style={{ color: 'var(--danger)', marginRight: 2, display: 'inline-flex', verticalAlign: '-0.125em' }}><Icon name="triangle-exclamation-point" /></span>}
                      {renamingKey === key ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => { renameCreature(key, renameValue); setRenamingKey(null) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { renameCreature(key, renameValue); setRenamingKey(null) }
                            if (e.key === 'Escape') setRenamingKey(null)
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', ...xsStyle, padding: '0 2px', border: '1px solid var(--border)', borderRadius: 2, background: 'var(--background)', color: 'var(--text)' }}
                        />
                      ) : (
                        <span title="Double-click to rename" style={{ color: ec.overrideName ? 'var(--accent)' : undefined }}>
                          {info.name}
                        </span>
                      )}
                    </span>
                    <span style={{ ...mutedCell, display: 'inline-flex', alignItems: 'center', gap: 1 }}
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => setLevelAdjust(key, Math.max(-5, (ec.levelAdjust ?? 0) - 1))}
                        disabled={(ec.levelAdjust ?? 0) <= -5} title="Lower level" aria-label="Lower level"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: 'var(--muted)', lineHeight: 1, opacity: (ec.levelAdjust ?? 0) <= -5 ? 0.3 : 1 }}>
                        <Icon name="chevron-down" size={10} /></button>
                      <span title={ec.levelAdjust ? `Base level ${level - (ec.levelAdjust ?? 0)}, adjusted ${ec.levelAdjust > 0 ? '+' : ''}${ec.levelAdjust}` : undefined}
                        style={{ color: ec.levelAdjust ? LEVEL_ADJUST_COLOR : undefined, fontWeight: ec.levelAdjust ? 600 : undefined, minWidth: 14, textAlign: 'center' }}>
                        {level}
                      </span>
                      <button onClick={() => setLevelAdjust(key, Math.min(5, (ec.levelAdjust ?? 0) + 1))}
                        disabled={(ec.levelAdjust ?? 0) >= 5} title="Raise level" aria-label="Raise level"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: 'var(--muted)', lineHeight: 1, opacity: (ec.levelAdjust ?? 0) >= 5 ? 0.3 : 1 }}>
                        <Icon name="chevron-up" size={10} /></button>
                    </span>
                    <span style={mutedCell}>{effectiveRole}{modLbl}</span>
                    <span style={mutedCell}>{creatureXP.toLocaleString()}</span>
                    <span onClick={e => e.stopPropagation()}>
                      <GhostNumberInput value={ec.count || undefined} min={1}
                        onChange={v => updateCount(key, v ?? 1)}
                        style={{ width: 24, textAlign: 'left', ...xsStyle }} />
                    </span>
                    <span style={{ ...xsStyle, color: 'var(--text-secondary)', fontWeight: 600 }}>
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
                            background: isMinion ? 'var(--accent)' : 'var(--hover)',
                            color: isMinion ? 'var(--on-fill)' : 'var(--muted)',
                            border: '1px solid var(--border)', lineHeight: 1.2,
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
                               !preview ? 'Loading creature data…' : 'No eligible templates')
                            : (inTemplateMode ? 'Exit template mode' : 'Add a functional template')
                        }
                        style={{
                          padding: '0 5px', borderRadius: 'var(--radius-sm)',
                          ...xsStyle, fontWeight: 600,
                          cursor: templateBtnDisabled ? 'not-allowed' : 'pointer',
                          background: inTemplateMode ? 'var(--accent)' : 'var(--hover)',
                          color: inTemplateMode ? 'var(--on-fill)' : 'var(--muted)',
                          border: '1px solid var(--border)',
                          opacity: templateBtnDisabled ? 0.4 : 1, lineHeight: 1.2,
                        }}
                      >T</button>
                      <button
                        onClick={() => {
                          if (themePickerKey === key) { setThemePickerKey(null); setPendingTheme(null) }
                          else { setThemePickerKey(key); setPendingTheme(null); setSelectedRowKey(key) }
                        }}
                        title={ec.monsterTheme ? `Theme: ${findByRef(catalog.themes, ec.monsterTheme.name)?.name ?? ec.monsterTheme.name} (click to change)` : 'Add a theme'}
                        style={{
                          padding: '0 5px', borderRadius: 'var(--radius-sm)',
                          ...xsStyle, fontWeight: 600,
                          cursor: 'pointer',
                          background: themePickerKey === key ? THEME_COLOR : ec.monsterTheme ? withAlpha(THEME_COLOR, 0.25) : 'var(--hover)',
                          color: themePickerKey === key ? 'var(--on-fill)' : ec.monsterTheme ? THEME_COLOR : 'var(--muted)',
                          border: '1px solid var(--border)', lineHeight: 1.2,
                        }}
                      >Th</button>
                      <button onClick={() => removeCreature(key)}
                        title="Remove from encounter" aria-label="Remove from encounter"
                        style={{ color: 'var(--muted)', padding: '0 4px', lineHeight: 1, cursor: 'pointer', background: 'transparent', border: 'none', display: 'inline-flex' }}><Icon name="x" /></button>
                    </span>
                  </div>
                  {/* Template + theme chips */}
                  {(hasTemplates || ec.monsterTheme) && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 var(--space-2) 4px var(--space-4)', flexWrap: 'wrap', ...xsStyle }}
                    onClick={e => e.stopPropagation()}>
                    {appliedNames.map((tName, ti) => (
                      <span key={tName} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '0 5px', borderRadius: 'var(--radius-sm)',
                        background: withAlpha(templateColor(ti), 0.19), color: templateColor(ti),
                      }}>
                        {tName}
                        <button onClick={() => removeMonsterTemplate(key, ti)} title={`Remove ${tName}`} aria-label={`Remove ${tName}`}
                          style={{ color: 'inherit', padding: 0, lineHeight: 1, cursor: 'pointer', fontSize: '0.9em', background: 'transparent', border: 'none', display: 'inline-flex' }}><Icon name="x" /></button>
                      </span>
                    ))}
                    {ec.monsterTheme && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '0 5px', borderRadius: 'var(--radius-sm)',
                        background: withAlpha(THEME_COLOR, 0.19), color: THEME_COLOR,
                      }}>
                        {ec.monsterTheme.name}
                        <button onClick={() => setTheme(key, undefined)} title="Remove theme" aria-label="Remove theme"
                          style={{ color: 'inherit', padding: 0, lineHeight: 1, cursor: 'pointer', fontSize: '0.9em', background: 'transparent', border: 'none', display: 'inline-flex' }}><Icon name="x" /></button>
                      </span>
                    )}
                  </div>
                  )}
                  {/* Theme picker dropdown */}
                  {themePickerKey === key && (
                    <ThemePicker
                      currentTheme={ec.monsterTheme}
                      onApply={(theme) => { setTheme(key, theme); setThemePickerKey(null); setPendingTheme(null) }}
                      onRemove={() => { setTheme(key, undefined); setThemePickerKey(null); setPendingTheme(null) }}
                      onClose={() => { setThemePickerKey(null); setPendingTheme(null) }}
                      onPreview={setPendingTheme}
                    />
                  )}
                </div>
              )
            })
          )}
        </div>

        <EncounterTraps traps={encounter.traps ?? []} onChange={traps => save({ traps: traps.length ? traps : undefined })}
          location={location && locationTraps.length ? { name: location.name, traps: locationTraps } : undefined}
          selectedKey={selectedTrapKey}
          onSelect={key => { setSelectedTrapKey(key); if (key) { setSelectedRowKey(null); setPreviewId(null); setPreviewCreature(null) } }} />
        <EncounterDiseases sources={diseaseSources} />
        <TreasureSection place={{ encounterId: encounter.id }} level={partyLevel} encounterStyle />

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
          <label className="encounter-done" title="The party has overcome this encounter: its XP counts as earned on the Rewards page (ending its combat sets this)" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={!!encounter.done} onChange={e => save({ done: e.target.checked || undefined })} />Done
          </label>
          {(encounter.creatures.length > 0 || allTraps.length > 0) && (
            <button onClick={startCombat}
              title="Start combat with this encounter" className="btn btn-primary"
              style={{ padding: '3px 12px', fontSize: 'var(--font-size-xs)' }}>
              Start Combat <Icon name="play" style={{ verticalAlign: '-0.125em' }} />
            </button>
          )}
        </div>
      </div>{/* end encounter card */}

      {/* Bottom of left column: creature search OR template search */}
      {templateModeKey ? (() => {
        const targetEc = encounter.creatures.find(c => ecMatches(c, templateModeKey))
        const appliedNames = targetEc?.monsterTemplates ?? []
        return (
          <TemplatePanel
            eligible={rowPreviews[templateModeKey]?.eligible ?? null}
            appliedNames={appliedNames}
            previewTemplateName={previewTemplateName}
            onSelect={setPreviewTemplateName}
            onActivate={commitTemplate}
            onShowInfo={setTemplateInfoPopup}
            onExit={exitTemplateMode}
          />
        )
      })() : (
        <CompendiumSearchPanel comp={comp} onActivate={addCreature} onSelect={selectPreview}
          selectedId={previewId} maxCreatureXP={targetXP} tooltip={tooltip} />
      )}
      </div>{/* end left column */}

      {/* ─── Right column: preview ─── */}
      <div ref={previewRef} className="stat-block-4e" style={{ flex: '1 1 320px', minWidth: 280, overflow: 'auto', minHeight: 0, fontSize: 12 }}>
        {selectedTrapKey && !templateModeKey ? <TrapPreview row={allTraps.find(t => trapKey(t) === selectedTrapKey)} /> : null}
        {selectedTrapKey && !templateModeKey ? null : (() => {
          // Template mode: live merged preview of the target row + (optional) hovered template
          if (templateModeKey) {
            const targetEc = templateTarget
            const previewTemplate = previewTemplateName
              ? findByRef(catalog.templates, previewTemplateName) ?? null
              : null
            // The hovered template's preview until it arrives, then the row as saved.
            const current = (previewTemplate ? hoverPreview : undefined) ?? rowPreviews[templateModeKey]
            if (!targetEc || !current) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontStyle: 'italic', padding: 'var(--space-4)', textAlign: 'center' }}>
                  Loading creature data…
                </div>
              )
            }
            const synthetic = kitViewCreature(current.monster, current.attribution, { id: 'preview', name: targetEc.overrideName || current.monster.name })
            const chips: TemplateChip[] = []
            ;(targetEc?.monsterTemplates ?? []).forEach((name, slot) => {
              chips.push({ name: findByRef(catalog.templates, name)?.name ?? name, slot })
            })
            if (previewTemplate) {
              chips.push({ name: previewTemplate.name, slot: chips.length, preview: true })
            }
            return <Dnd4eCreatureViewer creature={synthetic} tooltip={tooltip}
              templateChips={chips}
              onTemplateChipClick={(name) => {
                const t = findByRef(catalog.templates, name)
                if (t) setTemplateInfoPopup(t)
              }} />
          }
          // Selected encounter row: show its current merged stat block (no template overlay)
          if (selectedRowKey) {
            const targetEc = selectedEc
            // While the theme picker is open for this row, preview the theme being picked.
            const targetCurrent = (themePickerKey === selectedRowKey ? themePreview : undefined) ?? rowPreviews[selectedRowKey]
            if (targetEc && targetCurrent) {
              const isCustom = !!targetEc?.creatureId
              // A Library creature's art is edited on its compendium page (it is stored with the Library).
              const isLibrary = !!targetEc?.libraryId
              const entityKey = isLibrary ? undefined : targetEc?.creatureId ?? targetEc?.compendiumId
              const customCreature = isCustom ? creatures.find(c => c.id === targetEc?.creatureId) : isLibrary ? libraryCreatures.find(c => c.id === targetEc?.libraryId) : undefined
              const synthetic = kitViewCreature(targetCurrent.monster, targetCurrent.attribution, {
                id: 'selected', name: targetEc.overrideName || targetCurrent.monster.name,
                ...customCreature?.art,
              })
              const chips: TemplateChip[] = (targetEc?.monsterTemplates ?? []).map((name, slot) => ({ name: findByRef(catalog.templates, name)?.name ?? name, slot }))
              return <Dnd4eCreatureViewer creature={synthetic} tooltip={tooltip}
                compendiumId={targetEc?.compendiumId}
                templateChips={chips.length > 0 ? chips : undefined}
                onTemplateChipClick={(name) => {
                  const t = findByRef(catalog.templates, name)
                  if (t) setTemplateInfoPopup(t)
                }}
                onPopout={() => {
                  if (!poppedOut.some(p => p.id === synthetic.id))
                    setPoppedOut(prev => [...prev, { id: synthetic.id, creature: synthetic }])
                }}
                onImageChange={isCustom
                  ? async (imageId) => { await saveCreatureArt(targetEc!.creatureId!, { imageId }) }
                  : entityKey ? async (imageId) => {
                      await window.api.annotation.save(entityKey, { ...(annotations[entityKey] ?? {}), imageId })
                    } : undefined
                }
                onTokenChange={isCustom
                  ? async (tokenImageId, crop) => { await saveCreatureArt(targetEc!.creatureId!, { tokenImageId, tokenCrop: crop }) }
                  : entityKey ? async (tokenImageId, crop) => {
                      await window.api.annotation.save(entityKey, { ...(annotations[entityKey] ?? {}), tokenImageId, tokenCrop: crop })
                    } : undefined
                }
              />
            }
          }
          if (previewCreature) {
            const previewIsCustom = !!creatures.find(c => c.id === previewId)
            return (
              <Dnd4eCreatureViewer creature={previewCreature} tooltip={tooltip}
                compendiumId={!previewIsCustom ? previewId ?? undefined : undefined}
                onPopout={previewCreature ? () => {
                  const pid = previewId ?? previewCreature.id
                  if (!poppedOut.some(p => p.id === pid))
                    setPoppedOut(prev => [...prev, { id: pid, creature: previewCreature }])
                } : undefined}
                onImageChange={previewIsCustom
                  ? async (imageId) => {
                      setPreviewCreature({ ...previewCreature, imageId })
                      await saveCreatureArt(previewId!, { imageId })
                    }
                  : previewId ? async (imageId) => {
                      const existing = annotations[previewId] ?? {}
                      await window.api.annotation.save(previewId, { ...existing, imageId })
                    } : undefined
                }
                onTokenChange={previewIsCustom
                  ? async (tokenImageId, crop) => {
                      setPreviewCreature({ ...previewCreature, tokenImageId, tokenCrop: crop })
                      await saveCreatureArt(previewId!, { tokenImageId, tokenCrop: crop })
                    }
                  : previewId ? async (tokenImageId, crop) => {
                      const existing = annotations[previewId] ?? {}
                      await window.api.annotation.save(previewId, { ...existing, tokenImageId, tokenCrop: crop })
                    } : undefined
                }
              />
            )
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontStyle: 'italic', padding: 'var(--space-4)', textAlign: 'center' }}>
              Click a creature in the search or encounter list to preview.<br/>Double-click in search to add. Press Delete on a selected encounter row to remove.
            </div>
          )
        })()}
      </div>

      {/* Floating popup: a template's own stat block */}
      {templateInfoPopup && (
        <DraggableTemplateWindow template={templateInfoPopup} onClose={() => setTemplateInfoPopup(null)} />
      )}

      {/* Popped-out stat block floating panels */}
      {poppedOut.map((p, i) => (
        <FloatingPanel
          key={p.id}
          title={<><Icon name="file-text" style={{ verticalAlign: '-0.125em' }} /> {p.creature.name}</>}
          popoutKey={`encounter-statblock:${p.id}`} popoutPlace="statblock" windowTitle={p.creature.name}
          initialX={120 + i * 30}
          initialY={80 + i * 30}
          width={420}
          maxHeight="80vh"
          onClose={() => setPoppedOut(prev => prev.filter(x => x.id !== p.id))}
        >
          <Dnd4eCreatureViewer creature={p.creature} tooltip={tooltip}
            compendiumId={p.creature.compendiumId ?? p.id} />
        </FloatingPanel>
      ))}
    </div>
  )
}

// ─── Draggable Template Window ───

function DraggableTemplateWindow({ template, onClose }: { template: MonsterTemplate; onClose: () => void }) {
  return (
    <FloatingPanel title={`Template — ${template.name}`} initialX={window.innerWidth - 460} initialY={80} width={420} maxHeight="85vh"
      onClose={onClose} popoutKey={`template:${template.name}`} popoutPlace="statblock" windowTitle={`${template.name} (template)`}
      bodyStyle={{ padding: 'var(--space-2)' }}>
      <TemplateViewer template={template} />
    </FloatingPanel>
  )
}

// ─── Template Panel (replaces compendium panel during template-mode) ───

function TemplatePanel({ eligible, appliedNames, previewTemplateName, onSelect, onActivate, onShowInfo, onExit }: {
  /** Refs of the templates the target qualifies for (null while loading). */
  eligible: string[] | null
  appliedNames: string[]
  previewTemplateName: string | null
  onSelect: (name: string | null) => void
  onActivate: (name: string) => void
  onShowInfo: (template: MonsterTemplate) => void
  onExit: () => void
}) {
  const { templates } = useTemplateCatalog()
  const [search, setSearch] = useState('')
  const [eligibleOnly, setEligibleOnly] = useState(true)
  const [roleFilter, setRoleFilter] = useState<string[]>([])

  const allRoles = useMemo(
    () => [...new Set(templates.map(t => t.role))].sort(),
    []
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return templates.filter(t => {
      if (appliedNames.includes(t.ref)) return false
      if (q && !t.name.toLowerCase().includes(q) && !t.role.toLowerCase().includes(q) && !t.prerequisite.toLowerCase().includes(q)) return false
      if (roleFilter.length > 0 && !roleFilter.includes(t.role)) return false
      if (eligibleOnly && eligible && !eligible.includes(t.ref)) return false
      return true
    })
  }, [search, eligibleOnly, roleFilter, eligible, appliedNames])

  const total = templates.length - appliedNames.length

  const GRID_COLS = '1fr 50px 70px 1fr'
  const xs = { fontSize: 'var(--font-size-xs)' }

  return (
    <div className="stat-block-4e" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, fontSize: 12 }}>
      {/* Header */}
      <div className="sb-header" style={{ flexShrink: 0, marginBottom: 0, gap: 6 }}>
        <button onClick={onExit} className="btn btn-sm"
          title="Back to creature search"><Icon name="arrow-left" style={{ verticalAlign: '-0.125em' }} /> creatures</button>
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
        borderBottom: '1px solid var(--sb-separator, var(--border))',
        flexShrink: 0, color: 'var(--muted)', fontWeight: 600, ...xs, userSelect: 'none',
      }}>
        <span>Name</span>
        <span>Source</span>
        <span>Role</span>
        <span>Prerequisite</span>
      </div>

      {/* List */}
      <VirtualizedList items={filtered} renderRow={(t) => {
        const isSelected = previewTemplateName === t.ref
        return (
          <div
            onClick={() => onSelect(isSelected ? null : t.ref)}
            onDoubleClick={() => onActivate(t.ref)}
            title="Click to preview, double-click to apply"
            style={{
              display: 'grid', gridTemplateColumns: GRID_COLS, height: '100%',
              gap: 'var(--space-2)', alignItems: 'center', padding: '0 var(--space-2)',
              background: isSelected ? 'var(--active)' : 'transparent',
              cursor: 'pointer', userSelect: 'none', ...xs,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 600 : 400 }}>
              {t.name}
              {t.leader && <span title="Leader" style={{ color: 'var(--accent)', marginLeft: 3 }}>L</span>}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{t.source}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{t.role}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{t.prerequisite}</span>
          </div>
        )
      }} />

      {/* Status */}
      <div style={{ color: 'var(--muted)', padding: 'var(--space-2)', flexShrink: 0, fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>{filtered.length.toLocaleString()} of {total.toLocaleString()}</span>
        {previewTemplateName && (
          <button onClick={() => onShowInfo(findByRef(templates, previewTemplateName ?? undefined)!)}
            className="btn btn-sm">
            view base template
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Difficulty Bar ───

// Each level cell in the bar: delta from party level, which difficulty zone it belongs to
const LEVEL_CELLS: { delta: number; label: string; color: string }[] = [
  { delta: -4, label: 'Trivial', color: DIFFICULTY_COLORS.Trivial },
  { delta: -3, label: 'Trivial', color: DIFFICULTY_COLORS.Trivial },
  { delta: -2, label: 'Easy', color: DIFFICULTY_COLORS.Easy },
  { delta: -1, label: 'Easy', color: DIFFICULTY_COLORS.Easy },
  { delta: 0, label: 'Standard', color: DIFFICULTY_COLORS.Standard },
  { delta: 1, label: 'Standard', color: DIFFICULTY_COLORS.Standard },
  { delta: 2, label: 'Hard', color: DIFFICULTY_COLORS.Hard },
  { delta: 3, label: 'Hard', color: DIFFICULTY_COLORS.Hard },
  { delta: 4, label: 'Hard', color: DIFFICULTY_COLORS.Hard },
  { delta: 5, label: 'Deadly', color: DIFFICULTY_COLORS.Deadly },
  { delta: 6, label: 'Deadly', color: DIFFICULTY_COLORS.Deadly },
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
          border: '1px solid var(--border)',
          background: imageId ? 'var(--active)' : 'transparent',
          color: imageId ? 'var(--text)' : 'var(--muted)',
          fontWeight: 600, fontSize: 'var(--font-size-xs)',
          cursor: 'pointer', lineHeight: 1.2,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <Icon name="image" /> {imageId ? 'Background' : 'Add background'}
      </button>
      {imageUrl && (
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <img src={imageUrl} alt=""
            title="Player-screen background preview"
            style={{ width: 28, height: 18, objectFit: 'cover', borderRadius: 2, border: '1px solid var(--border)', display: 'block' }} />
        </span>
      )}
      {imageId && (
        <button onClick={() => onChange(undefined)}
          title="Clear background image" aria-label="Clear background image"
          style={{
            background: 'transparent', border: 'none', color: 'var(--muted)',
            cursor: 'pointer', fontSize: 'var(--font-size-xs)', padding: 0, lineHeight: 1, display: 'inline-flex',
          }}><Icon name="x" /></button>
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
      <div style={{ position: 'relative', display: 'flex', height: 22, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {LEVEL_CELLS.map((cell) => {
          const isTarget = cell.delta === targetDelta
          return (
            <div key={cell.delta} onClick={() => onSetTarget(cell.delta)}
              title={`PL${cell.delta >= 0 ? '+' : ''}${cell.delta}`}
              style={{
                flex: 1, background: cell.color, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: withAlpha('var(--on-fill)', 0.8), cursor: 'pointer',
                borderRight: `1px solid ${withAlpha('var(--text)', 0.15)}`,
                outline: isTarget ? '2px solid var(--on-fill)' : 'none',
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
            width: 2, background: 'var(--on-fill)', opacity: 0.8,
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

// ─── Theme Picker ──────────────────────────────────────────────────────────

function ThemePicker({ currentTheme, onApply, onRemove, onClose, onPreview }: {
  currentTheme?: { name: string; attackPower: string; utilityPower: string; skillChoice?: number }
  onApply: (theme: { name: string; attackPower: string; utilityPower: string; skillChoice?: number }) => void
  onRemove: () => void
  onClose: () => void
  onPreview: (preview: { name: string; attackPower: string; utilityPower: string; skillChoice?: number } | null) => void
}) {
  const [selectedThemeName, setSelectedThemeName] = useState<string>(currentTheme?.name ?? '')
  const [selectedAttack, setSelectedAttack] = useState<string>(currentTheme?.attackPower ?? '')
  const [selectedUtility, setSelectedUtility] = useState<string>(currentTheme?.utilityPower ?? '')
  const [skillChoice, setSkillChoice] = useState<number>(currentTheme?.skillChoice ?? 0)

  // Push current selections as live preview whenever they change
  useEffect(() => {
    if (selectedThemeName) {
      onPreview({ name: selectedThemeName, attackPower: selectedAttack, utilityPower: selectedUtility, skillChoice })
    } else {
      onPreview(null)
    }
  }, [selectedThemeName, selectedAttack, selectedUtility, skillChoice])

  const { themes } = useTemplateCatalog()
  const theme = findByRef(themes, selectedThemeName)
  const attackPowers = theme?.powers.filter(p => p.category === 'attack') ?? []
  const utilityPowers = theme?.powers.filter(p => p.category === 'utility') ?? []
  const parsedSkills = theme?.skills ?? (theme?.skillModifications ? parseSkillModifications(theme.skillModifications) : null)
  const hasSkillChoice = !!parsedSkills?.choices && parsedSkills.choices.length > 1

  const canApply = !!theme && !!selectedAttack && !!selectedUtility

  // When theme changes, reset power selections
  const handleThemeChange = (name: string) => {
    setSelectedThemeName(name)
    setSelectedAttack('')
    setSelectedUtility('')
    setSkillChoice(0)
  }

  /** Get summary text for a power — prefer description, fall back to hit, then flavorText */
  const powerSummary = (p: ThemePower): string => {
    const text = p.description || (p as any).hit || p.flavorText || ''
    return text.length > 150 ? text.substring(0, 150) + '…' : text
  }

  return (
    <div style={{
      padding: 'var(--space-2) var(--space-3)',
      background: 'var(--surface-raised)',
      borderTop: `1px solid ${withAlpha(THEME_COLOR, 0.27)}`,
      fontSize: 'var(--font-size-xs)',
    }}
      onClick={e => e.stopPropagation()}
    >
      {/* Theme selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{ color: THEME_COLOR, fontWeight: 600 }}>Theme:</span>
        <select
          value={selectedThemeName}
          onChange={e => handleThemeChange(e.target.value)}
          style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}
        >
          <option value="">— Select a theme —</option>
          {themes.map(t => (
            <option key={t.ref} value={t.ref}>{t.name} ({t.library ? 'Shared' : t.custom ? 'Custom' : t.source})</option>
          ))}
        </select>
        {currentTheme && (
          <button onClick={onRemove} title="Remove theme"
            style={{ color: 'var(--danger)', background: 'none', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: '0 6px', cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}>
            Remove
          </button>
        )}
        <button onClick={onClose} title="Close" aria-label="Close"
          style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
          <Icon name="x" />
        </button>
      </div>

      {theme && (
        <>
          {theme.originChange && (
            <div style={{ color: 'var(--muted)', marginBottom: 'var(--space-1)', fontStyle: 'italic' }}>
              {theme.originChange}
            </div>
          )}

          {/* Skill modifications — with choice UI when there are alternatives */}
          {parsedSkills && (parsedSkills.always.length > 0 || parsedSkills.choices) && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                Skills: {parsedSkills.always.length > 0 && (
                  <span>{parsedSkills.always.map(s => `${capitalize(s)} +${parsedSkills.bonus}`).join(', ')}</span>
                )}
              </div>
              {hasSkillChoice && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontWeight: 600, color: THEME_COLOR, marginBottom: 2 }}>Choose skill bonus:</div>
                  {parsedSkills.choices!.map((group, gi) => (
                    <label key={gi} style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                      padding: '1px 4px', cursor: 'pointer',
                      background: skillChoice === gi ? withAlpha(THEME_COLOR, 0.13) : 'transparent',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      <input type="radio" name="skillChoice" checked={skillChoice === gi}
                        onChange={() => setSkillChoice(gi)} />
                      <span>+{parsedSkills.bonus} to {group.map(s => capitalize(s)).join(', ')}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Attack power selection */}
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <div style={{ fontWeight: 600, color: THEME_COLOR, marginBottom: 2 }}>Choose one attack power:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {attackPowers.map(p => (
                <label key={p.name} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                  padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                  background: selectedAttack === p.name ? withAlpha(THEME_COLOR, 0.13) : 'transparent',
                  cursor: 'pointer',
                }}>
                  <input type="radio" name="attack" checked={selectedAttack === p.name}
                    onChange={() => setSelectedAttack(p.name)}
                    style={{ marginTop: 2 }} />
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    {p.action && <span style={{ color: 'var(--muted)' }}> ({p.action})</span>}
                    <div style={{ color: 'var(--muted)', lineHeight: 1.3, marginTop: 1 }}>
                      {powerSummary(p)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Utility power selection */}
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <div style={{ fontWeight: 600, color: THEME_COLOR, marginBottom: 2 }}>Choose one utility power:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {utilityPowers.map(p => (
                <label key={p.name} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                  padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                  background: selectedUtility === p.name ? withAlpha(THEME_COLOR, 0.13) : 'transparent',
                  cursor: 'pointer',
                }}>
                  <input type="radio" name="utility" checked={selectedUtility === p.name}
                    onChange={() => setSelectedUtility(p.name)}
                    style={{ marginTop: 2 }} />
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    {p.action && <span style={{ color: 'var(--muted)' }}> ({p.action})</span>}
                    <div style={{ color: 'var(--muted)', lineHeight: 1.3, marginTop: 1 }}>
                      {powerSummary(p)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Apply button */}
          <button
            disabled={!canApply}
            onClick={() => canApply && onApply({ name: theme.name, attackPower: selectedAttack, utilityPower: selectedUtility, skillChoice: hasSkillChoice ? skillChoice : undefined })}
            style={{
              padding: '3px 12px', borderRadius: 'var(--radius-sm)',
              background: canApply ? THEME_COLOR : 'var(--hover)',
              color: canApply ? 'var(--on-fill)' : 'var(--muted)',
              border: `1px solid ${canApply ? THEME_COLOR : 'var(--border-strong)'}`, cursor: canApply ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: 'var(--font-size-xs)',
            }}
          >
            Apply Theme
          </button>
        </>
      )}
    </div>
  )
}
