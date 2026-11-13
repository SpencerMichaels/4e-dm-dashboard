import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { Encounter, Creature, CompendiumEntry, EncounterCreature } from '@common/types'
import { GhostNumberInput } from '@renderer/components/shared/GhostNumberInput'
import { MultiSelectDropdown } from '@renderer/components/shared/MultiSelectDropdown'
import { useImage } from '@renderer/hooks/use-image'
import { useHotkeys } from '@renderer/hooks/use-hotkeys'
import { useCompendium } from '../compendium/use-compendium'
import { useGlossary } from '../compendium/use-glossary'
import { XP_BY_LEVEL, xpForCreature, encounterBudget, encounterLevel, encounterDifficulty, ENCOUNTER_TEMPLATES, type EncounterTemplate } from '../creature/dnd4e-utils'
import { MONSTER_TEMPLATES, meetsPrerequisite, applyMonsterTemplate, type MonsterTemplate } from '../creature/monster-templates'
import { MONSTER_THEMES, applyMonsterTheme, parseSkillModifications, type MonsterTheme, type ThemePower } from '../creature/monster-themes'
import { CompendiumSearchPanel } from '../compendium/CompendiumSearchPanel'
import { Dnd4eCreatureViewer, type TemplateChip } from '../creature/Dnd4eCreatureViewer'
import { TemplateViewer } from '../compendium/Dnd4eTemplateBrowser'
import { VirtualizedList } from '../shared/VirtualizedList'
import { FloatingPanel } from '@renderer/components/shared/FloatingPanel'
import { useUiStore } from '@renderer/stores/ui-store'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { generateId } from '@common/utils/id'
import { capitalize } from '@common/utils/format'
import '../creature/statblock.css'


/** Get a unique key for an encounter creature entry */
function ecKey(ec: EncounterCreature): string {
  return ec.creatureId ?? ec.compendiumId ?? ''
}

/** Adjust the flat modifier in a damage expression by `delta`.
 *  "2d6+3" +1 → "2d6+4"; "2d6" +1 → "2d6+1"; "3" +1 → "4" */
function adjustDamageExpr(expr: string, delta: number): string {
  if (!expr || !delta) return expr
  // Match trailing +N or -N
  const m = expr.match(/^(.+?)([+-]\d+)$/)
  if (m) {
    const newMod = parseInt(m[2]) + delta
    if (newMod === 0) return m[1]
    return `${m[1]}${newMod >= 0 ? '+' : ''}${newMod}`
  }
  // Pure number (flat damage)
  const flat = parseInt(expr)
  if (!isNaN(flat) && String(flat) === expr.trim()) return String(flat + delta)
  // Has dice but no modifier — append one
  if (/\d+d\d+/.test(expr)) return `${expr}${delta >= 0 ? '+' : ''}${delta}`
  return expr
}

/** Apply DMG p.174 level adjustment (±1 to ±5) to a stat block.
 *  Per level: ±1 attack, ±1 defenses, ±HP (role-based), ±1 damage per 2 levels. */
