#!/usr/bin/env npx tsx
// Pre-parses raw 4e item HTML data into structured JSON.
// Run: npx tsx plugins/dnd-4e/data/build-items.ts

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parseItemHtml, type ParsedItem } from '../item-parser'

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
}

main()
