import type { Comment, Draft, Finding } from './types'

/** Content fields shown on each stat block row; comments and findings on any of them gather at that row. */
export const STAT_ANCHOR_PATHS: Record<string, string[]> = {
  header: ['name', 'level', 'role', 'rank', 'leader', 'size', 'origin', 'type', 'keywords', 'xp'],
  senses: ['initiative', 'perception', 'senses'],
  speed: ['speed'],
  saves: ['savingThrowBonus', 'actionPoints'],
  hp: ['hp'],
  defenses: ['defenses'],
  resistances: ['immune', 'resist', 'vulnerable', 'regeneration'],
  skills: ['skills', 'skillNotes'],
  abilities: ['abilities'],
  alignment: ['alignment'],
  languages: ['languages'],
  equipment: ['equipment'],
  description: ['description'],
  // Items
  'item-header': ['name', 'level', 'rarity'],
  'item-type': ['category', 'slot', 'subtype', 'itemType', 'levels'],
  'item-text': ['flavor', 'description'],
  'item-stats': ['weapon', 'armor', 'weight', 'ritual', 'alchemical'],
  'item-critical': ['critical'],
  'item-properties': ['properties', 'propertyLevelSteps'],
  'item-special': ['special', 'requirement'],
  // Traps
  'trap-header': ['name', 'level', 'role', 'rank', 'xp', 'kind', 'usage'],
  'trap-text': ['flavor', 'description'],
  'trap-detect': ['detect'],
  'trap-stats': ['initiative', 'speed', 'hp', 'hpText', 'defenses'],
  'trap-damage': ['immune', 'resist'],
  'trap-trigger': ['trigger'],
  // Diseases
  'disease-header': ['name', 'level'],
  'disease-text': ['flavor'],
  'disease-check': ['endurance', 'check'],
  'disease-attack': ['attack'],
  // Templates
  'template-header': ['name', 'kind', 'role', 'rankChange', 'leader', 'prerequisite'],
  'template-text': ['description'],
  'template-stats': ['keyword', 'senses', 'defenses', 'immune', 'resist', 'vulnerable', 'hpPerLevel', 'hpNote', 'regeneration', 'savingThrows', 'actionPoints'],
  // Themes
  'theme-header': ['name'],
  'theme-text': ['description'],
  'theme-mods': ['originChange', 'skills'],
  // Skill challenges
  'challenge-header': ['name', 'level', 'complexity'],
  'challenge-setup': ['setup', 'flavor', 'primarySkills', 'secondarySkills'],
  'challenge-success': ['success'],
  'challenge-failure': ['failure'],
  'challenge-special': ['special'],
}
const STAT_LABELS: Record<string, string> = {
  header: 'Name and role', senses: 'Initiative and senses', saves: 'Saves and action points', hp: 'Hit points', resistances: 'Immunities and resistances',
  'item-header': 'Name, level, and rarity', 'item-type': 'Category, slot, and price', 'item-text': 'Description', 'item-stats': 'Item statistics', 'item-critical': 'Enhancement and critical', 'item-properties': 'Properties', 'item-special': 'Special and requirement',
  'trap-header': 'Name and role', 'trap-text': 'Description', 'trap-detect': 'Detection', 'trap-stats': 'Initiative, HP, and defenses', 'trap-damage': 'Immunities and resistances', 'trap-trigger': 'Trigger',
  'disease-header': 'Name and level', 'disease-text': 'Description', 'disease-check': 'Endurance check', 'disease-attack': 'Attack',
  'template-header': 'Name, role, and prerequisite', 'template-text': 'Description', 'template-stats': 'Template adjustments',
  'theme-header': 'Name', 'theme-text': 'Description', 'theme-mods': 'Origin and skills',
  'challenge-header': 'Name, level, and complexity', 'challenge-setup': 'Setup and skills', 'challenge-success': 'Success', 'challenge-failure': 'Failure', 'challenge-special': 'Special',
}
const GROUPS: Record<string, string> = { trait: 'traits', aura: 'auras', action: 'powers', countermeasure: 'countermeasures', stage: 'stages', property: 'properties' }