function applyLevelAdjustment(sb: Record<string, unknown>, delta: number): Record<string, unknown> {
  if (!delta) return sb
  sb = { ...sb }
  const role = (sb.role as string) ?? ''
  const source = `Level ${delta > 0 ? '+' : ''}${delta}`
  const diffs = [...(sb._templateDiffs as any[] ?? [])]

  // Level
  const oldLevel = (sb.level as number) ?? 1
  sb.level = oldLevel + delta

  // AC
  const oldAc = (sb.ac as number) ?? 0
  sb.ac = oldAc + delta
  diffs.push({ field: 'ac', before: oldAc, after: sb.ac, source, sourceIndex: -2 })

  // Defenses
  const oldDefs = (sb.defenses as Record<string, number>) ?? {}
  const newDefs = { ...oldDefs }
  for (const key of ['fortitude', 'reflex', 'will']) {
    if (newDefs[key] != null) {
      const before = newDefs[key]
      newDefs[key] = before + delta
      diffs.push({ field: `defenses.${key}`, before, after: newDefs[key], source, sourceIndex: -2 })
    }
  }
  sb.defenses = newDefs

  // HP
  const hpPerLevel: Record<string, number> = {
    brute: 10, skirmisher: 8, soldier: 8, controller: 8, lurker: 6, artillery: 6
  }
  const perLevel = hpPerLevel[role] ?? 8
  const oldHp = (sb.hp as number) ?? 1
  sb.hp = Math.max(1, oldHp + delta * perLevel)
  diffs.push({ field: 'hp', before: oldHp, after: sb.hp, source, sourceIndex: -2 })

  // Attack bonuses + damage on powers
  const damageDelta = Math.sign(delta) * Math.floor(Math.abs(delta) / 2)
  sb.actions = (sb.actions as any[] ?? []).map((a: any) => {
    const patched = { ...a }
    const hasAttackAdj = patched.attackBonus != null
    const hasDamageAdj = damageDelta !== 0 && (Array.isArray(patched.damage) && patched.damage.length > 0 || (patched.hit && /^\d+d\d+/.test(patched.hit)))
    if (hasAttackAdj) patched.attackBonus += delta
    if (damageDelta !== 0 && Array.isArray(patched.damage)) {
      patched.damage = patched.damage.map((d: any) => ({ ...d, expr: adjustDamageExpr(d.expr, damageDelta) }))
    }
    // Also adjust damage in hit text if it contains a simple "Xd6+N" at the start
    if (damageDelta !== 0 && patched.hit && /^\d+d\d+/.test(patched.hit)) {
      patched.hit = adjustDamageExpr(patched.hit.split(/\s/)[0], damageDelta) + patched.hit.substring(patched.hit.indexOf(' '))
    }
    // Store adjustment metadata for display attribution
    if (hasAttackAdj || hasDamageAdj) {
      patched._levelAdjust = { attackDelta: hasAttackAdj ? delta : 0, damageDelta: hasDamageAdj ? damageDelta : 0, source }
    }
    return patched
  })

  sb._templateDiffs = diffs
  return sb
}

/** Apply templates + solo upgrade + theme + level adjustment to a base statBlock.
 *  Shared by the preview resolver and the combat start handler so the logic is
 *  in one place. Returns a new statBlock — does not mutate the input. */
