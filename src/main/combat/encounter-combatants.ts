// An encounter's creatures as combatants: each row resolved to a kit monster (a campaign creature
// record, a Library one, or the published entry; a clone never stands in for its original) with the row's
// templates, theme, level adjustment, and minion setting applied. Library entries are used live, like
// published ones: an edit to one shows in every campaign's encounters (combat keeps what it started with).

import type { Monster, MonsterTemplate, MonsterTheme, Trap } from '@kit'
import type { CampaignRecord, CombatantState, CompendiumAnnotation, CreatureRecord, Encounter, EncounterCreature, EncounterRowPreview, EncounterTrap, Location, TrapRef } from '@common/types'
import { generateId } from '@common/utils/id'
import { adjustMonster, templateAllowed } from '@common/rules/adjust-monster'
import { challengeXp, isSkillChallenge } from '@common/rules/rewards'
import { getKitEntry, publishedTemplateList, publishedThemeList } from '../compendium/kit'
import { getActiveCampaignId, getEntity, listEntities, loadAnnotations } from '../data/campaign-store'
import { listLibrary } from '../data/library-store'

export interface EncounterSources {
  creatures: CreatureRecord[]
  /** The Library's creatures and traps (referenced by `libraryId`). */
  library?: { creatures: CreatureRecord[]; traps: CampaignRecord<Trap>[] }
  published: (id: string) => Monster | null
  templates: { ref: string; template: MonsterTemplate }[]
  themes: { ref: string; theme: MonsterTheme }[]
  annotations: Record<string, CompendiumAnnotation>
  traps: Trap[]
  publishedTrap: (id: string) => Trap | null
  /** Traps noted on the encounter's location; they join its combat hidden. */
  locationTraps?: TrapRef[]
}

/** By ref ("campaign:<id>", "library:<id>", or a published name), falling back to the name (older encounters). */
function byRef<T extends { ref: string }>(list: T[], ref: string, name: (t: T) => string): T | undefined {
  return list.find(t => t.ref === ref) ?? list.find(t => name(t) === ref)
}

type RowBase = { monster: Monster; entityId?: string; imageId?: string; tokenImageId?: string }

/** The row's creature before adjustments, with the images combat shows for it. */
function rowBase(ec: EncounterCreature, s: EncounterSources): RowBase | null {
  if (ec.creatureId || ec.libraryId) {
    const r = ec.creatureId ? s.creatures.find(x => x.id === ec.creatureId) : s.library?.creatures.find(x => x.id === ec.libraryId)
    return r ? { monster: structuredClone(r.content), entityId: r.id, imageId: r.art?.imageId, tokenImageId: r.art?.tokenImageId } : null
  }
  if (!ec.compendiumId) return null
  const monster = s.published(ec.compendiumId)
  const ann = s.annotations[ec.compendiumId]
  return monster ? { monster, entityId: ec.compendiumId, imageId: ann?.imageId, tokenImageId: ann?.tokenImageId } : null
}

export type RowTheme = { name: string; attackPower: string; utilityPower: string; skillChoice?: number } | null

export type ResolvedRow = EncounterRowPreview

/** One row's adjusted monster; `theme` previews a different theme choice (null: none). */
export function resolveRow(ec: EncounterCreature, s: EncounterSources, theme: RowTheme | undefined = ec.monsterTheme): ResolvedRow | null {
  const base = rowBase(ec, s)
  if (!base) return null
  const templates = (ec.monsterTemplates ?? []).flatMap(ref => byRef(s.templates, ref, t => t.template.name)?.template ?? [])
  const th = theme ? byRef(s.themes, theme.name, t => t.theme.name)?.theme : undefined
  const adjusted = adjustMonster(base.monster, {
    templates, levelAdjust: ec.levelAdjust, minion: ec.isMinion,
    theme: th && theme ? { theme: th, attack: theme.attackPower, utility: theme.utilityPower, skillChoice: theme.skillChoice } : undefined,
  })
  const eligible = s.templates.filter(t => templateAllowed(adjusted.monster, t.template)).map(t => t.ref)
  return { ...base, ...adjusted, baseRank: base.monster.rank, eligible }
}

export function encounterCombatants(encounter: Encounter, s: EncounterSources): CombatantState[] {
  return [...creatureCombatants(encounter, s), ...trapCombatants(encounter, s)]
}

function creatureCombatants(encounter: Encounter, s: EncounterSources): CombatantState[] {
  return encounter.creatures.flatMap(ec => {
    const row = resolveRow(ec, s)
    if (!row) return []
    const hp = ec.isMinion ? 1 : ec.overrideHp ?? row.monster.hp
    const name = ec.overrideName || row.monster.name
    // Creatures from the same row roll initiative as a group.
    const initiativeGroupId = ec.count > 1 ? generateId() : undefined
    return Array.from({ length: ec.count }, () => ({
      id: generateId(), name, baseName: name, isPC: false, hp, maxHp: hp, tempHp: 0,
      kind: 'creature' as const, content: row.monster, attribution: row.attribution,
      imageId: row.imageId, tokenImageId: row.tokenImageId, entityId: row.entityId, initiativeGroupId,
      conditions: [], effects: [], usedPowers: {}, usedActionPoints: 0,
    }))
  })
}

