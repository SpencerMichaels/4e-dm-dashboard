/**
 * App types for D&D 4e monster templates and themes, as the encounter editor's template list, theme
 * picker, and template viewer display them (applying them happens on kit monsters, in
 * src/common/rules/adjust-monster.ts). Published templates and themes come from the content pack as
 * kit entries and are converted with kit-templates.ts, like campaign and Library ones.
 */

export interface TemplatePower {
  name: string
  action?: string       // e.g., 'standard; encounter', 'minor; recharge 5-6'
  keywords?: string     // e.g., 'Fire, Necrotic'
  description: string   // trait/aura text, or remaining effect text for actions
  entryType?: 'action' | 'trait' | 'aura'
  auraRange?: number
  // Structured attack fields (for action-type powers)
  rangeType?: string    // 'melee' | 'ranged' | 'close-burst' | 'close-blast' | 'area-burst'
  rangeValue?: string   // '1', '10', '2 within 10', etc.
  target?: string       // 'one creature', 'enemies', etc.
  attackBonus?: string  // 'level + 2', 'level + 5', etc. (template attacks use level-relative bonuses)
  defense?: string      // 'AC', 'Fortitude', 'Reflex', 'Will'
  damage?: string       // '2d8 + Strength modifier necrotic', '1d6 fire'
  hit?: string          // additional hit effect beyond damage
  miss?: string         // miss effect
  trigger?: string      // for reactions/interrupts
  requirement?: string  // prerequisites
  critical?: string     // critical hit effect
}

export interface MonsterTemplate {
  name: string
  source?: string               // book abbreviation (DMG, DMG2, OG, DCC, DCM)
  description?: string          // flavor text describing the template
  role: string                  // new effective role
  leader?: boolean
  prerequisite: string          // human-readable
  /** Old built-in templates checked prerequisites in code; kit templates carry TemplatePrereq data. */
  prereqCheck?: (sb: Record<string, unknown>) => boolean
  keyword?: string              // added keyword (undead, shadow, fey, elemental)
  senses?: string[]
  defenses: { ac?: number; fortitude?: number; reflex?: number; will?: number }
  immunities?: string[]
  resistPerTier?: { type: string; heroic: number; paragon: number; epic: number }
  vulnerable?: { type: string; value: number }
  hpPerLevel: number            // extra HP per creature level
  savingThrows: number          // typically +2
  actionPoints: number          // typically 1
  regeneration?: number
  regenerationNote?: string
  powers: TemplatePower[]
}


export interface ThemePower extends TemplatePower {
  category: 'attack' | 'utility'
  recommendedFor?: string   // e.g., 'brutes, soldiers' — which roles benefit most
  flavorText?: string        // per-power narrative description from the book
}

export interface MonsterTheme {
  name: string
  source: string              // book abbreviation
  description: string         // flavor text
  skillModifications?: string // e.g., '+2 bonus to Intimidate checks'
  originChange?: string       // e.g., 'origin becomes fey'
  /** Already-parsed skill bonuses (campaign themes from kit content); used instead of skillModifications. */
  skills?: ParsedSkillMods
  powers: ThemePower[]
}

const SKILL_NAMES = [
  'acrobatics', 'arcana', 'athletics', 'bluff', 'diplomacy', 'dungeoneering',
  'endurance', 'heal', 'history', 'insight', 'intimidate', 'nature',
  'perception', 'religion', 'stealth', 'streetwise', 'thievery',
]

export interface ParsedSkillMods {
  always: string[]       // skills that always apply
  choices?: string[][]   // groups of skills to choose between (pick one group)
  bonus: number
}

function findSkills(text: string): string[] {
  return SKILL_NAMES.filter(s => text.toLowerCase().includes(s))
}

/** Parse the skillModifications string into always-applied skills and choice groups.
 *  Handles patterns like:
 *  - "+2 bonus to Intimidate checks" → always: [intimidate]
 *  - "+2 bonus to Athletics or Stealth checks" → choices: [[athletics], [stealth]]
 *  - "+2 bonus to Diplomacy and Intimidate checks or Insight and Perception checks" → choices: [[diplomacy, intimidate], [insight, perception]]
 *  - "+2 bonus to Intimidate and to Athletics or Acrobatics checks" → always: [intimidate], choices: [[athletics], [acrobatics]] */
export function parseSkillModifications(text: string): ParsedSkillMods {
  const bonusMatch = text.match(/([+-]\d+)/)
  if (!bonusMatch) return { always: [], bonus: 0 }
  const bonus = parseInt(bonusMatch[1])

  // Strip the bonus prefix to work with just the skill part
  const body = text.replace(/^[^a-zA-Z]*bonus to\s*/i, '').replace(/\s*checks?\.?\s*$/i, '')

  // Check for " or " — indicates a choice
  if (/ or /i.test(body)) {
    // Check for "X and to Y or Z" pattern (always + choice)
    const andToMatch = body.match(/^(.+?)\s+and to\s+(.+)$/i)
    if (andToMatch) {
      const always = findSkills(andToMatch[1])
      const choiceParts = andToMatch[2].split(/\s+or\s+/i)
      const choices = choiceParts.map(p => findSkills(p))
      return { always, choices: choices.filter(c => c.length > 0), bonus }
    }
    // "X and Y checks or A and B checks" or "X or Y"
    const choiceParts = body.split(/\s+or\s+/i)
    const choices = choiceParts.map(p => findSkills(p))
    if (choices.some(c => c.length > 0)) {
      return { always: [], choices: choices.filter(c => c.length > 0), bonus }
    }
  }

  // No "or" — all skills are always-applied
  return { always: findSkills(body), bonus }
}
