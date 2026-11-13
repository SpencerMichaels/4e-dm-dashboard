// Convert the parsed compendium into the 4e-kit schema and write the private
// content repo: one pretty-printed JSON file per entry.
//
// Run: CONTENT_REPO=/path/to/4e-content npm run content:convert
//   (CONTENT_REV overrides the git short hash recorded in provenance.by)
//
// Monsters are re-parsed from content/raw with the parser's `printed` option
// (the printed text of each line goes into Line.text), and traps are
// re-parsed from content/raw (trait text and extra labeled lines); items and
// diseases come from content/parsed, with the raw item HTML for the tier
// heading. Files whose provenance.origin is not 'parser' (agent or human
// edits) are never overwritten.

import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Provenance } from '@kit'
import { parseMonsterHtml } from '../html-parser'
import { parseTrapHtml } from '../trap-parser'
import { MONSTER_TEMPLATES } from '../../../src/renderer/components/creature/monster-templates'
import { MONSTER_THEMES } from '../../../src/renderer/components/creature/monster-themes'
import type { ConvertContext } from './common'
import { convertDisease } from './disease'
import { convertItem } from './item'
import { convertMonster } from './monster'
import { convertTemplate, convertTheme } from './template'
import { convertTrap } from './trap'

const ROOT = join(__dirname, '..', '..', '..')
const CONTENT = join(ROOT, 'content')

const RAW_ITEM_FILES = ['item.json', 'weapon.json', 'armor.json', 'implement.json', 'ritual.json']

export const CONTENT_DIRS =['monsters', 'items', 'traps', 'diseases', 'templates', 'themes'] as const
export type ContentDir = (typeof CONTENT_DIRS)[number]

export function gitRev(): string {
  if (process.env.CONTENT_REV) return process.env.CONTENT_REV
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    throw new Error('Cannot read the git hash; set CONTENT_REV')
  }
}

/** Pretty-printed JSON, 2-space indent, trailing newline. Key order is the converter's construction order. */
export function toJson(entry: unknown): string {
  return JSON.stringify(entry, null, 2) + '\n'
}

/** Write one entry unless an agent or human edit is already there. Returns false when skipped. */
export function writeEntry(repo: string, dir: ContentDir, id: string, entry: unknown): boolean {
  const path = join(repo, dir, `${id}.json`)
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, 'utf-8'))
    if (existing?.provenance?.origin && existing.provenance.origin !== 'parser') return false
  }
  writeFileSync(path, toJson(entry))
  return true
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(CONTENT, file), 'utf-8')) as T
}

function main() {
  const repo = process.env.CONTENT_REPO ?? process.argv[2]
  if (!repo) throw new Error('Set CONTENT_REPO (or pass the content repo path)')
  for (const dir of CONTENT_DIRS) mkdirSync(join(repo, dir), { recursive: true })

  const provenance: Provenance = {
    origin: 'parser',
    by: `tools/content@${gitRev()}`,
    at: process.env.CONTENT_DATE ?? new Date().toISOString().slice(0, 10),
  }
  const ctx: ConvertContext = { provenance }
  const summary: Record<string, { converted: number; skipped: number; failed: string[] }> = {}
  const run = (dir: ContentDir, entries: [string, () => unknown][]) => {
    const s = summary[dir] = { converted: 0, skipped: 0, failed: [] as string[] }
    for (const [id, convert] of entries) {
      try {
        if (writeEntry(repo, dir, id, convert())) s.converted++
        else s.skipped++
      } catch (e: any) {
        s.failed.push(`${id}: ${e.message}`)
      }
    }
  }

  const rawMonsters = readJson<Record<string, string>>('raw/monsters.json')
  run('monsters', Object.keys(rawMonsters).sort().map(id => [id, () => {
    const warnings: string[] = []
    const creature: any = parseMonsterHtml(rawMonsters[id], warnings, { printed: true })
    if (warnings.length > 0) creature.statBlock._importWarnings = warnings
    return convertMonster(id, creature, ctx)
  }]))
  const items = readJson<Record<string, any>>('parsed/items.json')
  const rawItems: Record<string, string> = Object.assign({}, ...RAW_ITEM_FILES.map(f => readJson<Record<string, string>>(`raw/${f}`)))
  run('items', Object.keys(items).sort().map(id => [id, () => convertItem(id, items[id], ctx, rawItems[id])]))
  const rawTraps = readJson<Record<string, string>>('raw/trap.json')
  run('traps', Object.keys(rawTraps).sort().map(id => [id, () => convertTrap(id, parseTrapHtml(rawTraps[id]), ctx)]))
  const diseases = readJson<Record<string, any>>('parsed/diseases.json')
  run('diseases', Object.keys(diseases).sort().map(id => [id, () => convertDisease(id, diseases[id], ctx)]))
  run('templates', MONSTER_TEMPLATES.map(t => [convertTemplate(t, ctx).id, () => convertTemplate(t, ctx)]))
  run('themes', MONSTER_THEMES.map(t => [convertTheme(t, ctx).id, () => convertTheme(t, ctx)]))

  for (const [dir, s] of Object.entries(summary)) {
    console.log(`${dir}: ${s.converted} written, ${s.skipped} kept (agent/human), ${s.failed.length} failed`)
    for (const f of s.failed) console.log(`  FAILED ${f}`)
  }
}

if (require.main === module) main()
