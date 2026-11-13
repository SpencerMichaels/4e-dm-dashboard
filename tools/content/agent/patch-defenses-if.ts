// Add the parser's defensesIf (schema v9: printed conditional defenses, "AC 24
// (28 against opportunity attacks)") to agent-cleaned monsters, which the
// converter never overwrites.
//
// Run: npm run content:patch-defenses-if -- --repo <content repo> [--check]
//
// Only monsters with provenance origin 'agent' and no defensesIf are touched,
// and only when the parser finds conditional values and the entry's base
// defenses equal the parser's. The patch adds the field right after
// `defenses` and changes nothing else (provenance included). --check lists
// what would change and writes nothing.

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseMonsterHtml } from '../html-parser'
import { toJson } from '../convert/index'
import { contentRepo } from './prompt'

const RAW = join(__dirname, '..', '..', '..', 'content', 'raw', 'monsters.json')

export interface PatchResult { id: string; status: 'patched' | 'base differs'; defensesIf: unknown[] }

/** The entry with defensesIf inserted after defenses, or undefined when it does not apply. */
export function patchEntry(entry: Record<string, any>, html: string): { entry?: Record<string, any>; result?: PatchResult } {
  if (entry?.provenance?.origin !== 'agent' || entry.defensesIf !== undefined) return {}
  const sb: any = parseMonsterHtml(html, [], { printed: true }).statBlock
  const defensesIf = sb.defensesIf
  if (!defensesIf?.length) return {}
  const base: Record<string, number> = { ac: sb.ac, fortitude: sb.defenses?.fortitude, reflex: sb.defenses?.reflex, will: sb.defenses?.will }
  const same = Object.entries(base).every(([d, v]) => entry.defenses?.[d] === v)
  if (!same) return { result: { id: entry.id, status: 'base differs', defensesIf } }
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(entry)) {
    out[k] = v
    if (k === 'defenses') out.defensesIf = defensesIf
  }
  return { entry: out, result: { id: entry.id, status: 'patched', defensesIf } }
}

function main() {
  const args = process.argv.slice(2)
  const repo = contentRepo(args)
  const check = args.includes('--check')
  const raw = JSON.parse(readFileSync(RAW, 'utf-8')) as Record<string, string>
  const dir = join(repo, 'monsters')
  let patched = 0, differs = 0
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const id = file.replace(/\.json$/, '')
    if (!raw[id]) continue
    const path = join(dir, file)
    const { entry, result } = patchEntry(JSON.parse(readFileSync(path, 'utf-8')), raw[id])
    if (!result) continue
    console.log(`${result.status === 'patched' ? (check ? 'WOULD PATCH' : 'PATCHED') : 'SKIPPED (base defenses differ)'} ${id} ${JSON.stringify(result.defensesIf)}`)
    if (result.status === 'patched') { patched++; if (!check && entry) writeFileSync(path, toJson(entry)) }
    else differs++
  }
  console.log(`\n${patched} ${check ? 'to patch' : 'patched'}; ${differs} skipped (base defenses differ from the print)`)
}

if (require.main === module) main()
