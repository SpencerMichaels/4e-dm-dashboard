// Write the agent briefs in a single run, so cleaning agents only Read files
// (no container start per brief).
//
// Run: npm run content:agent:briefs -- (--sample <sample.json> [--tier small|full] | --kind <kind> --chunk <start>:<count>)
//        --repo <content repo> (--out <dir> | --tag <name>) [--batch-size N] [--max-chars N] [--responses <dir>] [--app <host app dir>]
//
// Entries: the ids of a sample file (sample order), or with --chunk a slice of
// ALL entries of one kind: the ids in <repo>/<kind>/ sorted by id (numeric
// aware, "monster2" before "monster10"), positions start .. start+count-1,
// skipping entries whose provenance is already agent or human. Chunks are
// deterministic, so a full run is a series of chunks (0:250, 250:250, ...),
// each with its own --tag.
//
// --batch-size N (default 5) writes, per kind, one rules file
// <out>/<kind>-rules.md (steps, rules, examples, schema) and one brief per up
// to N entries (fewer when they would pass --max-chars, default 36000),
// <out>/<kind>-batch<k>.md: a pointer to the rules file, then each
// entry's reply path, check command, source text and current JSON;
// <out>/batches.json lists the ids in each batch. The agent Reads the rules
// file, then its batch brief, and does the entries in order, checking each
// reply before the next. --batch-size 1 writes one self-contained brief per
// entry, <out>/<kind>-<id>.md.
// --tag <name> means --out <repo>/pilot/briefs-<name>. Each entry's reply goes
// to <responses>/<kind>/<id>.json (default responses dir: <out> with "briefs"
// replaced by "responses", e.g. pilot/briefs-2b-opus -> pilot/responses-2b-opus);
// its check command points at that reply. Agents only run the check; replies
// are applied later in one batch (content:agent:apply-all). --app is the app
// checkout as the host sees it (default $APP_HOST_DIR, else this checkout); set
// it when running in the container. Brief and reply paths are written as this
// process sees them, so mount host dirs at the same path in the container.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { argValue } from './apply'
import { AGENT_KINDS, appDir, buildBatchBrief, buildBrief, buildRulesFile, contentRepo, isAgentKind, replyPath, rulesFile, type AgentKind } from './prompt'
import { byId, CHARS_PER_TOKEN, sampleIds, stats } from './sample'

export const DEFAULT_BATCH_SIZE = 5
/** A batch brief stays under this many characters (one Read), unless one entry alone is larger. */
export const DEFAULT_MAX_CHARS = 36000

export function defaultResponsesDir(out: string): string {
  const name = basename(out)
  return name.includes('briefs') ? join(dirname(out), name.replace('briefs', 'responses')) : join(out, 'responses')
}

/** Brief and reply directories from --out or --tag, and --responses. */
export function briefDirs(args: string[], repo: string): { out: string; responses: string } | undefined {
  const tag = argValue(args, '--tag')
  const outArg = argValue(args, '--out') ?? (tag ? join(repo, 'pilot', `briefs-${tag}`) : undefined)
  if (!outArg) return undefined
  const out = resolve(outArg)
  return { out, responses: resolve(argValue(args, '--responses') ?? defaultResponsesDir(out)) }
}

/**
 * Consecutive groups of at most `maxCount` items whose sizes add up to at most
 * `maxChars` (an item larger than that is a group of its own), in order.
 */
export function packBatches<T>(list: T[], size: (item: T) => number, maxCount: number, maxChars: number): T[][] {
  const out: T[][] = []
  let group: T[] = []
  let chars = 0
  for (const item of list) {
    const s = size(item)
    if (group.length > 0 && (group.length >= maxCount || chars + s > maxChars)) { out.push(group); group = []; chars = 0 }
    group.push(item)
    chars += s
  }
  if (group.length > 0) out.push(group)
  return out
}
/** File name of the k-th (1-based) batch brief of a kind: "monsters-batch1.md". */
export function batchFile(kind: AgentKind, k: number): string {
  return `${kind}-batch${k}.md`
}

/** "<start>:<count>" -> { start, count }; undefined when malformed. */
export function parseChunk(spec: string | undefined): { start: number; count: number } | undefined {
  const m = spec?.match(/^(\d+):(\d+)$/)
  if (!m || parseInt(m[2]) < 1) return undefined
  return { start: parseInt(m[1]), count: parseInt(m[2]) }
}

/**
 * Positions start .. start+count-1 of all entries of a kind, sorted by id,
 * without the entries an agent or a human has already edited (`skipped`).
 */
