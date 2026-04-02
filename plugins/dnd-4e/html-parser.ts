// D&D 4e HTML parser — build-time only
// Parses the raw HTML monster data from iws.mx into structured Creature objects.
// Used by data/build-parsed.ts to pre-parse the corpus. Not bundled with the app.

import { generateId } from '../../src/common/utils/id'
import type { Creature } from '../../src/common/types'
import { allDamageTypes, attackTraits } from './known-values'

/** Parse raw HTML into a Creature. */
export function parseMonsterHtml(html: string, warnings: string[]): Creature {
  return _parseMonsterHtml(html, warnings)
}

// ─── Strip HTML tags, keeping text content ───
function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/td>\s*<td[^>]*>/gi, '\n').replace(/<\/tr>\s*<tr[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').trim()
}

// ─── Extract bold text from HTML ───
function extractBold(html: string): string[] {
  return [...html.matchAll(/<b>([^<]+)<\/b>/g)].map(m => m[1].trim())
}

// ─── Main HTML parser ───
function _parseMonsterHtml(html: string, warnings: string[]): Creature {
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

  // Immune/Resist/Vulnerable from stats text
  const immuneMatch = statsText.match(/Immune\s+(.+?)(?=\n|Resist|Vulnerable|Saving|$)/i)
  const immunities = immuneMatch ? immuneMatch[1].split(',').map(s => ({ type: s.replace(/[;.]+$/, '').trim() })).filter(e => e.type) : []
  const resistMatch = statsText.match(/Resist\s+(.+?)(?=\n|Vulnerable|Saving|$)/i)
  const resistances = resistMatch ? parseResistValues(resistMatch[1]) : []
  const vulnMatch = statsText.match(/Vulnerable\s+(.+?)(?=\n|Saving|$)/i)
  const weaknesses = vulnMatch ? parseResistValues(vulnMatch[1]) : []

  // Auras from stats block (bold name + "aura N;")
  const statsAuras = parseAurasFromStatsHtml(statsHtml)

  // ── Powers: <p class='flavor alt'> + <p class=flavorIndent> pairs ──
  const actions = [...statsAuras, ...parsePowersFromHtml(html, warnings)]

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
  const traits = [origin, type, ...keywords].filter(s => s && !sizeNames.includes(s))

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

  return {
    id: generateId(),
    name,
    hp,
    maxHp: hp,
    statBlock: {
      size, level, role: cleanRole, monsterModifier: eliteSolo, ac,
      defenses: { fortitude: fort, reflex: ref, will },
      initiative, perception, senses,
      speed: land, speeds, speedNotes: speedNotes || undefined,
      abilities, primaryAbility, traits,
      immunities, resistances, weaknesses,
      skills, alignment, languages, equipment,
      xp, savingThrowBonus, actionPoints,
      description, source,
      actions,
    },
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Parse powers from HTML <p> tag pairs ───
function parsePowersFromHtml(html: string, warnings: string[]): any[] {
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
    const parsed = parseOneAbility(currentHeader, currentBody, sectionToDefault(currentSection), warnings)
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

// ─── Parse a single ability from its header HTML and body block HTMLs ───
function parseOneAbility(headerHtml: string, bodyBlocks: string[], sectionDefault: string = 'standard', warnings: string[] = []): any | null {
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

  // Keywords = bold words after ✦ (filter out usage types that appear as bold keywords)
  const usageWords = new Set(['at-will', 'encounter', 'daily'])
  const hasStarKeywords = headerText.includes('✦')
  const keywords = hasStarKeywords ? bolds.slice(1).filter(k => !usageWords.has(k.toLowerCase())) : []

  // Parse action paren
  const parenMatch = afterIcon.match(/\(([^)]+)\)/)
  const actionParen = parenMatch?.[1] ?? ''
  const parsed = parseActionParen(actionParen)
  let { actionType, usage: finalUsage, trigger, requirement, sustain, rechargeCondition, parenKeywords, unrecognized } = parsed

  // Merge keywords from paren into the header keywords
  if (parenKeywords.length > 0) keywords.push(...parenKeywords)

  // Warn about unrecognized paren segments
  if (unrecognized.length > 0) {
    warnings.push(`${name}: unrecognized paren segment(s): ${unrecognized.map(s => '"' + s + '"').join(', ')}`)
  }

  // Override usage from bold header keywords if paren didn't specify
  if (finalUsage === 'at-will' && hasStarKeywords) {
    const headerUsage = bolds.slice(1).find(k => usageWords.has(k.toLowerCase()))
    if (headerUsage) {
      const u = headerUsage.toLowerCase()
      if (u === 'encounter') finalUsage = 'encounter'
      else if (u === 'daily') finalUsage = 'daily'
    }
  }

  // ─── Parse each body block by its <i> label ───
  const fields: Record<string, string> = {}
  let unlabeledText = ''

  for (const blockHtml of bodyBlocks) {
    const labelMatch = blockHtml.match(/<i>([^<]+)<\/i>\s*/)
    if (labelMatch) {
      const label = labelMatch[1].replace(/:$/, '').trim().toLowerCase()
      const value = stripHtml(blockHtml.substring(labelMatch.index! + labelMatch[0].length)).trim()
      if (label.startsWith('attack')) fields.attack = (fields.attack ? fields.attack + ' ' : '') + value
      else if (label.startsWith('hit')) fields.hit = value
      else if (label.startsWith('miss')) fields.miss = value
      else if (label.startsWith('effect')) {
        fields.effect = value
        const actMatch = label.match(/\((free action|immediate interrupt|immediate reaction|no action)\)/i)
        if (actMatch) {
          const a = actMatch[1].toLowerCase()
          if (a.includes('free')) actionType = 'free'
          else if (a.includes('interrupt')) actionType = 'immediate-interrupt'
          else if (a.includes('reaction')) actionType = 'immediate-reaction'
        }
      }
      else if (label.startsWith('trigger')) fields.trigger = value
      else if (label.startsWith('sustain')) { fields.sustain = value; sustain = label.replace('sustain', '').trim() || value }
      else if (label.startsWith('secondary')) fields.secondary = (fields.secondary ? fields.secondary + ' ' : '') + value
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
      else if (u === 'daily') finalUsage = 'encounter'
    }
  }

  // Recharge from body if not in paren
  if (finalUsage === 'recharge' && !rechargeCondition && unlabeledText) {
    const rc = unlabeledText.match(/[Rr]echarge\s+(.+?)(?=\s+Attack:|\s+Effect:|\n|$)/i)
    if (rc) {
      rechargeCondition = rc[1].replace(/[⚅]/g,'6').replace(/[⚄]/g,'5').replace(/[⚃]/g,'4').replace(/[⚂]/g,'3').replace(/[⚁]/g,'2').replace(/[⚀]/g,'1').replace(/\s+/g,' ').trim()
      const dr = rechargeCondition.match(/^[\d\s]+$/)
      if (dr) { const nums = rechargeCondition.replace(/\s+/g,'').split('').map(Number).sort((a,b)=>a-b); rechargeCondition = nums[0]+'-'+nums[nums.length-1] }
    }
  }

  // Trait (no icon, no action paren, no ✦)
  if (!icon && !actionParen && !hasStarKeywords) {
    return {
      name, entryType: 'trait', actionType: '', usage: '',
      keywords: [], rangeType: '', rangeValue: '', target: '',
      attackBonus: null, attackNotes: '', defense: '', damage: [],
      hit: '', miss: '', effect: (unlabeledText || Object.values(fields).join(' ')).substring(0, 500),
      trigger: '', requirement: '', sustain: '',
    }
  }

  // Aura
  const allBodyText = unlabeledText + ' ' + Object.values(fields).join(' ')
  if (icon === '☼' || allBodyText.toLowerCase().startsWith('aura') || afterIcon.toLowerCase().includes('aura')) {
    const auraRange = parseInt((afterIcon + ' ' + allBodyText).match(/[Aa]ura\s+(\d+)/)?.[1] ?? '1')
    return {
      name, entryType: 'aura', actionType: '', usage: '',
      keywords, rangeType: '', rangeValue: '', target: '',
      attackBonus: null, attackNotes: '', defense: '', damage: [],
      hit: '', miss: '',
      effect: allBodyText.replace(/^Aura\s+\d+\s*/i, '').substring(0, 500),
      trigger: '', requirement: '', sustain: '', auraRange,
    }
  }

  // ─── Build result from labeled fields ───
  let rangeType = icon === '➶' || icon === '✻' ? 'ranged' : icon === 'ᗕ' ? 'close-burst' : 'melee'
  let rangeValue = ''
  let target = ''
  let attackBonus: number | null = null
  let attackNotes = ''
  let defense = 'AC'
  let damageRaw = ''
  let hit = ''
  let miss = fields.miss ?? ''
  let effect = fields.effect ?? ''

  // Use trigger from body or paren
  if (!trigger && fields.trigger) trigger = fields.trigger

  // Parse Attack field
  if (fields.attack) {
    const atkLabeled = fields.attack.match(/(.+?)\s*;\s*\+(\d+)\s+vs\.?\s*(\w+)/)
    if (atkLabeled) {
      const rangePart = atkLabeled[1].trim()
      rangeType = parseRangeType(rangePart)
      rangeValue = rangePart.match(/\d+/)?.[0] ?? ''
      target = rangePart.match(/\((.+)\)/)?.[1] ?? ''
      attackBonus = parseInt(atkLabeled[2])
      defense = atkLabeled[3]
    }
  } else if (unlabeledText) {
    // Inline format
    const atkRollMatch = unlabeledText.match(/\+(\d+)\s+vs\.?\s*(\w+)\s*;\s*(.+)/is)
    if (atkRollMatch) {
      attackBonus = parseInt(atkRollMatch[1])
      defense = atkRollMatch[2]

      const beforeAtk = unlabeledText.substring(0, atkRollMatch.index).trim()
      if (beforeAtk) {
        rangeType = parseRangeType(beforeAtk)
        const rv = beforeAtk.match(/(?:burst|blast|ranged|melee)\s+(\d+)/i)
        if (rv) rangeValue = rv[1]
        const targetsMatch = beforeAtk.match(/targets?\s+(.+?)(?:;|$)/i)
        if (targetsMatch) {
          target = targetsMatch[1].trim()
        } else {
          const targetParen = beforeAtk.match(/\((.+)\)/)
          if (targetParen) {
            const parenParts = targetParen[1].split(/;\s*/)
            target = parenParts[0].trim()
            if (parenParts.length > 1) attackNotes = parenParts.slice(1).join('; ')
          }
        }
      }

      let afterAtk = atkRollMatch[3].trim()
      const lp = afterAtk.match(/^\(([^)]+)\)\s*;?\s*/)
      if (lp) {
        afterAtk = afterAtk.substring(lp[0].length)
        if (lp[1].startsWith('+')) attackNotes = lp[1]
        else if (!target) target = lp[1]
        else attackNotes = (attackNotes ? attackNotes + '; ' : '') + lp[1]
      }
      const missInline = unlabeledText.match(/Miss:\s*(.+?)(?=\s+Effect:|\n|$)/i)
      if (missInline && !miss) miss = missInline[1].trim()
      const effInline = unlabeledText.match(/Effect:\s*(.+?)(?=\n|$)/i)
      if (effInline && !effect) effect = effInline[1].trim()
      const em = afterAtk.match(/^(.+?)\s*(?:Effect:|Miss:)/i)
      if (em) afterAtk = em[1].trim()

      // Strip crit/critical parentheticals before damage splitting — they contain
      // effect text that would otherwise leak into damage parts
      afterAtk = afterAtk.replace(/\s*\((?:on\s+)?crit(?:ical)?[^)]*\)/gi, '').trim()
      // Also strip "(plus ...on a critical hit)" style parens
      afterAtk = afterAtk.replace(/\s*\([^)]*critical hit[^)]*\)/gi, '').trim()

      const hasDamageExpr = /\d+d\d+|\d+\s+damage\b/i.test(afterAtk)
      if (hasDamageExpr) {
        const split = splitDamageFromHit(afterAtk)
        damageRaw = split.damage
        if (split.hit) hit = split.hit
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
  }

  // If no attack/damage/hit found, entire body is the effect
  if (attackBonus == null && !damageRaw && !hit && !effect) {
    effect = allBodyText.substring(0, 500)
  }

  // Append secondary attack/aftereffect to hit if present
  if (fields.secondary) hit = (hit ? hit + ' ' : '') + 'Secondary: ' + fields.secondary
  if (fields.aftereffect) hit = (hit ? hit + ' ' : '') + 'Aftereffect: ' + fields.aftereffect
  if (fields.requirement) requirement = requirement ? requirement + '; ' + fields.requirement : fields.requirement

  // Parse damageRaw into structured DamagePart[]
  const damage = parseDamageParts(damageRaw, allDamageTypes)

  // Clean leading conjunctions from hit text
  hit = hit.replace(/^and\s+/i, '')

  function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

  return {
    name, entryType: 'action', actionType, usage: finalUsage,
    rechargeCondition: rechargeCondition || undefined,
    keywords, rangeType, rangeValue, target, attackBonus, attackNotes, defense,
    damage, hit: cap(hit), miss: cap(miss), effect: cap(effect),
    trigger: cap(trigger), requirement, sustain,
  }
}

// ─── Parse auras from the stats <p class=flavor> HTML ───
function parseAurasFromStatsHtml(statsHtml: string): any[] {
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
    })
  }
  return results
}

