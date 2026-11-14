// Read item headers from a Character Builder datapack (the D20Rules XML that
// 4ecb's CBLoader merges, e.g. combined.dnd40.merged.xml). Proprietary: tools
// read it from a path argument and never copy it into the repo.
//
// The datapack has one record per "+N" version ("Flaming Weapon +1" ... "+6");
// `cbItemsByName` groups them under the normalized base name.

/** One Character Builder item record (a magic item version, or a mundane weapon, armor or gear). */
export interface CbItem {
  name: string
  type: 'Magic Item' | 'Weapon' | 'Armor' | 'Gear'
  source: string
  level?: number
  gold?: number
  /** "Weapon", "Armor", "Neck Slot Item", "Wondrous Item", "Consumable", ... */
  magicItemType?: string
  itemSlot?: string
  rarity?: string
  /** "+1 attack rolls and damage rolls", "+2 AC", "+3 Fortitude, Reflex, and Will". */
  enhancement?: string
  // Mundane weapons
  damage?: string
  proficiency?: number
  range?: string
  weaponCategory?: string
  group?: string
  properties?: string
  // Mundane armor
  armorBonus?: number
  minEnhancement?: number
  check?: number
  speed?: number
  armorCategory?: string
}

const TYPES = new Set(['Magic Item', 'Weapon', 'Armor', 'Gear'])

const unescape = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const num = (s: string | undefined) => {
  if (s === undefined || s.trim() === '') return undefined
  const n = Number(s.trim().replace(/^\+/, ''))
  return Number.isFinite(n) ? n : undefined
}

/** Every item record of the datapack, in file order. */
export function readCbItems(xml: string): CbItem[] {
  const out: CbItem[] = []
  const re = /<RulesElement\b([^>]*)>([\s\S]*?)<\/RulesElement>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const attr = (k: string) => m![1].match(new RegExp(`\\b${k}="([^"]*)"`))?.[1]
    const type = attr('type')
    if (!type || !TYPES.has(type)) continue
    const spec: Record<string, string> = {}
    for (const s of m[2].matchAll(/<specific name="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/specific>)/g)) {
      const v = unescape((s[2] ?? '').trim())
      if (v) spec[s[1]] = v
    }
    const it: CbItem = {
      name: unescape(attr('name') ?? ''), type: type as CbItem['type'], source: unescape(attr('source') ?? ''),
      level: num(spec['Level']), gold: num(spec['Gold']),
      magicItemType: spec['Magic Item Type'], itemSlot: spec['Item Slot'], rarity: spec['Rarity'],
      enhancement: spec['Enhancement'],
      damage: spec['Damage'], proficiency: num(spec['Proficiency Bonus']), range: spec['Range'],
      weaponCategory: spec['Weapon Category'], group: spec['Group'], properties: spec['Properties'],
      armorBonus: num(spec['Armor Bonus']), minEnhancement: num(spec['Minimum Enhancement Bonus']),
      check: num(spec['Check']), speed: num(spec['Speed']), armorCategory: spec['Armor Category'],
    }
    for (const k of Object.keys(it) as (keyof CbItem)[]) if (it[k] === undefined) delete it[k]
    out.push(it)
  }
  return out
}

/** Name key shared by the compendium and the datapack: case, apostrophes, punctuation and spacing folded. */
export function itemNameKey(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'").replace(/[^a-z0-9+']+/g, ' ').trim()
}

/**
 * The base item of a version record: "Flaming Weapon +2" -> { base: "Flaming Weapon", plus: 2 };
 * "Elven Boots (paragon tier)", "Tanglefoot Bag (level 7)", "(Lvl 12)" -> the name before the parenthesis.
 */
export function splitPlus(name: string): { base: string; plus?: number } {
  const n = name.replace(/\s*\((?:(?:heroic|paragon|epic)(?: tier)?|level \d+|lvl \d+)\)$/i, '')
  const m = n.match(/^(.*?)\s*\+(\d)$/)
  return m ? { base: m[1], plus: parseInt(m[2]) } : { base: n }
}

/** Datapack records grouped by the normalized name of their base item. */
export function cbItemsByName(items: CbItem[]): Map<string, CbItem[]> {
  const byName = new Map<string, CbItem[]>()
  for (const it of items) {
    const key = itemNameKey(splitPlus(it.name).base)
    const list = byName.get(key) ?? []
    list.push(it)
    byName.set(key, list)
  }
  return byName
}
