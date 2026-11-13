// Shared pieces of the parsed-content -> 4e-kit converter (build-time only).
// Deterministic only: structured fields are filled from parser output, each
// printed line goes into Line.text, and clauses are added only where a simple
// exact pattern makes them unambiguous. Everything else keeps `clauses: []`.

import {
  ACTION_TYPES, CONDITION_IDS, DAMAGE_TYPES, DEFENSES, isOneOf,
  type ActionType, type Attack, type Clause, type DamageModifier, type DamageType, type Defense,
  type Line, type Provenance, type Range, type RangeKind, type Recharge, type SourceRef, type Usage,
} from '@kit'

export interface ConvertContext {
  provenance: Provenance
}

/** Per-entry conversion notes (things the schema has no place for, dropped values). */
export class Notes {
  readonly list: string[] = []
  add(note: string): void { if (!this.list.includes(note)) this.list.push(note) }
}

export function provenanceFor(ctx: ConvertContext, notes: Notes): Provenance {
  return notes.list.length > 0 ? { ...ctx.provenance, notes: [...notes.list] } : { ...ctx.provenance }
}

/** Whitespace-normalized printed text. */
export function normText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function line(text: string, clauses: Clause[] = []): Line {
  return { text: normText(text), clauses }
}

/** A Line for non-empty text, undefined otherwise. */
export function optLine(text: string | undefined | null): Line | undefined {
  return text && text.trim() ? line(text) : undefined
}

/** Drop undefined values so JSON output has no placeholder keys (keeps insertion order). */
export function compact<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] === undefined) delete obj[key]
  }
  return obj
}