// ─── Parse damage text into structured DamagePart[] ───
interface DamagePart { expr: string; type: string; ongoing: boolean }

// ─── Split a Hit/damage text into damage expression(s) and hit effect ───
// Scans tokens from the start, consuming while they look like damage components.
// Stops at the first token that can't be part of a damage expression.
//
// Damage tokens: digits, dice (1d8), operators (+/-), damage type words,
// "damage", "ongoing", "plus", "and" (between types), "(crit ...)" parens.
// Everything after the last damage token is hit effect text.

const DAMAGE_TYPES_SET = new Set(['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'])

function splitDamageFromHit(text: string): { damage: string; hit: string } {
  const trimmed = text.trim()
  // Tokenize: split on whitespace but keep parenthesized groups together
  const tokens: string[] = []
  let i = 0
  while (i < trimmed.length) {
    // Skip whitespace
    while (i < trimmed.length && /\s/.test(trimmed[i])) i++
    if (i >= trimmed.length) break
    // Parenthesized group
    if (trimmed[i] === '(') {
      const start = i
      let depth = 1
      i++
      while (i < trimmed.length && depth > 0) {
        if (trimmed[i] === '(') depth++
        else if (trimmed[i] === ')') depth--
        i++
      }
      tokens.push(trimmed.substring(start, i))
    } else {
      // Regular token: up to next whitespace or paren
      const start = i
      while (i < trimmed.length && !/[\s(]/.test(trimmed[i])) i++
      tokens.push(trimmed.substring(start, i))
    }
  }

  function isDamageToken(tok: string, nextTok?: string): boolean {
    const lower = tok.toLowerCase().replace(/[.,;:]+$/, '')
    // Pure punctuation — skip
    if (!lower) return true
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
    if (lower === 'plus' && nextTok && isDamageToken(nextTok, tokens[tokens.indexOf(nextTok) + 1])) return true
    // "and" between damage types: "fire and necrotic damage"
    if (lower === 'and' && nextTok && DAMAGE_TYPES_SET.has(nextTok.toLowerCase().replace(/[.,;:]+$/, ''))) return true
    // Crit parens: "(crit ...)" or "(critical ...)" — may be unclosed in source
    if (tok.startsWith('(') && /crit/i.test(tok)) return true
    return false
  }

  // Consume damage tokens from the front
  let lastDmgIdx = -1
  for (let t = 0; t < tokens.length; t++) {
    if (isDamageToken(tokens[t], tokens[t + 1])) {
      lastDmgIdx = t
    } else {
      break
    }
  }

  if (lastDmgIdx < 0) {
    return { damage: '', hit: trimmed }
  }

  const dmgTokens = tokens.slice(0, lastDmgIdx + 1)
  const hitTokens = tokens.slice(lastDmgIdx + 1)
  const damage = dmgTokens.join(' ')
  let hit = hitTokens.join(' ')
  // Strip leading punctuation and conjunctions from hit text
  hit = hit.replace(/^[.,;:]+\s*/, '').replace(/^and\s+/i, '').replace(/^or\s+/i, '')
  return { damage, hit }
}

function parseDamageParts(raw: string, knownTypes: string[]): DamagePart[] {
  if (!raw || !raw.trim()) return []

  const segments = raw.split(/\s+(?:plus|and)\s+|,\s+(?=(?:ongoing\s+)?\d)/i)
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

    // Clean up leftover punctuation, commas, "and" between stripped types
    seg = seg.replace(/\s*,\s*/g, ' ').replace(/\s+and\s+/gi, ' ').trim()
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
  // Format: "origin type (keywords)" or "origin type , keywords" or "origin type keyword"
  // Types can be two words: "magical beast"
  const knownOrigins = new Set(['aberrant', 'elemental', 'fey', 'immortal', 'natural', 'shadow'])
  const knownTypes = new Set(['animate', 'beast', 'humanoid', 'magical beast'])

  let str = typeStr.toLowerCase().trim()

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

  // Now str should be "origin type" or "origin magical beast"
  const words = str.split(/\s+/)
  const origin = knownOrigins.has(words[0]) ? words[0] : ''
  const rest = origin ? words.slice(1).join(' ') : str

  // Check for two-word type first
  const type = knownTypes.has(rest) ? rest : knownTypes.has(words[1] ?? '') ? words[1] : rest

  // If there are extra words after the type that aren't part of a known type, they're keywords
  if (type && rest !== type && rest.startsWith(type)) {
    const extra = rest.substring(type.length).trim()
    if (extra) keywords.push(...extra.split(/\s+/))
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

function parseResistValues(str: string): { type: string; value: number }[] {
  const results: { type: string; value: number }[] = []
  for (const m of str.matchAll(/(\d+)\s+([\w\s]+?)(?=,\s*\d|\s*$)/g)) {
    results.push({ type: m[2].trim(), value: parseInt(m[1]) })
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
  let actionType = 'standard'
  if (lower.match(/\bminor\b/)) actionType = 'minor'
  else if (lower.match(/\bmove\b/)) actionType = 'move'
  else if (lower.match(/\bfree\b/)) actionType = 'free'
  else if (lower.includes('immediate interrupt')) actionType = 'immediate-interrupt'
  else if (lower.includes('immediate reaction')) actionType = 'immediate-reaction'

  let usage = 'at-will'
  if (lower.includes('encounter')) usage = 'encounter'
  else if (lower.includes('recharge')) usage = 'recharge'

  let trigger = ''
  const triggerMatch = str.match(/,\s*when\s+(.+?)(?=;\s|,\s*(?:recharge|encounter|at-will|daily)|$)/i)
  if (triggerMatch) trigger = triggerMatch[1].trim()

  let sustain = ''
  const sustainMatch = str.match(/sustain\s+(\w+)/i)
  if (sustainMatch) sustain = sustainMatch[1]

  let rechargeCondition = ''
  if (usage === 'recharge') {
    const rcMatch = str.match(/recharge[s]?\s+(.+?)(?=\)|$)/i)
    if (rcMatch) {
      rechargeCondition = rcMatch[1]
        .replace(/⚅/g, '6').replace(/⚄/g, '5').replace(/⚃/g, '4').replace(/⚂/g, '3').replace(/⚁/g, '2').replace(/⚀/g, '1')
        .replace(/\s+/g, ' ').trim()
      const diceRange = rechargeCondition.match(/^[\d\s]+$/)
      if (diceRange) {
        const nums = rechargeCondition.replace(/\s+/g, '').split('').map(Number).sort((a, b) => a - b)
        rechargeCondition = nums[0] + '-' + nums[nums.length - 1]
      }
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
  if (l.includes('ranged')) return 'ranged'
  if (l.includes('melee')) return 'melee'
  return 'melee'
}
