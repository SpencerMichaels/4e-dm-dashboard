// D&D 4e item HTML parser — build-time only
// Parses raw HTML for items, weapons, armor, implements, and rituals.
import { fixLigatureSplits, normalizeActionLabel } from './text-utils'

export interface LevelScaling {
  level: number
  text: string
}

export interface ItemPower {
  name: string
  usage: string             // 'Daily', 'Encounter', 'At-Will', 'Consumable', ''
  action: string            // 'Standard Action', 'Minor Action', 'Free Action', etc.
  keywords: string[]        // e.g. ['Cold', 'Zone']
  trigger: string
  effect: string
  attack: string            // e.g. "+14 vs. Reflex"
  target: string
  hit: string
  miss: string
  requirement: string
  sustain: string
  text: string              // base text (Level X: lines removed)
  levelScaling?: LevelScaling[]
}

export interface ParsedItem {
  name: string
  category: 'item' | 'weapon' | 'armor' | 'implement' | 'ritual' | 'set'
  level: number
  rarity: string
  price: string
  flavor: string
  slot: string              // body slot: "Arms Slot", "Weapon", "Neck Slot", etc.
  itemType: string          // restriction: "Any melee", "Cloth, leather or hide", "Any shield", etc.
  enhancement: string
  critical: string
  properties: string[]      // property NAMES only (descriptions in item-known-values.ts)
  propertyScaling?: LevelScaling[]
  powers: ItemPower[]
  // Weapon-specific
  damage?: string
  proficiency?: string
  range?: string
  weight?: string
  weaponCategory?: string   // "Simple one-handed melee weapon", etc.
  groups: string[]           // group NAMES: ["Heavy Blade", "Polearm"]
  special?: string
  requirement?: string
  itemSet?: string
  // Alchemical item fields
  alchemicalType?: string     // "Volatile", "Curative", etc.
  formulaCost?: string        // "70 gp"
  // Ritual / alchemical shared fields
  componentCost?: string
  keySkill?: string
  castTime?: string
  duration?: string
  ritualCategory?: string
  // Scaling
  levels?: { level: number; enhancement?: string; price: string; overrides?: Record<string, string> }[]
  source: string
  description: string
  /** Structured description with inline tables for rich rendering */
  descriptionParts?: DescriptionPart[]
}

export type DescriptionPart =
  | { type: 'text'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][]; links?: Record<string, string> }
  | { type: 'properties'; items: string[] }
  | { type: 'power'; power: ItemPower }

function stripHtml(html: string): string {
  return fixLigatureSplits(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '').replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').trim())
}

/** Extract "Level X:" lines from text, returning base text and scaling entries */
function extractLevelScaling(text: string): { base: string; scaling: LevelScaling[] } {
  const scaling: LevelScaling[] = []
  const lines = text.split('\n')
  const baseLines: string[] = []
  for (const line of lines) {
    const m = line.match(/^\s*Level\s+(\d+)(?:\s+or\s+\d+)*\s*:\s*(.*)/i)
    if (m) {
      scaling.push({ level: parseInt(m[1]), text: m[2].trim() })
    } else {
      baseLines.push(line)
    }
  }
  return { base: baseLines.join('\n').trim(), scaling }
}

function extractText(html: string, regex: RegExp): string {
  const m = html.match(regex)
  return m ? stripHtml(m[1]).trim() : ''
}

export function parseItemHtml(html: string, category: ParsedItem['category']): ParsedItem {
  if (category === 'ritual') return parseRitual(html)
  const isSet = html.includes('class=miset') || html.includes("class='miset'")
  if (isSet) return parseItemSet(html, category)
  const isMagical = html.includes('class=mihead') || html.includes("class='mihead'")
  if (isMagical) return parseMagicalItem(html, category)
  return parseMundaneItem(html, category)
}

