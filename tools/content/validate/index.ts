// Validate the content repo: (a) shape, (b) clause spans, (c) DMG math bands.
// Shape and span problems are errors (the apply step rejects them); band
// outliers are flags for review.
//
// Run: npm run content:validate -- /path/to/4e-content [--json report.json]
//   (default report: <repo>/reports/validation.json)

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { Monster } from '@kit'
import { checkMonsterBands, type Flag } from './bands'
import {
  Checker, diseaseShape, itemShape, monsterShape, templateShape, themeShape, trapShape, type Issue,
} from './shape'
import { checkSpans } from './spans'

export type ContentKind = 'monsters' | 'items' | 'traps' | 'diseases' | 'templates' | 'themes'

const SHAPES: Record<ContentKind, (c: Checker, e: unknown) => void> = {
  monsters: monsterShape, items: itemShape, traps: trapShape, diseases: diseaseShape, templates: templateShape, themes: themeShape,
}

export interface EntryResult {
  errors: Issue[]
  flags: Flag[]
}

export function validateEntry(kind: ContentKind, entry: unknown): EntryResult {
  const c = new Checker()
  SHAPES[kind](c, entry)
  const errors = [...c.issues, ...checkSpans(entry)]
  // Bands need a well-formed monster.
  const flags = kind === 'monsters' && c.issues.length === 0 ? checkMonsterBands(entry as Monster) : []
  return { errors, flags }
}

export interface ReportEntry {
  kind: ContentKind
  id: string
  errors: Issue[]
  flags: Flag[]
}

export function validateRepo(repo: string): { summary: Record<string, unknown>; entries: ReportEntry[] } {
  const entries: ReportEntry[] = []
  const counts: Record<string, Record<string, number>> = {}
  for (const kind of Object.keys(SHAPES) as ContentKind[]) {
    const dir = join(repo, kind)
    let files: string[] = []
    try { files = readdirSync(dir).filter(f => f.endsWith('.json')).sort() } catch { continue }
    const k: Record<string, number> = counts[kind] = { entries: files.length, withErrors: 0, flagged: 0, clauses: 0 }
    for (const file of files) {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      const { errors, flags } = validateEntry(kind, entry)
      k.clauses += countClauses(entry)
      if (errors.length > 0) k.withErrors++
      if (flags.length > 0) k.flagged++
      for (const f of flags) k[`flag:${f.rule}`] = (k[`flag:${f.rule}`] ?? 0) + 1
      for (const e of errors) {
        const key = `error:${e.path.replace(/\[\d+\]/g, '[]').replace(/^\$\./, '')}`
        k[key] = (k[key] ?? 0) + 1
      }
      if (errors.length > 0 || flags.length > 0) entries.push({ kind, id: entry.id ?? file.replace(/\.json$/, ''), errors, flags })
    }
  }
  return { summary: counts, entries }
}

function countClauses(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + countClauses(x), 0)
  if (typeof v !== 'object' || v === null) return 0
  const o = v as Record<string, unknown>
  if (typeof o.text === 'string' && Array.isArray(o.clauses)) return o.clauses.length
  return Object.values(o).reduce((n: number, x) => n + countClauses(x), 0)
}

function main() {
  const args = process.argv.slice(2)
  const repo = args.find(a => !a.startsWith('--')) ?? process.env.CONTENT_REPO
  if (!repo) throw new Error('Pass the content repo path (or set CONTENT_REPO)')
  const jsonIdx = args.indexOf('--json')
  const out = jsonIdx >= 0 ? args[jsonIdx + 1] : join(repo, 'reports', 'validation.json')

  const { summary, entries } = validateRepo(repo)
  for (const [kind, counts] of Object.entries(summary)) {
    const c = counts as Record<string, number>
    console.log(`${kind}: ${c.entries} entries, ${c.withErrors} with errors, ${c.flagged} flagged, ${c.clauses} clauses`)
    for (const [k, v] of Object.entries(c).filter(([k]) => k.includes(':')).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`  ${k}: ${v}`)
    }
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ summary, entries }, null, 2) + '\n')
  console.log(`\nWrote ${entries.length} entries with errors or flags to ${out}`)
}

if (require.main === module) main()
