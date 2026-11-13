// Parsed item (item-parser output) -> kit Item.

import type { Attack, DescriptionPart, Item, ItemSlot, Power } from '@kit'
import type { DescriptionPart as ParsedDescriptionPart, ItemPower, ParsedItem } from '../item-parser'
import {
  Notes, compact, hitLine, line, normText, optLine, parseAttackLine, parseSources, provenanceFor,
  toActionType, toUsage, type ConvertContext,
} from './common'

const SLOT_MAP: Record<string, ItemSlot> = {
  'head': 'head', 'neck': 'neck', 'arms': 'arms', 'hands': 'hands', 'waist': 'waist', 'feet': 'feet',
  'ring': 'ring', 'body': 'body', 'armor': 'body', 'weapon': 'weapon', 'implement': 'implement',
  'tattoo': 'tattoo', 'wondrous item': 'wondrous', 'mount': 'mount', 'ki focus': 'ki-focus',
}

/**
 * Printed price -> gp. "2,625,000 gp" -> 2625000; "5 sp" -> 0.5 and "2 cp" ->
 * 0.02 (printed text kept); "Special", "—" -> null with the printed text;
 * no price at all -> null.
 */
export function parsePrice(raw: string | undefined): { price: number | null; priceText?: string } {
  const text = normText((raw ?? '').replace(/\s*Published in[\s\S]*$/i, '')).replace(/\.$/, '')
  if (!text) return { price: null }
  const m = text.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*(gp|sp|cp)?$/i)
  if (!m) {
    const gp = text.replace(/,/g, '').match(/(\d+)\s*gp\b/i)
    return gp ? { price: parseInt(gp[1]) } : { price: null, priceText: text }
  }
  const unit = (m[2] ?? '').toLowerCase()
  const value = parseFloat(m[1]) / (unit === 'sp' ? 10 : unit === 'cp' ? 100 : 1)
  return unit === 'gp' ? { price: value } : { price: Math.round(value * 100) / 100, priceText: text }
}

const TIERS = { heroic: 'heroic', paragon: 'paragon', epic: 'epic' } as const

/** "Paragon Tier", "Heroic Tier Group Set", or an artifact's "Epic Level" heading -> tier. */
export function tierOf(text: string | undefined): Item['tier'] {
  const m = normText(text ?? '').toLowerCase().match(/^(heroic|paragon|epic) (?:tier|level)\b/)
  return m ? TIERS[m[1] as keyof typeof TIERS] : undefined
}

/**
 * Mundane armor stat lines ("AC Bonus: +3", "Check: -1", "Speed: -1",
 * "Minimum Enhancement Value: +4", "Type: Leather") -> Item.armor, plus the
 * description with those lines removed.
 */
export function armorFrom(description: string): { armor: NonNullable<Item['armor']>; rest: string } | undefined {
  const ac = description.match(/^(?:AC|Shield) Bonus:\s*\+?(\d+)\s*$/m)
  if (!ac) return undefined
  const num = (label: string) => {
    const m = description.match(new RegExp(`^${label}:\\s*([+-−]?\\d+)\\s*$`, 'm'))
    return m ? parseInt(m[1].replace('−', '-')) : undefined
  }
  const armor = compact({
    category: description.match(/^Type:\s*(.+?)\s*$/m)?.[1] ?? '',
    acBonus: parseInt(ac[1]),
    check: num('Check'),
    speed: num('Speed'),
    minEnhancement: num('Minimum Enhancement Value'),
  })
  const rest = description.split('\n')
    .filter(l => !/^(?:AC Bonus|Shield Bonus|Check|Speed|Minimum Enhancement Value|Type):/.test(l.trim()))
    .join('\n').trim()
  return { armor, rest }
}

/** The slot heading when it names a kind of item rather than a body slot ("Consumable", "Divine Boon"). */
function subtypeOf(it: ParsedItem, slot: ItemSlot | undefined): string | undefined {
  if (/group set/i.test(it.rarity ?? '')) return 'Group Set'
  if (it.alchemicalType && it.alchemicalType !== 'Alchemical Item') return it.alchemicalType
  const s = normText(it.slot ?? '')
  if (!s || slot) return undefined
  // Rituals print their category there (kept in ritual.category); sets say "Item Set".
  if (it.category === 'ritual' || s === 'Item Set' || (s === 'Alchemical Item' && it.alchemicalType)) return undefined
  return s
}

/** "15 lb.Cost: Special" -> "15 lb." (the parser runs the next label into the weight). */
function cleanWeight(w: string): string {
  return normText(w.replace(/(?:Cost|Price):[\s\S]*$/i, ''))
}