export function kebab(text: string): string {
  return text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Source ──

/**
 * "Monster Manual 3, page(s) 132, Dungeon Magazine 190." ->
 *   [{ book: 'Monster Manual 3', page: 132 }, { book: 'Dungeon Magazine 190' }]
 * The first entry is the primary source. Booklet pages ("page(s) 2-77") keep
 * the printed text: { book, page: "2-77" }.
 */
export function parseSources(source: string, notes: Notes): SourceRef[] {
  const text = normText(source ?? '').replace(/^Published in\s+/i, '').replace(/\.$/, '')
  if (!text) return [{ book: '' }]
  const refs: SourceRef[] = []
  for (const token of text.split(/\s*,\s*/).filter(Boolean)) {
    const page = token.match(/^page\(s\)\s*(\S+)$/i)
    const last = refs[refs.length - 1]
    if (page && last) {
      if (last.page === undefined) last.page = /^\d+$/.test(page[1]) ? parseInt(page[1]) : page[1]
    } else if (/^\d+$/.test(token) && last) {
      // "page(s) 59, 68": another page of the same book.
      refs.push({ book: last.book, page: parseInt(token) })
    } else {
      refs.push({ book: token })
    }
  }
  return refs.length > 0 ? refs : [{ book: '' }]
}

// ── Resistances ──

/**
 * A resistance or vulnerability. Numeric entries keep their type ("resist 10
 * fire"); a damage type with no number ("vulnerable radiant: see text") keeps
 * the type and no value; anything else ("insubstantial", "half damage from
 * melee and ranged attacks") is text-only: { type: 'special', text }.
 */
export function damageModifier(rawType: string, value?: number, note?: string): DamageModifier {
  const type = normText(rawType).toLowerCase()
  const n = note ? normText(note) : undefined
  // "Vulnerable 10 against close and area attacks": a numbered qualifier, not a damage type.
  if (typeof value === 'number' && /^(against|to|vs\.?)\s/.test(type)) return compact({ type: 'special', value, text: normText(rawType), note: n })
  if (typeof value === 'number') return compact({ type, value, note: n })
  const variable = type.match(/^(\d+)\/variable$/)
  if (variable) return compact({ type: 'variable', value: parseInt(variable[1]), note: n })
  if (isOneOf(DAMAGE_TYPES, type) || type === 'all' || type === 'silver') return compact({ type, note: n })
  return compact({ type: 'special', text: normText(rawType), note: n })
}

// ── Action, usage, range, defense ──

export function toActionType(raw: string | undefined): ActionType | undefined {
  const s = (raw ?? '').toLowerCase().replace(/\s+action$/, '').replace(/\s+/g, '-').trim()
  if (isOneOf(ACTION_TYPES, s)) return s
  if (s === 'no') return 'no-action'
  // Traps' "Triggered Actions" heading with no printed action type.
  if (s === 'triggered' || s === 'triggered-actions') return 'triggered'
  return undefined
}

export function toUsage(raw: string | undefined): Usage | undefined {
  const s = (raw ?? '').toLowerCase().trim()
  if (s.startsWith('recharge')) return 'recharge'
  if (s === 'at-will' || s === 'at will') return 'at-will'
  if (s === 'encounter' || s === 'daily' || s === 'consumable') return s
  return undefined
}

/** "5-6" -> roll 5; "6" -> roll 6; "when first bloodied" -> bloodied; else text. */
export function toRecharge(condition: string | undefined): Recharge | undefined {
  const c = (condition ?? '').trim()
  if (!c) return undefined
  const roll = c.match(/^([2-6])(?:-6)?$/)
  if (roll) return { kind: 'roll', min: parseInt(roll[1]) as 2 | 3 | 4 | 5 | 6 }
  if (/^when (?:first )?bloodied$/i.test(c)) return { kind: 'bloodied' }
  return { kind: 'text', text: c }
}

/** A defense, or 'any' ("vs. Any": the attacker picks). */
export function toDefense(raw: string | undefined): Defense | 'any' | undefined {
  const d = (raw ?? '').toLowerCase().trim()
  if (d === 'any' || d === 'any defense') return 'any'
  return isOneOf(DEFENSES, d) ? d : undefined
}

/**
 * Printed conditional attack bonuses the parser leaves in the range note
 * ("+37 while bloodied", "or +20 vs. Reflex if the target is bloodied") move to
 * Attack.altBonus; other note parts stay. Mutates and returns the attack.
 */
export function extractAltBonus(attack: Attack): Attack {
  const note = attack.range.note
  if (!note) return attack
  const rest: string[] = []
  const alt: NonNullable<Attack['altBonus']> = []
  for (const part of note.split(/;\s*/)) {
    const m = part.trim().match(/^\(?(?:or )?\+(\d+)(?: vs\.? (AC|Fortitude|Reflex|Will))?(?: to hit)? ((?:while|when|against|if) [^()]+?)\.?\)?$/i)
    if (!m) { rest.push(part); continue }
    const vs = m[2] ? toDefense(m[2]) : undefined
    alt.push(compact({ value: parseInt(m[1]), if: m[3].trim(), vs: vs === 'any' ? undefined : vs }) as { value: number; if: string; vs?: Defense })
  }
  if (alt.length === 0) return attack
  attack.altBonus = alt
  if (rest.length > 0) attack.range.note = rest.join('; ')
  else delete attack.range.note
  return attack
}

/** "Second Failed Saving Throw" -> 2, "Each Failed Saving Throw" -> 'each'; undefined for other labels. */
export function failedSaveN(label: string): number | 'each' | undefined {
  const m = label.toLowerCase().trim().match(/^(first|second|third|fourth|fifth|sixth|each) failed saving throw$/)
  if (!m) return undefined
  return m[1] === 'each' ? 'each' : ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'].indexOf(m[1]) + 1
}

/** Printed label from a lowercased parser key: "1. fire ray (fire)" -> "1. Fire Ray (fire)". */
export function labelText(key: string): string {
  let depth = 0
  return key.replace(/[()]|\b[a-z]/g, ch => {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0) return ch.toUpperCase()
    return ch
  })
}

const RANGE_PREFIX = /^((?:close (?:burst|blast)|area (?:burst|wall)|wall|ranged|melee|reach)\s+(?:\d+(?:\/\d+)?(?:\s+squares?)?(?:\s*\(\d+ (?:squares? )?high\))?(?:\s+within\s+\d+(?:\s+squares?)?)?|sight|touch)|personal)(?:\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\))?(?:\s*[.;:,]\s*|(?<=\))\s*)/i

/**
 * The range a non-attack power prints at the start of its effect:
 * "Close burst 5; one ally ..." / "Ranged 5 (one ally). The target ..." /
 * "Area wall 8 (4 high) within 10 squares; ...". The target in parentheses
 * (and a wall's height) goes into Range.note; the rest stays the effect.
 */
export function splitRangePrefix(text: string): { range: Range; rest: string } | undefined {
  const t = normText(text)
  const m = t.match(RANGE_PREFIX)
  if (!m) return undefined
  const rest = t.substring(m[0].length).trim()
  if (!rest) return undefined
  const head = m[1]
  const kind = rangeKindOf(head)
  let value = head.replace(/^(close burst|close blast|area burst|area wall|wall|ranged|melee|reach|personal)\s*/i, '').replace(/\s+squares?\b/gi, '')
  const high = value.match(/\s*\((\d+ (?:squares? )?high)\)/i)
  if (high) value = value.replace(high[0], '')
  const range = toRange(kind, value, [high?.[1], m[2]?.trim()].filter(Boolean).join('; ') || undefined)
  return { range, rest }
}

