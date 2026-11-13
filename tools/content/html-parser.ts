// D&D 4e HTML parser — build-time only
// Parses the raw HTML monster data from iws.mx into structured Creature objects.
// Used by data/build-parsed.ts to pre-parse the corpus. Not bundled with the app.

import { generateId } from '../../src/common/utils/id'
import type { Creature } from '../../src/common/types'
import { allDamageTypes, attackTraits } from '../../src/common/rules/known-values'
import { fixLigatureSplits, normalizeRecharge } from './text-utils'

export interface ParseOptions {
  /**
   * Attach `printed` to each power: the printed text of every labeled line
   * (attack, hit, miss, effect, ...) before damage and crit are split out.
   * The kit converter needs it; the app's parsed JSON leaves it out.
   */
  printed?: boolean
}

/** Parse raw HTML into a Creature. */
export function parseMonsterHtml(html: string, warnings: string[], options: ParseOptions = {}): Creature {
  return _parseMonsterHtml(html, warnings, options)
}

// ─── Strip HTML tags, keeping text content ───
function stripHtml(html: string): string {
  return fixLigatureSplits(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/td>\s*<td[^>]*>/gi, '\n').replace(/<\/tr>\s*<tr[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/^[ \t]+/gm, '').trim())
}

// ─── Extract bold text from HTML ───
function extractBold(html: string): string[] {
  return [...html.matchAll(/<b>([^<]+)<\/b>/g)].map(m => m[1].trim())
}

