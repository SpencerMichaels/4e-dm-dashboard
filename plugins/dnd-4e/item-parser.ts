// D&D 4e item HTML parser — build-time only
// Parses raw HTML for items, weapons, armor, implements, and rituals.

export interface ParsedItem {
  name: string
  category: 'item' | 'weapon' | 'armor' | 'implement' | 'ritual'
  level: number
  rarity: string
  price: string
  flavor: string
  slot: string              // body slot: "Arms Slot", "Weapon", "Neck Slot", etc.
  itemType: string          // restriction: "Any melee", "Cloth, leather or hide", "Any shield", etc.
  enhancement: string
  critical: string
  properties: string[]      // property NAMES only (descriptions in item-known-values.ts)
  powers: { name: string; usage: string; action: string; text: string }[]
  // Weapon-specific
  damage?: string
  proficiency?: string
  range?: string
  weight?: string
  weaponCategory?: string   // "Simple one-handed melee weapon", etc.
  groups: string[]           // group NAMES: ["Heavy Blade", "Polearm"]
  // Ritual-specific
  componentCost?: string
  keySkill?: string
  castTime?: string
  duration?: string
  ritualCategory?: string
  // Scaling
  levels?: { level: number; enhancement?: string; price: string }[]
  source: string
  description: string
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function extractText(html: string, regex: RegExp): string {
  const m = html.match(regex)
  return m ? stripHtml(m[1]).trim() : ''
}

export function parseItemHtml(html: string, category: ParsedItem['category']): ParsedItem {
  if (category === 'ritual') return parseRitual(html)
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
  const price = levels.length > 0 ? levels[0].price : ''

  // Slot + itemType from first <p class=mistat> with bold label
  // e.g. <b>Armor:</b> Cloth, leather or hide → slot="Armor", itemType="Cloth, leather or hide"
  // e.g. <b>Wondrous Item</b> → slot="Wondrous Item", itemType=""
  let slot = '', itemType = ''
  const slotMatch = html.match(/<p class=['"]?mistat['"]?>\s*<b>([^<]+)<\/b>\s*([^<]*)/)
  if (slotMatch) {
    const rawSlot = slotMatch[1].replace(/:?\s*$/, '').trim()
    const rawType = slotMatch[2].trim()
    // Strip any trailing price (gp) from the value, and check if anything remains
    const cleanType = rawType.replace(/\s*\d[\d,]*\s*gp\s*/g, '').trim()
    slot = rawSlot
    itemType = cleanType
  }

  // Enhancement
  const enhMatch = html.match(/<b>Enhancement\s*(?:Bonus)?:?\s*<\/b>\s*([^<\n]+)/i)
  const enhancement = enhMatch ? enhMatch[1].trim() : ''

  // Critical
  const critMatch = html.match(/<b>Critical:?\s*<\/b>\s*([^<\n]+)/i)
  const critical = critMatch ? critMatch[1].trim() : ''

  // Properties — from h2 sections and inline <b>Properties</b>:
  const properties: string[] = []
  // h2 Property sections
  const propH2 = /<h2[^>]*>Property<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/gi
  let pm
  while ((pm = propH2.exec(html)) !== null) properties.push(stripHtml(pm[1]))
  // Inline <b>Property</b> in mistat
  const inlineProp = html.match(/<p class=['"]?mistat['"]?>[^<]*<b>Property[^<]*<\/b>([\s\S]*?)<\/p>/i)
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

  // Powers — capture h2 header + all following <p> blocks until next h2 or end
  const powers: ParsedItem['powers'] = []
  const powerHeaderRegex = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|<br>\s*<br>\s*\n*<p class=['"]?publishedIn|$)/gi
  let pwm
  while ((pwm = powerHeaderRegex.exec(html)) !== null) {
    const header = stripHtml(pwm[1])
    if (!header.toLowerCase().includes('power') && !header.toLowerCase().includes('utility')) continue
    const body = stripHtml(pwm[2])
    const usageMatch = header.match(/(At-Will|Encounter|Daily|Consumable)/i)
    const actionMatch = header.match(/\(([^)]*(?:Action|Interrupt|Reaction)[^)]*)\)/i)
    powers.push({
      name: header.replace(/\s*✦[\s\S]*/, '').replace(/\(.*\)/, '').trim(),
      usage: usageMatch?.[1] ?? '',
      action: actionMatch?.[1] ?? '',
      text: body,
    })
  }

  // Source
  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  return {
    name, category, level, rarity, price, flavor, slot, itemType, enhancement, critical,
    properties, powers, groups,
    levels: levels.length > 1 ? levels.sort((a, b) => a.level - b.level) : undefined,
    source, description: flavor,
  }
}

function parseMundaneItem(html: string, category: ParsedItem['category']): ParsedItem {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'
  const text = stripHtml(html)

  const price = text.match(/Cost:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const damage = text.match(/Damage:\s*([^\n]+)/i)?.[1]?.trim()
  const proficiency = text.match(/Proficient?:\s*([^\n]+)/i)?.[1]?.trim()
  const range = text.match(/Range:\s*([^\n]+)/i)?.[1]?.trim()
  const weight = text.match(/Weight:\s*([^\n]+)/i)?.[1]?.trim()

  // Weapon category line
  const weaponCategory = text.match(/\n((?:Simple|Military|Superior|Improvised)\s+(?:one-handed|two-handed|double)\s+(?:melee|ranged)\s+weapon)/i)?.[1]?.trim()
  const armorCategory = text.match(/\n((?:Light|Heavy)\s+(?:Shield))/i)?.[1]?.trim()

  const slot = category
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
  const descStart = text.indexOf('\n\n')
  const description = descStart > 0 ? text.substring(descStart).replace(/Properties:[\s\S]*$/, '').replace(/Group:[\s\S]*$/, '').replace(/Published in[\s\S]*$/, '').trim() : ''

  return {
    name, category, level: 0, rarity: '', price, flavor: '', slot, itemType,
    enhancement: '', critical: '', properties, powers: [], groups,
    damage, proficiency, range, weight, weaponCategory,
    source, description,
  }
}

function parseRitual(html: string): ParsedItem {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'
  const text = stripHtml(html)

  const flavorMatch = html.match(/<p[^>]*>\s*<i>([\s\S]*?)<\/i>/)
  const flavor = flavorMatch ? stripHtml(flavorMatch[1]) : ''

  const componentCost = text.match(/Component Cost:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const marketPrice = text.match(/Market Price:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const keySkill = text.match(/Key Skill:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const level = parseInt(text.match(/\bLevel:\s*(\d+)/)?.[1] ?? '0')
  const ritualCategory = text.match(/Category:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const castTime = text.match(/Time:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const duration = text.match(/Duration:\s*([^\n]+)/i)?.[1]?.trim() ?? ''

  const source = text.match(/Published in\s+(.+?)\.?\s*$/im)?.[1] ?? ''

  // Description — everything after the stat block
  const lines = text.split('\n').filter(s => s.trim())
  const statFields = ['Component Cost', 'Market Price', 'Key Skill', 'Level:', 'Category:', 'Time:', 'Duration:', 'Published in']
  const descLines = lines.filter(l => !statFields.some(f => l.startsWith(f)) && l !== name && l !== flavor)
  const description = descLines.join('\n').trim()

  return {
    name, category: 'ritual', level, rarity: '', price: marketPrice, flavor,
    slot: ritualCategory, itemType: '', enhancement: '', critical: '',
    properties: [], powers: [], groups: [],
    componentCost, keySkill, castTime, duration, ritualCategory,
    source, description,
  }
}