/** Parser rangeType/rangeValue ("area-burst", "2 within 10") -> kit Range. */
export function toRange(rangeType: string, rangeValue: string, note?: string): Range {
  const kind = (rangeType || 'melee') as RangeKind
  const range: Range = { kind }
  const v = (rangeValue ?? '').trim()
  const within = v.match(/^(\d+)\s+within\s+(\d+)/)
  const num = v.match(/^(\d+)/)
  if (kind === 'melee') {
    if (num) range.reach = parseInt(num[1])
  } else if (within) {
    range.size = parseInt(within[1])
    range.within = parseInt(within[2])
  } else if (num) {
    range.size = parseInt(num[1])
  }
  const extra = num ? v.substring((within ?? num)[0].length).trim() : v
  const noteParts = [extra, note].filter(Boolean)
  if (noteParts.length > 0) range.note = noteParts.join('; ')
  return range
}

/**
 * Parse a printed attack line ("Ranged 5 (one creature); +21 vs. Will",
 * "Close burst 2 (enemies in the burst); item level + 3 vs. Will") into the
 * range/target/bonus/defense parts of an Attack.
 */
export function parseAttackLine(text: string): Pick<Attack, 'range' | 'target' | 'bonus' | 'vs'> | undefined {
  const t = normText(text)
  const m = t.match(/^(.*?)\s*;?\s*(\+\d+|[^;]*?level\s*\+\s*\d+|[^;]*?\+\s*\d+)\s+vs\.?\s+(AC|Fortitude|Reflex|Will|Any)\b/i)
  if (!m) return undefined
  const vs = toDefense(m[3])
  if (!vs) return undefined
  const rangeText = m[1].replace(/[;,]\s*$/, '').trim()
  const bonusText = m[2].trim()
  const fixed = bonusText.match(/^\+(\d+)$/)
  const lvl = bonusText.match(/^level\s*\+\s*(\d+)$/i)
  const bonus = fixed ? { kind: 'fixed' as const, value: parseInt(fixed[1]) }
    : lvl ? { kind: 'level' as const, plus: parseInt(lvl[1]) }
    : { kind: 'formula' as const, text: bonusText }
  const target = rangeText.match(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/)?.[1]?.trim() ?? ''
  const head = target ? rangeText.substring(0, rangeText.lastIndexOf('(')).trim() : rangeText
  const kind = rangeKindOf(head)
  const value = head.replace(/^.*?(close burst|close blast|area burst|area wall|ranged|range|melee|reach|personal|area)\s*/i, '')
  return { range: toRange(kind, value), target, bonus, vs }
}

export function rangeKindOf(text: string): RangeKind {
  const l = text.toLowerCase()
  if (l.includes('close burst')) return 'close-burst'
  if (l.includes('close blast')) return 'close-blast'
  if (l.includes('area burst')) return 'area-burst'
  if (l.includes('area wall')) return 'area-wall'
  if (/^wall \d/.test(l)) return 'area-wall'
  if (/\bpersonal\b/.test(l)) return 'personal'
  if (/\branged?\b/.test(l)) return 'ranged'
  return 'melee'
}

// ── Clauses ──

const TYPE_ALT = DAMAGE_TYPES.join('|')
const CONDITION_ALT = CONDITION_IDS.filter(c => !c.includes('-')).join('|')

function exprPattern(expr: string): string {
  // "2d6+7" matches "2d6 + 7"; the expression must start at a word boundary.
  return expr.split(/([+-])/).map(p => p === '+' ? '\\s*\\+\\s*' : p === '-' ? '\\s*[-−]\\s*' : p.replace(/[.*?^${}()|[\]\\]/g, '\\$&')).join('')
}

function typesOf(text: string): DamageType[] | undefined {
  const words = text.toLowerCase().split(/\s*(?:,|\band\b|\bor\b)\s*/).map(s => s.trim()).filter(Boolean)
  if (words.length === 0) return []
  return words.every(w => isOneOf(DAMAGE_TYPES, w)) ? words as DamageType[] : undefined
}

export interface DamagePartIn { expr: string; type: string; ongoing: boolean; saveEnds?: boolean }