export interface AnchorTarget { target: string; label: string; paths: string[] }

export function statAnchorTarget(key: string): AnchorTarget {
  const paths = (STAT_ANCHOR_PATHS[key] ?? [key]).map(p => `/content/${p}`)
  return { target: paths[0], label: STAT_LABELS[key] ?? key[0].toUpperCase() + key.slice(1), paths }
}

/** A stat block entry carries `_draftNode`; entries not yet applied to the draft have no anchor. */
export function entryAnchorTarget(d: Draft, entry: { entryType?: string; name?: string; label?: string; _draftNode?: string }): AnchorTarget | undefined {
  const group = GROUPS[entry.entryType ?? 'action']
  if (!entry._draftNode || !d.nodes[group]?.includes(entry._draftNode)) return undefined
  const target = `/content/${group}/@${entry._draftNode}`
  return { target, label: entry.name || entry.label || 'Unnamed entry', paths: [target] }
}

export const within = (target: string, paths: string[]) => paths.some(p => target === p || target.startsWith(p + '/'))

/** Every anchor a stat block can show; new comments must fall within one of them. */
export function allAnchorPaths(d: Draft): string[] {
  // Creature rows have bare keys; other kinds' sections are prefixed with their kind ("trap-detect").
  const prefix = d.kind === 'monster' ? '' : d.kind + '-'
  const keys = Object.keys(STAT_ANCHOR_PATHS).filter(k => prefix ? k.startsWith(prefix) : !k.includes('-'))
  return [
    ...keys.flatMap(k => STAT_ANCHOR_PATHS[k]).map(p => `/content/${p}`),
    ...Object.values(GROUPS).flatMap(g => (d.nodes[g] ?? []).map(id => `/content/${g}/@${id}`)),
  ]
}
export function unanchored<T extends Comment | Finding>(d: Draft, items: T[]): T[] {
  const paths = allAnchorPaths(d)
  return items.filter(i => !within(i.target, paths))
}

const FIELD_LABELS: Record<string, string> = { hp: 'HP', xp: 'XP', ac: 'AC', savingThrowBonus: 'Saving throws', actionPoints: 'Action points', skillNotes: 'Skill notes', description: 'Notes', immune: 'Immunities', resist: 'Resistances', vulnerable: 'Vulnerabilities' }

/** A readable name for a semantic path: "Wrench Shadow › hit › text", "Removed powers entry". */
export function targetLabel(d: Draft, target: string) {
  if (['/', '/content', '/content/'].includes(target)) return 'Whole draft'
  const parts = target.replace(/^\/content\//, '').split('/')
  return parts.map((part, i) => {
    const group = parts[i - 1]
    if (part.startsWith('@') && d.nodes[group]) {
      const index = d.nodes[group].indexOf(part.slice(1))
      return index < 0 ? `Removed ${group} entry` : (d.content as any)[group][index]?.name ?? `${group} ${index + 1}`
    }
    return FIELD_LABELS[part] ?? (i === 0 && part ? part[0].toUpperCase() + part.slice(1) : part)
  }).filter((_, i) => !(d.nodes[parts[i]] && parts[i + 1]?.startsWith('@'))).join(' › ')
}

/** A validator JSON path ("$.traits[0].text.clauses[0]") as a semantic target with a stable node ID. */
export function jsonPathTarget(d: Draft, path: string): string {
  const rest = (s: string) => s.replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/')
  const m = path.match(/^\$\.(\w+)\[(\d+)\](.*)$/)
  const id = m && d.nodes[m[1]]?.[Number(m[2])]
  return id ? `/content/${m![1]}/@${id}${rest(m![3])}` : `/content/${rest(path.replace(/^\$\.?/, ''))}`
}