/** A trap row's trap: a campaign record, a Library one, or a published trap. */
export function rowTrap(et: EncounterTrap, s: EncounterSources): Trap | null {
  if (et.trapId) return s.traps.find(t => t.id === et.trapId) ?? null
  if (et.libraryId) return s.library?.traps.find(r => r.id === et.libraryId)?.content ?? null
  return et.compendiumId ? s.publishedTrap(et.compendiumId) : null
}

/** A trap reference's identity, the same in main and the renderer (`trap-refs.tsx`). */
export const trapRefKey = (r: TrapRef) => r.trapId ? `trap:${r.trapId}` : r.libraryId ? `library:${r.libraryId}` : `published:${r.compendiumId}`

/** Traps join hidden from the Player window unless their row says otherwise. HP-less traps have 0 HP; combat reads that from the content. */
/** The encounter's traps plus those noted on its location (once each; the encounter's own row wins). */
export function encounterTrapRows(encounter: Encounter, locationTraps: TrapRef[]): EncounterTrap[] {
  const own = encounter.traps ?? []
  const key = trapRefKey
  return [...own, ...locationTraps.filter(r => !own.some(t => key(t) === key(r))).map(r => ({ ...r, count: 1 }))]
}


/** An encounter's XP: each creature row's adjusted monster's and each of its traps' (its own and its location's), times the row's count, and its skill challenge's. */
export function encounterXp(encounter: Encounter, s: EncounterSources): number {
  let xp = 0
  for (const ec of encounter.creatures) xp += (resolveRow(ec, s)?.monster.xp ?? 0) * ec.count
  // A skill challenge standing on its own is no fight: its location's traps don't join it.
  for (const et of encounterTrapRows(encounter, isSkillChallenge(encounter) ? [] : s.locationTraps ?? [])) xp += (rowTrap(et, s)?.xp ?? 0) * et.count
  if (encounter.challenge) xp += challengeXp(encounter.challenge)
  return xp
}
function trapCombatants(encounter: Encounter, s: EncounterSources): CombatantState[] {
  return encounterTrapRows(encounter, s.locationTraps ?? []).flatMap(et => {
    const trap = rowTrap(et, s)
    if (!trap) return []
    const name = et.overrideName || trap.name
    const initiativeGroupId = et.count > 1 ? generateId() : undefined
    return Array.from({ length: et.count }, () => ({
      id: generateId(), name, baseName: name, isPC: false, hp: trap.hp ?? 0, maxHp: trap.hp ?? 0, tempHp: 0,
      kind: 'trap' as const, content: trap, hidden: !et.visible, entityId: et.trapId ?? et.libraryId ?? et.compendiumId, initiativeGroupId,
      conditions: [], effects: [], usedPowers: {}, usedActionPoints: 0,
    }))
  })
}

/** The active campaign's creatures, templates, themes, traps, and compendium annotations, the Library's, and the traps on `locationId`. */
export async function campaignSources(locationId?: string): Promise<EncounterSources> {
  const campaignId = getActiveCampaignId()
  const [creatures, templates, themes, annotations, traps, libCreatures, libTemplates, libThemes, libTraps] = await Promise.all([
    listEntities<CreatureRecord>('creature'),
    listEntities<CampaignRecord<MonsterTemplate>>('template'),
    listEntities<CampaignRecord<MonsterTheme>>('theme'),
    campaignId ? loadAnnotations(campaignId) : Promise.resolve({}),
    listEntities<CampaignRecord<Trap>>('trap'),
    listLibrary<Monster>('creature'),
    listLibrary<MonsterTemplate>('template'),
    listLibrary<MonsterTheme>('theme'),
    listLibrary<Trap>('trap'),
  ])
  const location = locationId ? await getEntity<Location>('location', locationId) : null
  return {
    creatures,
    library: { creatures: libCreatures, traps: libTraps },
    published: id => getKitEntry('monster', id) as Monster | null,
    templates: [...publishedTemplateList().map(t => ({ ref: t.name, template: t })), ...templates.map(r => ({ ref: `campaign:${r.id}`, template: r.content })), ...libTemplates.map(r => ({ ref: `library:${r.id}`, template: r.content }))],
    themes: [...publishedThemeList().map(t => ({ ref: t.name, theme: t })), ...themes.map(r => ({ ref: `campaign:${r.id}`, theme: r.content })), ...libThemes.map(r => ({ ref: `library:${r.id}`, theme: r.content }))],
    annotations,
    traps: traps.map(r => r.content),
    publishedTrap: id => getKitEntry('trap', id) as Trap | null,
    locationTraps: location?.traps ?? [],
  }
}
