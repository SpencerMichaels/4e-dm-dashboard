// Write one agent brief per sampled entry in a single run, so cleaning agents
// only Read a file (no container start per brief).
//
// Run: npm run content:agent:briefs -- --sample <sample.json> --repo <content repo> (--out <dir> | --tag <name>)
//        [--tier small|full] [--responses <dir>] [--app <host app dir>]
//
// Briefs go to <out>/<kind>-<id>.md; --tag <name> means --out <repo>/pilot/briefs-<name>.
// Each tells its agent to write the reply to <responses>/<kind>/<id>.json
// (default responses dir: <out> with "briefs" replaced by "responses", e.g.
// pilot/briefs-2b-opus -> pilot/responses-2b-opus) and gives the exact check
// command, which points at that reply. Agents only run the check; replies are
// applied later in one batch (content:agent:apply-all). --app is the app checkout as the host sees it
// (default $APP_HOST_DIR, else this checkout); set it when running in the container.

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { argValue } from './apply'
import { AGENT_KINDS, appDir, buildBrief, contentRepo, replyPath } from './prompt'
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

function main() {
  const args = process.argv.slice(2)
  const samplePath = argValue(args, '--sample')
  const repo = contentRepo(args)
  const dirs = briefDirs(args, repo)
  if (!samplePath || !dirs) throw new Error('Usage: briefs --sample <sample.json> --repo <dir> (--out <dir> | --tag <name>) [--tier <name>] [--responses <dir>] [--app <dir>]')
  const { out, responses } = dirs
  const app = appDir(args)
  const ids = sampleIds(JSON.parse(readFileSync(samplePath, 'utf-8')), argValue(args, '--tier'))

  mkdirSync(out, { recursive: true })
  let total = 0
  for (const kind of AGENT_KINDS) {
    const list = ids[kind] ?? []
    if (list.length === 0) continue
    mkdirSync(join(responses, kind), { recursive: true })
    const sizes = list.map(id => {
      const brief = buildBrief(kind, id, { repo, reply: replyPath(responses, kind, id), app })
      writeFileSync(join(out, `${kind}-${id}.md`), brief)
      return brief.length
    })
    const s = stats(sizes)
    total += list.length
    console.log(`${kind}: ${list.length} briefs; chars mean ${s.mean}, max ${s.max}; ~${Math.round(s.mean / CHARS_PER_TOKEN)} tokens mean`)
  }
  console.log(`Wrote ${total} briefs to ${resolve(out)}; replies go to ${responses}/<kind>/<id>.json`)
}

if (require.main === module) main()
