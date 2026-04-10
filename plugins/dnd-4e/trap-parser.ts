// D&D 4e trap/hazard/terrain HTML parser — build-time only
// Parses raw HTML for traps across three different formats.

export interface TrapAction {
  name: string
  usage: string        // 'At-Will', 'Encounter', 'Recharge', etc.
  action?: string      // 'Standard Actions', 'Triggered Actions', 'Traits', etc.
  trigger?: string
  attack?: string
  hit?: string
  miss?: string
  effect?: string
  sustain?: string
  requirement?: string
}

export interface ParsedTrap {
  name: string
  trapType: string       // 'Trap', 'Hazard', 'Object', 'Terrain'
  level: number
  role: string           // 'Lurker', 'Blaster', 'Warder', etc.
  modifier: string       // 'Elite', 'Solo', ''
  xp: number
  flavor: string
  description: string    // the traplead / main description
  perception: string     // DC info
  additionalSkills: { skill: string; text: string }[]
  initiative: string     // "+3" or "-"
  trigger: string
  attack: string         // full attack text (format 1)
  countermeasures: string[]
  // For newer format (thHead):
  hp?: string
  ac?: string
  defenses?: string      // "Fortitude 15, Reflex 12"
  resist?: string
  immune?: string
  actions?: TrapAction[]
  source: string
}

export interface TrapIndexEntry {
  id: string
  name: string
  trapType: string
  level: number
  role: string
  xp: number
}

/** Normalize initiative: bare numbers get +, em-dashes become - */
function normalizeInitiative(init: string): string {
  if (init === '---' || init === '—') return '-'
  // Bare number without sign → add +
  if (/^\d+$/.test(init)) return '+' + init
  return init
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

function extractText(html: string, regex: RegExp): string {
  const m = html.match(regex)
  return m ? stripHtml(m[1]).trim() : ''
}

const ROLES = ['Lurker', 'Blaster', 'Warder', 'Obstacle', 'Blocker', 'Soldier', 'Skirmisher', 'Controller', 'Artillery', 'Brute', 'Minion']
const MODIFIERS = ['Elite', 'Solo']

function parseRole(text: string): { role: string; modifier: string } {
  let role = '', modifier = ''
  for (const m of MODIFIERS) {
    if (text.includes(m)) { modifier = m; break }
  }
  for (const r of ROLES) {
    if (text.includes(r)) { role = r; break }
  }
  return { role, modifier }
}

/** Parse old-format attack text into a structured TrapAction */
function parseAttackText(text: string): TrapAction {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  // First line is typically: "Immediate Reaction      Melee 1" or "Standard Action      Close burst 3"
  const firstLine = lines[0] ?? ''
  const actionMatch = firstLine.match(/^(Standard Action|Move Action|Minor Action|Free Action|Immediate Reaction|Immediate Interrupt|Opportunity Action|No Action)/i)
  const actionType = actionMatch?.[1] ?? ''
  const rangeInfo = actionType ? firstLine.substring(actionType.length).trim() : firstLine

  // Extract labeled fields from remaining lines
  let target = '', attackRoll = '', hit = '', miss = '', effect = ''
  const remaining: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^(Targets?|Attack|Hit|Miss|Effect|Special|Aftereffect):?\s*(.*)/i)
    if (m) {
      const label = m[1].toLowerCase()
      const val = m[2]
      if (label.startsWith('target')) target = val
      else if (label === 'attack') attackRoll = val
      else if (label === 'hit') hit = val
      else if (label === 'miss') miss = val
      else if (label === 'effect' || label === 'special' || label === 'aftereffect') {
        effect = effect ? effect + '\n' + m[1] + ': ' + val : val
      }
    } else {
      // Continuation of previous field or extra text
      remaining.push(line)
    }
  }

  // If there's remaining text not captured by labels, append to effect
  if (remaining.length > 0) {
    effect = effect ? effect + '\n' + remaining.join('\n') : remaining.join('\n')
  }

  return {
    name: 'Attack',
    usage: 'At-Will',
    action: actionType || undefined,
    trigger: undefined,
    attack: [rangeInfo, target && `(${target})`, attackRoll && `; ${attackRoll}`]
      .filter(Boolean).join(' ') || attackRoll || undefined,
    hit: hit || undefined,
    miss: miss || undefined,
    effect: effect || undefined,
  }
}

/** Split countermeasure strings on bullet points (✦) */
function splitCountermeasures(cms: string[]): string[] {
  const result: string[] = []
  for (const cm of cms) {
    // Split on ✦ bullets, keeping each as a separate entry
    const parts = cm.split(/\n?✦\s*/).map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) result.push(...parts)
    else if (cm.trim()) result.push(cm.trim())
  }
  return result
}

