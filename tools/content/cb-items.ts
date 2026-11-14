// Cross-check item headers against a Character Builder datapack.
//
// Run: npm run content:cb-items -- --datapack <combined.dnd40.merged.xml> [--out <report.json>]
//   (default report: content/cb-items-report.json, untracked)
//
// Items are matched by normalized name (cb-datapack.ts), versions by enhancement
// bonus ("+N" records) or else by level. The compendium (DDI) text is the newer,
// errata'd source, so nothing is overwritten: the report lists level, price,
// rarity, enhancement-target and mundane weapon/armor stat mismatches, and the
// versions whose price the compendium leaves out but the datapack has at the
// same level ("fillable"). A name whose datapack levels share none of the
// compendium's is reported as a different item, not compared.

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Item } from '@kit'
import { cbItemsByName, itemNameKey, readCbItems, splitPlus, type CbItem } from './cb-datapack'
import { enhancementTargetsOf } from './convert/item'
import { publishedEntries } from './convert/published'

const CONTENT = join(__dirname, '..', '..', 'content')

export interface CbReport {
  summary: Record<string, number>
  levelMismatch: { id: string; name: string; enhancement: number; ddi: number; cb: number }[]
  priceMismatch: { id: string; name: string; level: number; ddi: number; cb: number }[]
  fillable: { id: string; name: string; level: number; cb: number }[]
  rarityMismatch: { id: string; name: string; ddi: string | null; cb: string }[]
  enhancementMismatch: { id: string; name: string; ddi: string[]; cb: string[] }[]
  statMismatch: { id: string; name: string; field: string; ddi: unknown; cb: unknown }[]
  differentItem: { id: string; name: string; ddiLevels: number[]; cbLevels: number[] }[]
  unmatched: { id: string; name: string; category: string }[]
}

/** Compare kit items with datapack records; pure, for tests. */
export function crossCheck(items: Item[], cb: CbItem[]): CbReport {
  const byName = cbItemsByName(cb)
  const r: CbReport = {
    summary: {}, levelMismatch: [], priceMismatch: [], fillable: [], rarityMismatch: [],
    enhancementMismatch: [], statMismatch: [], differentItem: [], unmatched: [],
  }
  let matched = 0, versions = 0
  for (const it of items) {
    if (it.category === 'set' || it.category === 'ritual') continue
    const recs = byName.get(itemNameKey(it.name))
    if (!recs) { r.unmatched.push({ id: it.id, name: it.name, category: it.category }); continue }
    matched++
    const magic = recs.filter(c => c.type === 'Magic Item')
    const mundane = recs.find(c => c.type !== 'Magic Item')

    if (magic.length > 0) {
      const cbLevels = magic.map(c => c.level ?? 0)
      const plus = (c: CbItem) => splitPlus(c.name).plus
      const byPlus = it.levels.some(l => l.enhancement !== undefined) && magic.some(c => plus(c) !== undefined)
      if (!byPlus && !it.levels.some(l => cbLevels.includes(l.level))) {
        r.differentItem.push({ id: it.id, name: it.name, ddiLevels: it.levels.map(l => l.level), cbLevels })
        continue
      }
      for (const l of it.levels) {
        const c = byPlus ? magic.find(m => plus(m) === l.enhancement) : magic.find(m => m.level === l.level)
        if (!c) continue
        versions++
        if (byPlus && c.level !== undefined && c.level !== l.level) {
          r.levelMismatch.push({ id: it.id, name: it.name, enhancement: l.enhancement!, ddi: l.level, cb: c.level })
        }
        if (!c.gold || c.level !== l.level) continue
        if (l.price === null && l.priceText === undefined) r.fillable.push({ id: it.id, name: it.name, level: l.level, cb: c.gold })
        else if (l.price !== null && l.price !== c.gold) r.priceMismatch.push({ id: it.id, name: it.name, level: l.level, ddi: l.price, cb: c.gold })
      }
      const cbRarity = magic[0].rarity?.toLowerCase().match(/^(common|uncommon|rare)\b/)?.[1]
      if (cbRarity && it.rarity && cbRarity !== it.rarity) r.rarityMismatch.push({ id: it.id, name: it.name, ddi: it.rarity, cb: cbRarity })
      const cbEnh = magic.find(c => c.enhancement)?.enhancement
      const cbTargets = cbEnh ? enhancementTargetsOf(cbEnh.replace(/^\s*\+\d+\s*/, ''), true, it.category, it.slot) : undefined
      const ddiTargets = it.enhancementTargets ?? []
      if (cbTargets && cbTargets.join() !== ddiTargets.join()) {
        r.enhancementMismatch.push({ id: it.id, name: it.name, ddi: ddiTargets, cb: cbTargets })
      }
    }

    if (mundane && it.weapon && mundane.type === 'Weapon') {
      const stat = (field: string, ddi: unknown, cbv: unknown) => {
        if (cbv !== undefined && String(ddi).replace(/\s/g, '') !== String(cbv).replace(/\s/g, '')) r.statMismatch.push({ id: it.id, name: it.name, field, ddi, cb: cbv })
      }
      stat('weapon.damage', it.weapon.damage, mundane.damage)
      stat('weapon.proficiency', it.weapon.proficiency, mundane.proficiency)
      if (mundane.gold !== undefined && it.levels[0]?.price !== null && it.levels[0]?.price !== mundane.gold) {
        r.priceMismatch.push({ id: it.id, name: it.name, level: it.levels[0].level, ddi: it.levels[0].price, cb: mundane.gold })
      }
    }
    if (mundane && it.armor && mundane.type === 'Armor') {
      const stat = (field: string, ddi: number | undefined, cbv: number | undefined) => {
        if (cbv !== undefined && (ddi ?? 0) !== cbv) r.statMismatch.push({ id: it.id, name: it.name, field, ddi, cb: cbv })
      }
      stat('armor.acBonus', it.armor.acBonus, mundane.armorBonus)
      stat('armor.check', it.armor.check, mundane.check)
      stat('armor.speed', it.armor.speed, mundane.speed)
      stat('armor.minEnhancement', it.armor.minEnhancement, mundane.minEnhancement)
    }
  }
  r.summary = {
    items: items.filter(i => i.category !== 'set' && i.category !== 'ritual').length, matched, versionsCompared: versions,
    ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'summary').map(([k, v]) => [k, (v as unknown[]).length])),
  }
  return r
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  const datapack = arg('--datapack')
  if (!datapack) throw new Error('Pass --datapack <path to the Character Builder XML>')
  const out = arg('--out') ?? join(CONTENT, 'cb-items-report.json')
  const ctx = { provenance: { origin: 'parser' as const, by: 'tools/content', at: '' } }
  const items = (await publishedEntries(CONTENT, 'item', ctx)).map(([, convert]) => convert() as Item)
  const report = crossCheck(items, readCbItems(readFileSync(datapack, 'utf-8')))
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report.summary))
  console.log(`Wrote ${out}`)
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
