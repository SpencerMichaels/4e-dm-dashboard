// D&D 4e item HTML parser — build-time only
// Parses raw HTML data for items, weapons, armor, implements, and rituals
// into structured ParsedItem objects.

export interface ParsedItem {
  name: string
  category: 'item' | 'weapon' | 'armor' | 'implement' | 'ritual'
  level: number
  rarity: string
  price: string
  flavor: string
  slot: string
  enhancement: string
  properties: string[]
  powers: { name: string; usage: string; action: string; text: string }[]
  damage?: string
  proficiency?: string
  range?: string
  weight?: string
  group?: string
  componentCost?: string
  keySkill?: string
  castTime?: string
  duration?: string
  ritualCategory?: string
  levels?: { level: number; enhancement?: string; price: string }[]
  source: string
  description: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractText(html: string, regex: RegExp): string {
  const m = html.match(regex)
  return m ? stripHtml(m[1]).trim() : ''
}

export function parseItemHtml(html: string, category: ParsedItem['category']): ParsedItem {
  if (category === 'ritual') return parseRitual(html)

  // Detect magical vs mundane
  const isMagical = html.includes('class=mihead') || html.includes("class='mihead'")

  if (isMagical) return parseMagicalItem(html, category)
  return parseMundaneItem(html, category)
}

function parseMagicalItem(html: string, category: ParsedItem['category']): ParsedItem {
  // Name
  const nameMatch = html.match(/<h1[^>]*>([^<]+)/)
  const name = nameMatch?.[1]?.trim() ?? 'Unknown'

  // Level + Rarity from <span class=milevel>
  const levelMatch = html.match(/milevel[^>]*>([^<]+)/)
  const levelText = levelMatch?.[1]?.trim() ?? ''
  const lvlNum = parseInt(levelText.match(/Level\s+(\d+)/)?.[1] ?? '0')
  const rarity = levelText.match(/(Common|Uncommon|Rare)/i)?.[1] ?? ''

  // Flavor
  const flavor = extractText(html, /<p class=['"]?miflavor['"]?>([\s\S]*?)<\/p>/)

  // Pricing table
  const levels: { level: number; enhancement?: string; price: string }[] = []
  const tableMatch = html.match(/<table class=['"]?magicitem['"]?>([\s\S]*?)<\/table>/)
  if (tableMatch) {
    const rows = tableMatch[1]
    const cellRegex = /<td class=mic1>([^<]*)<td class=mic2>([^<]*)<td class=mic3>([^<]*)/g
    let m
    while ((m = cellRegex.exec(rows)) !== null) {
      const lvl = parseInt(m[1].replace(/\D/g, '') || '0')
      const enh = m[2].trim()
      const price = m[3].trim()
      if (lvl > 0 || price) levels.push({ level: lvl, enhancement: enh || undefined, price })
    }
  }

  const price = levels.length > 0 ? levels[0].price : ''

  // Slot / type from first <p class=mistat> with <b> — strip trailing colon/spaces
  const slot = extractText(html, /<p class=['"]?mistat['"]?>\s*<b>([^<]+)<\/b>/).replace(/:\s*$/, '')

  // Enhancement
  const enhMatch = html.match(/<b>Enhancement\s*(?:Bonus)?:?\s*<\/b>\s*([^<\n]+)/i)
  const enhancement = enhMatch ? enhMatch[1].trim() : ''

  // Properties — from <h2>Property</h2> sections, <p> with <b>Property</b>, or inline <b>Properties</b>:
  const properties: string[] = []
  // h2 section format
  const propRegex = /<h2[^>]*>Property<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/gi
  let pm
  while ((pm = propRegex.exec(html)) !== null) {
    properties.push(stripHtml(pm[1]))
  }
  // <p class=mistat> with <b>Property</b>
  const inlinePropMatch = html.match(/<p class=['"]?mistat['"]?>[^<]*<b>Property[^<]*<\/b>([\s\S]*?)<\/p>/i)
  if (inlinePropMatch) properties.push(stripHtml(inlinePropMatch[1]))
  // <b>Properties</b>: followed by inline text (mundane implements, weapons, etc.)
  const boldPropsMatch = html.match(/<b>Properties<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<b>|<p class|<br>\s*<br>|$)/i)
  if (boldPropsMatch) {
    // Each property is "Name (description)." — split on ")."
    const propText = stripHtml(boldPropsMatch[1])
    for (const p of propText.split(/\.\s*(?=[A-Z])/).map(s => s.trim()).filter(Boolean)) {
      if (!properties.includes(p)) properties.push(p.replace(/\.$/, ''))
    }
  }

  // Powers — <h2> with "Power" in it
  const powers: ParsedItem['powers'] = []
  const powerHeaderRegex = /<h2[^>]*>([\s\S]*?)<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/gi
  let pwm
  while ((pwm = powerHeaderRegex.exec(html)) !== null) {
    const header = stripHtml(pwm[1])
    if (!header.toLowerCase().includes('power') && !header.toLowerCase().includes('utility')) continue
    const text = stripHtml(pwm[2])
    // Parse usage and action from header: "Power ✦ Daily (Free Action)"
    const usageMatch = header.match(/(At-Will|Encounter|Daily)/i)
    const actionMatch = header.match(/\(([^)]*Action[^)]*)\)/i)
    powers.push({
      name: header.replace(/✦/g, '').replace(/\(.*\)/, '').trim(),
      usage: usageMatch?.[1] ?? '',
      action: actionMatch?.[1] ?? '',
      text,
    })
  }

  // Group — from <b>Group</b>: inline text
  const groupMatch = html.match(/<b>Group<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<b>|<p class=['"]?publishedIn|<br>\s*<br>|$)/i)
  const group = groupMatch ? stripHtml(groupMatch[1]).split('\n')[0].replace(/\s*\(.*/, '').trim() : undefined

  // Source
  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/)
    .replace(/^Published in\s*/i, '')

  // Full description (everything not captured above)
  const description = flavor

  return {
    name, category, level: lvlNum, rarity, price, flavor, slot, enhancement,
    properties, powers, levels: levels.length > 1 ? levels : undefined,
    group, source, description,
  }
}

function parseMundaneItem(html: string, category: ParsedItem['category']): ParsedItem {
  const nameMatch = html.match(/<h1[^>]*>([^<]+)/)
  const name = nameMatch?.[1]?.trim() ?? 'Unknown'

  const text = stripHtml(html)

  // Extract fields from plain text
  const price = text.match(/Cost:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const damage = text.match(/Damage:\s*([^\n]+)/i)?.[1]?.trim()
  const proficiency = text.match(/Proficient?:\s*([^\n]+)/i)?.[1]?.trim()
  const range = text.match(/Range:\s*([^\n]+)/i)?.[1]?.trim()
  const weight = text.match(/Weight:\s*([^\n]+)/i)?.[1]?.trim()
  // Group — from HTML <b>Group</b>: or plain text
  const groupHtmlMatch = html.match(/<b>Group<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<b>|<p class=['"]?publishedIn|<br>\s*<br>|$)/i)
  const group = groupHtmlMatch
    ? stripHtml(groupHtmlMatch[1]).split('\n')[0].replace(/\s*\(.*/, '').trim()
    : text.match(/Group:\s*([^\n]+)/i)?.[1]?.trim()

  // Category line (e.g. "Superior two-handed melee weapon")
  const catLine = text.match(/\n((?:Simple|Military|Superior|Improvised)?\s*(?:one-handed|two-handed|double)?\s*(?:melee|ranged)?\s*weapon)/i)?.[1]?.trim()
    ?? text.match(/\n((?:Light|Heavy|Chain|Scale|Plate|Hide|Leather)\s*(?:armor|shield)?)/i)?.[1]?.trim()
    ?? ''

  // Slot
  const slot = catLine || category

  // Properties — from HTML <b>Properties</b>: or plain text
  const properties: string[] = []
  const boldPropsMatch = html.match(/<b>Properties<\/b>\s*:?\s*<br\s*\/?>([\s\S]*?)(?=<b>Group|<b>|<p class|<br>\s*<br>|$)/i)
  if (boldPropsMatch) {
    const propText = stripHtml(boldPropsMatch[1])
    for (const p of propText.split(/\.\s*(?=[A-Z])/).map(s => s.trim()).filter(Boolean)) {
      properties.push(p.replace(/\.$/, ''))
    }
  }
  const propsMatch = !boldPropsMatch ? text.match(/Properties:\s*\n?([\s\S]*?)(?=\n\n|Published in|$)/i) : null
  if (propsMatch) {
    properties.push(...propsMatch[1].split(/\n/).map(s => s.trim()).filter(Boolean))
  }

  // Source
  const source = text.match(/Published in\s+(.+?)\.?\s*$/im)?.[1] ?? ''

  // Description — everything after the stats
  const descStart = text.indexOf('\n\n')
  const description = descStart > 0 ? text.substring(descStart).replace(/Published in[\s\S]*$/, '').trim() : ''

  return {
    name, category, level: 0, rarity: '', price, flavor: '', slot,
    enhancement: '', properties, powers: [],
    damage, proficiency, range, weight, group,
    source, description,
  }
}

function parseRitual(html: string): ParsedItem {
  const nameMatch = html.match(/<h1[^>]*>([^<]+)/)
  const name = nameMatch?.[1]?.trim() ?? 'Unknown'

  const text = stripHtml(html)

  // Flavor — first italic line
  const flavorMatch = html.match(/<p[^>]*>\s*<i>([\s\S]*?)<\/i>/)
  const flavor = flavorMatch ? stripHtml(flavorMatch[1]) : ''

  // Stats from ritualstats spans or bold labels
  const componentCost = text.match(/Component Cost:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const marketPrice = text.match(/Market Price:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const keySkill = text.match(/Key Skill:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const level = parseInt(text.match(/Level:\s*(\d+)/)?.[1] ?? '0')
  const ritualCategory = text.match(/Category:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const castTime = text.match(/Time:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  const duration = text.match(/Duration:\s*([^\n]+)/i)?.[1]?.trim() ?? ''

  // Description — everything after the stat block
  const lines = text.split('\n').filter(s => s.trim())
  const statFields = ['Component Cost', 'Market Price', 'Key Skill', 'Level', 'Category', 'Time', 'Duration', 'Published in']
  const descLines = lines.filter(l => !statFields.some(f => l.startsWith(f)) && l !== name && l !== flavor)
  const description = descLines.join('\n').trim()

  const source = text.match(/Published in\s+(.+?)\.?\s*$/im)?.[1] ?? ''

  return {
    name, category: 'ritual', level, rarity: '', price: marketPrice, flavor,
    slot: ritualCategory, enhancement: '', properties: [], powers: [],
    componentCost, keySkill, castTime, duration, ritualCategory,
    source, description,
  }
}