export function convertItem(id: string, it: ParsedItem, ctx: ConvertContext, rawHtml?: string): Item {
  const notes = new Notes()
  const category: Item['category'] = it.alchemicalType ? 'alchemical' : it.category
  const rarity = (it.rarity ?? '').toLowerCase()
  const tier = tierOf(it.rarity) ?? tierOf(rawHtml?.match(/class=milevel[^>]*>([^<]*)/)?.[1])

  const levels: Item['levels'] = []
  for (const l of it.levels ?? []) {
    const { price, priceText } = parsePrice(l.price)
    levels.push(compact({ level: l.level, enhancement: l.enhancement ? parseInt(l.enhancement) : undefined, price, priceText }))
    if (l.overrides && Object.keys(l.overrides).length > 0) notes.add(`level ${l.level} overrides: ${JSON.stringify(l.overrides)}`)
  }
  if (levels.length === 0) {
    const { price, priceText } = parsePrice(it.price)
    levels.push(compact({ level: it.level, price, priceText }))
  }

  const slotKey = (it.slot ?? '').toLowerCase()
  const slot = SLOT_MAP[slotKey]
  const subtype = subtypeOf(it, slot)
  if (rarity && !['common', 'uncommon', 'rare'].includes(rarity) && !tier) notes.add(`rarity "${it.rarity}" is not common/uncommon/rare`)
  const armor = category === 'armor' && !it.descriptionParts ? armorFrom(it.description ?? '') : undefined
  // The usual enhancement targets follow from the slot; only note unusual ones.
  if (it.enhancement && !/^(attack rolls and damage rolls|ac|fortitude, reflex, and will)\.?$/i.test(it.enhancement.trim())) {
    notes.add(`enhancement applies to: ${it.enhancement}`)
  }
  if (it.propertyScaling?.length) notes.add(`property scaling: ${it.propertyScaling.map(s => `Level ${s.level}: ${s.text}`).join(' ')}`)
  if (it.special) notes.add(`special: ${normText(it.special)}`)
  if (it.requirement) notes.add(`requirement: ${normText(it.requirement)}`)
  if (it.formulaCost) notes.add(`alchemical formula cost: ${it.formulaCost}`)
  if (it.alchemicalType === 'Alchemical Item') notes.add(`alchemical type: ${it.alchemicalType}`)

  const isWeapon = it.category === 'weapon' && (it.damage || it.proficiency)
  const isRitual = it.category === 'ritual' || !!it.keySkill

  const item: Item = {
    id,
    name: it.name,
    category,
    level: it.level,
    rarity: rarity === 'common' || rarity === 'uncommon' || rarity === 'rare' ? rarity : null,
    tier,
    levels,
    slot,
    subtype,
    itemType: it.itemType || undefined,
    critical: optLine(it.critical),
    properties: (it.properties ?? []).map(p => line(p)),
    powers: (it.powers ?? []).map(p => convertItemPower(p, notes)),
    weapon: isWeapon ? compact({
      damage: it.damage ?? '',
      proficiency: parseInt(it.proficiency ?? '0') || 0,
      range: it.range || undefined,
      groups: it.groups ?? [],
      properties: it.properties ?? [],
      category: it.weaponCategory ?? '',
      weight: it.weight ? cleanWeight(it.weight) : undefined,
    }) : undefined,
    armor: armor?.armor,
    ritual: isRitual ? {
      keySkill: it.keySkill ?? '',
      castTime: it.castTime ?? '',
      duration: it.duration ?? '',
      componentCost: it.componentCost ?? '',
      category: it.ritualCategory ?? '',
    } : undefined,
    itemSet: it.itemSet || undefined,
    flavor: it.flavor ?? '',
    description: it.descriptionParts ? it.descriptionParts.map(d => convertDescriptionPart(d, notes))
      : (armor?.rest ?? it.description) ? [{ type: 'text', text: armor?.rest ?? it.description }] : [],
    sources: parseSources(it.source ?? '', notes),
    provenance: undefined as never,
  }
  if (it.weight && !isWeapon) notes.add(`weight: ${cleanWeight(it.weight)}`)
  item.provenance = provenanceFor(ctx, notes)
  return compact(item)
}

/** Description parts keep their shape; artifact and set powers become kit Powers. */
function convertDescriptionPart(d: ParsedDescriptionPart, notes: Notes): DescriptionPart {
  if (d.type === 'power') return { type: 'power', power: convertItemPower(d.power, notes) }
  if (d.type === 'table') {
    if (d.links && Object.keys(d.links).length > 0) notes.add(`table links: ${JSON.stringify(d.links)}`)
    return { type: 'table', headers: d.headers, rows: d.rows }
  }
  return d
}

function convertItemPower(p: ItemPower, notes: Notes): Power {
  const action = toActionType(p.action.replace(/^.*;\s*/, ''))
  const usage = toUsage(p.usage)
  const name = normText(p.name.replace(/^[⚔➶ᗕ✻☼]\s*/, ''))
  if (!action && p.action) notes.add(`power "${name}": action "${p.action}" unknown, using standard`)
  if (!usage) notes.add(`power "${name}": usage "${p.usage}" unknown, using at-will`)
  if (/;/.test(p.action)) notes.add(`power "${name}": action "${p.action}"`)

  const attacks: Attack[] = []
  if (p.attack) {
    const a = parseAttackLine(p.attack)
    if (a) {
      attacks.push(compact({
        label: 'primary', ...a, target: a.target || p.target || '',
        hit: p.hit ? hitLine(p.hit, []) : undefined, miss: optLine(p.miss),
      } as Attack))
    } else {
      notes.add(`power "${name}": attack line not parsed: ${normText(p.attack)}`)
    }
  } else if (p.hit || p.miss) {
    notes.add(`power "${name}": hit/miss without an attack line`)
  }

  // Remaining body text is the effect when there is no labeled Effect line.
  const effectText = p.effect || (p.text && !p.effect ? p.text : '')
  if (p.effect && p.text) notes.add(`power "${name}": extra text: ${normText(p.text)}`)

  return compact({
    name,
    action: action ?? 'standard',
    usage: usage ?? 'at-will',
    keywords: (p.keywords ?? []).map(k => k.toLowerCase()),
    trigger: optLine(p.trigger),
    requirement: optLine(p.requirement),
    attacks,
    effect: optLine(effectText),
    sustain: p.sustain ? { action: 'minor', line: line(p.sustain) } : undefined,
    levelSteps: p.levelScaling?.length ? p.levelScaling.map(s => ({ level: s.level, text: s.text })) : undefined,
  } as Power)
}
