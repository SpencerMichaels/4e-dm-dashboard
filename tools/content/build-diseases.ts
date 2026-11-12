#!/usr/bin/env npx tsx
// Pre-parses raw 4e disease HTML data into structured JSON.
// Run: npx tsx tools/content/build-diseases.ts

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const CONTENT_DIR = join(__dirname, '..', '..', 'content')
import { parseDiseaseHtml, type ParsedDisease } from './disease-parser'
import { extractFirstBook } from './build-utils'

function main() {
  const rawPath = join(CONTENT_DIR, 'raw', 'disease.json')
  const outDir = join(CONTENT_DIR, 'parsed')

  mkdirSync(outDir, { recursive: true })

  console.log('Reading raw disease data...')
  const raw: Record<string, string> = JSON.parse(readFileSync(rawPath, 'utf-8'))
  const ids = Object.keys(raw)
  console.log(`Parsing ${ids.length} diseases...`)

  const parsed: Record<string, ParsedDisease> = {}
  const warnings: string[] = []
  let clean = 0

  for (const id of ids) {
    try {
      const disease = parseDiseaseHtml(raw[id])
      parsed[id] = disease
      clean++
    } catch (e: any) {
      warnings.push(`${id}: FAILED - ${e.message}`)
    }
  }

  console.log(`\nParsed: ${Object.keys(parsed).length} / ${ids.length}`)
  console.log(`Clean:  ${clean} (${(clean / ids.length * 100).toFixed(1)}%)`)

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`)
    for (const w of warnings) console.log(`  ${w}`)
  }

  // Stats
  const stageCountDist: Record<number, number> = {}
  for (const d of Object.values(parsed)) {
    const count = d.stages.length
    stageCountDist[count] = (stageCountDist[count] || 0) + 1
  }
  const withCheck = Object.values(parsed).filter(d => d.check).length
  console.log(`\nWith check: ${withCheck} | Stage count distribution:`, JSON.stringify(stageCountDist))

  const json = JSON.stringify(parsed)
  const outPath = join(outDir, 'diseases.json')
  writeFileSync(outPath, json)
  console.log(`\nWrote ${outPath} (${(json.length / 1024).toFixed(0)} KB)`)

  // Build compact index
  const indexEntries = Object.entries(parsed).map(([id, disease]) => ({
    id,
    name: disease.name,
    level: disease.level,
    source: extractFirstBook(disease.source ?? ''),
  })).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

  const indexJson = JSON.stringify(indexEntries)
  const indexPath = join(outDir, 'diseases-index.json')
  writeFileSync(indexPath, indexJson)
  console.log(`Wrote ${indexPath} (${(indexJson.length / 1024).toFixed(0)} KB, ${indexEntries.length} entries)`)
}

main()
