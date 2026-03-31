// PF2e creature importer — fetches from Archives of Nethys Elasticsearch API

import { generateId } from '../../src/common/utils/id'
import type { Creature } from '../../src/common/types'

const ES_URL = 'https://elasticsearch.aonprd.com/aon-test/_search?stats=search'

interface AonCreature {
  name: string
  level: number
  hp: number
  ac: number
  fortitude_save: number
  reflex_save: number
  will_save: number
  perception: number
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
  speed: Record<string, number>
  speed_raw: string
  trait_raw: string[]
  size: string[]
  sense_markdown: string
  skill_mod: Record<string, number>
  resistance: Record<string, number>
  weakness: Record<string, number>
  immunity: string[]
  immunity_markdown: string
  creature_ability: string[]
  spell_markdown: string
  markdown: string
  image?: string[]
  language_markdown?: string
  alignment?: string
  rarity?: string
  source_markdown?: string
  summary?: string
  summary_markdown?: string
  resistance_markdown?: string
}

// Extract creature ID from a URL like https://2e.aonprd.com/Monsters.aspx?ID=84
export function parseAonCreatureId(url: string): string | null {
  const match = url.match(/Monsters\.aspx\?ID=(\d+)/i)
    || url.match(/\/Monsters\.aspx\?ID=(\d+)/i)
    || url.match(/creature-(\d+)/)
  return match ? match[1] : null
}

export async function importPf2eCreature(url: string): Promise<Creature> {
  const creatureId = parseAonCreatureId(url)
  if (!creatureId) throw new Error('Could not parse creature ID from URL: ' + url)

  const esId = `creature-${creatureId}`

  const response = await fetch(ES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'TabletopDashboard/1.0' },
    body: JSON.stringify({
      query: { match: { _id: esId } },
      size: 1,
    }),
  })

  if (!response.ok) throw new Error(`AoN API error: ${response.status}`)

  const data = await response.json()
  const hits = data.hits?.hits
  if (!hits || hits.length === 0) throw new Error('Creature not found: ' + esId)

  const src: AonCreature = hits[0]._source
  return convertToCreature(src)
}

function convertToCreature(src: AonCreature): Creature {
  const now = new Date().toISOString()

  // Parse abilities from markdown
  const actions = parseAbilitiesFromMarkdown(src.markdown)

  // Build speeds
  const speeds: Record<string, number> = {}
  for (const [type, val] of Object.entries(src.speed)) {
    if (type !== 'max' && type !== 'land') speeds[type] = val
  }

  // Build resistances/weaknesses/immunities as structured arrays
  // Detect "all X except Y" pattern from the markdown
  const resistances = parseResistances(src.resistance || {}, src.resistance_markdown || '')
  const weaknesses = Object.entries(src.weakness || {}).map(([type, value]) => ({ type, value: value as number }))
  const immunities = (Array.isArray(src.immunity) ? src.immunity : []).map((type: string) => ({ type }))

  // Languages — clean markdown links
  const languages = cleanMarkdownLinks(src.language_markdown || '')
    .replace(/<%[^%]*%>/g, '').trim()

  // Source — clean markdown links
  const source = cleanMarkdownLinks(src.source_markdown || '').trim()

  // Description/summary
  const description = cleanMarkdownLinks(src.summary_markdown || src.summary || '').trim()

  const creature: Creature = {
    id: generateId(),
    name: src.name,
    hp: src.hp,
    maxHp: src.hp,
    tags: [],
    statBlock: {
      level: src.level,
      ac: src.ac,
      perception: src.perception,
      saves: {
        fort: src.fortitude_save,
        ref: src.reflex_save,
        will: src.will_save,
      },
      abilities: {
        str: src.strength,
        dex: src.dexterity,
        con: src.constitution,
        int: src.intelligence,
        wis: src.wisdom,
        cha: src.charisma,
      },
      size: src.size?.[0] ?? 'Medium',
      speed: src.speed.land ?? 0,
      speeds,
      traits: src.trait_raw || [],
      senses: cleanMarkdownLinks(src.sense_markdown || ''),
      skills: src.skill_mod || {},
      languages,
      alignment: src.alignment || '',
      rarity: src.rarity || 'common',
      source,
      description,
      resistances,
      weaknesses,
      immunities,
      actions,
      spells: src.spell_markdown || '',
    },
    createdAt: now,
    updatedAt: now,
  }

  return creature
}