// ─── Main HTML parser ───
function _parseMonsterHtml(html: string, warnings: string[], options: ParseOptions): Creature {
  const now = new Date().toISOString()

  // ── Header: <h1 class=monster> ──
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const headerHtml = h1Match?.[1] ?? ''
  const name = headerHtml.match(/^([^<]+)/)?.[1]?.trim() ?? 'Unknown'
  const sizeType = headerHtml.match(/<span class=type>([^<]+)/)?.[1]?.trim() ?? ''
  const levelRole = headerHtml.match(/<span class=level>([^<]+)/)?.[1]?.trim() ?? ''
  const xpMatch = headerHtml.match(/<span class=xp>\s*XP\s+(\d+)/)
  const xp = parseInt(xpMatch?.[1] ?? '0')

  // Parse size, origin, type from "Medium natural humanoid human , human"
  const sizeMatch = sizeType.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(.+)/)
  const size = sizeMatch?.[1] ?? 'Medium'
  const typeStr = sizeMatch?.[2] ?? sizeType
  const { origin, type, keywords } = parseTypeLine(typeStr)

  // Parse level and role from "Level 8 Skirmisher (Leader)"
  const lvlMatch = levelRole.match(/Level\s+(\d+)\s+(.+)/)
  const level = parseInt(lvlMatch?.[1] ?? '1')
  const roleRaw = lvlMatch?.[2]?.toLowerCase() ?? ''
  let eliteSolo: string | undefined
  if (roleRaw.includes('solo')) eliteSolo = 'solo'
  else if (roleRaw.includes('elite')) eliteSolo = 'elite'
  const isMinion = roleRaw.includes('minion')
  // Extract role by matching known 4e roles — avoids picking up origin words like "fey", "natural"
  const knownRoles = ['artillery', 'brute', 'controller', 'lurker', 'skirmisher', 'soldier']
  const roleMatch = knownRoles.find(r => roleRaw.includes(r))
  const cleanRole = roleMatch ?? ''

  // ── Stats block: either <table class=bodytable> (newer) or <p class=flavor> (older) ──
  const tableMatch = html.match(/<table class=bodytable>([\s\S]*?)<\/table>/)
  const statsPMatch = html.match(/<p class=['"]?flavor['"]?>([\s\S]*?)<\/p>/)
  const statsHtml = tableMatch?.[1] ?? statsPMatch?.[1] ?? ''
  const statsText = stripHtml(statsHtml)

  const initiative = parseInt(statsText.match(/Initiative\s+\+?(-?\d+)/)?.[1] ?? '0')
  const perception = parseInt(statsText.match(/Perception\s*\+?(-?\d+)/)?.[1] ?? '0')
  // Extract senses — search entire stats text for known sense keywords
  const senseKeywords = ['Darkvision', 'Low-light vision', 'Blindsight \\d+', 'Tremorsense \\d+', 'Truesight \\d+', 'All-around vision']
  const foundSenses: string[] = []
  for (const kw of senseKeywords) {
    const m = statsText.match(new RegExp(kw, 'i'))
    if (m) foundSenses.push(m[0])
  }
  const senses = foundSenses.join(', ')
  const hp = parseInt(statsText.match(/HP\s+(\d+)/)?.[1] ?? '1')
  const defMatch = statsText.match(/AC\s+(\d+)[;,]\s*Fortitude\s+(\d+)[;,]\s*Reflex\s+(\d+)[;,]\s*Will\s+(\d+)/)
  const ac = parseInt(defMatch?.[1] ?? '10')
  const fort = parseInt(defMatch?.[2] ?? '10')
  const ref = parseInt(defMatch?.[3] ?? '10')
  const will = parseInt(defMatch?.[4] ?? '10')
  const savingThrowBonus = parseInt(statsText.match(/Saving Throws\s+\+(\d+)/)?.[1] ?? '0')
  const actionPoints = parseInt(statsText.match(/Action Points?\s+(\d+)/)?.[1] ?? '0')

  // Speed — capture all speed entries including notes like (hover)
  const speedMatch = statsText.match(/Speed\s+(.+?)(?=\n|$)/i)
  const { land, speeds, speedNotes } = parseSpeeds(speedMatch?.[1] ?? '6')

  // Header-line Regeneration (appears between HP and AC in the stats block)
  const headerRegenMatch = statsText.match(/Regeneration\s+(\d+)/i)
  const headerRegenValue = headerRegenMatch ? parseInt(headerRegenMatch[1]) : undefined

  // Immune/Resist/Vulnerable from stats text
  const immuneMatch = statsText.match(/Immune\s+(.+?)(?=\n|Resist|Vulnerable|Saving|$)/i)
  const immunities = immuneMatch ? immuneMatch[1].split(/[,;]/).map(s => ({ type: s.replace(/[;.,\s]+$/, '').trim() })).filter(e => e.type) : []
  const resistMatch = statsText.match(/Resist\s+(.+?)(?=\n|Vulnerable|Saving|$)/i)
  const resistances = resistMatch ? parseResistValues(resistMatch[1].replace(/[;]+$/, '').trim()) : []
  const vulnMatch = statsText.match(/Vulnerable\s+(.+?)(?=\n|Saving|$)/i)
  const weaknesses = vulnMatch ? parseResistValues(vulnMatch[1]) : []

  // Extract regen inhibition from Vulnerable line parenthetical
  let headerRegenInhibit: string[] | undefined
  if (headerRegenValue && vulnMatch) {
    const vulnText = vulnMatch[1]
    const inhibitMatch = vulnText.match(/\(if\b.*?\btakes?\s+([\w\s,]+?)\s+damage.*?regeneration\b.*?\)/i)
    if (inhibitMatch) {
      headerRegenInhibit = inhibitMatch[1].toLowerCase()
        .replace(/\s+from\s+.*$/, '')  // strip "from a silver weapon" etc.
        .split(/(?:\s+or\s+|\s*,\s*)/)
        .map(s => s.trim())
        .filter(Boolean)
    }
  }

  // Auras from stats block (bold name + "aura N;")
  const statsAuras = parseAurasFromStatsHtml(statsHtml, options.printed)

  // ── Powers: <p class='flavor alt'> + <p class=flavorIndent> pairs ──
  const actions = [...statsAuras, ...parsePowersFromHtml(html, warnings, options)]

  // ── Footer: ability scores, skills from <p class='flavor alt'> with Skills/Str ──
  // Alignment, Languages, Equipment from <p class=flavor> with Alignment
  const abilities: Record<string, number> = {}
  const skills: Record<string, number> = {}

  // Find the footer block(s) — may be one or two <p> blocks containing
  // Skills, Str/Dex/etc, Alignment, Languages, Equipment
  // Search all <p> blocks that contain Str or Alignment
  const footerText = stripHtml(
    (html.match(/<p[^>]*>[\s\S]*?<b>Str<\/b>[\s\S]*?<\/p>/)?.[0] ?? '') +
    ' ' +
    (html.match(/<p[^>]*><b>Alignment<\/b>[\s\S]*?<\/p>/)?.[0] ?? '')
  )

  const skillsMatch = footerText.match(/Skills\s+(.+?)(?=\s+Str\s)/i)
  if (skillsMatch) {
    for (const m of skillsMatch[1].matchAll(/(\w+)\s+\+(\d+)/g)) {
      skills[m[1].toLowerCase()] = parseInt(m[2])
    }
  }
  for (const m of footerText.matchAll(/(Str|Dex|Wis|Con|Int|Cha)\s+(\d+)\s*\([+-]?\d+\)/g)) {
    abilities[m[1].toLowerCase()] = parseInt(m[2])
  }
  const alignment = footerText.match(/Alignment\s+(.+?)(?=\s+Languages|\s*$)/i)?.[1]?.trim() ?? ''
  const languages = footerText.match(/Languages\s+(.+?)(?=\n|Skills|Equipment|Str|$)/i)?.[1]?.trim() ?? ''
  const equipment = footerText.match(/Equipment\s*:?\s*(.+?)(?=\.\s*$|$)/i)?.[1]?.trim() ?? ''

  const sizeNames = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
  const filteredKeywords = [...new Set(keywords.filter(s => s && !sizeNames.includes(s)))]

  // Description and published source — appear after the footer
  const descMatch = html.match(/<b>Description<\/b>:?\s*([\s\S]*?)<\/p>/i)
  const description = descMatch ? stripHtml(descMatch[1]).trim() : ''
  const pubMatch = html.match(/<p class=publishedIn>([\s\S]*?)<\/p>/i)
  const source = pubMatch ? stripHtml(pubMatch[1]).replace(/^Published in\s*/i, '').trim() : ''

  // Infer primary ability from highest score
  const primaryAbility = Object.keys(abilities).length > 0
    ? Object.entries(abilities).sort((a, b) => b[1] - a[1])[0][0]
    : undefined

  if (actions.length === 0) warnings.push('No powers or abilities were parsed')

  // ─── Pre-compute trigger classifications on actions ───
  for (const a of actions) {
    const trigger = ((a.trigger as string) ?? '').toLowerCase().replace(/\.$/, '').trim()
    if (trigger) {
      // Classify trigger events
      const triggerEvents: string[] = []
      if (/\bbloodied\b/.test(trigger)) triggerEvents.push('bloodied')
      if (/\breduced to 0\b|\bdrops to 0\b|\bhit points or fewer\b/.test(trigger)) triggerEvents.push('reduced-to-0')
      if (/\btakes damage\b/.test(trigger)) triggerEvents.push('takes-damage')

      if (triggerEvents.length > 0) {
        let triggerSubject: string = 'self'
        if (/\ban ally\b|\ballied\b|\badjacent ally\b/.test(trigger)) triggerSubject = 'ally'
        else if (/\ba creature\b|\ban enemy\b|\ban undead\b|\ba [\w]+ creature\b/.test(trigger)) triggerSubject = 'any-creature'
        a.triggerEvents = triggerEvents
        a.triggerSubject = triggerSubject
      }

      // Flag self-turn-only triggers (should not show as off-turn reactions)
      if (/\b(hits with|misses with|makes an attack|attacks with|scores a critical|makes a melee|makes a ranged)\b/.test(trigger)
        && !/\benemy\b|\ban ally\b|\ba creature\b/.test(trigger)) {
        a.selfTurnOnly = true
      }
      if (/\b(shifts|moves|charges|teleports)\b/.test(trigger)
        && !/\benemy\b|\ban ally\b|\ba creature\b|\bmarked\b/.test(trigger)) {
        a.selfTurnOnly = true
      }
    }

  }

  // ─── Extract regeneration and revival data ───
  let regeneration: { value: number; inhibitDamageTypes?: string[] } | undefined
  let revival: { hp: number; abilityName: string } | undefined

  // Header-line regen (between HP and AC in the stats block)
  if (headerRegenValue) {
    regeneration = { value: headerRegenValue, inhibitDamageTypes: headerRegenInhibit }
  }

  for (const a of actions) {
    const aName = (a.name as string ?? '').toLowerCase()
    const effect = (a.effect as string) ?? ''

    // Action-based Regeneration trait: "regains N hit points whenever it starts its turn"
    if (aName.startsWith('regeneration') && !regeneration) {
      const regenMatch = effect.match(/regains?\s+(\d+)\s+hit points?/i)
      if (regenMatch) {
        const regen: { value: number; inhibitDamageTypes?: string[] } = { value: parseInt(regenMatch[1]) }
        const inhibitMatch = effect.match(/takes?\s+([\w,\s]+?)\s+damage.*(?:doesn't|does not)\s+function/i)
          ?? effect.match(/takes?\s+([\w,\s]+?)\s+damage.*does not regenerate/i)
        if (inhibitMatch) {
          regen.inhibitDamageTypes = inhibitMatch[1].toLowerCase()
            .split(/(?:\s+or\s+|\s*,\s*)/)
            .map(s => s.trim())
            .filter(Boolean)
        }
        regeneration = regen
      }
    }

    // Revival ability (Troll Healing, Rise Again, etc.): "reduced to 0 HP... revives/rises/regains N HP"
    if (!revival && /reduc(?:ed|es)\b.{0,30}\bto 0|drops?\b.{0,30}\bto 0/i.test(effect)) {
      const reviveMatch = effect.match(/(?:regains?|with|returns.*?with|has)\s+(\d+)\s+hit points?/i)
      if (reviveMatch && /(?:rises|regains|returns|revives|next turn)/i.test(effect)) {
        revival = { hp: parseInt(reviveMatch[1]), abilityName: a.name as string }
      }
    }
  }

  return {
    id: generateId(),
    name,
    hp,
    maxHp: hp,
    statBlock: {
      size, level, role: cleanRole, monsterModifier: eliteSolo, isMinion: isMinion || undefined, leader: roleRaw.includes('leader') || undefined, ac,
      defenses: { fortitude: fort, reflex: ref, will },
      initiative, perception, senses,
      speed: land, speeds, speedNotes: speedNotes || undefined,
      abilities, primaryAbility,
      origin, creatureType: type, subtypes: filteredKeywords,
      immunities, resistances, weaknesses,
      skills, alignment, languages, equipment,
      xp, savingThrowBonus, actionPoints,
      description, source,
      actions,
      regeneration,
      ...(options.printed && headerRegenMatch ? { printed: { regeneration: statsText.match(/Regeneration[^\n]*/i)?.[0]?.trim() } } : {}),
      revival,
    },
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Parse powers from HTML <p> tag pairs ───
function parsePowersFromHtml(html: string, warnings: string[], options: ParseOptions): any[] {
  const results: any[] = []

  // Collect all <h2> and <p> blocks in document order
  const allBlocks: { type: 'section' | 'header' | 'body'; html: string }[] = []
  const blockRegex = /<(h2|p)\s*(?:class=['"]?([^'">\s]+(?:\s+[^'">\s]+)?)['"]?)?\s*>([\s\S]*?)<\/\1>/g
  let bm
  while ((bm = blockRegex.exec(html)) !== null) {
    const tag = bm[1]
    const cls = bm[2] ?? ''
    const content = bm[3]
    if (tag === 'h2') {
      allBlocks.push({ type: 'section', html: content })
    } else if (cls.includes('flavor') && cls.includes('alt')) {
      allBlocks.push({ type: 'header', html: content })
    } else if (cls === 'flavorIndent') {
      allBlocks.push({ type: 'body', html: content })
    }
  }

  let currentSection = ''
  let currentHeader: string | null = null
  let currentBody: string[] = []

  function sectionToDefault(section: string): string {
    if (section.includes('minor')) return 'minor'
    if (section.includes('move')) return 'move'
    if (section.includes('triggered')) return 'triggered'
    if (section.includes('free')) return 'free'
    return 'standard'
  }

  function flushPower() {
    if (!currentHeader) return
    const parsed = parseOneAbility(currentHeader, currentBody, sectionToDefault(currentSection), warnings, options)
    if (parsed) results.push(parsed)
    currentHeader = null
    currentBody = []
  }

  for (const block of allBlocks) {
    if (block.type === 'section') {
      flushPower()
      currentSection = stripHtml(block.html).toLowerCase()
    } else if (block.type === 'header') {
      if (block.html.includes('<b>Alignment</b>') || block.html.includes('<b>Str</b>') ||
          (block.html.includes('<b>Skills</b>') && block.html.includes('<b>Str</b>'))) {
        flushPower()
        break
      }
      flushPower()
      currentHeader = block.html
    } else {
      if (block.html.includes('<b>Str</b>') && block.html.includes('<b>Con</b>')) {
        flushPower()
        break
      }
      currentBody.push(block.html)
    }
  }
  flushPower()

  return results
}

// ─── Header keyword cleanup ───
// Header bolds after ✦ mix real keywords with usage metadata ("Encounter",
// "Recharge", "2/Encounter", "At-Will (1/round)"). Split the two apart.
interface HeaderKeywords {
  keywords: string[]
  usage?: 'encounter' | 'daily' | 'recharge'
  encounterUses?: number
  /** "1/round" frequency limits, reported as requirements. */
  frequency: string[]
}

export function cleanHeaderKeywords(bolds: string[]): HeaderKeywords {
  const out: HeaderKeywords = { keywords: [], frequency: [] }
  const parts = bolds.flatMap(k => k.split(/[,;]/)).map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    const lower = part.toLowerCase()
    let m: RegExpMatchArray | null
    if (lower === 'at-will') continue
    if (lower === 'encounter') { out.usage = 'encounter'; continue }
    if (lower === 'daily') { out.usage = 'daily'; continue }
    if ((m = lower.match(/^(\d+)\/encounter(?:\s*\((\d+\/\w+)\))?$/))) {
      out.usage = 'encounter'
      out.encounterUses = parseInt(m[1])
      if (m[2]) out.frequency.push(m[2])
      continue
    }
    if ((m = lower.match(/^at-will\s*\((\d+)\/(\w+)\)$/))) {
      if (m[2] === 'encounter') { out.usage = 'encounter'; out.encounterUses = parseInt(m[1]) }
      else out.frequency.push(`${m[1]}/${m[2]}`)
      continue
    }
    // "Recharge", "Recharge 5", "or when first bloodied": the condition itself
    // is read from the header text, so the fragments are dropped here.
    if (/^recharge\b/.test(lower) || /^(?:or|and)\b.*\b(?:recharge|bloodied)\b/.test(lower) || /^[1-6⚀-⚅\s]+$/.test(lower)) {
      out.usage = 'recharge'
      continue
    }
    // "Acid, Cold, or Poison" split on commas leaves "or Poison".
    out.keywords.push(part.replace(/^(?:or|and)\s+/i, ''))
  }
  return out
}

// ─── Range, target and notes from an attack's range part ───
// "Close burst 5; targets enemies" / "Ranged 10 (one creature)" / "Melee 1 or Ranged 10"
export function parseRangePart(rangePart: string): { rangeType: string; rangeValue: string; target: string; notes: string[] } {
  const segs = rangePart.split(/\s*;\s*/).map(s => s.trim()).filter(Boolean)
  let target = ''
  const notes: string[] = []
  let rangeType = 'melee'
  let rangeValue = ''
  const first = segs[0] ?? ''
  if (/^targets?\b/i.test(first)) {
    // No range at all: "Targets the triggering enemy"
    target = first.replace(/^targets?\s+/i, '')
  } else {
    rangeType = parseRangeType(first)
    const paren = first.match(/\((.+)\)\s*$/)
    if (paren) target = paren[1].trim()
    const value = parseRangeValue(first)
    const lead = value.match(/^(?:\d+(?:\/\d+)?(?:\s+within\s+\d+)?(?:\s+squares?)?|sight|touch)\b/i)
    rangeValue = lead ? lead[0].replace(/\s+squares?$/i, '') : ''
    const rest = lead ? value.substring(lead[0].length).replace(/^[\s,.]+/, '') : value
    if (rest) notes.push(rest)
  }
  for (const seg of segs.slice(1)) {
    if (!target) target = seg.replace(/^targets?\s+/i, '')
    else notes.push(seg)
  }
  return { rangeType, rangeValue, target, notes }
}

const LEADING_RANGE = /^((?:close burst|close blast|area burst|area wall|ranged|melee|reach)\b[^;.()]*(?:\([^)]*\))?)\s*[;.]\s*/i

/**
 * Pull a leading range ("Close burst 5; ...", "Ranged sight (one creature). ...")
 * off the front of a utility power's effect text.
 */
export function splitLeadingRange(text: string): { range: string; target: string; rest: string } | null {
  const m = text.match(LEADING_RANGE)
  if (!m) return null
  let rest = text.substring(m[0].length)
  let target = ''
  const t = rest.match(/^targets?\s+([^;.]+);\s*/i)
  if (t) { target = t[1].trim(); rest = rest.substring(t[0].length) }
  rest = rest.replace(/^Effect:\s*/i, '')
  return { range: m[1].trim(), target, rest }
}

/** Action type named in a body label's parenthetical: "attack (immediate reaction)". */
export function labelActionType(label: string): string | undefined {
  const m = label.match(/\((free action|immediate interrupt|immediate reaction|no action|opportunity action)\)/i)
  if (!m) return undefined
  const a = m[1].toLowerCase()
  if (a.includes('free')) return 'free'
  if (a.includes('interrupt')) return 'immediate-interrupt'
  if (a.includes('reaction')) return 'immediate-reaction'
  if (a.includes('opportunity')) return 'opportunity'
  return 'no-action'
}

/** "ACThe" (text run into the defense) -> "AC"; unknown defenses unchanged. */
export function normalizeDefense(raw: string): string {
  const m = raw.match(/^(AC|Fortitude|Reflex|Will)/i)
  if (!m) return raw
  const d = m[1].toLowerCase()
  return d === 'ac' ? 'AC' : d.charAt(0).toUpperCase() + d.slice(1)
}

// ─── Parse a single ability from its header HTML and body block HTMLs ───
function parseOneAbility(headerHtml: string, bodyBlocks: string[], sectionDefault: string = 'standard', warnings: string[] = [], options: ParseOptions = {}): any | null {
  const headerText = stripHtml(headerHtml)
  const bolds = extractBold(headerHtml)

  if (!headerText || headerText.length < 2) return null

  // Extract icon
  const iconMatch = headerText.match(/^[\s(]?([⚔➶ᗕ✻☼])\)?\s*/)
  const icon = iconMatch?.[1] ?? ''
  const afterIcon = headerText.substring(iconMatch?.[0]?.length ?? 0)

  // Name = first bold in header
  const name = bolds[0] ?? afterIcon.match(/^([A-Z][\w\s'\-]+?)(?:\s+[✦(]|\s*$)/)?.[1]?.trim() ?? afterIcon.trim()
  if (!name || name.length < 2) return null

  // Keywords = bold words after ✦, minus usage metadata. Some entries pack
  // several keywords into one <b> tag ("<b>Healing, Weapon</b>").
  const hasStarKeywords = headerText.includes('✦')
  const headerKw = cleanHeaderKeywords(hasStarKeywords ? bolds.slice(1) : [])
  const keywords = headerKw.keywords

  // Parse action paren
  const parenMatch = afterIcon.match(/\(([^)]+)\)/)
  const actionParen = parenMatch?.[1] ?? ''
  const parsed = parseActionParen(actionParen)
  let { actionType, usage: finalUsage, trigger, requirement, sustain, rechargeCondition, parenKeywords, unrecognized } = parsed
  let encounterUses = headerKw.encounterUses
  if (headerKw.frequency.length > 0) requirement = [requirement, ...headerKw.frequency].filter(Boolean).join('; ')

  // Merge keywords from paren into the header keywords
  if (parenKeywords.length > 0) keywords.push(...parenKeywords)

  // Warn about unrecognized paren segments
  if (unrecognized.length > 0) {
    warnings.push(`${name}: unrecognized paren segment(s): ${unrecognized.map(s => '"' + s + '"').join(', ')}`)
  }

  // Usage from the header after ✦ if the paren didn't specify one. "Recharge"
  // may be bold or plain text ("✦ Recharge ⚄ ⚅"); its condition follows it.
  if (finalUsage === 'at-will' && hasStarKeywords) {
    const afterStar = afterIcon.substring(afterIcon.indexOf('✦') + 1)
    const rcMatch = afterStar.match(/\bRecharge\b\s*([^✦]*)/i)
    if (rcMatch) {
      finalUsage = 'recharge'
      const rc = normalizeRecharge(rcMatch[1].replace(/[,.;]+$/, ''))
      if (!rechargeCondition && rc) rechargeCondition = rc
    } else if (headerKw.usage) {
      finalUsage = headerKw.usage
    }
  }

  // ─── Parse each body block by its <i> label ───
  const fields: Record<string, string> = {}
  let unlabeledText = ''

  // After a "Secondary Attack" line, the Hit/Miss/Effect lines that follow
  // belong to the secondary attack, not the primary one.
  let inSecondary = false
  for (const blockHtml of bodyBlocks) {
    const labelMatch = blockHtml.match(/<i>([^<]+)<\/i>\s*/)
    if (labelMatch) {
      const label = labelMatch[1].replace(/:$/, '').trim().toLowerCase()
      const value = stripHtml(blockHtml.substring(labelMatch.index! + labelMatch[0].length)).trim()
      // "Attack (Immediate Reaction):", "Effect (No Action):", "Trigger (Free Action):"
      const labelAction = /^(attack|effect|trigger)\b/.test(label) ? labelActionType(label) : undefined
      if (labelAction) actionType = labelAction
      if (label.startsWith('secondary') || label.startsWith('tertiary')) {
        inSecondary = true
        fields.secondary = (fields.secondary ? fields.secondary + ' ' : '') + value
      }
      else if (inSecondary && /^(hit|miss|effect)\b/.test(label)) {
        const sub = label.replace(/\s*\(.*$/, '')
        fields['secondary ' + sub] = value
      }
      else if (label.startsWith('attack')) fields.attack = (fields.attack ? fields.attack + ' ' : '') + value
      else if (label.startsWith('hit')) fields.hit = value
      else if (label.startsWith('miss')) fields.miss = value
      else if (label.startsWith('effect')) fields.effect = value
      else if (label.startsWith('trigger')) fields.trigger = value
      else if (label.startsWith('sustain')) { fields.sustain = value; sustain = label.replace('sustain', '').trim() || value }
      else if (label.startsWith('aftereffect')) fields.aftereffect = value
      else if (label.startsWith('requirement')) fields.requirement = value
      else fields[label] = value
    } else {
      unlabeledText += (unlabeledText ? '\n' : '') + stripHtml(blockHtml)
    }
  }

  // Use section header for action type if paren didn't specify
  const parenHasAction = /\b(standard|minor|move|free|immediate|encounter|at-will|recharge|daily)\b/i.test(actionParen)
  if (actionType === 'standard' && !parenHasAction && sectionDefault !== 'standard') {
    if (sectionDefault === 'triggered') {
      if (actionType === 'standard') actionType = 'free'
    } else {
      actionType = sectionDefault
    }
  }

  // Usage from unlabeled body start
  if (finalUsage === 'at-will' && unlabeledText) {
    const bodyUsage = unlabeledText.match(/^(At-Will|Encounter|Daily)/i)
    if (bodyUsage) {
      const u = bodyUsage[1].toLowerCase()
      if (u === 'encounter') finalUsage = 'encounter'
      else if (u === 'daily') finalUsage = 'daily'
    }
  }

  // Recharge from body if not in paren
  if (finalUsage === 'recharge' && !rechargeCondition && unlabeledText) {
    const rc = unlabeledText.match(/[Rr]echarge\s+(.+?)(?=\s+Attack:|\s+Effect:|\n|$)/i)
    if (rc) rechargeCondition = normalizeRecharge(rc[1])
  }

  // Printed text of each line, before damage and crit are split out (converter input)
  const printed: Record<string, string> = { ...fields }
  if (unlabeledText) printed.body = unlabeledText

  // Trait (no icon, no action paren, no ✦)
  if (!icon && !actionParen && !hasStarKeywords) {
    const text = unlabeledText || Object.values(fields).join(' ')
    return {
      name, entryType: 'trait', actionType: '', usage: '',
      keywords: [], rangeType: '', rangeValue: '', target: '',
      attackBonus: null, attackNotes: '', defense: '', damage: [],
      hit: '', miss: '', effect: text.substring(0, 500),
      trigger: '', requirement: '', sustain: '',
      ...(options.printed ? { printed: { text } } : {}),
    }
  }

  // Aura
  const allBodyText = unlabeledText + ' ' + Object.values(fields).join(' ')
  if (icon === '☼' || allBodyText.toLowerCase().startsWith('aura') || afterIcon.toLowerCase().includes('aura')) {
    const auraRange = parseInt((afterIcon + ' ' + allBodyText).match(/[Aa]ura\s+(\d+)/)?.[1] ?? '1')
    const text = allBodyText.replace(/^Aura\s+\d+\s*/i, '')
    return {
      name, entryType: 'aura', actionType: '', usage: '',
      keywords, rangeType: '', rangeValue: '', target: '',
      attackBonus: null, attackNotes: '', defense: '', damage: [],
      hit: '', miss: '',
      effect: text.substring(0, 500),
      trigger: '', requirement: '', sustain: '', auraRange,
      ...(options.printed ? { printed: { text: text.trim() } } : {}),
    }
  }

  // ─── Build result from labeled fields ───
  let rangeType = icon === '➶' || icon === '✻' ? 'ranged' : icon === 'ᗕ' ? 'close-burst' : 'melee'
  let rangeValue = ''
  let target = ''
  let attackBonus: number | null = null
  const notes: string[] = []
  let defense = 'AC'
  let damageRaw = ''
  let hit = ''
  let critical = ''
  let miss = fields.miss ?? ''
  let effect = fields.effect ?? ''

  // Use trigger from body or paren
  if (!trigger && fields.trigger) trigger = fields.trigger

  // Parse Attack field
  if (fields.attack) {
    const atkLabeled = fields.attack.match(/(.+?)\s*;\s*\+(\d+)\s+vs\.?\s*(\w+)/)
    if (atkLabeled) {
      const r = parseRangePart(atkLabeled[1].trim())
      rangeType = r.rangeType
      rangeValue = r.rangeValue
      target = r.target
      notes.push(...r.notes)
      attackBonus = parseInt(atkLabeled[2])
      defense = normalizeDefense(atkLabeled[3])
      // Text after the defense ("vs. ACIf Vestapalk targets only one creature, ...")
      const tail = (atkLabeled[3].substring(defense.length) + fields.attack.substring(atkLabeled.index! + atkLabeled[0].length))
        .replace(/^[\s.;,]+/, '').trim()
      if (tail) notes.push(tail)
    }
  } else if (unlabeledText) {
    // Inline format
    const atkRollMatch = unlabeledText.match(/\+(\d+)\s+vs\.?\s*(\w+)\s*;\s*(.+)/is)
    if (atkRollMatch) {
      attackBonus = parseInt(atkRollMatch[1])
      defense = normalizeDefense(atkRollMatch[2])

      const beforeAtk = unlabeledText.substring(0, atkRollMatch.index).trim().replace(/;$/, '').trim()
      if (beforeAtk) {
        const r = parseRangePart(beforeAtk)
        rangeType = r.rangeType
        rangeValue = r.rangeValue
        target = r.target
        notes.push(...r.notes)
      }

      let afterAtk = atkRollMatch[3].trim()
      const lp = afterAtk.match(/^\(([^)]+)\)\s*;?\s*/)
      if (lp) {
        afterAtk = afterAtk.substring(lp[0].length)
        if (lp[1].startsWith('+')) notes.push(lp[1])
        else if (!target) target = lp[1]
        else notes.push(lp[1])
      }
      // Inline labels; "Aftereffect:" must not be read as "Effect:".
      const missInline = unlabeledText.match(/\bMiss:\s*(.+?)(?=\s+(?<![A-Za-z])(?:Effect|Aftereffect):|\n|$)/i)
      if (missInline && !miss) miss = missInline[1].trim()
      const effInline = unlabeledText.match(/(?<![A-Za-z])Effect:\s*(.+?)(?=\n|$)/i)
      if (effInline && !effect) effect = effInline[1].trim()
      const aftInline = unlabeledText.match(/\bAftereffect:\s*(.+?)(?=\s+(?:(?<![A-Za-z])Effect|Miss):|\n|$)/i)
      if (aftInline && !fields.aftereffect) fields.aftereffect = aftInline[1].trim()
      const em = afterAtk.match(/^(.+?)\s*(?:(?<![A-Za-z])Effect:|Aftereffect:|Miss:)/i)
      if (em) afterAtk = em[1].trim()
      printed.hit = afterAtk
      if (missInline) printed.miss = missInline[1].trim()
      if (effInline) printed.effect = effInline[1].trim()
      if (aftInline) printed.aftereffect = aftInline[1].trim()

      // Extract crit/critical parentheticals into the critical field before stripping
      const critParenMatch = afterAtk.match(/\((?:on\s+)?crit(?:ical)?\s+([^)]*)\)/i)
      if (critParenMatch && !critical) critical = critParenMatch[1].trim()
      const critParenMatch2 = afterAtk.match(/\(([^)]*critical hit[^)]*)\)/i)
      if (critParenMatch2 && !critical) critical = critParenMatch2[1].trim()
      // Now strip them so they don't leak into damage parts
      afterAtk = afterAtk.replace(/\s*\((?:on\s+)?crit(?:ical)?[^)]*\)/gi, '').trim()
      afterAtk = afterAtk.replace(/\s*\([^)]*critical hit[^)]*\)/gi, '').trim()

      const hasDamageExpr = /\d+d\d+|\d+\s+damage\b/i.test(afterAtk)
      if (hasDamageExpr) {
        const split = splitDamageFromHit(afterAtk)
        damageRaw = split.damage
        if (split.hit) hit = split.hit
        if (split.critical) critical = split.critical
      } else {
        effect = effect || afterAtk.replace(/^[;,.\s]+/, '').replace(/\.\s*$/, '')
      }
    }
  }

  // Parse Hit field — extract leading damage expression, rest is hit effect
  if (fields.hit) {
    const split = splitDamageFromHit(fields.hit)
    damageRaw = split.damage
    hit = split.hit
    if (split.critical) critical = split.critical
  }

  // If no attack/damage/hit found, entire body is the effect
  if (attackBonus == null && !damageRaw && !hit && !effect) {
    effect = allBodyText.substring(0, 500)
  }

  // Utility powers print their range at the front of the effect:
  // "Close burst 5; targets allies; each target ..." — move it to the range fields.
  if (attackBonus == null && !rangeValue) {
    const lead = splitLeadingRange(effect.trim())
    if (lead) {
      const r = parseRangePart(lead.range)
      rangeType = r.rangeType
      rangeValue = r.rangeValue
      target = lead.target || r.target
      notes.push(...r.notes)
      effect = lead.rest
    }
  }

  if (fields.requirement) requirement = requirement ? requirement + '; ' + fields.requirement : fields.requirement

  // Parse damageRaw into structured DamagePart[]
  const damage = parseDamageParts(damageRaw, allDamageTypes)

  // "ongoing 5 fire damage (save ends)": once the ongoing part is structured,
  // the "(save ends)" left at the front of the hit text belongs to it.
  const lastPart = damage[damage.length - 1]
  const orphanSave = hit.match(/^\(save ends\)\s*[.,;]?\s*/i)
  if (orphanSave && lastPart?.ongoing) {
    lastPart.saveEnds = true
    hit = hit.substring(orphanSave[0].length)
  }

  // Clean leading conjunctions from hit text
  hit = hit.replace(/^and\s+/i, '')

  // Extract (crit ...) from effect field if not already captured
  if (!critical && effect) {
    const effCritMatch = effect.match(/\((?:on\s+)?crit(?:ical)?\s+([^)]*)\)/i)
    if (effCritMatch) {
      critical = effCritMatch[1].trim()
      effect = effect.replace(/\s*\((?:on\s+)?crit(?:ical)?[^)]*\)/gi, '').trim()
    }
  }

  function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

  /** Clean redundant phrases from critical text, keeping just the damage/effect */
  function cleanCritical(c: string): string {
    if (!c) return ''
    let s = c.trim().replace(/\.+$/, '')
    // Strip "on a critical hit" / "on critical hit" (trailing or mid-string before comma/and)
    s = s.replace(/\s+on (?:a )?critical hit\b,?\s*/i, ' ')
    // Strip "if X scores a critical hit" (trailing or mid-string)
    s = s.replace(/\s+if .+ scores a critical hit\b,?\s*/i, ' ')
    // Strip "damage if X scores a critical hit" at end
    s = s.replace(/\s+damage if .+ scores a critical hit$/i, '')
    // Strip "damage" after a number/expr where it's redundant (e.g., "4d12 + 49 damage")
    s = s.replace(/(\d)\s+damage(?=\s*$|\s*,|\s+and\b|\s+plus\b)/i, '$1')
    // Strip leading "on a critical hit, " / "if X scores a critical hit, "
    s = s.replace(/^on a critical hit,?\s*/i, '')
    s = s.replace(/^if .+ scores a critical hit,?\s*/i, '')
    // Strip "Critical Hit: " prefix
    s = s.replace(/^Critical Hit:\s*/i, '')
    return s.trim()
  }

  return {
    name, entryType: 'action', actionType, usage: finalUsage,
    basicAttack: /^\s*\(\s*⚔\s*\)/.test(headerText) ? 'melee' : /^\s*\(\s*[➶✻]\s*\)/.test(headerText) ? 'ranged' : undefined,
    rechargeCondition: rechargeCondition || undefined,
    encounterUses,
    keywords, rangeType, rangeValue, target, attackBonus, attackNotes: notes.join('; '), defense,
    damage, hit: cap(hit), miss: cap(miss), effect: cap(effect),
    secondary: fields.secondary
      ? cap([fields.secondary, ...['hit', 'miss', 'effect'].filter(k => fields['secondary ' + k]).map(k => `${cap(k)}: ${fields['secondary ' + k]}`)].join(' '))
      : undefined,
    aftereffect: fields.aftereffect ? cap(fields.aftereffect) : undefined,
    critical: cleanCritical(critical) || undefined,
    trigger: cap(trigger), requirement, sustain,
    ...(options.printed ? { printed } : {}),
  }
}

