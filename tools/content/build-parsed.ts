#!/usr/bin/env npx tsx
// Pre-parses raw 4e HTML monster data into structured JSON.
// Run: npm run content:build (rebuilds all content/parsed files)
//
// Input:  content/raw/monsters.json  (HTML strings keyed by monster ID)
// Output: content/parsed/monsters.json (structured creature statblocks)
//
// The parsed output is embedded in the app; the raw HTML is not.

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const CONTENT_DIR = join(__dirname, '..', '..', 'content')
import { parseMonsterHtml } from './html-parser'
import { extractFirstBook } from './build-utils'

function main() {
  const rawPath = join(CONTENT_DIR, 'raw', 'monsters.json')
  const outDir = join(CONTENT_DIR, 'parsed')
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

  // Build compact index for fast compendium browsing
  const indexEntries = Object.entries(parsed).map(([id, entry]: [string, any]) => {
    const sb = entry.statBlock
    return {
      id, name: entry.name ?? 'Unknown',
      level: sb?.level ?? 1, role: sb?.role ?? '', modifier: sb?.monsterModifier ?? '',
      size: sb?.size ?? 'Medium', origin: sb?.origin ?? '', type: sb?.creatureType ?? '',
      alignment: sb?.alignment ?? '', xp: sb?.xp ?? 0,
      source: extractFirstBook(sb?.source ?? ''),
    }
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

  const indexJson = JSON.stringify(indexEntries)
  const indexPath = join(outDir, 'monsters-index.json')
  writeFileSync(indexPath, indexJson)
  console.log(`Wrote ${indexPath} (${(indexJson.length / 1024).toFixed(0)} KB, ${indexEntries.length} entries)`)
}

main()