function parseMagicalItem(html: string, category: ParsedItem['category']): ParsedItem {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'

  // Level + Rarity
  const levelText = html.match(/milevel[^>]*>([^<]+)/)?.[1]?.trim() ?? ''
  const level = parseInt(levelText.match(/Level\s+(\d+)/)?.[1] ?? '0')
  const rarity = levelText.match(/(Common|Uncommon|Rare)/i)?.[1] ?? ''

  // Flavor
  const flavor = extractText(html, /<p class=['"]?miflavor['"]?>([\s\S]*?)<\/p>/)

  // Pricing table
  const levels: ParsedItem['levels'] = []
  const tableMatch = html.match(/<table class=['"]?magicitem['"]?>([\s\S]*?)<\/table>/)
  if (tableMatch) {
    const cellRegex = /<td class=mic1>([^<]*)<td class=mic2>([^<]*)<td class=mic3>([^<]*)/g
    let m
    while ((m = cellRegex.exec(tableMatch[1])) !== null) {
      const lvl = parseInt(m[1].replace(/\D/g, '') || '0')
      const enh = m[2].trim()
      const price = m[3].trim()
      if (lvl > 0 || price) levels.push({ level: lvl, enhancement: enh || undefined, price })
    }
  }
  let price = levels.length > 0 ? levels[0].price : ''

  // Slot + itemType from first <p class=mistat> with bold label
  // e.g. <b>Armor:</b> Cloth, leather or hide → slot="Armor", itemType="Cloth, leather or hide"
  // e.g. <b>Wondrous Item</b> → slot="Wondrous Item", itemType=""
  const KNOWN_SLOTS = new Set([
    'Arms', 'Feet', 'Hands', 'Head', 'Neck', 'Ring',
    'Waist', 'Body', 'Head and Neck', 'Familiar', 'Item',
    'Weapon', 'Armor', 'Implement', 'Wondrous Item', 'Consumable', 'Ammunition',
    'Mount', 'Artifact', 'Companion', 'Alchemical Item',
    'Grandmaster Training', 'Legendary Boon', 'Divine Boon', 'Fey Magic Gift',
    "Sorcerer-King's Boon", 'Primal Blessing', 'Glory Boon', 'Psionic Talent',
    'Elemental Gift', 'Elemental gift', 'Lost Rune', 'Secret of the Way',
    "Wanderer's Secret", 'Echo of Power', 'Battle Scars', 'Veiled Alliance Mystery',
    'Templar Brand',
  ])
  let slot = '', itemType = ''
  const slotMatch = html.match(/<p class=['"]?mistat['"]?>\s*<b>([^<]+)<\/b>\s*([^<]*)/)
  if (slotMatch) {
    const rawSlot = slotMatch[1].replace(/:?\s*$/, '').replace(/\s+Slot$/, '').trim()
    const rawType = slotMatch[2].trim()
    const cleanType = rawType.replace(/\s*\d[\d,]*\s*gp\s*|\s*\b(?:Priceless|Special)$/g, '').trim()
    if (KNOWN_SLOTS.has(rawSlot)) {
      slot = rawSlot
      itemType = cleanType
    }
    // A single-version item prints its price on the slot line ("Wondrous Item 1,000 gp").
    if (!price) price = rawType.match(/\d[\d,]*\s*gp\b|\b(?:Priceless|Special)$/)?.[0] ?? ''
  }

  // Enhancement
  const enhMatch = html.match(/<b>Enhancement\s*(?:Bonus)?:?\s*<\/b>\s*([^<\n]+)/i)
  const enhancement = enhMatch ? enhMatch[1].trim() : ''

  // Critical
  const critMatch = html.match(/<b>Critical:?\s*<\/b>\s*([^<\n]+)/i)
  const critical = critMatch ? critMatch[1].trim() : ''

  // Concordance artifacts: split HTML at first <p class=mitext> or <h2 class=ah1>
  // Everything after that boundary is concordance content, not base properties/powers
  const concordanceBoundary = html.search(/<(?:p class=['"]?mitext['"]?|h2 class=['"]?ah[12]['"]?)>/)
  const baseHtml = concordanceBoundary > 0 ? html.substring(0, concordanceBoundary) : html
  const concordanceHtml = concordanceBoundary > 0 ? html.substring(concordanceBoundary) : ''

  // Properties — from h2 sections and inline <b>Properties</b>:
  const properties: string[] = []
  // h2 Property sections (in base HTML only) — may be followed by <p> or <ul>
  const propH2 = /<h2[^>]*>Propert(?:y|ies)<\/h2>\s*(?:<ul[^>]*>([\s\S]*?)<\/ul>|<p[^>]*>([\s\S]*?)<\/p>)/gi
  let pm
  while ((pm = propH2.exec(baseHtml)) !== null) {
    const raw = pm[1] || pm[2]
    // If it's a <ul>, extract individual <li> items
    if (pm[1]) {
      const liRegex = /<li>([\s\S]*?)(?:<\/li>|(?=<li>))/gi
      let lm
      while ((lm = liRegex.exec(raw)) !== null) {
        const t = stripHtml(lm[1]).trim()
        if (t) properties.push(t)
      }
    } else {
      const text = stripHtml(raw)
      if (text) properties.push(text)
    }
  }
  // Inline <b>Property</b> in mistat
  const inlineProp = baseHtml.match(/<p class=['"]?mistat['"]?>[^<]*<b>Property[^<]*<\/b>([\s\S]*?)<\/p>/i)
  if (inlineProp) properties.push(stripHtml(inlineProp[1]))
  // <b>Properties</b>: format — extract just the names
  const boldProps = html.match(/<b>Properties<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<b>Group|<b>|<p class|$)/i)
  if (boldProps) {
    const propBlock = boldProps[1]
    const nameRe = /([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s*\([^)]*\))?)\s*(?:\(<i>|\.)/g
    let nm
    while ((nm = nameRe.exec(propBlock)) !== null) {
      const propName = nm[1].trim()
      if (propName.length < 30) properties.push(propName)
    }
  }

  // Groups — from <b>Group</b>: format, may have multiple (e.g. "Axe.Polearm")
  const groups: string[] = []
  const groupMatch = html.match(/<b>Group<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<p class=['"]?publishedIn|$)/i)
  if (groupMatch) {
    const groupText = stripHtml(groupMatch[1])
    // Extract group names: "GroupName (" — may appear multiple times
    const gre = /([A-Z][a-z]+(?:\s+[a-z]+)?)\s*\(/g
    let gm
    while ((gm = gre.exec(groupText)) !== null) {
      const gname = gm[1].trim()
      if (gname.length < 20 && !groups.includes(gname)) groups.push(gname)
    }
  }

  // Powers — capture h2 header + all following <p> blocks until next h2 or end (base only)
  const powers: ItemPower[] = []
  const powerHeaderRegex = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|<br>\s*<br>\s*\n*<p class=['"]?publishedIn|$)/gi
  let pwm
  while ((pwm = powerHeaderRegex.exec(baseHtml)) !== null) {
    const header = stripHtml(pwm[1])
    if (!header.toLowerCase().includes('power') && !header.toLowerCase().includes('utility')) continue
    powers.push(parseItemPower(header, pwm[2]))
  }

  // Special / Requirement
  const specialMatch = html.match(/<b>Special:?\s*<\/b>\s*([\s\S]*?)(?=<\/p>|<h2|<p class)/i)
  const special = specialMatch ? stripHtml(specialMatch[1]).trim() : ''
  const reqMatch = html.match(/<b>Requirement:?\s*<\/b>\s*([\s\S]*?)(?=<\/p>|<h2|<p class)/i)
  const requirement = reqMatch ? stripHtml(reqMatch[1]).trim() : ''

  // Item Set — from <h1 class=miset> or "Item Set:" text
  const setMatch = html.match(/<h1 class=['"]?miset['"]?>\s*([^<]+)/i)
    ?? html.match(/<b>Item Set:?\s*<\/b>\s*([^<]+)/i)
  const itemSet = setMatch ? setMatch[1].trim() : ''

  // Alchemical item fields — from <p class=mistatAI>
  let alchemicalType = '', formulaCost = '', alchKeySkill = '', alchTime = ''
  const aiMatch = html.match(/<p class=['"]?mistatAI['"]?>([\s\S]*?)<\/p>/i)
  if (aiMatch) {
    const aiBlock = aiMatch[1]
    const aiTypeMatch = aiBlock.match(/<b>Alchemical Item:?\s*<\/b>\s*([^<]*)/i)
    alchemicalType = aiTypeMatch ? (aiTypeMatch[1].trim() || 'Alchemical Item') : 'Alchemical Item'
    const fcMatch = aiBlock.match(/<b>Formula Cost:?\s*<\/b>\s*([^<]+)/i)
    formulaCost = fcMatch ? fcMatch[1].trim() : ''
    const ksMatch = aiBlock.match(/<b>Key Skill:?\s*<\/b>\s*([^<]+)/i)
    alchKeySkill = ksMatch ? ksMatch[1].trim() : ''
    const tmMatch = aiBlock.match(/<b>Time:?\s*<\/b>\s*([^<]+)/i)
    alchTime = tmMatch ? tmMatch[1].trim() : ''
    // Set slot to "Alchemical Item" if not already set
    if (!slot) slot = 'Alchemical Item'
  }

  // Source
  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  // Extract level scaling from properties
  const propertyScaling: LevelScaling[] = []
  for (let pi = 0; pi < properties.length; pi++) {
    const { base, scaling } = extractLevelScaling(properties[pi])
    if (scaling.length > 0) {
      properties[pi] = base
      propertyScaling.push(...scaling)
    }
  }

  // Parse concordance sections into descriptionParts
  let descriptionParts: ParsedItem['descriptionParts'] | undefined
  if (concordanceHtml) {
    descriptionParts = parseConcordanceSections(concordanceHtml)
  }

  return {
    name, category, level, rarity, price, flavor, slot, itemType, enhancement, critical,
    properties, powers, groups,
    propertyScaling: propertyScaling.length > 0 ? propertyScaling : undefined,
    special: special || undefined,
    requirement: requirement || undefined,
    itemSet: itemSet || undefined,
    alchemicalType: alchemicalType || undefined,
    formulaCost: formulaCost || undefined,
    keySkill: alchKeySkill || undefined,
    castTime: alchTime || undefined,
    levels: levels.length > 1 ? levels.sort((a, b) => a.level - b.level) : undefined,
    source, description: flavor,
    descriptionParts,
  }
}

/** Parse concordance/artifact sections into descriptionParts */
function parseConcordanceSections(html: string): DescriptionPart[] {
  const parts: DescriptionPart[] = []

  // Split on h2 boundaries — each section is heading + content until next h2
  const chunks = html.split(/<h2[^>]*>/).filter(Boolean)
  for (const chunk of chunks) {
    // Split heading from body at </h2>
    const closeIdx = chunk.indexOf('</h2>')
    const heading = closeIdx >= 0 ? stripHtml(chunk.substring(0, closeIdx)).trim() : ''
    const body = closeIdx >= 0 ? chunk.substring(closeIdx + 5) : chunk

    // Skip publishedIn
    if (heading.toLowerCase().includes('published')) continue

    // Check for tables in body
    const tableMatch = body.match(/<table[\s\S]*?<\/table>/i)
    if (tableMatch) {
      const table = parseHtmlTable(tableMatch[0])
      const beforeTable = stripHtml(body.substring(0, body.indexOf(tableMatch[0]))).trim()
      const afterTable = stripHtml(body.substring(body.indexOf(tableMatch[0]) + tableMatch[0].length)).trim()
      if (heading) parts.push({ type: 'heading', text: heading })
      if (beforeTable) parts.push({ type: 'text', text: beforeTable })
      if (table) parts.push(table)
      if (afterTable) parts.push({ type: 'text', text: afterTable })
      continue
    }

    // Properties heading — extract list items
    if (/^Propert(?:y|ies)$/i.test(heading)) {
      const listItems: string[] = []
      const liRegex = /<li>([\s\S]*?)(?:<\/li>|(?=<li>))/gi
      let lm
      while ((lm = liRegex.exec(body)) !== null) {
        const t = stripHtml(lm[1]).trim()
        if (t) listItems.push(t)
      }
      if (listItems.length === 0) {
        const t = stripHtml(body).trim()
        if (t) listItems.push(t)
      }
      if (listItems.length > 0) parts.push({ type: 'properties', items: listItems })
      continue
    }

    // Power heading — parse into structured power
    if (/^Power\b|^Utility\b/i.test(heading)) {
      parts.push({ type: 'power', power: parseItemPower(heading, body) })
      continue
    }

    // Tier heading (Pleased, Satisfied, Normal, etc.)
    if (heading) parts.push({ type: 'heading', text: heading })

    // Plain text body
    const text = stripHtml(body).replace(/Published in[\s\S]*$/im, '').trim()
    if (text) parts.push({ type: 'text', text })
  }

  return parts
}

function parseMundaneItem(html: string, category: ParsedItem['category']): ParsedItem {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'
  const text = stripHtml(html)

  const price = text.match(/(?:Cost|Price):\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const damage = text.match(/Damage:\s*([^\n]+)/i)?.[1]?.trim()
  const proficiency = text.match(/Proficient?:\s*([^\n]+)/i)?.[1]?.trim()
  const range = text.match(/Range:\s*([^\n]+)/i)?.[1]?.trim()
  const weight = text.match(/Weight:\s*([^\n]+)/i)?.[1]?.trim()

  // Weapon category line
  const weaponCategory = text.match(/\n((?:Simple|Military|Superior|Improvised)\s+(?:one-handed|two-handed|double)\s+(?:melee|ranged)\s+weapon)/i)?.[1]?.trim()
  const armorCategory = text.match(/\n((?:Light|Heavy)\s+(?:Shield))/i)?.[1]?.trim()

  // Category field (e.g. "Service", "Adventuring Gear") — use as slot if present
  const categoryField = text.match(/Category:[ \t]*([^\n]+)/i)?.[1]?.trim()
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
  const slot = categoryField || cap(category)
  const itemType = weaponCategory || armorCategory || ''

  // Properties — from <b>Properties</b>: format, extract names
  const properties: string[] = []
  const boldProps = html.match(/<b>Properties<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<b>Group|<b>|<p class|$)/i)
  if (boldProps) {
    const nameRe = /([A-Z][a-z]+(?:\s+[a-z]+)?(?:\s*\([^)]*\))?)\s*(?:\(<i>|\.)/g
    let nm
    while ((nm = nameRe.exec(boldProps[1])) !== null) {
      const propName = nm[1].trim()
      if (propName.length < 30) properties.push(propName)
    }
  }
  // Fallback: from plain text
  if (properties.length === 0) {
    const textProps = text.match(/Properties:\s*\n?([\s\S]*?)(?=\n\n|Group:|Published in|$)/i)
    if (textProps) {
      for (const line of textProps[1].split(/\n/).map(s => s.trim()).filter(Boolean)) {
        const propName = line.replace(/\s*\(.*/, '').trim()
        if (propName.length < 30 && /^[A-Z]/.test(propName)) properties.push(propName)
      }
    }
  }

  // Groups — from <b>Group</b>: format
  const groups: string[] = []
  const groupMatch = html.match(/<b>Group<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<p class=['"]?publishedIn|$)/i)
  if (groupMatch) {
    const gText = stripHtml(groupMatch[1])
    const gre = /([A-Z][a-z]+(?:\s+[a-z]+)?)\s*\(/g
    let gm
    while ((gm = gre.exec(gText)) !== null) {
      const gname = gm[1].trim()
      if (gname.length < 20 && !groups.includes(gname)) groups.push(gname)
    }
  }
  // Fallback
  if (groups.length === 0) {
    const gPlain = text.match(/Group:\s*([^\n(]+)/i)
    if (gPlain) groups.push(gPlain[1].trim())
  }

  const source = text.match(/Published in\s+(.+?)\.?\s*$/im)?.[1] ?? ''
  // Try explicit "Description:" field first, then fall back to free text after blank line
  const descField = text.match(/Description:\s*([^\n](?:[\s\S]*?)?)(?=Published in|$)/i)?.[1]?.trim()
  const descStart = text.indexOf('\n\n')
  const description = descField || (descStart > 0 ? text.substring(descStart).replace(/Properties:[\s\S]*$/, '').replace(/Group:[\s\S]*$/, '').replace(/Published in[\s\S]*$/, '').trim() : '')

  return {
    name, category, level: 0, rarity: '', price, flavor: '', slot, itemType,
    enhancement: '', critical: '', properties, powers: [], groups,
    damage, proficiency, range, weight, weaponCategory,
    source, description,
  }
}

/** Parse an item power from its h2 header text and HTML body */
function parseItemPower(header: string, bodyHtml: string): ItemPower {
  // Header: "Power (Cold, Zone) ✦ Daily (Minor Action)"
  // or: "Attack Power (Acid) ✦ Encounter (Immediate Reaction)"
  const usageMatch = header.match(/(At-Will|Encounter|Daily|Consumable)/i)
  const actionMatch = header.match(/\(([^)]*(?:Action|Interrupt|Reaction|No Action)[^)]*)\)/i)
  const keywordsMatch = header.match(/(?:Power|Utility)\s*\(([^)]+)\)/i)
  const keywords = keywordsMatch
    ? keywordsMatch[1].split(',').map(k => k.trim()).filter(Boolean)
    : []

  let name = header.replace(/\s*✦[\s\S]*/, '').replace(/\([^)]*\)/g, '').trim()
  if (/^(Attack )?Power$/i.test(name)) name = 'Power'

  // Extract structured fields from body — handles both <i>Label:</i> and <b>Label</b>: patterns
  const extractField = (label: string): string => {
    // Try <i>Label:</i> first (standard item powers), then <b>Label</b>: (set powers)
    const re1 = new RegExp(`<i>${label}:?\\s*</i>\\s*:?\\s*([\\s\\S]*?)(?=<i>\\w|</p>|$)`, 'i')
    const re2 = new RegExp(`<b>${label}</b>\\s*:?\\s*([\\s\\S]*?)(?=<b>\\w|</p>|$)`, 'i')
    const m = bodyHtml.match(re1) || bodyHtml.match(re2)
    return m ? stripHtml(m[1]).replace(/^:\s*/, '').trim() : ''
  }

  const trigger = extractField('Trigger')
  const effect = extractField('Effect')
  const attack = extractField('Attack')
  const target = extractField('Target')
  const hit = extractField('Hit')
  const miss = extractField('Miss')
  const requirement = extractField('Requirement')
  const sustain = extractField('Sustain (?:Minor|Move|Standard|Free)')
    || extractField('Sustain')

  // Remaining text: strip out the structured fields, keep level scaling etc.
  const fullText = stripHtml(bodyHtml)
  // Remove lines that are just the usage/action repeated from the header
  const structuredLabels = ['Trigger', 'Effect', 'Attack', 'Target', 'Hit', 'Miss', 'Requirement', 'Sustain']
  const lines = fullText.split('\n').filter(l => {
    const trimmed = l.trim()
    // Skip empty
    if (!trimmed) return false
    // Skip lines that are just usage/action (from dailypower blocks)
    if (/^(Daily|Encounter|At-Will|Consumable)$/i.test(trimmed)) return false
    if (/^(Standard Action|Minor Action|Move Action|Free Action|Immediate Interrupt|Immediate Reaction|No Action)/i.test(trimmed) && trimmed.length < 50) return false
    if (/^(Melee|Ranged|Close|Area)\b/i.test(trimmed) && trimmed.length < 30) return false
    if (/^(Personal)$/i.test(trimmed)) return false
    // Skip lines that start with a structured field label we already extracted
    for (const label of structuredLabels) {
      if (new RegExp(`^${label}:?\\s`, 'i').test(trimmed) && extractField(label)) return false
    }
    return true
  })
  const rawText = lines.join('\n').trim()
  const { base: text, scaling: levelScaling } = extractLevelScaling(rawText)

  return {
    name,
    usage: usageMatch?.[1] ?? '',
    action: normalizeActionLabel(actionMatch?.[1] ?? ''),
    keywords,
    trigger, effect, attack, target, hit, miss, requirement, sustain,
    text,
    levelScaling: levelScaling.length > 0 ? levelScaling : undefined,
  }
}

function parseItemSet(html: string, _category: ParsedItem['category']): ParsedItem {
  const setName = html.match(/<h1[^>]*class=['"]?miset['"]?[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown Set'
  const tier = html.match(/milevel[^>]*>([^<]+)/)?.[1]?.trim() ?? ''
  const lore = extractText(html, /<\/h1>\s*<p>([\s\S]*?)<\/p>/)
  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  // Parse component items table
  const itemsTable = parseHtmlTable(html.match(/<h3>[^<]*Items<\/h3>\s*(<table[\s\S]*?<\/table>)/i)?.[1] ?? '')
  // Parse benefits table
  const benefitsTable = parseHtmlTable(html.match(/<h3>[^<]*Benefits<\/h3>\s*(<table[\s\S]*?<\/table>)/i)?.[1] ?? '')

  // Build set entry
  const setParts: DescriptionPart[] = []
  if (lore) setParts.push({ type: 'text', text: lore })
  if (itemsTable) setParts.push(itemsTable)
  if (benefitsTable) setParts.push(benefitsTable)

  // Parse set-level powers (dailypower / atwillpower h1 blocks)
  const setPowers: ItemPower[] = []
  const setPowerRegex = /<h1 class=['"]?(?:dailypower|atwillpower)['"]?>([\s\S]*?)<\/h1>([\s\S]*?)(?=<h1 class=['"]?mi|$)/gi
  let spm
  while ((spm = setPowerRegex.exec(html)) !== null) {
    const name = stripHtml(spm[1])
    // Build a synthetic header from the body's usage/action fields
    const body = spm[2]
    const usageMatch = body.match(/<b>(Daily|At-Will|Encounter)<\/b>/i)
    const actionMatch = body.match(/<b>((?:Standard|Move|Minor|Free|Immediate)[^<]*)<\/b>/i)
    const header = `${name} ✦ ${usageMatch?.[1] ?? ''} (${actionMatch?.[1] ?? ''})`
    setPowers.push(parseItemPower(header, body))
  }

  return {
    name: setName, category: 'set', level: 0, rarity: tier, price: '', flavor: '',
    slot: 'Item Set', itemType: '', enhancement: '', critical: '',
    properties: [], powers: setPowers, groups: [],
    itemSet: setName,
    source, description: lore,
    descriptionParts: setParts.length > 0 ? setParts : undefined,
  }
}

function parseRitual(html: string): ParsedItem {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'

  const flavorMatch = html.match(/<p[^>]*>\s*<i>([\s\S]*?)<\/i>/)
  const flavor = flavorMatch ? stripHtml(flavorMatch[1]) : ''

  // Parse stat fields from HTML structure (not stripped text) to avoid field-bleed
  // The ritualstats span has Component Cost, Market Price, Key Skill
  // Outside the span: Level, Category, Time, Duration
  const extractField = (label: string) => {
    const re = new RegExp(`<b>${label}<\\/b>\\s*:?\\s*([^<]+)`, 'i')
    return html.match(re)?.[1]?.trim() ?? ''
  }

  const componentCost = extractField('Component Cost')
  const marketPrice = extractField('Market Price')
  const keySkill = extractField('Key Skill')
  const level = parseInt(extractField('Level') || '0')
  const ritualCategory = extractField('Category')
  const castTime = extractField('Time')
  const duration = extractField('Duration')

  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  // Description — the body text after the first stat <p>, excluding stat fields, name, and source
  // Strip embedded sub-items (alchemical products) which exist as standalone entries
  const statPEnd = html.indexOf('</p>')
  let bodyHtml = statPEnd > 0 ? html.substring(statPEnd + 4) : html
  const subItemStart = bodyHtml.search(/<h1 class=['"]?magicitem['"]?>/i)
  if (subItemStart >= 0) bodyHtml = bodyHtml.substring(0, subItemStart)

  // Build structured description with text and table segments
  const descriptionParts = parseDescriptionParts(bodyHtml)
  // Flat text fallback
  const description = descriptionParts
    .filter(p => p.type === 'text')
    .map(p => (p as any).text)
    .join('\n')

  return {
    name, category: 'ritual', level, rarity: '', price: marketPrice, flavor,
    slot: ritualCategory, itemType: '', enhancement: '', critical: '',
    properties: [], powers: [], groups: [],
    componentCost, keySkill, castTime, duration, ritualCategory,
    source, description, descriptionParts,
  }
}

/** Split HTML body into text and table segments */
function parseDescriptionParts(html: string): DescriptionPart[] {
  const parts: DescriptionPart[] = []
  // Split around <table>...</table>
  const chunks = html.split(/(<table[\s\S]*?<\/table>)/gi)
  for (const chunk of chunks) {
    if (/^<table/i.test(chunk)) {
      const table = parseHtmlTable(chunk)
      if (table) parts.push(table)
    } else {
      const text = stripHtml(chunk)
        .replace(/Published in[\s\S]*$/im, '')
        .trim()
      if (text) parts.push({ type: 'text', text })
    }
  }
  return parts
}

/** Parse an HTML table into structured header + row data */
function parseHtmlTable(tableHtml: string): { type: 'table'; headers: string[]; rows: string[][] } | null {
  const allRows: { isHeader: boolean; cells: string[] }[] = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)(?=<tr|<\/table>)/gi
  let rm
  while ((rm = rowRegex.exec(tableHtml)) !== null) {
    const cells: string[] = []
    const hasHeader = /<th/i.test(rm[1])
    const cellRegex = /<t[hd][^>]*>([^<]*)/gi
    let cm
    while ((cm = cellRegex.exec(rm[1])) !== null) {
      cells.push(cm[1].trim())
    }
    if (cells.length > 0) allRows.push({ isHeader: hasHeader, cells })
  }
  if (allRows.length === 0) return null
  const headerRow = allRows[0].isHeader ? allRows[0].cells : []
  const dataRows = allRows.filter((_, i) => i > 0 || !allRows[0].isHeader).map(r => r.cells)
  return { type: 'table', headers: headerRow, rows: dataRows }
}
