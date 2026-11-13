// Parsed item (item-parser output) -> kit Item.

import type { Attack, DescriptionPart, Item, ItemSlot, Power } from '@kit'
import type { DescriptionPart as ParsedDescriptionPart, ItemPower, ParsedItem } from '../item-parser'
import {
  Notes, compact, line, normText, optLine, parseAttackLine, parseSource, provenanceFor,
  toActionType, toUsage, type ConvertContext,
} from './common'

const SLOT_MAP: Record<string, ItemSlot> = {
  'head': 'head', 'neck': 'neck', 'arms': 'arms', 'hands': 'hands', 'waist': 'waist', 'feet': 'feet',
  'ring': 'ring', 'body': 'body', 'armor': 'body', 'weapon': 'weapon', 'implement': 'implement',
  'tattoo': 'tattoo', 'wondrous item': 'wondrous', 'mount': 'mount', 'ki focus': 'ki-focus',
}

/** "2,625,000 gp" -> 2625000; non-numeric prices ("Special") -> undefined. */
export function parsePrice(price: string | undefined): number | undefined {
  const m = (price ?? '').replace(/,/g, '').match(/(\d+)\s*gp/i)
  return m ? parseInt(m[1]) : undefined
}

export function convertItem(id: string, it: ParsedItem, ctx: ConvertContext): Item {
  const notes = new Notes()
  const category: Item['category'] = it.alchemicalType ? 'alchemical' : it.category
  const rarity = (it.rarity ?? '').toLowerCase()

  const levels: Item['levels'] = []
  for (const l of it.levels ?? []) {
    const price = parsePrice(l.price)
    if (price === undefined) notes.add(`level ${l.level} price "${l.price}" is not numeric`)
    levels.push(compact({ level: l.level, enhancement: l.enhancement ? parseInt(l.enhancement) : undefined, price: price ?? 0 }))
    if (l.overrides && Object.keys(l.overrides).length > 0) notes.add(`level ${l.level} overrides: ${JSON.stringify(l.overrides)}`)
  }
  if (levels.length === 0) {
    const price = parsePrice(it.price)
    if (it.price && price === undefined) notes.add(`price "${it.price}" is not numeric`)
    levels.push({ level: it.level, price: price ?? 0 })
  }

  const slotKey = (it.slot ?? '').toLowerCase()
  const slot = SLOT_MAP[slotKey]
  if (it.slot && !slot) notes.add(`slot "${it.slot}" is not a kit ItemSlot`)
  if (rarity && !['common', 'uncommon', 'rare'].includes(rarity)) notes.add(`rarity "${it.rarity}" is not common/uncommon/rare`)
  // The usual enhancement targets follow from the slot; only note unusual ones.
  if (it.enhancement && !/^(attack rolls and damage rolls|ac|fortitude, reflex, and will)\.?$/i.test(it.enhancement.trim())) {
    notes.add(`enhancement applies to: ${it.enhancement}`)
  }
  if (it.propertyScaling?.length) notes.add(`property scaling: ${it.propertyScaling.map(s => `Level ${s.level}: ${s.text}`).join(' ')}`)
  if (it.special) notes.add(`special: ${normText(it.special)}`)
  if (it.requirement) notes.add(`requirement: ${normText(it.requirement)}`)
  if (it.formulaCost) notes.add(`alchemical formula cost: ${it.formulaCost}`)
  if (it.alchemicalType) notes.add(`alchemical type: ${it.alchemicalType}`)

  const isWeapon = it.category === 'weapon' && (it.damage || it.proficiency)
  const isRitual = it.category === 'ritual' || !!it.keySkill

  const item: Item = {
    id,
    name: it.name,
    category,
    level: it.level,
    rarity: rarity === 'common' || rarity === 'uncommon' || rarity === 'rare' ? rarity : null,
    levels,
    slot,
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
      weight: it.weight || undefined,
    }) : undefined,
    ritual: isRitual ? {
      keySkill: it.keySkill ?? '',
      castTime: it.castTime ?? '',
      duration: it.duration ?? '',
      componentCost: it.componentCost ?? '',
      category: it.ritualCategory ?? '',
    } : undefined,
    itemSet: it.itemSet || undefined,
    flavor: it.flavor ?? '',
    description: it.descriptionParts ? it.descriptionParts.map(d => convertDescriptionPart(d, notes)) : (it.description ? [{ type: 'text', text: it.description }] : []),
    source: parseSource(it.source ?? '', notes),
    provenance: undefined as never,
  }
  if (it.weight && !isWeapon) notes.add(`weight: ${it.weight}`)
  item.provenance = provenanceFor(ctx, notes)
  return compact(item)
}

/**
 * Description parts keep their shape. Artifact concordance powers
 * ({ type: 'power' }) have no kit DescriptionPart yet: they are converted to a
 * kit Power under the same type (proposed schema addition) and noted.
 */
function convertDescriptionPart(d: ParsedDescriptionPart, notes: Notes): DescriptionPart {
  if (d.type === 'power') {
    notes.add('description has a power part (no kit DescriptionPart for powers)')
    return { type: 'power', power: convertItemPower(d.power, notes) } as unknown as DescriptionPart
  }
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
        hit: optLine(p.hit), miss: optLine(p.miss),
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