// ─── Parse auras from the stats <p class=flavor> HTML ───
function parseAurasFromStatsHtml(statsHtml: string, printed = false): any[] {
  const results: any[] = []
  const auraRegex = /<b>([^<]+)<\/b>\s*aura\s+(\d+)\s*;\s*(.+?)(?=<br|<\/p|$)/gi
  let m
  while ((m = auraRegex.exec(statsHtml)) !== null) {
    const name = m[1].trim()
    if (['HP', 'AC', 'Initiative', 'Perception', 'Speed', 'Immune', 'Resist'].includes(name)) continue
    results.push({
      name, entryType: 'aura', actionType: '', usage: '',
      keywords: [], rangeType: '', rangeValue: '', target: '',
      attackBonus: null, attackNotes: '', defense: '', damage: [],
      hit: '', miss: '', effect: stripHtml(m[3]).substring(0, 250),
      trigger: '', requirement: '', sustain: '', auraRange: parseInt(m[2]),
      ...(printed ? { printed: { text: stripHtml(m[3]) } } : {}),
    })
  }
  return results
}

// ─── Parse damage text into structured DamagePart[] ───
interface DamagePart { expr: string; type: string; ongoing: boolean; saveEnds?: true }

// ─── Split a Hit/damage text into damage expression(s) and hit effect ───
// Scans tokens from the start, consuming while they look like damage components.
// Stops at the first token that can't be part of a damage expression.
//
// Damage tokens: digits, dice (1d8), operators (+/-), damage type words,
// "damage", "ongoing", "plus", "and" (between types), "(crit ...)" parens.
// Everything after the last damage token is hit effect text, cut from the
// original string so its spacing and punctuation survive.

