#!/usr/bin/env npx tsx
// Pre-parses raw 4e trap HTML data into structured JSON.
// Run: npx tsx tools/content/build-traps.ts

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const CONTENT_DIR = join(__dirname, '..', '..', 'content')
import { parseTrapHtml, type ParsedTrap } from './trap-parser'
import { extractFirstBook } from './build-utils'

function main() {
  const rawPath = join(CONTENT_DIR, 'raw', 'trap.json')
  const outDir = join(CONTENT_DIR, 'parsed')

  mkdirSync(outDir, { recursive: true })

  console.log('Reading raw trap data...')
  const raw: Record<string, string> = JSON.parse(readFileSync(rawPath, 'utf-8'))
  const ids = Object.keys(raw)
  console.log(`Parsing ${ids.length} traps...`)

  const parsed: Record<string, ParsedTrap> = {}
  const warnings: string[] = []
  let clean = 0
  const byFormat: Record<string, number> = { trap: 0, thHead: 0, dm: 0 }

  for (const id of ids) {
    try {
      const html = raw[id]
      // Track format
      if (html.includes('class=thHead>')) byFormat.thHead++
      else if (html.includes('class=dm>')) byFormat.dm++
      else byFormat.trap++

      const trap = parseTrapHtml(html)
      parsed[id] = trap
      clean++
    } catch (e: any) {
      warnings.push(`${id}: FAILED - ${e.message}`)
    }
  }

  console.log(`\nParsed: ${Object.keys(parsed).length} / ${ids.length}`)
  console.log(`Clean:  ${clean} (${(clean / ids.length * 100).toFixed(1)}%)`)
  console.log(`By format: trap=${byFormat.trap}, thHead=${byFormat.thHead}, dm=${byFormat.dm}`)

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`)
    for (const w of warnings) console.log(`  ${w}`)
  }

  // Stats
  const withActions = Object.values(parsed).filter(t => t.actions && t.actions.length > 0).length
  const withCountermeasures = Object.values(parsed).filter(t => t.countermeasures.length > 0).length
  const byType: Record<string, number> = {}
  for (const t of Object.values(parsed)) {
    byType[t.trapType] = (byType[t.trapType] || 0) + 1
  }
  console.log(`\nWith actions: ${withActions} | With countermeasures: ${withCountermeasures}`)
  console.log('By type:', JSON.stringify(byType))

  const json = JSON.stringify(parsed)
  const outPath = join(outDir, 'traps.json')
  writeFileSync(outPath, json)
  console.log(`\nWrote ${outPath} (${(json.length / 1024).toFixed(0)} KB)`)

  // Build compact index
  const indexEntries = Object.entries(parsed).map(([id, trap]) => ({
    id,
    name: trap.name,
    trapType: trap.trapType,
    level: trap.level,
    role: trap.role,
    xp: trap.xp,
    source: extractFirstBook(trap.source ?? ''),
  })).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

  const indexJson = JSON.stringify(indexEntries)
  const indexPath = join(outDir, 'traps-index.json')
  writeFileSync(indexPath, indexJson)
  console.log(`Wrote ${indexPath} (${(indexJson.length / 1024).toFixed(0)} KB, ${indexEntries.length} entries)`)
}

main()
