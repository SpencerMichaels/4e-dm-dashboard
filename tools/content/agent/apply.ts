// Apply an agent's returned JSON to the content repo after validation.
//
// Run: npm run content:agent:apply -- <kind> <id> <response.json> --model <model id> [--repo <dir>] [--force]
//
// The response is { entry, notes, confidence } (see prompt.md). The entry must
// keep its id and pass the shape and span validators; otherwise nothing is
// written and the errors are printed (exit code 1). Band outliers are printed
// but do not block. Provenance becomes origin 'agent' with the model id, date,
// confidence and notes. A human-edited entry is only replaced with --force.

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { toJson } from '../convert/index'
import { validateEntry, type ContentKind, type EntryResult } from '../validate/index'
import { contentRepo } from './prompt'

export interface AgentResponse {
  entry: Record<string, unknown>
  notes?: string[]
  confidence?: 'high' | 'low'
}

export interface ApplyResult extends EntryResult {
  written: boolean
  reason?: string
}

/** Pull the JSON object out of a reply that may be wrapped in a ```json fence. */
export function parseResponse(text: string): AgentResponse {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const parsed = JSON.parse(body)
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.entry !== 'object') throw new Error('response has no "entry" object')
  return parsed
}

export function applyResponse(
  kind: ContentKind, id: string, response: AgentResponse, existing: Record<string, any>,
  opts: { model: string; date: string; force?: boolean },
): { result: ApplyResult; entry?: Record<string, unknown> } {
  const entry = { ...response.entry }
  if (entry.id !== id) return { result: { written: false, reason: `entry id "${String(entry.id)}" does not match ${id}`, errors: [], flags: [] } }
  if (existing?.provenance?.origin === 'human' && !opts.force) {
    return { result: { written: false, reason: 'entry was edited by a human (use --force)', errors: [], flags: [] } }
  }
  const confidence = response.confidence === 'low' ? 'low' : response.confidence === 'high' ? 'high' : undefined
  const notes = Array.isArray(response.notes) ? response.notes.filter(n => typeof n === 'string' && n.trim()) : []
  // Provenance always goes last so the key order stays stable.
  delete entry.provenance
  entry.provenance = {
    origin: 'agent', by: opts.model, at: opts.date,
    ...(confidence ? { confidence } : { confidence: 'low' }),
    ...(notes.length > 0 ? { notes } : {}),
  }
  const result = validateEntry(kind, entry)
  if (result.errors.length > 0) return { result: { ...result, written: false, reason: 'validation failed' } }
  return { result: { ...result, written: true }, entry }
}

function main() {
  const args = process.argv.slice(2)
  const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
  const [kind, id, responseFile] = positional
  const modelIdx = args.indexOf('--model')
  const model = modelIdx >= 0 ? args[modelIdx + 1] : undefined
  if (!kind || !id || !responseFile || !model) {
    throw new Error('Usage: apply <kind> <id> <response.json> --model <model id> [--repo <dir>] [--force]')
  }
  const repo = contentRepo(args)
  const path = join(repo, kind, `${id}.json`)
  const existing = JSON.parse(readFileSync(path, 'utf-8'))
  const response = parseResponse(readFileSync(responseFile, 'utf-8'))
  const { result, entry } = applyResponse(kind as ContentKind, id, response, existing, {
    model, date: new Date().toISOString().slice(0, 10), force: args.includes('--force'),
  })
  for (const e of result.errors) console.log(`ERROR ${e.path}: ${e.message}`)
  for (const f of result.flags) console.log(`FLAG  ${f.rule} ${f.path}: ${f.message}`)
  if (!result.written || !entry) {
    console.log(`Rejected ${kind}/${id}: ${result.reason}`)
    process.exitCode = 1
    return
  }
  writeFileSync(path, toJson(entry))
  console.log(`Applied ${kind}/${id} (${(entry.provenance as any).confidence} confidence, ${result.flags.length} flags)`)
}

if (require.main === module) main()