const DAMAGE_TYPES_SET = new Set(['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'])

/** Hit text that qualifies the damage before it: "plus 1d6 damage if the target is prone". */
const CONDITIONAL_TAIL = /^(?:extra|if|against|when|while|for|per|to|on|instead)$/i

export function splitDamageFromHit(text: string): { damage: string; hit: string; critical: string } {
  const trimmed = text.trim()
  // Tokenize: split on whitespace but keep parenthesized groups together
  const tokens: string[] = []
  const starts: number[] = []
  let i = 0
  while (i < trimmed.length) {
    // Skip whitespace
    while (i < trimmed.length && /\s/.test(trimmed[i])) i++
    if (i >= trimmed.length) break
    const start = i
    // Parenthesized group
    if (trimmed[i] === '(') {
      let depth = 1
      i++
      while (i < trimmed.length && depth > 0) {
        if (trimmed[i] === '(') depth++
        else if (trimmed[i] === ')') depth--
        i++
      }
    } else {
      // Regular token: up to next whitespace or paren
      while (i < trimmed.length && !/[\s(]/.test(trimmed[i])) i++
    }
    tokens.push(trimmed.substring(start, i))
    starts.push(start)
  }

  function isDamageToken(t: number): boolean {
    const tok = tokens[t]
    const nextTok = tokens[t + 1]
    const lower = tok.toLowerCase().replace(/[.,;:]+$/, '')
    // Pure punctuation — skip
    if (!lower) return true
    // Arithmetic operators between dice/numbers: "+", "-"
    if ((lower === '+' || lower === '-') && nextTok && /^\d/.test(nextTok)) return true
    // Dice expression: 1d8, 2d12+6, 4, 10
    if (/^\d+d\d+([+\-]\d+)?$/.test(lower)) return true
    // Flat number (but only if not followed by prose — "4 damage" ok, "4 squares" not)
    if (/^\d+$/.test(lower)) {
      if (!nextTok) return true
      const nextLower = nextTok.toLowerCase().replace(/[.,;:]+$/, '')
      return DAMAGE_TYPES_SET.has(nextLower) || nextLower === 'damage' || nextLower === 'plus'
        || nextLower === 'ongoing' || /^\d/.test(nextLower) || nextTok.startsWith('(')
    }
    // Known damage type words
    if (DAMAGE_TYPES_SET.has(lower)) return true
    // "damage" keyword
    if (lower === 'damage') return true
    // "ongoing" — only if followed by a number
    if (lower === 'ongoing' && nextTok && /^\d/.test(nextTok)) return true
    // "plus" — only if followed by another damage token
    if (lower === 'plus' && nextTok && isDamageToken(t + 1)) return true
    // "and" / "or" between damage types: "fire and necrotic damage", "cold or fire damage"
    if ((lower === 'and' || lower === 'or') && nextTok && DAMAGE_TYPES_SET.has(nextTok.toLowerCase().replace(/[.,;:]+$/, ''))) return true
    // Crit parens: "(crit ...)" or "(critical ...)" — may be unclosed in source
    if (tok.startsWith('(') && /crit/i.test(tok)) return true
    return false
  }

  // Consume damage tokens from the front
  let lastDmgIdx = -1
  for (let t = 0; t < tokens.length; t++) {
    if (isDamageToken(t)) lastDmgIdx = t
    else break
  }

  // A trailing "plus 1d6" whose sentence goes on ("extra damage against a
  // prone target", "damage if the target is immobilized") is conditional:
  // give the whole "plus ..." clause back to the hit text.
  // (Critical-hit tails are handled below.)
  if (lastDmgIdx >= 0 && lastDmgIdx + 1 < tokens.length && CONDITIONAL_TAIL.test(tokens[lastDmgIdx + 1])
      && !/[.;]$/.test(tokens[lastDmgIdx])
      && !/^[^.]*critical hit/i.test(trimmed.substring(starts[lastDmgIdx + 1]))) {
    for (let t = lastDmgIdx; t > 0; t--) {
      if (tokens[t].toLowerCase() === 'plus') { lastDmgIdx = t - 1; break }
    }
  }

  if (lastDmgIdx < 0) {
    return { damage: '', hit: trimmed, critical: '' }
  }

  const damage = tokens.slice(0, lastDmgIdx + 1).join(' ')
  let hit = lastDmgIdx + 1 < tokens.length ? trimmed.substring(starts[lastDmgIdx + 1]) : ''
  // Strip leading punctuation and conjunctions from hit text.
  // Keep "or" when followed by a dice/number expression (it's an alternative damage, not a stray conjunction).
  hit = hit.replace(/^[.,;:]+\s*/, '').replace(/^and\s+/i, '').replace(/^or\s+(?!\d)/i, '')
  // Extract critical hit info into a separate field
  let critical = ''
  if (/\bcritical hit\b/i.test(hit)) {
    // Pure crit: "1d12 + 23 on a critical hit" or "3d10+59 if X scores a critical hit"
    if (/^\d.*\bcritical hit\b/i.test(hit) || /^(if |on a ).*critical hit/i.test(hit)) {
      critical = hit.replace(/\.+$/, '')
      hit = ''
    } else {
      // Mixed: "X can shift 1 square. On a critical hit, deals 2d4+20."
      const critMatch = hit.match(/^(.*?)\.\s*((?:On a critical hit|If .* scores a critical hit|Critical Hit:).+)$/i)
      if (critMatch) {
        hit = critMatch[1].trim() + '.'
        critical = critMatch[2].replace(/\.+$/, '')
      }
    }
  }
  return { damage, hit, critical }
}

function parseDamageParts(raw: string, knownTypes: string[]): DamagePart[] {
  if (!raw || !raw.trim()) return []

  // "2d6 damage + 3d6 fire damage" is two parts, like "2d6 damage plus 3d6 fire damage".
  const segments = raw.split(/\s+(?:plus|and)\s+|,\s+(?=(?:ongoing\s+)?\d)|(?<=\bdamage),?\s+\+\s+(?=\d)/i)
  const typePat = knownTypes.length > 0 ? new RegExp('\\b(' + knownTypes.join('|') + ')\\b', 'i') : null
  const parts: DamagePart[] = []

  for (let seg of segments) {
    seg = seg.trim()
    if (!seg) continue

    seg = seg.replace(/\s*damage\b/gi, '').trim()
    seg = seg.replace(/[.,;]+$/, '').trim()
    // Strip crit parens — may be unclosed in source data
    seg = seg.replace(/\s*\(crit(?:ical)?[^)]*\)?/i, '').trim()

    if (!seg) continue

    const ongoingMatch = seg.match(/^ongoing\s+(.+)/i)
    const ongoing = !!ongoingMatch
    if (ongoingMatch) seg = ongoingMatch[1].trim()

    // Extract all damage types (may be comma-separated: "cold, fire, lightning")
    let type = ''
    if (typePat) {
      const foundTypes: string[] = []
      let m
      const globalPat = new RegExp('\\b(' + knownTypes.join('|') + ')\\b', 'gi')
      while ((m = globalPat.exec(seg)) !== null) foundTypes.push(m[1].toLowerCase())
      if (foundTypes.length > 0) {
        type = foundTypes.join(', ')
        seg = seg.replace(globalPat, '').trim()
      }
    }

    // Clean up leftover punctuation, commas, "and"/"or" between stripped types
    seg = seg.replace(/\s*,\s*/g, ' ').replace(/\s+(?:and|or)\s+/gi, ' ').trim()
    // Compact spaces around arithmetic operators and normalize dice (3D10 → 3d10)
    seg = seg.replace(/\s*([+\-])\s*/g, '$1').replace(/(\d+)D(\d+)/g, '$1d$2').trim()
    // Strip any remaining non-expression characters (parens with bonus info, etc.)
    seg = seg.replace(/\s*\([^)]*\)\s*/g, '').trim()
    if (!seg) continue

    parts.push({ expr: seg, type, ongoing })
  }

  return parts
}

