// Convert the parsed compendium into the 4e-kit schema and write the private
// content repo: one pretty-printed JSON file per entry.
//
// Run: CONTENT_REPO=/path/to/4e-content npm run content:convert
//   (CONTENT_REV overrides the git short hash recorded in provenance.by)
//
// Each kind's inputs are in published.ts (monsters and traps re-parsed from
// content/raw, items and diseases from content/parsed); the glossary is copied
// from content/parsed. Templates and themes are not converted any more: the
// repo's agent-cleaned files are their only source. Files whose
// provenance.origin is not 'parser' (agent or human edits) are never
// overwritten.

import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Provenance } from '@kit'
import type { ConvertContext } from './common'
import { publishedEntries } from './published'

const ROOT = join(__dirname, '..', '..', '..')
const CONTENT = join(ROOT, 'content')

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

async function main() {
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

  run('monsters', await publishedEntries(CONTENT, 'monster', ctx))
  run('items', await publishedEntries(CONTENT, 'item', ctx))
  run('traps', await publishedEntries(CONTENT, 'trap', ctx))
  run('diseases', await publishedEntries(CONTENT, 'disease', ctx))
  // Templates and themes live only in the content repo now (agent-cleaned from their printed lines).

  // The glossary goes into the content pack as is (built by content:build from content/raw).
  const glossary = join(CONTENT, 'parsed', 'glossary.json')
  if (existsSync(glossary)) writeFileSync(join(repo, 'glossary.json'), toJson(JSON.parse(readFileSync(glossary, 'utf-8'))))
  else console.log('glossary: content/parsed/glossary.json missing (run content:build), not written')

  for (const [dir, s] of Object.entries(summary)) {
    console.log(`${dir}: ${s.converted} written, ${s.skipped} kept (agent/human), ${s.failed.length} failed`)
    for (const f of s.failed) console.log(`  FAILED ${f}`)
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