export function chunkIds(repo: string, kind: AgentKind, start: number, count: number): { ids: string[]; skipped: string[]; total: number } {
  const all = readdirSync(join(repo, kind)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort(byId)
  const ids: string[] = []
  const skipped: string[] = []
  for (const id of all.slice(start, start + count)) {
    const origin = JSON.parse(readFileSync(join(repo, kind, `${id}.json`), 'utf-8'))?.provenance?.origin
    if (origin === 'agent' || origin === 'human') skipped.push(id)
    else ids.push(id)
  }
  return { ids, skipped, total: all.length }
}

const USAGE = 'Usage: briefs (--sample <sample.json> [--tier <name>] | --kind <kind> --chunk <start>:<count>) --repo <dir> (--out <dir> | --tag <name>) [--batch-size N] [--max-chars N] [--responses <dir>] [--app <dir>]'

function main() {
  const args = process.argv.slice(2)
  const samplePath = argValue(args, '--sample')
  const chunkArg = argValue(args, '--chunk')
  const kindArg = argValue(args, '--kind')
  const repo = contentRepo(args)
  const dirs = briefDirs(args, repo)
  const batchSize = parseInt(argValue(args, '--batch-size') ?? String(DEFAULT_BATCH_SIZE))
  const maxChars = parseInt(argValue(args, '--max-chars') ?? String(DEFAULT_MAX_CHARS))
  if (!dirs || !(batchSize >= 1) || !(maxChars >= 1) || !!samplePath === !!chunkArg) throw new Error(USAGE)
  const { out, responses } = dirs
  const app = appDir(args)

  let ids: Partial<Record<AgentKind, string[]>>
  if (samplePath) ids = sampleIds(JSON.parse(readFileSync(samplePath, 'utf-8')), argValue(args, '--tier'))
  else {
    const slice = parseChunk(chunkArg)
    if (!slice || !isAgentKind(kindArg)) throw new Error(`${USAGE}\n--chunk needs --kind <${AGENT_KINDS.join('|')}> and <start>:<count>`)
    const { ids: list, skipped, total } = chunkIds(repo, kindArg, slice.start, slice.count)
    console.log(`${kindArg} ${slice.start}:${slice.count} of ${total}: ${list.length} entries${skipped.length ? `, ${skipped.length} skipped (agent/human provenance)` : ''}`)
    ids = { [kindArg]: list }
  }

  mkdirSync(out, { recursive: true })
  let total = 0
  let briefs = 0
  const batches: Record<string, string[]> = {}
  for (const kind of AGENT_KINDS) {
    const list = ids[kind] ?? []
    if (list.length === 0) continue
    mkdirSync(join(responses, kind), { recursive: true })
    total += list.length
    if (batchSize === 1) {
      const sizes = list.map(id => {
        const brief = buildBrief(kind, id, { repo, reply: replyPath(responses, kind, id), app })
        writeFileSync(join(out, `${kind}-${id}.md`), brief)
        return brief.length
      })
      const s = stats(sizes)
      briefs += list.length
      console.log(`${kind}: ${list.length} briefs; chars mean ${s.mean}, max ${s.max}; ~${Math.round(s.mean / CHARS_PER_TOKEN)} tokens mean`)
      continue
    }
    const rulesPath = join(out, rulesFile(kind))
    const rules = buildRulesFile(kind)
    writeFileSync(rulesPath, rules)
    const sizes: number[] = []
    const perEntry: number[] = []
    const entry = (id: string) => ({ id, reply: replyPath(responses, kind, id) })
    const oneEntry = (id: string) => buildBatchBrief(kind, [entry(id)], { repo, app }, 'batch 1', rulesPath).length
    packBatches(list, oneEntry, batchSize, maxChars).forEach((group, i) => {
      const file = batchFile(kind, i + 1)
      const brief = buildBatchBrief(kind, group.map(entry), { repo, app }, `batch ${i + 1}`, rulesPath)
      writeFileSync(join(out, file), brief)
      batches[file] = group
      briefs++
      sizes.push(brief.length)
      perEntry.push(brief.length / group.length)
    })
    const s = stats(sizes)
    const e = stats(perEntry)
    const tok = (chars: number) => Math.round(chars / CHARS_PER_TOKEN)
    console.log(`${kind}: ${rulesFile(kind)} ${rules.length} chars (~${tok(rules.length)} tokens); ${sizes.length} batch briefs (${(list.length / sizes.length).toFixed(1)} entries mean), chars mean ${s.mean}, max ${s.max}; per entry chars mean ${e.mean}, max ${Math.round(e.max)} (~${tok(e.mean)} tokens mean)`)
    console.log(`  an agent reads ~${tok(rules.length + s.mean)} tokens per batch, ~${tok((rules.length * sizes.length + s.total) / list.length)} per entry (rules file read once per batch)`)
  }
  if (batchSize > 1) writeFileSync(join(out, 'batches.json'), JSON.stringify(batches, null, 2) + '\n')
  console.log(`Wrote ${briefs} briefs for ${total} entries to ${resolve(out)}; replies go to ${responses}/<kind>/<id>.json`)
}

if (require.main === module) main()