// ─── Helpers ───

function parseTypeLine(typeStr: string): { origin: string; type: string; keywords: string[] } {
  const knownOrigins = new Set(['aberrant', 'elemental', 'fey', 'immortal', 'natural', 'shadow'])
  const knownTypes = new Set(['animate', 'beast', 'humanoid', 'magical beast'])

  let str = typeStr.toLowerCase().trim()

  // Fix known typos
  str = str.replace(/\bhumanold\b/g, 'humanoid')

  // Strip "or Huge", "Small/Medium" size prefixes that leaked through
  str = str.replace(/\b(?:or\s+)?(?:tiny|small|medium|large|huge|gargantuan)\s*/gi, '').trim()
  str = str.replace(/^\/\s*/, '').trim()

  // Extract parenthetical keywords
  const keywords: string[] = []
  const parenMatch = str.match(/\(([^)]+)\)/)
  if (parenMatch) {
    keywords.push(...parenMatch[1].split(',').map(s => s.trim()).filter(Boolean))
    str = str.replace(/\s*\([^)]+\)/, '').trim()
  }

  // Extract comma-separated keywords (older format)
  const commaIdx = str.indexOf(',')
  if (commaIdx > 0) {
    keywords.push(...str.substring(commaIdx + 1).split(',').map(s => s.trim()).filter(Boolean))
    str = str.substring(0, commaIdx).trim()
  }

  // Parse remaining words into origin + type
  // e.g. "elemental immortal magical beast" → origin=elemental, type=magical beast, keywords=[immortal]
  // e.g. "magical beast" (no origin) → origin='', type=magical beast
  const words = str.split(/\s+/)
  let origin = ''
  let type = ''

  // First: check if the whole string or a prefix is a known type (no origin)
  if (knownTypes.has(str)) {
    type = str
  } else if (knownTypes.has(words.slice(0, 2).join(' '))) {
    type = words.slice(0, 2).join(' ')
    // Remaining words are keywords
    keywords.push(...words.slice(2).filter(w => !knownOrigins.has(w)))
  } else {
    // First known origin
    for (const w of words) {
      if (knownOrigins.has(w)) {
        if (!origin) origin = w
        else keywords.push(w) // extra origins become keywords
      }
    }
    // Type from remaining words after removing origins
    const typeWords = words.filter(w => !knownOrigins.has(w))
    const rest = typeWords.join(' ')
    type = knownTypes.has(rest) ? rest : knownTypes.has(typeWords[0] ?? '') ? typeWords[0] : rest

    // Extra words after type become keywords
    if (type && rest !== type && rest.startsWith(type)) {
      const extra = rest.substring(type.length).trim()
      if (extra) keywords.push(...extra.split(/\s+/))
    }
  }

  return { origin, type, keywords }
}

