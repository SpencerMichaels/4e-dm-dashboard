#!/usr/bin/env npx tsx
// Pre-parses raw 4e HTML monster data into structured JSON.
// Run: npx tsx plugins/dnd-4e/data/build-parsed.ts
//
// Input:  plugins/dnd-4e/data/raw/monsters.json  (HTML strings keyed by monster ID)
// Output: plugins/dnd-4e/data/parsed/monsters.json (structured creature statblocks)
//
// The parsed output is embedded in the app; the raw HTML is not.

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { parseMonsterHtml } from '../importer'

function main() {
  const rawPath = join(__dirname, 'raw', 'monsters.json')
  const outDir = join(__dirname, 'parsed')
  const outPath = join(outDir, 'monsters.json')

  mkdirSync(outDir, { recursive: true })

  console.log('Reading raw monster data...')
  const raw: Record<string, string> = JSON.parse(readFileSync(rawPath, 'utf-8'))
  const ids = Object.keys(raw)
  console.log(`Parsing ${ids.length} monsters...`)

  const parsed: Record<string, any> = {}
  const allWarnings: string[] = []
  let clean = 0

  for (const id of ids) {
    const warnings: string[] = []
    try {
      const creature = parseMonsterHtml(raw[id], warnings)
      // Store everything except generated fields (id, timestamps)
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = creature
      // Attach warnings so they surface on import
      if (warnings.length > 0) {
        (rest as any)._importWarnings = warnings
        allWarnings.push(`${id} (${creature.name}): ${warnings.join('; ')}`)
      } else {
        clean++
      }
      parsed[id] = rest
    } catch (e: any) {
      allWarnings.push(`${id}: FAILED - ${e.message}`)
    }
  }

  console.log(`\nParsed: ${Object.keys(parsed).length} / ${ids.length}`)
  console.log(`Clean:  ${clean} (${(clean / ids.length * 100).toFixed(1)}%)`)
  if (allWarnings.length > 0) {
    console.log(`\nWarnings (${allWarnings.length}):`)
    for (const w of allWarnings) console.log(`  ${w}`)
  }

  const json = JSON.stringify(parsed)
  writeFileSync(outPath, json)
  console.log(`\nWrote ${outPath} (${(json.length / 1024 / 1024).toFixed(1)} MB)`)
}

main()
