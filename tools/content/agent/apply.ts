// Apply an agent's reply to the content repo after validation.
//
// Run: npm run content:agent:apply -- <kind> <id> <reply.json> --repo <dir> (--check | --model <model id>) [--force]
//
// The reply is { entry, notes, confidence } (see prompt.md), as raw JSON or in
// a ```json fence. Clauses may give `quote` (exact words from their Line.text)
// instead of `at`; each quote is resolved to `at` here. The entry must keep its
// id and pass the shape and span validators; otherwise nothing is written and
// the errors are printed (exit code 1). --check validates and writes nothing.
// Band outliers are printed but do not block. Provenance becomes origin
// 'agent' with the model id, date, confidence and notes. A human-edited entry
// is only replaced with --force.

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { toJson } from '../convert/index'
import { validateEntry, type ContentKind, type EntryResult } from '../validate/index'
import { contentRepo } from './prompt'
import { resolveQuotes } from './quotes'

export interface AgentResponse {
  entry: Record<string, unknown>
  notes?: string[]
  confidence?: 'high' | 'low'
}

export interface ApplyResult extends EntryResult {
  written: boolean
  reason?: string
}

/** The reply object: raw JSON, JSON in a ```json fence, or the outermost {...} in other text. */
export function parseResponse(text: string): AgentResponse {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = [trimmed, fenced?.[1], trimmed.substring(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)]
  let firstError: Error | undefined
  for (const body of candidates) {
    if (!body?.trim()) continue
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.entry !== 'object' || parsed.entry === null) {
        throw new Error('reply has no "entry" object (expected { "entry": {...}, "notes": [...], "confidence": "high" })')
      }
      return parsed
    } catch (e: any) {
      firstError ??= e
    }
  }
  throw new Error(`reply is not valid JSON: ${firstError?.message ?? 'empty file'}`)
}

export function applyResponse(
  kind: ContentKind, id: string, response: AgentResponse, existing: Record<string, any>,
  opts: { model: string; date: string; force?: boolean },
): { result: ApplyResult; entry?: Record<string, unknown> } {
  const entry = JSON.parse(JSON.stringify(response.entry)) as Record<string, unknown>
  if (entry.id !== id) return { result: { written: false, reason: `entry id "${String(entry.id)}" does not match ${id}`, errors: [], flags: [] } }
  if (existing?.provenance?.origin === 'human' && !opts.force) {
    return { result: { written: false, reason: 'entry was edited by a human (use --force)', errors: [], flags: [] } }
  }
  const quoteErrors = resolveQuotes(entry)
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
  // A clause whose quote was not found also fails the span check; report the quote problem only.
  const quotePaths = new Set(quoteErrors.map(e => e.path))
  const errors = [...quoteErrors, ...result.errors.filter(e => ![...quotePaths].some(p => e.path === p || e.path.startsWith(`${p}.`)))]
  if (errors.length > 0) return { result: { errors, flags: result.flags, written: false, reason: 'validation failed' } }
  return { result: { ...result, written: true }, entry }
}

/**
 * A readable location for a JSON path: power and trait names, and the clause
 * kind. "$.powers[1].attacks[0].hit.clauses[2].dice" ->
 * 'powers[1] "Claw" > attacks[0].hit > clauses[2] (damage) > dice'.
 */
export function describePath(entry: unknown, path: string): string {
  const segments = path.replace(/^\$/, '').match(/\.[^.[\]]+|\[\d+\]/g) ?? []
  const out: string[] = []
  let cur = ''
  let prev = ''
  let node: any = entry
  for (const seg of segments) {
    const index = seg.startsWith('[')
    node = node !== null && typeof node === 'object' ? node[index ? Number(seg.slice(1, -1)) : seg.slice(1)] : undefined
    cur += cur || index ? seg : seg.slice(1)
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      if (typeof node.name === 'string' && node.name) { out.push(`${cur} "${node.name}"`); cur = '' }
      else if (prev === '.clauses' && typeof node.kind === 'string') { out.push(`${cur} (${node.kind})`); cur = '' }
    }
    prev = seg
  }
  if (cur) out.push(cur)
  return out.join(' > ') || '(entry)'
}