function parseSpeeds(speedStr: string): { land: number; speeds: Record<string, number>; speedNotes: string } {
  const land = parseInt(speedStr.match(/^(\d+)/)?.[1] ?? '0')
  const speeds: Record<string, number> = {}
  const notes: string[] = []
  // Match known movement types with optional parenthetical notes
  const typePattern = /(fly|swim|climb|burrow|teleport|phasing|overland flight|earth walk|forest walk|ice walk|spider climb)\s+(\d+)(?:\s*\(([^)]+)\))?/gi
  let m
  while ((m = typePattern.exec(speedStr)) !== null) {
    const key = m[1].toLowerCase().replace(/\s+/g, '_')
    speeds[key] = parseInt(m[2])
    if (m[3]) notes.push(key + ': ' + m[3])
  }
  // Check for land speed note like "6 (clumsy)"
  const landNote = speedStr.match(/^(\d+)\s*\(([^)]+)\)/)
  if (landNote) notes.push('land: ' + landNote[2])
  return { land, speeds, speedNotes: notes.join('; ') }
}

/**
 * "10 fire, 5 cold" / "10 necrotic;" / "5 fire (a magma runner that ...)" /
 * "insubstantial". Each comma part is "N type (note)"; parts without a number
 * are kept as descriptive entries.
 */
