// Write the agent briefs for a sample in a single run, so cleaning agents only
// Read a file (no container start per brief).
//
// Run: npm run content:agent:briefs -- --sample <sample.json> --repo <content repo> (--out <dir> | --tag <name>)
//        [--tier small|full] [--batch-size N] [--responses <dir>] [--app <host app dir>]
//
// --batch-size 1 (the default) writes one brief per entry, <out>/<kind>-<id>.md.
// --batch-size N writes one brief per N entries of the same kind, in sample
// order: <out>/<kind>-batch<k>.md, with the steps, rules, examples and schema
// once and then each entry's source text, current JSON, reply path and check
// command; <out>/batches.json lists the ids in each batch. The agent does the
// entries in order, checking each reply before the next.
// --tag <name> means --out <repo>/pilot/briefs-<name>. Each entry's reply goes
// to <responses>/<kind>/<id>.json (default responses dir: <out> with "briefs"
// replaced by "responses", e.g. pilot/briefs-2b-opus -> pilot/responses-2b-opus);
// its check command points at that reply. Agents only run the check; replies
// are applied later in one batch (content:agent:apply-all). --app is the app
// checkout as the host sees it (default $APP_HOST_DIR, else this checkout); set
// it when running in the container.

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { argValue } from './apply'
import { AGENT_KINDS, appDir, buildBatchBrief, buildBrief, contentRepo, replyPath, type AgentKind } from './prompt'
import { CHARS_PER_TOKEN, sampleIds, stats } from './sample'

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

/** Consecutive chunks of at most `size`. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** File name of the k-th (1-based) batch brief of a kind: "monsters-batch1.md". */
export function batchFile(kind: AgentKind, k: number): string {
  return `${kind}-batch${k}.md`
}

function main() {
  const args = process.argv.slice(2)
  const samplePath = argValue(args, '--sample')
  const repo = contentRepo(args)
  const dirs = briefDirs(args, repo)
  const batchSize = parseInt(argValue(args, '--batch-size') ?? '1')
  if (!samplePath || !dirs || !(batchSize >= 1)) {
    throw new Error('Usage: briefs --sample <sample.json> --repo <dir> (--out <dir> | --tag <name>) [--tier <name>] [--batch-size N] [--responses <dir>] [--app <dir>]')
  }
  const { out, responses } = dirs
  const app = appDir(args)
  const ids = sampleIds(JSON.parse(readFileSync(samplePath, 'utf-8')), argValue(args, '--tier'))

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
    chunk(list, batchSize).forEach((group, i) => {
      const file = batchFile(kind, i + 1)
      const brief = buildBatchBrief(kind, group.map(id => ({ id, reply: replyPath(responses, kind, id) })), { repo, app }, `batch ${i + 1}`)
      writeFileSync(join(out, file), brief)
      batches[file] = group
      briefs++
      const tokens = brief.length / CHARS_PER_TOKEN
      console.log(`${file}: ${group.join(', ')}; ${brief.length} chars, ~${Math.round(tokens)} tokens, ~${Math.round(tokens / group.length)} per entry`)
    })
  }
  if (batchSize > 1) writeFileSync(join(out, 'batches.json'), JSON.stringify(batches, null, 2) + '\n')
  console.log(`Wrote ${briefs} briefs for ${total} entries to ${resolve(out)}; replies go to ${responses}/<kind>/<id>.json`)
}

if (require.main === module) main()
