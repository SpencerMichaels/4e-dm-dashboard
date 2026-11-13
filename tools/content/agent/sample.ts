// Deterministic pilot sample: seeded random picks of monsters, items and traps
// from the content repo, with the assembled prompt size for each entry.
//
// Run: npm run content:agent:sample -- [--repo <content repo>] [--seed 4]
// Writes <repo>/pilot/sample.json.

import { mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { buildPrompt, contentRepo, type AgentKind } from './prompt'

export const SAMPLE_SIZES: Partial<Record<AgentKind, number>> = { monsters: 100, items: 20, traps: 20 }

/** mulberry32: small, well-known seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick n distinct ids (partial Fisher-Yates over the sorted list), returned sorted. */
export function pick(ids: string[], n: number, rand: () => number): string[] {
  const pool = [...ids].sort()
  const out: string[] = []
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const j = i + Math.floor(rand() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
    out.push(pool[i])
  }
  return out.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

/** Rough token estimate for mixed HTML/JSON/prose: ~3.5 characters per token. */
export const CHARS_PER_TOKEN = 3.5

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  return { min: s[0], median: s[Math.floor(s.length / 2)], mean: Math.round(sum / s.length), max: s[s.length - 1], total: sum }
}

function main() {
  const args = process.argv.slice(2)
  const repo = contentRepo(args)
  const seedIdx = args.indexOf('--seed')
  const seed = seedIdx >= 0 ? parseInt(args[seedIdx + 1]) : 4
  const rand = mulberry32(seed)

  const sample: Record<string, string[]> = {}
  const sizes: Record<string, unknown> = {}
  for (const [kind, n] of Object.entries(SAMPLE_SIZES) as [AgentKind, number][]) {
    const ids = readdirSync(join(repo, kind)).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
    sample[kind] = pick(ids, n, rand)
    const chars = sample[kind].map(id => buildPrompt(kind, id, repo).length)
    const c = stats(chars)
    sizes[kind] = { chars: c, approxTokens: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v / CHARS_PER_TOKEN)])) }
    console.log(`${kind}: ${sample[kind].length} picked; prompt chars median ${c.median}, mean ${c.mean}, max ${c.max}; ~${Math.round(c.mean / CHARS_PER_TOKEN)} tokens mean, ~${Math.round(c.total / CHARS_PER_TOKEN)} tokens total`)
  }

  mkdirSync(join(repo, 'pilot'), { recursive: true })
  const out = { seed, generator: 'tools/content/agent/sample.ts (mulberry32)', charsPerToken: CHARS_PER_TOKEN, ...sample, inputSize: sizes }
  writeFileSync(join(repo, 'pilot', 'sample.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(`Wrote ${join(repo, 'pilot', 'sample.json')}`)
}

if (require.main === module) main()