export function parseResistValues(str: string): { type: string; value?: number; note?: string }[] {
  const results: { type: string; value?: number; note?: string }[] = []
  // Split on commas and semicolons outside parentheses.
  const parts = str.split(/[,;](?![^()]*\))/).map(s => s.replace(/[;.,\s]+$/, '').trim()).filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(?:(\d+)\s+)?([^()]+?)(?:\s+(\d+))?\s*(?:\(([^)]*)\))?$/)
    if (!m) { results.push({ type: part }); continue }
    const entry: { type: string; value?: number; note?: string } = { type: m[2].trim() }
    // "10 fire", and the odd "fire 20"
    if (m[1] || m[3]) entry.value = parseInt(m[1] ?? m[3])
    if (m[4]) entry.note = m[4].trim()
    results.push(entry)
  }
  return results
}

interface ParsedParen {
  actionType: string
  usage: string
  trigger: string
  requirement: string
  sustain: string
  rechargeCondition: string
  parenKeywords: string[]
  unrecognized: string[]
}

function parseActionParen(str: string): ParsedParen {
  const lower = str.toLowerCase()
  const hasActionKeyword = /\b(standard|minor|move|free|immediate interrupt|immediate reaction|no action)\b/i.test(lower)
  let actionType = 'standard'
  if (lower.match(/\bminor\b/)) actionType = 'minor'
  else if (lower.match(/\bmove\b/)) actionType = 'move'
  else if (lower.match(/\bfree\b/)) actionType = 'free'
  else if (lower.includes('immediate interrupt')) actionType = 'immediate-interrupt'
  else if (lower.includes('immediate reaction')) actionType = 'immediate-reaction'
  // If paren has a trigger but no explicit action type, it's a triggered free action
  else if (!hasActionKeyword && /\bwhen\b/i.test(lower)) actionType = 'free'

  let usage = 'at-will'
  if (lower.includes('encounter')) usage = 'encounter'
  else if (lower.includes('recharge')) usage = 'recharge'

  let trigger = ''
  // Trigger can start with ", when ..." (after action type) or be the entire paren "when ..."
  const triggerMatch = str.match(/(?:^|,)\s*when\s+(.+?)(?:;\s|,\s*(?:recharge|encounter|at-will|daily)|\s*$)/i)
  if (triggerMatch) trigger = triggerMatch[1].trim().replace(/,\s*$/, '')

  let sustain = ''
  const sustainMatch = str.match(/sustain\s+(\w+)/i)
  if (sustainMatch) sustain = sustainMatch[1]

  let rechargeCondition = ''
  if (usage === 'recharge') {
    const rcMatch = str.match(/recharge[s]?\s+(.+?)(?=\)|$)/i)
    if (rcMatch) {
      rechargeCondition = normalizeRecharge(rcMatch[1])
    }
  }

  const knownKeywordsLower = new Set(attackTraits.map(k => k.toLowerCase()))
  for (const w of ['longsword', 'short sword', 'scimitar', 'mace', 'halberd', 'battleaxe']) {
    knownKeywordsLower.add(w)
  }

  const actionPat = /\b(standard|minor|move|free|immediate interrupt|immediate reaction|no action)\b/i
  const usagePat = /\b(at-will|encounter|recharge|daily)\b/i
  const sustainPat = /\bsustain\s+\w+/i
  const triggerPat = /\bwhen\s+/i
  const requirementPat = /^(while\b|requires?\b|must\b|only\b|usable\b|unusable\b|not\b|until\b|there must\b|begins?\b|cannot\b|the\b.*\b(must|first time)\b|a\b.*\bmust\b|see\s+(also|text)\b|breath weapon\b|expends?\b|consumes?\b|with\b.*\bonly\b)/i
  const rechargePat = /^recharges?\b/i
  const atkBonusPat = /^[+-]\d+$/
  const frequencyPat = /^\d+\/(round|turn)$/i

  const parenKeywords: string[] = []
  let requirement = ''
  const unrecognized: string[] = []

  const segments = str.split(/;\s*/)
  for (const seg of segments) {
    const s = seg.trim()
    if (!s) continue

    if (actionPat.test(s) || usagePat.test(s) || sustainPat.test(s) || triggerPat.test(s)) continue
    if (rechargePat.test(s)) continue
    if (atkBonusPat.test(s)) continue
    if (/^[⚔➶ᗕ✻☼⚀⚁⚂⚃⚄⚅\s]+$/.test(s)) continue
    if (frequencyPat.test(s)) {
      requirement = requirement ? requirement + '; ' + s : s
      continue
    }

    const parts = s.split(/,\s*/)
    const allKnown = parts.every(p => knownKeywordsLower.has(p.trim().toLowerCase()))
    if (allKnown) {
      parenKeywords.push(...parts.map(p => p.trim()))
      continue
    }

    if (requirementPat.test(s)) {
      requirement = requirement ? requirement + '; ' + s : s
      continue
    }

    unrecognized.push(s)
  }

  return { actionType, usage, trigger, requirement, sustain, rechargeCondition, parenKeywords, unrecognized }
}

function parseRangeType(str: string): string {
  const l = str.toLowerCase()
  if (l.includes('close burst')) return 'close-burst'
  if (l.includes('close blast')) return 'close-blast'
  if (l.includes('area burst')) return 'area-burst'
  if (l.includes('area wall')) return 'area-wall'
  if (l.includes('ranged') || /^range\b/.test(l)) return 'ranged'
  if (l.includes('melee')) return 'melee'
  return 'melee'
}

/** Parse the rangeValue out of a range string. Examples:
 *   "Area burst 1 within 10 (creatures in the burst)" → "1 within 10"
 *   "Close burst 3"  → "3"
 *   "Ranged 10"      → "10"
 *   "Melee 1"        → "1"
 */
function parseRangeValue(rangePart: string): string {
  return rangePart
    // Strip the type keyword (and anything before it) from the start
    .replace(/^.*?(close burst|close blast|area burst|area wall|ranged|range|melee|reach)\s*/i, '')
    // Strip a trailing target parenthetical, e.g. "(creatures in the burst)"
    .replace(/\s*\(.*$/, '')
    // Strip trailing punctuation (semicolon, comma, period) so it doesn't
    // collide with the renderer's own delimiters.
    .replace(/[;,.]+\s*$/, '')
    .trim()
}
