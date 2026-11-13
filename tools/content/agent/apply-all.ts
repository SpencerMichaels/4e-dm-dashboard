// Apply every agent reply in a responses directory in one run.
//
// Run: npm run content:agent:apply-all -- --dir <responses dir> --repo <content repo> --model <model id> [--check] [--force]
//
// Replies are <dir>/<kind>/<id>.json (the layout briefs.ts sets up). Each is
// checked and applied like `content:agent:apply`; a failed reply writes
// nothing. Prints one PASS/FAIL line per entry (with its problems) and a
// summary; the exit code is 1 when any reply failed.

import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { ContentKind } from '../validate/index'
import { applyFile, argValue, type ApplyFileResult } from './apply'
import { AGENT_KINDS, contentRepo } from './prompt'

export function applyAll(dir: string, repo: string, opts: { model?: string; check?: boolean; force?: boolean }): ApplyFileResult[] {
  const results: ApplyFileResult[] = []
  for (const kind of AGENT_KINDS) {
    const kindDir = join(dir, kind)
    if (!existsSync(kindDir)) continue
    const files = readdirSync(kindDir).filter(f => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    for (const file of files) results.push(applyFile(kind as ContentKind, file.replace(/\.json$/, ''), join(kindDir, file), repo, opts))
  }
  return results
}

function main() {
  const args = process.argv.slice(2)
  const dir = argValue(args, '--dir')
  const model = argValue(args, '--model')
  const check = args.includes('--check')
  if (!dir || (!model && !check)) throw new Error('Usage: apply-all --dir <responses dir> --repo <dir> (--model <model id> | --check) [--force]')
  const results = applyAll(dir, contentRepo(args), { model, check, force: args.includes('--force') })
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.summary}`)
    if (!r.ok) for (const d of r.details) console.log(d)
  }
  const passed = results.filter(r => r.ok)
  const low = passed.filter(r => r.confidence === 'low').length
  const structured = passed.reduce((n, r) => n + (r.clauses?.structured ?? 0), 0)
  const unparsed = passed.reduce((n, r) => n + (r.clauses?.unparsed ?? 0), 0)
  console.log(`\n${passed.length}/${results.length} ${check ? 'passed the check' : 'applied'}; ${low} low confidence; ${structured} structured + ${unparsed} unparsed clauses`)
  if (passed.length < results.length) process.exitCode = 1
}

if (require.main === module) main()