/** Format 1: class=trap — old format */
function parseTrapFormat(html: string): ParsedTrap {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'

  // Type: Trap, Hazard
  const trapType = html.match(/class=type>([^<]+)/)?.[1]?.trim() ?? 'Trap'

  // Level + Role
  const levelText = html.match(/class=level>([^<]+)/)?.[1]?.trim() ?? ''
  const level = parseInt(levelText.match(/Level\s+(\d+)/)?.[1] ?? '0')
  const { role, modifier } = parseRole(levelText)

  // XP
  const xp = parseInt(html.match(/class=xp>XP\s+([\d,]+)/)?.[1]?.replace(/,/g, '') ?? '0')

  // Flavor
  const flavor = extractText(html, /<p class=['"]?flavor['"]?>\s*<i>([\s\S]*?)<\/i>/)

  // Description (traplead — the first one with a bold label)
  const descMatch = html.match(/<span class=traplead><b>[^<]+:<\/b>\s*([\s\S]*?)<\/span>/)
  const description = descMatch ? stripHtml(descMatch[1]) : ''

  // Initiative (from traplead with Initiative)
  const initMatch = html.match(/<b>Initiative<\/b>\s*([^<]+)/)
  const initiative = initMatch ? normalizeInitiative(initMatch[1].trim()) : '-'

  // Parse block sections: trapblocktitle followed by trapblockbody spans
  // Collect all title/body pairs
  const sections: { title: string; bodies: string[] }[] = []
  const sectionRegex = /<span class=trapblocktitle>([\s\S]*?)<\/span>([\s\S]*?)(?=<span class=trapblocktitle>|<p class=['"]?publishedIn|$)/gi
  let sm
  while ((sm = sectionRegex.exec(html)) !== null) {
    const title = stripHtml(sm[1])
    const bodyBlock = sm[2]
    const bodies: string[] = []
    const bodyRegex = /<span class=trapblockbody>([\s\S]*?)<\/span>/gi
    let bm
    while ((bm = bodyRegex.exec(bodyBlock)) !== null) {
      bodies.push(stripHtml(bm[1]))
    }
    sections.push({ title, bodies })
  }

  let perception = ''
  const additionalSkills: { skill: string; text: string }[] = []
  let trigger = ''
  let attack = ''
  const countermeasures: string[] = []

  for (const sec of sections) {
    const t = sec.title.toLowerCase()
    if (t.includes('perception')) {
      perception = sec.bodies.join('\n')
    } else if (t.includes('trigger')) {
      trigger = sec.bodies.join('\n')
    } else if (t.includes('attack')) {
      attack = sec.bodies.join('\n')
    } else if (t.includes('countermeasure')) {
      countermeasures.push(...sec.bodies.filter(b => b.trim()))
    } else {
      // Additional skill sections (Arcana, Religion, Nature, etc.)
      additionalSkills.push({ skill: sec.title, text: sec.bodies.join('\n') })
    }
  }

  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  // Parse old-format attack text into a structured action
  const actions: TrapAction[] = []
  if (attack) {
    actions.push(parseAttackText(attack))
  }

  // Split countermeasures on bullet points
  const splitCMs = splitCountermeasures(countermeasures)

  return {
    name, trapType, level, role, modifier, xp, flavor, description,
    perception, additionalSkills, initiative, trigger, attack: '',
    countermeasures: splitCMs, actions, source,
  }
}

/** Format 2: class=thHead — newer format */
function parseThHeadFormat(html: string): ParsedTrap {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'

  const trapType = html.match(/class=thSubHead>([^<]+)/)?.[1]?.trim() ?? 'Trap'

  const levelText = html.match(/class=thLevel>([^<]+)/)?.[1]?.trim() ?? ''
  const level = parseInt(levelText.match(/Level\s+(\d+)/)?.[1] ?? '0')
  const { role, modifier } = parseRole(levelText)

  const xp = parseInt(html.match(/class=thXP>XP\s+([\d,]+)/)?.[1]?.replace(/,/g, '') ?? '0')

  // Detect/Perception
  const detectMatch = html.match(/<b>Detect<\/b>\s*([^<]+)/)
  const perception = detectMatch ? detectMatch[1].trim() : '-'

  // Initiative
  const initMatch = html.match(/<b>Initiative<\/b>\s*([^<]+)/)
  const initiative = initMatch ? normalizeInitiative(initMatch[1].trim()) : '-'

  // Stats from thStat paragraphs
  let hp = '', ac = '', defenses = '', resist = '', immune = ''
  const statRegex = /<p class=thStat>([\s\S]*?)<\/p>/gi
  let stm
  while ((stm = statRegex.exec(html)) !== null) {
    const block = stm[1]
    const text = stripHtml(block)

    if (/<b>HP<\/b>/i.test(block)) {
      hp = text.replace(/^HP\s*/, '').trim()
    }
    if (/<b>AC<\/b>/i.test(block)) {
      // Full defense line: "AC 16, Fortitude 17, Reflex 15, Will -"
      const acMatch = text.match(/AC\s+(\d+)/)
      ac = acMatch ? acMatch[1] : ''
      // Remaining defenses
      const defParts: string[] = []
      for (const def of ['Fortitude', 'Reflex', 'Will']) {
        const dm = text.match(new RegExp(`${def}\\s+(\\d+|-)`))
        if (dm) defParts.push(`${def} ${dm[1]}`)
      }
      if (defParts.length > 0) defenses = defParts.join(', ')
    }
    if (/<b>Resist<\/b>/i.test(block)) {
      const resistMatch = block.match(/<b>Resist<\/b>\s*([^<;]+)/i)
      resist = resistMatch ? resistMatch[1].trim() : ''
      // Immune may be in same block after semicolon
      const immuneMatch = block.match(/<b>Immune<\/b>\s*([^<]+)/i)
      if (immuneMatch) immune = immuneMatch[1].trim()
    }
    if (/<b>Immune<\/b>/i.test(block) && !immune) {
      const immuneMatch = block.match(/<b>Immune<\/b>\s*([^<]+)/i)
      immune = immuneMatch ? immuneMatch[1].trim() : ''
    }
  }

  // Parse h2 sections for actions, traits, countermeasures
  const actions: TrapAction[] = []
  const countermeasures: string[] = []
  const additionalSkills: { skill: string; text: string }[] = []

  // Split by h2 headers
  const h2Regex = /<h2 class=thHead>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2 class=thHead>|<p class=['"]?publishedIn|$)/gi
  let h2m
  while ((h2m = h2Regex.exec(html)) !== null) {
    const sectionTitle = stripHtml(h2m[1])
    const sectionBody = h2m[2]

    if (sectionTitle.toLowerCase().includes('countermeasure')) {
      // Parse countermeasure entries from thBody paragraphs
      const cmRegex = /<p class=thBody>([\s\S]*?)<\/p>/gi
      let cmm
      while ((cmm = cmRegex.exec(sectionBody)) !== null) {
        const text = stripHtml(cmm[1]).trim()
        if (text) countermeasures.push(text)
      }
    } else {
      // Action/trait section — parse th2 action headers and tbod/thStat detail lines
      const actionRegex = /<p class=th2>([\s\S]*?)<\/p>([\s\S]*?)(?=<p class=th2>|$)/gi
      let am
      while ((am = actionRegex.exec(sectionBody)) !== null) {
        const headerText = stripHtml(am[1])
        const bodyHtml = am[2]

        // Parse name and usage from header: "⚔ Attack ✦ At-Will"
        const usageMatch = headerText.match(/✦\s*(.+)/)
        const usage = usageMatch ? usageMatch[1].trim() : ''
        // Strip icon chars and everything after ✦ to get the clean name
        let actionName = headerText.replace(/[^\x20-\x7E✦]/g, '').replace(/✦.*/, '').replace(/\(\)\s*/g, '').trim()
        // Also strip trailing usage text that may remain (e.g. "At-Will", "Aura 1")
        if (usage) actionName = actionName.replace(new RegExp('\\s*' + usage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'), '').trim()

        const extractField = (label: string): string => {
          const re = new RegExp(`<(?:p class=tbod|p class=thStat)>\\s*<i>${label}<\\/i>\\s*:?\\s*([\\s\\S]*?)<\\/p>`, 'i')
          const m = bodyHtml.match(re)
          return m ? stripHtml(m[1]).replace(/^:\s*/, '').trim() : ''
        }

        actions.push({
          name: actionName,
          usage,
          action: sectionTitle,
          trigger: extractField('Trigger'),
          attack: extractField('Attack'),
          hit: extractField('Hit'),
          miss: extractField('Miss'),
          effect: extractField('Effect(?:\\s*\\([^)]*\\))?'),
          sustain: extractField('Sustain (?:Minor|Move|Standard|Free)') || extractField('Sustain'),
          requirement: extractField('Requirement'),
        })
      }

      // Also handle thStat blocks directly under section (traits with auras etc.)
      if (sectionBody.match(/<p class=thStat>/i) && !sectionBody.match(/<p class=th2>/i)) {
        const traitText = stripHtml(sectionBody)
        if (traitText.trim()) {
          actions.push({
            name: sectionTitle,
            usage: '',
            action: sectionTitle,
            effect: traitText,
          })
        }
      }
    }
  }

  const flavor = '' // thHead format doesn't typically have flavor text
  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  return {
    name, trapType, level, role, modifier, xp, flavor, description: '',
    perception, additionalSkills, initiative,
    trigger: '', attack: '',
    countermeasures: splitCountermeasures(countermeasures),
    hp: hp || undefined,
    ac: ac || undefined,
    defenses: defenses || undefined,
    resist: resist || undefined,
    immune: immune || undefined,
    actions: actions.length > 0 ? actions : undefined,
    source,
  }
}

/** Format 3: class=dm — terrain features */
function parseDmFormat(html: string): ParsedTrap {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'
  const trapType = html.match(/<span class=level>([^<]+)/)?.[1]?.trim() || 'Terrain'
  const levelMatch = trapType.match(/Level\s+(\d+)/i)
  const level = levelMatch ? parseInt(levelMatch[1]) : 0

  // Flavor — italic text in first flavor paragraph
  const flavorMatch = html.match(/<p class=['"]?flavor['"]?>\s*<i>([\s\S]*?)<\/i>/)
  const flavor = flavorMatch ? stripHtml(flavorMatch[1]) : ''

  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  // Check if there are powerstat blocks — if so, parse as structured action
  const hasPowerstat = html.includes('class=powerstat') || html.includes("class='powerstat'")
  if (hasPowerstat) {
    // Extract labeled fields from powerstat and flavor paragraphs
    const fieldRegex = /<p class=['"]?(?:powerstat|flavor)['"]?>\s*<b>([^<]+)<\/b>:?\s*([\s\S]*?)<\/p>/gi
    const fields: Record<string, string> = {}
    let fm
    while ((fm = fieldRegex.exec(html)) !== null) {
      const label = fm[1].replace(/:$/, '').trim()
      const value = stripHtml(fm[2]).trim()
      // Skip if it's the flavor italic paragraph
      if (label === name && !value) continue
      fields[label] = value
    }

    // Also grab bare action type headers: <p class=powerstat><b>Standard Action</b></p>
    const actionTypeMatch = html.match(/<p class=['"]?powerstat['"]?>\s*<b>(Standard Action|Move Action|Minor Action|Free Action|Immediate Reaction|Immediate Interrupt|Opportunity Action)<\/b>\s*<\/p>/i)
    const actionType = actionTypeMatch?.[1] ?? ''

    // Build description from non-power content (flavor paragraphs without bold labels)
    const descParts: string[] = []
    const descRegex = /<p class=['"]?flavor['"]?>\s*(?!<b>|<i>)([\s\S]*?)<\/p>/gi
    let dm2
    while ((dm2 = descRegex.exec(html)) !== null) {
      const t = stripHtml(dm2[1]).trim()
      if (t && t !== flavor) descParts.push(t)
    }
    // Also check for plain <p> blocks with Effect/Usage (non-powerstat)
    const plainRegex = /<p>\s*([\s\S]*?)<\/p>/gi
    let pm
    while ((pm = plainRegex.exec(html)) !== null) {
      const t = stripHtml(pm[1]).trim()
      if (t) descParts.push(t)
    }

    const action: TrapAction = {
      name: 'Attack',
      usage: 'At-Will',
      action: actionType || undefined,
      requirement: fields['Requirement'] || undefined,
      trigger: fields['Trigger'] || undefined,
      attack: [fields['Target'] && `(${fields['Target']})`, fields['Attack']].filter(Boolean).join('; ') || undefined,
      hit: fields['Hit'] || undefined,
      miss: fields['Miss'] || undefined,
      effect: [fields['Success'], fields['Effect']].filter(Boolean).join('\n') || undefined,
    }

    // Check/Success pattern — if there's a Check field, prepend to effect
    if (fields['Check'] && !action.effect?.includes(fields['Check'])) {
      action.effect = [fields['Check'], action.effect].filter(Boolean).join('\n')
    }

    return {
      name, trapType: trapType.replace(/Level\s+\d+\s*/i, '').trim() || 'Terrain',
      level, role: '', modifier: '', xp: 0,
      flavor, description: descParts.join('\n'),
      perception: '', additionalSkills: [], initiative: '-',
      trigger: '', attack: '',
      countermeasures: [],
      actions: [action],
      source,
    }
  }

  // No powerstat — plain description terrain
  const bodyMatch = html.match(/<\/h1>([\s\S]*?)(?:<p class=['"]?publishedIn|$)/)
  const bodyHtml = bodyMatch ? bodyMatch[1] : ''
  const description = stripHtml(bodyHtml)
    .replace(flavor, '')
    .trim()

  return {
    name, trapType: trapType.replace(/Level\s+\d+\s*/i, '').trim() || 'Terrain',
    level, role: '', modifier: '', xp: 0,
    flavor, description,
    perception: '', additionalSkills: [], initiative: '-',
    trigger: '', attack: '',
    countermeasures: [],
    source,
  }
}

export function parseTrapHtml(html: string): ParsedTrap {
  if (html.includes('class=thHead>')) {
    return parseThHeadFormat(html)
  } else if (html.includes('class=dm>')) {
    return parseDmFormat(html)
  } else {
    return parseTrapFormat(html)
  }
}