// Parse the AoN markdown to extract strikes and abilities
function parseAbilitiesFromMarkdown(markdown: string): any[] {
  const actions: any[] = []
  // Normalize line endings
  const md = markdown.replace(/\r\n/g, '\n')

  // Find melee/ranged strikes (spread across multiple lines with \n separators)
  const strikeRegex = /\*\*(Melee|Ranged)\*\*\s*\n\s*<actions string="([^"]*)" \/>\s*\n\s*(.+?)\+(\d+)\s*(.+?)?,\s*\n\s*\*\*Damage\*\*\s*([^\n]+)/g
  let match
  while ((match = strikeRegex.exec(md)) !== null) {
    const [, rangeType, actionStr, name, bonus, traitsRaw, damage] = match
    // Extract traits from parenthesized section like "(Agile, Finesse, reach 10 feet)"
    const traitsStr = traitsRaw?.trim() || ''
    const traitsMatch = traitsStr.match(/\((.+)\)/)
    const keywords = traitsMatch
      ? traitsMatch[1].split(',').map((t: string) => cleanMarkdownLinks(t).trim()).filter(Boolean)
      : []

    actions.push({
      name: name.trim(),
      entryType: 'action',
      actionType: actionStringToType(actionStr),
      usage: '',
      keywords,
      rangeType: rangeType.toLowerCase(),
      rangeValue: '1',
      target: 'One creature',
      attackBonus: parseInt(bonus), attackNotes: '',
      defense: 'AC',
      damage: [],
      hit: cleanMarkdownLinks(damage.trim()),
      miss: '',
      effect: '',
      trigger: '',
      requirement: '',
      sustain: '',
    })
  }

  // Find special abilities with action icons (may be on same line or next)
  const abilityRegex = /\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*\s*<actions string="([^"]*)" \/>/g
  while ((match = abilityRegex.exec(md)) !== null) {
    const [, rawName, actionStr] = match
    const name = cleanMarkdownLinks(rawName.trim())
    // Skip if already captured as a strike
    if (actions.some(a => a.name === name)) continue
    if (name === 'Melee' || name === 'Ranged') continue
    // Skip markdown formatting artifacts
    if (name.includes('Source') || name.length > 40) continue

    // Try to grab the rest of the text until the next ability or section break
    const afterMatch = md.substring(match.index + match[0].length, match.index + match[0].length + 500)
    const descMatch = afterMatch.match(/^[^]*?(?=\n\n\*\*|\n\n<|\n---|\n\n$)/)
    const desc = descMatch ? cleanMarkdownLinks(descMatch[0].replace(/\n/g, ' ').trim()) : ''

    // Check for trigger
    const triggerMatch = desc.match(/\*\*Trigger\*\*\s*([^*]+)/)
    const effectMatch = desc.match(/\*\*Effect\*\*\s*(.+)/)
    const reqMatch = desc.match(/\*\*Requirement\*?\*?\*?\s*([^*]+)/)

    actions.push({
      name,
      entryType: 'action',
      actionType: actionStringToType(actionStr),
      usage: '',
      keywords: [],
      rangeType: '',
      rangeValue: '',
      target: '',
      attackBonus: null, attackNotes: '',
      defense: 'AC',
      damage: [],
      hit: '',
      miss: '',
      effect: cleanMarkdownLinks((effectMatch?.[1] || desc.replace(/\*\*\w+\*\*\s*[^*]*/g, '').trim()).substring(0, 300)),
      trigger: cleanMarkdownLinks((triggerMatch?.[1] || '').trim()),
      requirement: cleanMarkdownLinks((reqMatch?.[1] || '').trim()),
      sustain: '',
    })
  }

  // Find passive abilities (bold name followed by spaces then description)
  const passiveRegex = /\*\*([A-Z][^*]{2,35})\*\*\s{2,}([A-Z][^\n]+)/g
  while ((match = passiveRegex.exec(md)) !== null) {
    const [, rawName, desc] = match
    const name = rawName.trim()
    if (actions.some(a => a.name === name)) continue
    if (name.includes('/') || name.includes('Source') || name.includes('Recall') || name.includes('Lore') || name.includes('Unspecific') || name.includes('Specific')) continue

    actions.push({
      name,
      entryType: 'trait',
      actionType: '',
      usage: '',
      keywords: [],
      rangeType: '',
      rangeValue: '',
      target: '',
      attackBonus: null, attackNotes: '',
      defense: '',
      damage: [],
      hit: '',
      miss: '',
      effect: cleanMarkdownLinks(desc.trim()),
      trigger: '',
      requirement: '',
      sustain: '',
    })
  }

  return actions
}

function cleanMarkdownLinks(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) → text
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')  // _italic_ → italic
}

function parseResistances(resistance: Record<string, number>, markdown: string): any {
  // Clean markdown links first, then parse
  const clean = cleanMarkdownLinks(markdown).replace(/_/g, '')

  // Check for "all damage N (except ...)" pattern
  const allExceptMatch = clean.match(/all damage\s+(\d+)\s*\(except\s+(.+?)\)/i)
  if (allExceptMatch && resistance.all != null) {
    const value = parseInt(allExceptMatch[1])
    const exceptTypes = allExceptMatch[2]
      .split(/,\s*or\s+|,\s+/)
      .map(s => s.trim())
      .filter(s => s && s.split(/\s+/).length <= 3 && !s.includes('resistance') && !s.includes('against'))
    return {
      allExcept: true,
      value,
      except: exceptTypes,
      note: clean,
    }
  }

  // Normal list of individual resistances
  return Object.entries(resistance).map(([type, value]) => ({ type, value: value as number }))
}

function actionStringToType(str: string): string {
  switch (str) {
    case 'Single Action': return '1'
    case 'Two Actions': return '2'
    case 'Three Actions': return '3'
    case 'Reaction': return 'reaction'
    case 'Free Action': return 'free'
    default: return '1'
  }
}
