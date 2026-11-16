// The Workshop edits kit Items with the existing item statblock editor (Dnd4eItemEditor), which
// works on the legacy campaign Item (`extra` fields). This projects a draft into that shape and
// turns only the fields the DM changed back into kit patches, as the creature adapter does.
// Unrepresented kit data (description parts, armor, property scaling, clauses) stays untouched.

import type { Item as KitItem, ItemSlot, Line } from '@kit'
import type { Item } from '../types/item'
import type { Change, Draft } from './types'
import { entryToPower, equal, powerToEntry, textLine } from './power-adapter'
import { decorate, kitEditorChanges } from './kit-editor-adapter'
import { enhancementTargetsText, impliedEnhancementTargets, parseEnhancementTargets } from '../rules/items'

const SLOTS: ItemSlot[] = ['head', 'neck', 'arms', 'hands', 'waist', 'feet', 'ring', 'body', 'weapon', 'implement', 'tattoo', 'wondrous', 'mount', 'ki-focus']
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
const slotLabel = (it: KitItem) => it.slot === 'wondrous' ? 'Wondrous Item' : it.slot ? cap(it.slot) : it.subtype ?? ''
/** "+1d6 fire damage per plus, and the target is knocked prone" */
const CRIT = /^\+?(\d+d\d+)\s+(?:(\w+)\s+)?damage per plus\b\s*(.*)$/i
const sourceText = (s: { book: string; page?: number | string }) => `${s.book}${s.page ? ', ' + s.page : ''}`
/** The editor prints its own "gp" after the price field. */
const priceText = (l: KitItem['levels'][number] | undefined) => !l ? '' : l.price !== null ? l.price.toLocaleString('en-US') : l.priceText ?? ''
/** What the item enhancement applies to: the item's own targets, else what its category implies. */
const enhancementTarget = (it: KitItem) => enhancementTargetsText(it.enhancementTargets ?? impliedEnhancementTargets(it.category, it.slot) ?? [])

/** A kit item as the item editor's model. */
export function itemToEditor(it: KitItem, id = it.id, at = ''): Item {
  const crit = it.critical?.text.match(CRIT)
  const extra: Record<string, unknown> = {
    name: it.name, level: it.level, category: it.category === 'alchemical' ? 'item' : it.category,
    rarity: it.rarity ? cap(it.rarity) : '', price: priceText(it.levels[0]), flavor: it.flavor,
    slot: slotLabel(it), itemType: it.itemType ?? '', enhancement: enhancementTarget(it),
    // The printed critical line, split into the editor's parts; unmatched text stays whole in critExtra.
    critDie: crit?.[1] ?? '', critType: crit?.[2]?.toLowerCase() ?? '', critExtra: crit ? crit[3] : it.critical?.text ?? '',
    properties: it.properties.map(p => p.text),
    // Draft node IDs (when present) anchor comments to the power cards.
    powers: it.powers.map((p, i) => ({ ...powerToEntry(p), _src: i, ...((p as { _draftNode?: string })._draftNode ? { _draftNode: (p as { _draftNode?: string })._draftNode } : {}) })),
    groups: it.weapon?.groups ?? [], damage: it.weapon?.damage ?? '', proficiency: it.weapon ? `+${it.weapon.proficiency}` : '',
    range: it.weapon?.range ?? '', weight: it.weapon?.weight ?? it.weight ?? '',
    special: it.special?.text ?? '', requirement: it.requirement?.text ?? '',
    keySkill: it.ritual?.keySkill ?? '', castTime: it.ritual?.castTime ?? '', duration: it.ritual?.duration ?? '', componentCost: it.ritual?.componentCost ?? '',
    alchemicalType: it.alchemical?.type ?? '', formulaCost: it.alchemical?.formulaCost ?? '',
    source: it.sources.map(sourceText).join('; '),
  }
  return { id, name: it.name, tags: [], extra, createdAt: at, updatedAt: at }
}

export const draftToItemEditor = (d: Draft): Item => itemToEditor(decorate<KitItem>(d), d.id, d.updatedAt)

/** Field-level kit changes for what the item editor changed: the edited item is rebuilt on a copy
 *  whose node entries keep their draft IDs, then diffed by the kit adapter (node operations, leaf
 *  edits, and unsets for cleared fields). */
export function itemEditorChanges(d: Draft, before: Item, after: Item): Change[] {
  return kitEditorChanges(d, itemFromEditor(decorate<KitItem>(d), before, after))
}

