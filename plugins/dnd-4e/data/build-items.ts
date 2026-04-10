#!/usr/bin/env npx tsx
// Pre-parses raw 4e item HTML data into structured JSON.
// Run: npx tsx plugins/dnd-4e/data/build-items.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parseItemHtml, type ParsedItem } from '../item-parser'
import { extractFirstBook } from './build-utils'

const RAW_DIR = join(__dirname, 'raw')
const OUT_DIR = join(__dirname, 'parsed')

const CATEGORIES = [
  { file: 'item.json', category: 'item' as const },
  { file: 'weapon.json', category: 'weapon' as const },
  { file: 'armor.json', category: 'armor' as const },
  { file: 'implement.json', category: 'implement' as const },
  { file: 'ritual.json', category: 'ritual' as const },
]

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const parsed: Record<string, ParsedItem> = {}
  let total = 0, success = 0
  const warnings: string[] = []
  const byCat: Record<string, number> = {}

  for (const { file, category } of CATEGORIES) {
    const path = join(RAW_DIR, file)
    if (!existsSync(path)) {
      console.log(`Skipping ${file} (not found)`)
      continue
    }

    const raw: Record<string, string> = JSON.parse(readFileSync(path, 'utf-8'))
    let catCount = 0

    for (const [id, html] of Object.entries(raw)) {
      total++
      try {
        const item = parseItemHtml(html, category)
        parsed[id] = item
        success++
        catCount++
      } catch (e: any) {
        warnings.push(`${id}: FAILED - ${e.message}`)
      }
    }

    byCat[category] = catCount
    console.log(`${category}: ${catCount} entries`)
  }

  // Tag standalone items belonging to sets
  const setNames = Object.values(parsed).filter(i => i.category === 'set').map(i => i.name)
  let tagged = 0
  for (const item of Object.values(parsed)) {
    if (item.category === 'set' || item.itemSet) continue
    // Check if item name contains a set name suffix (e.g. "Pact Blade - Zy Tormtor's Trinkets")
    for (const setName of setNames) {
      if (item.name.includes(setName) || item.name.endsWith(' - ' + setName)) {
        item.itemSet = setName
        tagged++
        break
      }
    }
  }
  // Also check set component tables for exact name matches + resolve links
  const nameToId = new Map<string, string>()
  for (const [id, item] of Object.entries(parsed)) {
    if (item.category !== 'set' && item.category !== 'ritual') nameToId.set(item.name.toLowerCase(), id)
  }

  for (const setItem of Object.values(parsed).filter(i => i.category === 'set')) {
    const itemsTable = setItem.descriptionParts?.find(p => p.type === 'table' && p.headers?.includes('Name'))
    if (!itemsTable || itemsTable.type !== 'table') continue
    const nameCol = itemsTable.headers.indexOf('Name')
    if (nameCol < 0) continue
    const links: Record<string, string> = {}
    for (let ri = 0; ri < itemsTable.rows.length; ri++) {
      const componentName = itemsTable.rows[ri][nameCol]
      if (!componentName) continue
      // Tag standalone items with set membership
      for (const [id, item] of Object.entries(parsed)) {
        if (item.category === 'set' || item.itemSet) continue
        if (item.name === componentName) {
          item.itemSet = setItem.name
          tagged++
        }
      }
      // Resolve link: try exact match, then case-insensitive
      const linkedId = nameToId.get(componentName.toLowerCase())
      if (linkedId) links[`${ri},${nameCol}`] = linkedId
    }
    if (Object.keys(links).length > 0) itemsTable.links = links
  }
  if (tagged > 0) console.log(`Tagged ${tagged} items with set membership`)

  // Link alchemical rituals to their corresponding item entries
  // Only for rituals that had embedded sub-items in the raw HTML
  const ritualRaw: Record<string, string> = existsSync(join(RAW_DIR, 'ritual.json'))
    ? JSON.parse(readFileSync(join(RAW_DIR, 'ritual.json'), 'utf-8')) : {}
  const alchemicalRitualIds = new Set<string>()
  for (const [id, html] of Object.entries(ritualRaw)) {
    if (html.includes('class=magicitem')) alchemicalRitualIds.add(id)
  }

  let linkedRituals = 0
  for (const [id, ritual] of Object.entries(parsed)) {
    if (ritual.category !== 'ritual' || !alchemicalRitualIds.has(id)) continue
    // Find matching item by exact name
    const itemId = nameToId.get(ritual.name.toLowerCase())
    if (!itemId) continue
    const item = parsed[itemId]
    if (!item) continue
    // Add a table linking to the item
    const table: { type: 'table'; headers: string[]; rows: string[][]; links?: Record<string, string> } = {
      type: 'table',
      headers: ['Item', 'Level', 'Price'],
      rows: [],
      links: {},
    }
    if (item.levels && item.levels.length > 0) {
      for (const lvl of item.levels) {
        table.rows.push([item.name, String(lvl.level), lvl.price])
      }
    } else {
      table.rows.push([item.name, String(item.level), item.price])
    }
    // Link the first column of every row to the item
    for (let ri = 0; ri < table.rows.length; ri++) {
      table.links![`${ri},0`] = itemId
    }
    if (!ritual.descriptionParts) ritual.descriptionParts = []
    ritual.descriptionParts.push(table)
    linkedRituals++
  }
  if (linkedRituals > 0) console.log(`Linked ${linkedRituals} alchemical rituals to their items`)

  console.log(`\nTotal: ${total} | Parsed: ${success} | Failed: ${total - success}`)
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`)
    for (const w of warnings.slice(0, 20)) console.log(`  ${w}`)
  }

  // Stats
  const withLevel = Object.values(parsed).filter(i => i.level > 0).length
  const withPowers = Object.values(parsed).filter(i => i.powers.length > 0).length
  const withProps = Object.values(parsed).filter(i => i.properties.length > 0).length
  console.log(`\nWith level: ${withLevel} | With powers: ${withPowers} | With properties: ${withProps}`)
  console.log('By category:', JSON.stringify(byCat))

  const json = JSON.stringify(parsed)
  const outPath = join(OUT_DIR, 'items.json')
  writeFileSync(outPath, json)
  console.log(`\nWrote ${outPath} (${(json.length / 1024 / 1024).toFixed(1)} MB)`)

  // Build compact index for fast compendium browsing
  const indexEntries = Object.entries(parsed).map(([id, item]) => {
    const maxLevel = item.levels && item.levels.length > 1
      ? Math.max(...item.levels.map(l => l.level)) : undefined
    return {
      id, name: item.name,
      category: item.category, level: item.level,
      maxLevel,
      rarity: item.rarity, price: item.price, slot: item.slot,
      source: extractFirstBook(item.source ?? ''),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const indexJson = JSON.stringify(indexEntries)
  const indexPath = join(OUT_DIR, 'items-index.json')
  writeFileSync(indexPath, indexJson)
  console.log(`Wrote ${indexPath} (${(indexJson.length / 1024).toFixed(0)} KB, ${indexEntries.length} entries)`)
}

main()