function applyEncounterOverrides(
  baseSb: Record<string, unknown>,
  ec: EncounterCreature,
  themeOverride?: { name: string; attackPower: string; utilityPower: string; skillChoice?: number } | null,
): Record<string, unknown> {
  let sb = { ...baseSb }
  const tNames = ec.monsterTemplates ?? []
  tNames.forEach((tName, i) => {
    const t = MONSTER_TEMPLATES.find(t => t.name === tName)
    if (t) sb = applyMonsterTemplate(sb, t, i)
  })
  if (tNames.length >= 2) {
    sb = { ...sb, monsterModifier: 'solo', savingThrowBonus: 5 }
  }
  const effectiveTheme = themeOverride !== undefined ? themeOverride : ec.monsterTheme
  if (effectiveTheme) {
    const theme = MONSTER_THEMES.find(t => t.name === effectiveTheme.name)
    if (theme) sb = applyMonsterTheme(sb, theme, effectiveTheme.attackPower, effectiveTheme.utilityPower, effectiveTheme.skillChoice)
  }
  if (ec.levelAdjust) {
    sb = applyLevelAdjustment(sb, ec.levelAdjust)
  }
  if (ec.isMinion) {
    sb = { ...sb, hp: 1, isMinion: true }
  }
  return sb
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
      const baseLevel = (sb.level as number) ?? 1
      return { name: ec.overrideName || creature.name, level: baseLevel + (ec.levelAdjust ?? 0), role: (sb.role as string) ?? '', modifier: (sb.monsterModifier as string) ?? '', imageId: creature.imageId, statBlock: sb }
    }
    if (ec.compendiumId && comp.index) {
      const entry = comp.index.find(e => e.id === ec.compendiumId)
      if (!entry) return null
      return { name: ec.overrideName || entry.name, level: entry.level + (ec.levelAdjust ?? 0), role: entry.role, modifier: entry.modifier, statBlock: compStatBlocks[ec.compendiumId] }
    }
    return null
  }, [creatures, comp.index, compStatBlocks])

  // Calculate total XP: 1 template = elite (2×), 2 templates = solo (5×), minion = standard / 4
  const totalXP = useMemo(() => {
    let xp = 0
    for (const ec of encounter.creatures) {
      const info = resolveInfo(ec)
      if (!info) continue
      if (ec.isMinion || info.statBlock?.isMinion) {
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
      // Auto-detect minions: check the name AND the statBlock isMinion field
      const autoMinion = /\bminion\b/i.test(entryName) || !!(campaignCreature?.statBlock?.isMinion) || !!(compStatBlocks[entryId]?.isMinion)
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
      const creature = await window.api.compendium.get(entryId)
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
      const creature = await window.api.compendium.get(id)
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

  // Resolve the live (post-applied-templates) statBlock + name for an encounter row.
  // Optional themeOverride replaces ec.monsterTheme for live preview purposes.
  const resolveCurrentSb = useCallback((ec: EncounterCreature, themeOverride?: { name: string; attackPower: string; utilityPower: string; skillChoice?: number } | null): { name: string; sb: Record<string, unknown> } | null => {
    let baseSb: Record<string, unknown> | undefined
    let name = ''
    if (ec.creatureId) {
      const c = creatures.find(x => x.id === ec.creatureId)
      if (!c) return null
      baseSb = { ...c.statBlock }
      // Imported creatures store HP on the wrapper, not in statBlock
      if (baseSb.hp == null) baseSb.hp = c.maxHp ?? c.hp
      name = ec.overrideName || c.name
    } else if (ec.compendiumId) {
      baseSb = compStatBlocks[ec.compendiumId]
      const entry = comp.index?.find(e => e.id === ec.compendiumId)
      name = ec.overrideName || (entry?.name ?? '')
      if (!baseSb) return null
    } else return null
    const sb = applyEncounterOverrides(baseSb, ec, themeOverride)
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
    await window.api.combat.init(encounter.id)

    // First pass: build all combatant entries with base names
    const pending: { baseName: string; hp: number; maxHp: number; sb: any; imageId?: string; tokenImageId?: string; entityId?: string; initiativeGroupId?: string }[] = []
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
          creature = await window.api.compendium.resolve(ec.compendiumId)
          // Apply annotation image/token if present
          const ann = annotations[ec.compendiumId]
          if (creature && ann) {
            if (ann.imageId) creature.imageId = ann.imageId
            if (ann.tokenImageId) creature.tokenImageId = ann.tokenImageId
          }
        }
      }
      if (!creature) continue

      // Ensure statBlock.hp is set before applying overrides (imported creatures store HP on creature, not statBlock)
      const baseSb = { ...creature.statBlock }
      if (baseSb.hp == null) baseSb.hp = creature.maxHp ?? creature.hp
      const sb = applyEncounterOverrides(baseSb, ec)
      const combatHp = ec.isMinion ? 1 : (ec.overrideHp ?? (sb.hp as number) ?? creature.maxHp)
      const baseName = ec.overrideName || creature.name

      // Creatures from the same encounter row share a groupId for initiative grouping
      const groupId = ec.count > 1 ? generateId() : undefined
      for (let i = 0; i < ec.count; i++) {
        pending.push({ baseName, hp: combatHp, maxHp: combatHp, sb, imageId: creature.imageId, tokenImageId: creature.tokenImageId, entityId: creature.id, initiativeGroupId: groupId })
      }
    }

    // Add each creature — no letter suffixes; the DM assigns colors/numbers
    // during initiative entry to distinguish duplicates.
    for (const p of pending) {
      await window.api.combat.addCombatant({
        id: generateId(),
        name: p.baseName, baseName: p.baseName,
        isPC: false, hp: p.hp, maxHp: p.maxHp,
        statBlock: p.sb,
        imageId: p.imageId, tokenImageId: p.tokenImageId, entityId: p.entityId,
        initiativeGroupId: p.initiativeGroupId,
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
        <div className="striped-rows" style={{ borderTop: encounter.creatures.length === 0 ? '1px solid var(--sb-separator)' : 'none', flex: 1, overflowX: 'hidden', overflowY: 'auto', minHeight: 0 }}>
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
              // Template prerequisites — use statBlock if available (campaign creature), else skip
              const sb = info.statBlock
              const modifierLevels = ['', 'standard', 'elite', 'solo']
              const baseIdx = baseModifier === 'solo' ? 3 : baseModifier === 'elite' ? 2 : 1
              const effectiveIdx = Math.min(baseIdx + templateCount, 3)
              const effectiveModifier = modifierLevels[effectiveIdx] === 'standard' ? '' : modifierLevels[effectiveIdx]
              const isMinion = !!ec.isMinion || !!sb?.isMinion
              const creatureXP = isMinion
                ? Math.round(xpForCreature(level, '') / 4)
                : xpForCreature(level, effectiveModifier)
              const modLbl = isMinion
                ? ' (M)'
                : effectiveModifier === 'elite' ? ' (E)' : effectiveModifier === 'solo' ? ' (S)' : ''
              const levelDelta = partyLevel != null ? Math.abs(level - partyLevel) : 0
              const outOfRange = partyLevel != null && levelDelta > 4
              const appliedNames = ec.monsterTemplates ?? []
              const availableTemplates = sb ? MONSTER_TEMPLATES.filter(t => meetsPrerequisite(sb, t) && !appliedNames.includes(t.name)) : []
              const maxTemplates = baseModifier === 'solo' ? 0 : baseModifier === 'elite' ? 1 : 2
              const canAddTemplate = !isMinion && templateCount < maxTemplates && availableTemplates.length > 0
              const hasTemplates = appliedNames.length > 0
              // Minion toggle is incompatible with elite/solo (base or via templates)
              const nativeMinion = !!(sb?.isMinion)
              const canBeMinion = !nativeMinion && baseModifier !== 'elite' && baseModifier !== 'solo' && templateCount === 0

              const inTemplateMode = templateModeKey === key
              const templateBtnDisabled = isMinion || !sb || templateCount >= maxTemplates || availableTemplates.length === 0

              const handleNavigate = () => {
                if (ec.creatureId) onNavigate(ec.creatureId)
                // Compendium creatures — no navigation (could open preview in future)
              }

              const isRowSelected = selectedRowKey === key
              const ENC_ROW_COLS = 'minmax(0, 1fr) 40px 60px 46px 28px 46px auto'
              const xsStyle = { fontSize: 'var(--font-size-xs)' }
              const mutedCell: React.CSSProperties = { ...xsStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }
              return (
                <div key={key}
                  onClick={() => selectRow(key)}
                  style={{
                    background: isRowSelected ? 'var(--color-bg-active, rgba(92,124,250,0.15))' : undefined,
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
                      {outOfRange && <span title={`${levelDelta} levels from party — DMG recommends ±4`} style={{ color: 'var(--color-danger)', marginRight: 2 }}>⚠</span>}
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
                          style={{ width: '100%', ...xsStyle, padding: '0 2px', border: '1px solid var(--color-border)', borderRadius: 2, background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
                        />
                      ) : (
                        <span title="Double-click to rename" style={{ color: ec.overrideName ? '#0d9488' : undefined }}>
                          {info.name}
                        </span>
                      )}
                    </span>
                    <span style={{ ...mutedCell, display: 'inline-flex', alignItems: 'center', gap: 1 }}
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => setLevelAdjust(key, Math.max(-5, (ec.levelAdjust ?? 0) - 1))}
                        disabled={(ec.levelAdjust ?? 0) <= -5}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 8, color: 'var(--color-text-muted)', lineHeight: 1, opacity: (ec.levelAdjust ?? 0) <= -5 ? 0.3 : 1 }}>
                        ▼</button>
                      <span title={ec.levelAdjust ? `Base level ${level - (ec.levelAdjust ?? 0)}, adjusted ${ec.levelAdjust > 0 ? '+' : ''}${ec.levelAdjust}` : undefined}
                        style={{ color: ec.levelAdjust ? '#c47a1a' : undefined, fontWeight: ec.levelAdjust ? 600 : undefined, minWidth: 14, textAlign: 'center' }}>
                        {level}
                      </span>
                      <button onClick={() => setLevelAdjust(key, Math.min(5, (ec.levelAdjust ?? 0) + 1))}
                        disabled={(ec.levelAdjust ?? 0) >= 5}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 8, color: 'var(--color-text-muted)', lineHeight: 1, opacity: (ec.levelAdjust ?? 0) >= 5 ? 0.3 : 1 }}>
                        ▲</button>
                    </span>
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
                      <button
                        onClick={() => {
                          if (themePickerKey === key) { setThemePickerKey(null); setPendingTheme(null) }
                          else { setThemePickerKey(key); setPendingTheme(null); setSelectedRowKey(key) }
                        }}
                        title={ec.monsterTheme ? `Theme: ${ec.monsterTheme.name} (click to change)` : 'Add a theme'}
                        style={{
                          padding: '0 5px', borderRadius: 'var(--radius-sm)',
                          ...xsStyle, fontWeight: 600,
                          cursor: 'pointer',
                          background: themePickerKey === key ? '#0d9488' : ec.monsterTheme ? '#0d948840' : 'var(--color-bg-hover)',
                          color: themePickerKey === key ? 'var(--color-text-on-dark)' : ec.monsterTheme ? '#0d9488' : 'var(--color-text-muted)',
                          border: '1px solid var(--color-border)', lineHeight: 1.2,
                        }}
                      >Th</button>
                      <button onClick={() => removeCreature(key)}
                        title="Remove from encounter"
                        style={{ color: 'var(--color-text-muted)', padding: '0 4px', lineHeight: 1, cursor: 'pointer', background: 'transparent', border: 'none' }}>×</button>
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
                        background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
                      }}>
                        {tName}
                        <button onClick={() => removeMonsterTemplate(key, ti)}
                          style={{ color: 'var(--color-text-muted)', padding: 0, lineHeight: 1, cursor: 'pointer', fontSize: '0.9em', background: 'transparent', border: 'none' }}>×</button>
                      </span>
                    ))}
                    {ec.monsterTheme && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        padding: '0 5px', borderRadius: 'var(--radius-sm)',
                        background: '#0d948830', color: '#0d9488',
                      }}>
                        {ec.monsterTheme.name}
                        <button onClick={() => setTheme(key, undefined)}
                          style={{ color: '#0d9488', padding: 0, lineHeight: 1, cursor: 'pointer', fontSize: '0.9em', background: 'transparent', border: 'none' }}>×</button>
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
        <CompendiumSearchPanel comp={comp} onActivate={addCreature} onSelect={selectPreview}
          selectedId={previewId} maxCreatureXP={targetXP} tooltip={tooltip} />
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
            // When the theme picker is open for this row, use pendingTheme for live preview
            const themeOverride = themePickerKey === selectedRowKey ? pendingTheme : undefined
            const targetCurrent = targetEc ? resolveCurrentSb(targetEc, themeOverride) : null
            if (targetCurrent) {
              const isCustom = !!targetEc?.creatureId
              const entityKey = targetEc?.creatureId ?? targetEc?.compendiumId
              const customCreature = isCustom ? creatures.find(c => c.id === targetEc?.creatureId) : undefined
              const synthetic: Creature = {
                id: 'selected', name: targetCurrent.name,
                hp: (targetCurrent.sb.hp as number) ?? 0, maxHp: (targetCurrent.sb.hp as number) ?? 0,
                statBlock: targetCurrent.sb, createdAt: '', updatedAt: '',
                imageId: customCreature?.imageId,
                tokenImageId: customCreature?.tokenImageId,
                tokenCrop: (customCreature as any)?.tokenCrop,
              }
              const chips: TemplateChip[] = (targetEc?.monsterTemplates ?? []).map((name, slot) => ({ name, slot }))
              return <Dnd4eCreatureViewer creature={synthetic} tooltip={tooltip}
                compendiumId={targetEc?.compendiumId}
                templateChips={chips.length > 0 ? chips : undefined}
                onTemplateChipClick={(name) => {
                  const t = MONSTER_TEMPLATES.find(t => t.name === name)
                  if (t) setTemplateInfoPopup(t)
                }}
                onPopout={() => {
                  if (!poppedOut.some(p => p.id === synthetic.id))
                    setPoppedOut(prev => [...prev, { id: synthetic.id, creature: synthetic }])
                }}
                onImageChange={isCustom
                  ? async (imageId) => {
                      const c = creatures.find(x => x.id === targetEc?.creatureId)
                      if (c) await window.api.entity.save('creature', { ...c, imageId, updatedAt: new Date().toISOString() })
                    }
                  : entityKey ? async (imageId) => {
                      await window.api.annotation.save(entityKey, { ...(annotations[entityKey] ?? {}), imageId })
                    } : undefined
                }
                onTokenChange={isCustom
                  ? async (tokenImageId, crop) => {
                      const c = creatures.find(x => x.id === targetEc?.creatureId)
                      if (c) await window.api.entity.save('creature', { ...c, tokenImageId, tokenCrop: crop, updatedAt: new Date().toISOString() })
                    }
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
                      const updated = { ...previewCreature, imageId, updatedAt: new Date().toISOString() }
                      setPreviewCreature(updated)
                      await window.api.entity.save('creature', updated)
                    }
                  : previewId ? async (imageId) => {
                      const existing = annotations[previewId] ?? {}
                      await window.api.annotation.save(previewId, { ...existing, imageId })
                    } : undefined
                }
                onTokenChange={previewIsCustom
                  ? async (tokenImageId, crop) => {
                      const updated = { ...previewCreature, tokenImageId, tokenCrop: crop, updatedAt: new Date().toISOString() }
                      setPreviewCreature(updated)
                      await window.api.entity.save('creature', updated)
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

      {/* Popped-out stat block floating panels */}
      {poppedOut.map((p, i) => (
        <FloatingPanel
          key={p.id}
          title={`📑 ${p.creature.name}`}
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
      <div style={{ position: 'relative', display: 'flex', height: 22, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
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

  const theme = MONSTER_THEMES.find(t => t.name === selectedThemeName)
  const attackPowers = theme?.powers.filter(p => p.category === 'attack') ?? []
  const utilityPowers = theme?.powers.filter(p => p.category === 'utility') ?? []
  const parsedSkills = theme?.skillModifications ? parseSkillModifications(theme.skillModifications) : null
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
      background: 'var(--color-bg-surface)',
      borderTop: '1px solid #0d948844',
      fontSize: 'var(--font-size-xs)',
    }}
      onClick={e => e.stopPropagation()}
    >
      {/* Theme selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{ color: '#0d9488', fontWeight: 600 }}>Theme:</span>
        <select
          value={selectedThemeName}
          onChange={e => handleThemeChange(e.target.value)}
          style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}
        >
          <option value="">— Select a theme —</option>
          {MONSTER_THEMES.map(t => (
            <option key={t.name} value={t.name}>{t.name} ({t.source})</option>
          ))}
        </select>
        {currentTheme && (
          <button onClick={onRemove} title="Remove theme"
            style={{ color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}>
            Remove
          </button>
        )}
        <button onClick={onClose}
          style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ✕
        </button>
      </div>

      {theme && (
        <>
          {theme.originChange && (
            <div style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)', fontStyle: 'italic' }}>
              {theme.originChange}
            </div>
          )}

          {/* Skill modifications — with choice UI when there are alternatives */}
          {parsedSkills && (parsedSkills.always.length > 0 || parsedSkills.choices) && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                Skills: {parsedSkills.always.length > 0 && (
                  <span>{parsedSkills.always.map(s => `${capitalize(s)} +${parsedSkills.bonus}`).join(', ')}</span>
                )}
              </div>
              {hasSkillChoice && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontWeight: 600, color: '#0d9488', marginBottom: 2 }}>Choose skill bonus:</div>
                  {parsedSkills.choices!.map((group, gi) => (
                    <label key={gi} style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                      padding: '1px 4px', cursor: 'pointer',
                      background: skillChoice === gi ? '#0d948820' : 'transparent',
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
            <div style={{ fontWeight: 600, color: '#0d9488', marginBottom: 2 }}>Choose one attack power:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {attackPowers.map(p => (
                <label key={p.name} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                  padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                  background: selectedAttack === p.name ? '#0d948820' : 'transparent',
                  cursor: 'pointer',
                }}>
                  <input type="radio" name="attack" checked={selectedAttack === p.name}
                    onChange={() => setSelectedAttack(p.name)}
                    style={{ marginTop: 2 }} />
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    {p.action && <span style={{ color: 'var(--color-text-muted)' }}> ({p.action})</span>}
                    <div style={{ color: 'var(--color-text-muted)', lineHeight: 1.3, marginTop: 1 }}>
                      {powerSummary(p)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Utility power selection */}
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <div style={{ fontWeight: 600, color: '#0d9488', marginBottom: 2 }}>Choose one utility power:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {utilityPowers.map(p => (
                <label key={p.name} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
                  padding: '2px 4px', borderRadius: 'var(--radius-sm)',
                  background: selectedUtility === p.name ? '#0d948820' : 'transparent',
                  cursor: 'pointer',
                }}>
                  <input type="radio" name="utility" checked={selectedUtility === p.name}
                    onChange={() => setSelectedUtility(p.name)}
                    style={{ marginTop: 2 }} />
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    {p.action && <span style={{ color: 'var(--color-text-muted)' }}> ({p.action})</span>}
                    <div style={{ color: 'var(--color-text-muted)', lineHeight: 1.3, marginTop: 1 }}>
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
              background: canApply ? '#0d9488' : 'var(--color-bg-hover)',
              color: canApply ? 'var(--color-text-on-dark)' : 'var(--color-text-muted)',
              border: 'none', cursor: canApply ? 'pointer' : 'not-allowed',
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