/**
 * Damage clauses for an attack's own (non-ongoing) damage parts: each part's
 * dice must appear in the line text as "<dice> [<type>[ and <type>]] damage",
 * or, for an untyped part, as bare dice that another part follows ("2d8+10
 * plus 2d6 lightning damage", "1d10+6 and ongoing 5 poison damage"): the quote
 * is then the dice alone and the trailing type is not the part's.
 */
export function damageClauses(text: string, parts: DamagePartIn[]): Clause[] {
  const clauses: Clause[] = []
  let from = 0
  for (const part of parts) {
    if (part.ongoing) continue
    const re = new RegExp(`(?<![\\w+])${exprPattern(part.expr)}\\s+(?:((?:${TYPE_ALT})(?:(?:,\\s*|\\s+(?:and|or)\\s+)(?:${TYPE_ALT}))*)\\s+)?damage\\b`, 'gi')
    re.lastIndex = from
    const m = re.exec(text)
    if (!m) {
      if (part.type) continue
      const bare = new RegExp(`(?<![\\w+])${exprPattern(part.expr)}(?=,?\\s+(?:plus|and)\\s+(?:ongoing\\s+)?\\d)`, 'gi')
      bare.lastIndex = from
      const b = bare.exec(text)
      if (!b) continue
      clauses.push({ at: [b.index, b.index + b[0].length], kind: 'damage', dice: part.expr, types: [], who: 'target' })
      from = b.index + b[0].length
      continue
    }
    const types = typesOf(m[1] ?? '')
    if (!types) continue
    // "cold or fire damage" is a choice, not both types: leave it for agents.
    if (/\bor\b/i.test(m[1] ?? '')) continue
    clauses.push({ at: [m.index, m.index + m[0].length], kind: 'damage', dice: part.expr, types, who: 'target' })
    from = m.index + m[0].length
  }
  return clauses
}

/** "(save ends)", or with a saving throw penalty: "(save at -2 ends)" (group 1) or "(save ends, with a -2 penalty to the saving throw)" (group 2). */
const SAVE_ENDS = String.raw`\(save (?:at ([-–−]\d+) ends|ends(?:[,;]? (?:with a |the target takes a )?([-–−]\d+) penalty (?:to|on) (?:the|this) saving throw)?)\)`

/** The saveModifier field for a SAVE_ENDS match's penalty group. */
function saveModifier(penalty: string | undefined): { saveModifier?: number } {
  return penalty ? { saveModifier: -parseInt(penalty.replace(/^[-–−]/, '')) } : {}
}

/**
 * Exact "(save ends)" patterns about the target (with a printed saving throw penalty as saveModifier):
 *   "ongoing 5 fire damage (save ends)" after the attack's damage or dice ("1d10+6 and ongoing 5 ...") or "the target takes"
 *   "the target is dazed (save ends)"
 */
export function saveEndsClauses(text: string): Clause[] {
  const clauses: Clause[] = []
  const ongoing = new RegExp(`(?:^|(?:damage|\\dd\\d+(?:\\s*[+-]\\s*\\d+)?),?\\s+(?:and|plus)\\s+|the target takes\\s+)(ongoing (\\d+) (?:(${TYPE_ALT}) )?damage ${SAVE_ENDS})`, 'gi')
  for (const m of text.matchAll(ongoing)) {
    const start = m.index! + m[0].length - m[1].length
    clauses.push({
      at: [start, start + m[1].length], kind: 'ongoing-damage', amount: parseInt(m[2]),
      types: m[3] ? [m[3].toLowerCase() as DamageType] : [], who: 'target', duration: { kind: 'save-ends' }, ...saveModifier(m[4] ?? m[5]),
    })
  }
  const cond = new RegExp(`\\bthe target is (${CONDITION_ALT}) ${SAVE_ENDS}`, 'gi')
  for (const m of text.matchAll(cond)) {
    const condition = m[1].toLowerCase()
    if (!isOneOf(CONDITION_IDS, condition)) continue
    clauses.push({ at: [m.index!, m.index! + m[0].length], kind: 'condition', condition, who: 'target', duration: { kind: 'save-ends' }, ...saveModifier(m[2] ?? m[3]) })
  }
  return clauses.sort((a, b) => a.at[0] - b.at[0])
}

/** Hit line with the deterministic clauses above. */
export function hitLine(text: string, parts: DamagePartIn[]): Line {
  const l = line(text)
  l.clauses = [...damageClauses(l.text, parts), ...saveEndsClauses(l.text)].sort((a, b) => a.at[0] - b.at[0])
  return l
}

/** Sort an object's keys alphabetically (for maps like skills). */
export function sortedRecord<T>(rec: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).sort(([a], [b]) => a.localeCompare(b)))
}