/** The kit item with only the fields the item editor changed applied; everything else is kept. */
export function itemFromEditor(source: KitItem, before: Item, after: Item): KitItem {
  const it = source
  const next = structuredClone(source) as KitItem & Record<string, any>
  const b = before.extra as Record<string, any>, a = after.extra as Record<string, any>
  const changed = (key: string) => !equal(b[key], a[key])
  const set = (path: string, value: unknown) => { next[path] = value }
  const unset = (path: string) => { delete next[path] }
  const str = (key: string) => String(a[key] ?? '').trim()
  const line = (path: keyof KitItem, key: string) => { if (!changed(key)) return; const text = str(key); if (text) set(path, textLine(text, it[path] as Line | undefined)); else if (it[path]) unset(path) }

  if (before.name !== after.name || changed('name')) set('name', after.name)
  if (changed('level')) {
    const level = Number(a.level) || 0
    set('level', level)
    if (it.levels.length === 1) set('levels', [{ ...it.levels[0], level }])
  }
  if (changed('rarity')) set('rarity', a.rarity ? String(a.rarity).toLowerCase() : null)
  if (changed('category')) set('category', a.category)
  if (changed('flavor')) set('flavor', a.flavor ?? '')
  if (changed('itemType')) { if (str('itemType')) set('itemType', str('itemType')); else if (it.itemType) unset('itemType') }
  if (changed('slot')) {
    const label = str('slot').toLowerCase()
    const slot = label === 'wondrous item' ? 'wondrous' : SLOTS.includes(label as ItemSlot) ? label as ItemSlot : undefined
    if (slot) { set('slot', slot); if (it.subtype) unset('subtype') }
    else { if (it.slot) unset('slot'); if (str('slot')) set('subtype', str('slot')); else if (it.subtype) unset('subtype') }
  }
  if (changed('price')) {
    const text = str('price')
    const gp = text.match(/^([\d,]+)(?:\s*gp)?$/i)
    const first = { ...(it.levels[0] ?? { level: it.level }), ...(gp ? { price: Number(gp[1].replace(/,/g, '')) } : { price: null, priceText: text }) }
    if (gp) delete (first as { priceText?: string }).priceText
    set('levels', [first, ...it.levels.slice(1)])
  }
  if (changed('enhancement')) {
    const targets = parseEnhancementTargets(str('enhancement'))
    if (targets) set('enhancementTargets', targets); else if (it.enhancementTargets) unset('enhancementTargets')
  }
  if (changed('critDie') || changed('critType') || changed('critExtra')) {
    const die = str('critDie')
    const text = die ? `+${die} ${a.critType ? a.critType + ' ' : ''}damage per plus${str('critExtra') ? ' ' + str('critExtra') : ''}` : str('critExtra')
    if (text) set('critical', textLine(text, it.critical)); else if (it.critical) unset('critical')
  }
  if (changed('properties')) set('properties', (a.properties as string[]).filter(s => s.trim()).map((text, i) => next.properties[i]?.text === text ? next.properties[i] : textLine(text)))
  line('special', 'special'); line('requirement', 'requirement')
  if (changed('powers')) set('powers', (a.powers as any[]).map(e => {
    const original = typeof e._src === 'number' ? next.powers[e._src] : undefined
    const from = typeof e._src === 'number' ? (b.powers as any[])[e._src] : {}
    return entryToPower(original, from ?? {}, e)
  }))
  const weaponKeys = ['groups', 'damage', 'proficiency', 'range']
  if (weaponKeys.some(changed) || (it.weapon && changed('weight'))) {
    const weapon = { ...(it.weapon ?? { damage: '', proficiency: 2, groups: [], properties: [], category: '' }), groups: a.groups ?? [], damage: str('damage'), proficiency: Number(String(a.proficiency).replace('+', '')) || 0 }
    if (str('range')) weapon.range = str('range'); else delete weapon.range
    if (str('weight')) weapon.weight = str('weight'); else delete weapon.weight
    set('weapon', weapon)
  } else if (changed('weight')) { if (str('weight')) set('weight', str('weight')); else if (it.weight) unset('weight') }
  const ritualKeys = ['keySkill', 'castTime', 'duration', 'componentCost']
  if (ritualKeys.some(changed)) set('ritual', { ...(it.ritual ?? { category: '' }), keySkill: str('keySkill'), castTime: str('castTime'), duration: str('duration'), componentCost: str('componentCost') })
  if (changed('alchemicalType') || changed('formulaCost')) {
    if (!str('alchemicalType') && !str('formulaCost')) { if (it.alchemical) unset('alchemical') }
    else set('alchemical', { ...(str('alchemicalType') ? { type: str('alchemicalType') } : {}), ...(str('formulaCost') ? { formulaCost: str('formulaCost') } : {}) })
  }
  if (changed('source')) set('sources', str('source').split(';').map(s => s.trim()).filter(Boolean).map(s => it.sources.find(o => sourceText(o) === s) ?? { book: s }))
  return next
}