/** One short line per issue, most useful first; at most `max` lines. */
export function formatIssues(entry: unknown, issues: { path: string; message: string }[], max = 20): string[] {
  const lines = issues.slice(0, max).map(e => `  ${describePath(entry, e.path)}: ${e.message}`)
  if (issues.length > max) lines.push(`  ... and ${issues.length - max} more`)
  return lines
}

export interface ApplyFileResult {
  ok: boolean
  /** One-line outcome. */
  summary: string
  /** Error and flag lines. */
  details: string[]
  confidence?: string
  clauses?: { structured: number; unparsed: number }
}

function countClauses(entry: unknown): { structured: number; unparsed: number } {
  const n = { structured: 0, unparsed: 0 }
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (typeof v !== 'object' || v === null) return
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string' && Array.isArray(o.clauses)) {
      for (const c of o.clauses as { kind?: string }[]) c?.kind === 'unparsed' ? n.unparsed++ : n.structured++
      return
    }
    Object.values(o).forEach(walk)
  }
  walk(entry)
  return n
}

/** Read, check and (unless check) write one reply. Never throws. */
export function applyFile(
  kind: ContentKind, id: string, replyPath: string, repo: string,
  opts: { model?: string; check?: boolean; force?: boolean; date?: string },
): ApplyFileResult {
  const label = `${kind}/${id}`
  let existing: Record<string, any>
  let response: AgentResponse
  try {
    existing = JSON.parse(readFileSync(join(repo, kind, `${id}.json`), 'utf-8'))
  } catch (e: any) {
    return { ok: false, summary: `${label}: no such entry in the content repo (${e.message})`, details: [] }
  }
  try {
    response = parseResponse(readFileSync(replyPath, 'utf-8'))
  } catch (e: any) {
    return { ok: false, summary: `${label}: ${e.code === 'ENOENT' ? `reply file ${replyPath} does not exist` : e.message}`, details: [] }
  }
  const { result, entry } = applyResponse(kind, id, response, existing, {
    model: opts.model ?? 'check', date: opts.date ?? new Date().toISOString().slice(0, 10), force: opts.force,
  })
  const details = [
    ...formatIssues(response.entry, result.errors),
    ...result.flags.map(f => `  flag (not blocking) ${f.rule} ${describePath(response.entry, f.path)}: ${f.message}`),
  ]
  if (!result.written || !entry) {
    const n = result.errors.length
    return { ok: false, summary: `${label}: ${n > 0 ? `${n} error${n === 1 ? '' : 's'}` : result.reason}`, details }
  }
  const clauses = countClauses(entry)
  const confidence = (entry.provenance as { confidence: string }).confidence
  const stats = `${confidence} confidence, ${clauses.structured} structured + ${clauses.unparsed} unparsed clauses, ${result.flags.length} flags`
  if (opts.check) return { ok: true, summary: `${label}: check passed (${stats}); nothing written`, details, confidence, clauses }
  writeFileSync(join(repo, kind, `${id}.json`), toJson(entry))
  return { ok: true, summary: `${label}: applied (${stats})`, details, confidence, clauses }
}

export function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

export function positionals(args: string[]): string[] {
  const valued = new Set(['--repo', '--model', '--out', '--sample', '--tier', '--dir', '--responses', '--app', '--seed', '--exclude', '--tag', '--batch-size'])
  return args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]))
}

function main() {
  const args = process.argv.slice(2)
  const [kind, id, replyFile] = positionals(args)
  const check = args.includes('--check')
  const model = argValue(args, '--model')
  if (!kind || !id || !replyFile || (!model && !check)) {
    throw new Error('Usage: apply <kind> <id> <reply.json> --repo <dir> (--check | --model <model id>) [--force]')
  }
  const r = applyFile(kind as ContentKind, id, replyFile, contentRepo(args), { model, check, force: args.includes('--force') })
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.summary}`)
  for (const d of r.details) console.log(d)
  if (!r.ok) {
    console.log('Fix the reply file and run the same command again.')
    process.exitCode = 1
  }
}

if (require.main === module) main()
