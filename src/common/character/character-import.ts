// Character files to kit CharacterSnapshots: final numbers only, never build choices.
//
// .dnd4e (Character Builder save): the <CharacterSheet> section carries the builder's computed stats "for
// applications without access to the rules engine". We read those numbers as printed.
// .4ecb (4ecb backup): 4ecb embeds evaluated snapshots in a top-level `snapshots` array.

import { ABILITIES, SKILLS, CHARACTER_SNAPSHOT_VERSION, type Ability, type CharacterSnapshot, type Skill } from '@kit'
import { child, parseXml, type XmlElement } from '../utils/xml'
import type { PlayerCharacter } from '../types/player-character'

const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength', con: 'Constitution', dex: 'Dexterity', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
}

/** Class features (Character Builder names) that grant a defender mark, to the class-marks ids. */
const MARK_FEATURES: [RegExp, string][] = [
  [/^Combat Challenge\b/, 'combat-challenge'],
  [/^Divine Challenge\b/, 'divine-challenge'],
  [/^(Swordmage Aegis|Aegis of \w+)\b/, 'aegis-of-assault'],
  [/^Nature's Wrath\b/, 'natures-wrath'],
  [/^Battlemind's Demand\b/, 'battlemind-demand'],
  [/^Hunter's Quarry\b/, 'hunter-quarry'],
  [/^Warlock's Curse\b/, 'warlock-curse'],
  [/^Oath of Enmity\b/, 'oath-of-enmity'],
  [/^Assassin's Shroud\b/, 'assassins-shroud'],
]

export type CharacterFileKind = 'dnd4e' | '4ecb'

export function characterFileKind(fileName: string, text: string): CharacterFileKind | undefined {
  if (/\.dnd4e$/i.test(fileName) || /^﻿?\s*<\?xml|^﻿?\s*<D20Character/.test(text)) return 'dnd4e'
  if (/\.4ecb$/i.test(fileName) || /^\s*\{/.test(text)) return '4ecb'
  return undefined
}

/** Every character in a file, as snapshots. Throws with a readable message when the file has none. */
export function readCharacterFile(fileName: string, text: string, now = new Date().toISOString()): CharacterSnapshot[] {
  const kind = characterFileKind(fileName, text)
  if (kind === 'dnd4e') return [snapshotFromDnd4e(text, now)]
  if (kind === '4ecb') return snapshotsFrom4ecb(text)
  throw new Error('Not a .dnd4e or .4ecb character file')
}

export function snapshotsFrom4ecb(text: string): CharacterSnapshot[] {
  let data: any
  try { data = JSON.parse(text) } catch { throw new Error('Not a .4ecb file (invalid JSON)') }
  if (data?.format !== '4ecb-character-backup') throw new Error('Not a 4ecb character backup')
  const snapshots: unknown[] = Array.isArray(data.snapshots) ? data.snapshots : []
  const valid = snapshots.filter(isSnapshot)
  if (valid.length === 0) {
    throw new Error('This .4ecb file has no evaluated character stats. Export it again from a 4ecb version that includes them.')
  }
  return valid
}

function isSnapshot(s: any): s is CharacterSnapshot {
  return s?.version === CHARACTER_SNAPSHOT_VERSION && typeof s.sourceId === 'string' && typeof s.name === 'string'
    && typeof s.level === 'number' && typeof s.hp?.max === 'number' && typeof s.defenses?.ac === 'number'
}

const num = (s: string | undefined) => {
  const n = parseInt(String(s ?? '').trim(), 10)
  return Number.isFinite(n) ? n : undefined
}
const text = (el: XmlElement | undefined) => el?.text.trim() || undefined

export function snapshotFromDnd4e(xml: string, now = new Date().toISOString()): CharacterSnapshot {
  const doc = parseXml(xml)
  const sheet = child(doc, 'CharacterSheet')
  if (doc.name !== 'D20Character' || !sheet) throw new Error('Not a Character Builder save (no <CharacterSheet>)')
  const details = child(sheet, 'Details')

  // Stats by alias, lowercased: the first stat to claim an alias wins.
  const stats = new Map<string, number>()
  for (const st of child(sheet, 'StatBlock')?.children ?? []) {
    if (st.name !== 'Stat') continue
    const value = num(st.attrs.value)
    if (value === undefined) continue
    for (const a of st.children) {
      const key = a.name === 'alias' ? a.attrs.name?.toLowerCase() : undefined
      if (key && !stats.has(key)) stats.set(key, value)
    }
  }
  const stat = (name: string) => stats.get(name.toLowerCase())
  const need = (name: string) => {
    const v = stat(name)
    if (v === undefined) throw new Error(`Character Builder save is missing the "${name}" stat`)
    return v
  }

  // Race, class, and so on: the rules elements the character has.
  const tally = (child(sheet, 'RulesElementTally')?.children ?? []).filter(e => e.name === 'RulesElement')
  const named = (type: string) => tally.filter(e => e.attrs.type === type).map(e => e.attrs.name)
  let className = named('Class')[0] ?? ''
  const hybrids = named('Hybrid Class').map(n => n.replace(/^Hybrid\s+/, ''))
  if (className === 'Hybrid' && hybrids.length) className = `Hybrid ${hybrids.join('/')}`
  const features = tally.filter(e => e.attrs.type === 'Class Feature' || e.attrs.type === 'CountsAsFeature').map(e => e.attrs.name)
  const markType = MARK_FEATURES.find(([re]) => features.some(f => re.test(f)))?.[1]

  const level = num(text(child(details, 'Level'))) ?? need('Level')
  const halfLevel = stat('HALF-LEVEL') ?? Math.floor(level / 2)
  const maxHp = need('Hit Points')

  const abilities = {} as CharacterSnapshot['abilities']
  for (const ab of ABILITIES) {
    const name = ABILITY_NAMES[ab]
    // The builder's "<Ability> modifier" is the bare modifier; the sheet prints it with half level added.
    abilities[ab] = { score: need(name), modifier: need(`${name} modifier`) + halfLevel }
  }
  const skills = {} as CharacterSnapshot['skills']
  for (const sk of SKILLS) {
    const name = sk[0].toUpperCase() + sk.slice(1)
    skills[sk as Skill] = { total: need(name), trained: (stat(`${name} Trained`) ?? 0) > 0 }
  }

  const resist: CharacterSnapshot['resist'] = []
  for (const [alias, value] of stats) {
    const m = alias.match(/^resist:([a-z]+)$/)
    if (m && value > 0) resist.push({ type: m[1], value })
  }

  const items: CharacterSnapshot['items'] = []
  for (const loot of child(sheet, 'LootTally')?.children ?? []) {
    if (loot.name !== 'loot' || !(num(loot.attrs.count)! > 0)) continue
    const parts = loot.children.filter(e => e.name === 'RulesElement')
    // A magic weapon or armor is its base item plus the enchantment; the enchantment names it.
    const name = (parts.find(e => e.attrs.type === 'Magic Item') ?? parts[0])?.attrs.name
    if (name) items.push({ name, equipped: (num(loot.attrs['equip-count']) ?? 0) > 0 })
  }

  const name = text(child(details, 'name')) ?? 'Unnamed character'
  return {
    version: CHARACTER_SNAPSHOT_VERSION,
    // The save has no stable id; the name is the best match for re-imports (an explicit "update" picks the PC).
    sourceId: `character-builder:${name.toLowerCase().replace(/\s+/g, ' ')}`,
    source: { app: 'character-builder', ...(doc.attrs.Version ? { appVersion: doc.attrs.Version } : {}), exportedAt: now },
    name,
    ...(text(child(details, 'Player')) ? { player: text(child(details, 'Player')) } : {}),
    level,
    race: named('Race')[0] ?? '',
    class: className,
    ...(named('Paragon Path')[0] ? { paragonPath: named('Paragon Path')[0] } : {}),
    ...(named('Epic Destiny')[0] ? { epicDestiny: named('Epic Destiny')[0] } : {}),
    ...(markType ? { markType } : {}),
    hp: {
      max: maxHp,
      // Bloodied value is half maximum HP (Rules Compendium p. 256); surge value is a quarter, rounded down
      // (p. 258), plus the builder's "Healing Surge Value" bonus (Belt of Vigor, PHB p. 253).
      bloodied: Math.floor(maxHp / 2),
      surgeValue: Math.floor(maxHp / 4) + (stat('Healing Surge Value') ?? 0),
      surgesPerDay: need('Healing Surges'),
    },
    defenses: { ac: need('AC'), fortitude: need('Fortitude Defense'), reflex: need('Reflex Defense'), will: need('Will Defense') },
    initiative: need('Initiative'),
    speed: need('Speed'),
    passivePerception: need('Passive Perception'),
    passiveInsight: need('Passive Insight'),
    abilities,
    skills,
    savingThrowBonus: stat('Saving Throws') ?? 0,
    resist,
    // The builder's base action points; adventurers start with 1 (Rules Compendium p. 235).
    actionPoints: stat('_BaseActionPoints') ?? 1,
    powers: [],
    items,
  }
}

export interface ImportedFile { name: string; text: string }
export interface ImportResult { created: string[]; updated: string[]; errors: string[] }

/**
 * Snapshots onto the campaign's PCs. With `targetId`, the file's one character updates that PC; otherwise a PC
 * whose sheet has the same sourceId is updated, or a new PC is made. Names, player names, and a mark the DM set stay.
 */
export function applySnapshots(
  pcs: PlayerCharacter[], files: ImportedFile[], opts: { targetId?: string; now?: string; newId: () => string },
): { save: PlayerCharacter[]; result: ImportResult } {
  const now = opts.now ?? new Date().toISOString()
  const result: ImportResult = { created: [], updated: [], errors: [] }
  const byId = new Map(pcs.map(pc => [pc.id, pc]))
  const save = new Map<string, PlayerCharacter>()
  for (const file of files) {
    let snapshots: CharacterSnapshot[]
    try { snapshots = readCharacterFile(file.name, file.text, now) } catch (e) {
      result.errors.push(`${file.name}: ${(e as Error).message}`)
      continue
    }
    if (opts.targetId && snapshots.length !== 1) {
      result.errors.push(`${file.name}: has ${snapshots.length} characters; import it from the page header instead`)
      continue
    }
    for (const sheet of snapshots) {
      const current = [...save.values(), ...byId.values()]
      const existing = opts.targetId ? byId.get(opts.targetId) : current.find(pc => pc.sheet?.sourceId === sheet.sourceId)
      const pc: PlayerCharacter = existing
        ? { ...(save.get(existing.id) ?? existing) }
        : { id: opts.newId(), name: sheet.name, playerName: sheet.player ?? '', createdAt: now, updatedAt: now }
      pc.name ||= sheet.name
      pc.playerName ||= sheet.player ?? ''
      if (!pc.markType && sheet.markType) pc.markType = sheet.markType
      pc.sheet = sheet
      pc.sheetFile = file.name
      pc.updatedAt = now
      save.set(pc.id, pc)
      ;(existing ? result.updated : result.created).push(pc.name)
    }
  }
  return { save: [...save.values()], result }
}
