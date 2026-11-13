// Deterministic pilot sample: seeded random picks of monsters, items and traps
// from the content repo, with the brief size for each kind.
//
// Run: npm run content:agent:sample -- --repo <content repo> [--seed 4] [--out <file>]
//        [--exclude <earlier sample.json>]... [--tier <name>=<monsters>,<items>,<traps>]...
//
// Without --tier: one sample of 100 monsters, 20 items and 20 traps, written as
// { monsters, items, traps } to <repo>/pilot/sample.json. With tiers, each
// tier is a prefix of the same seeded order, so a larger tier is a superset of
// a smaller one: { tiers: { small: {...}, full: {...} } }. --exclude drops
// every id listed in an earlier sample (either format).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join, relative } from 'path'
import { argValue } from './apply'
import { AGENT_KINDS, buildPrompt, contentRepo, type AgentKind } from './prompt'

export const SAMPLE_SIZES: Partial<Record<AgentKind, number>> = { monsters: 100, items: 20, traps: 20 }
const TIER_KINDS: AgentKind[] = ['monsters', 'items', 'traps']

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

export const byId = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

/** Pick n distinct ids (partial Fisher-Yates over the sorted list), in pick order. */
export function pickOrdered(ids: string[], n: number, rand: () => number): string[] {
  const pool = [...ids].sort()
  const out: string[] = []
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const j = i + Math.floor(rand() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
    out.push(pool[i])
  }
  return out
}

/** Pick n distinct ids, returned sorted. */
export function pick(ids: string[], n: number, rand: () => number): string[] {
  return pickOrdered(ids, n, rand).sort(byId)
}

/**
 * Tiered picks: one seeded order per kind (excluded ids removed first); each
 * tier takes a prefix of it, so larger tiers contain the smaller ones.
 */
export function tieredSample(
  idsByKind: Partial<Record<AgentKind, string[]>>, tiers: Record<string, Partial<Record<AgentKind, number>>>,
  seed: number, exclude: Set<string> = new Set(),
): Record<string, Partial<Record<AgentKind, string[]>>> {
  const rand = mulberry32(seed)
  const out: Record<string, Partial<Record<AgentKind, string[]>>> = Object.fromEntries(Object.keys(tiers).map(t => [t, {}]))
  for (const kind of TIER_KINDS) {
    const largest = Math.max(0, ...Object.values(tiers).map(t => t[kind] ?? 0))
    const order = pickOrdered((idsByKind[kind] ?? []).filter(id => !exclude.has(id)), largest, rand)
    for (const [name, sizes] of Object.entries(tiers)) out[name][kind] = order.slice(0, sizes[kind] ?? 0).sort(byId)
  }
  return out
}

/** The ids of a sample file: { monsters: [...], ... } or, with tiers, { tiers: { small: {...}, full: {...} } }. */
export function sampleIds(sample: any, tier?: string): Partial<Record<AgentKind, string[]>> {
  if (sample.tiers) {
    const names = Object.keys(sample.tiers)
    if (!tier || !sample.tiers[tier]) throw new Error(`The sample has tiers ${names.join(', ')}: pass --tier <name>`)
    return sample.tiers[tier]
  }
  if (tier) throw new Error('The sample has no tiers; leave out --tier')
  return Object.fromEntries(AGENT_KINDS.filter(k => Array.isArray(sample[k])).map(k => [k, sample[k]]))
}

/** Rough token estimate for mixed text/JSON/prose: ~3.5 characters per token. */
export const CHARS_PER_TOKEN = 3.5

export function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  return { min: s[0], median: s[Math.floor(s.length / 2)], mean: Math.round(sum / s.length), max: s[s.length - 1], total: sum }
}

function sizeReport(repo: string, ids: Partial<Record<AgentKind, string[]>>, label: string) {
  const sizes: Record<string, unknown> = {}
  for (const [kind, list] of Object.entries(ids) as [AgentKind, string[]][]) {
    if (list.length === 0) continue
    const c = stats(list.map(id => buildPrompt(kind, id, repo).length))
    sizes[kind] = { chars: c, approxTokens: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v / CHARS_PER_TOKEN)])) }
    console.log(`${label}${kind}: ${list.length} picked; brief chars median ${c.median}, mean ${c.mean}, max ${c.max}; ~${Math.round(c.mean / CHARS_PER_TOKEN)} tokens mean, ~${Math.round(c.total / CHARS_PER_TOKEN)} tokens total`)
  }
  return sizes
}

function main() {
  const args = process.argv.slice(2)
  const repo = contentRepo(args)
  const seed = parseInt(argValue(args, '--seed') ?? '4')
  const out = argValue(args, '--out') ?? join(repo, 'pilot', 'sample.json')
  const idsByKind = Object.fromEntries(TIER_KINDS.map(kind => [kind,
    readdirSync(join(repo, kind)).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))]))
  const excludeFiles = args.flatMap((a, i) => a === '--exclude' ? [args[i + 1]] : [])
  const exclude = new Set(excludeFiles.flatMap(f => {
    const s = JSON.parse(readFileSync(f, 'utf-8'))
    const tiers = s.tiers ? Object.keys(s.tiers) : [undefined]
    return tiers.flatMap(t => Object.values(sampleIds(s, t)).flat() as string[])
  }))
  const tierArgs = args.flatMap((a, i) => a === '--tier' ? [args[i + 1]] : [])
  const header = {
    seed, generator: 'tools/content/agent/sample.ts (mulberry32)', charsPerToken: CHARS_PER_TOKEN,
    ...(excludeFiles.length > 0 ? { excludes: excludeFiles.map(f => relative(dirname(out), f)), excludedIds: exclude.size } : {}),
  }

  let body: Record<string, unknown>
  if (tierArgs.length === 0) {
    const sample = tieredSample(idsByKind, { all: SAMPLE_SIZES }, seed, exclude).all
    body = { ...sample, inputSize: sizeReport(repo, sample, '') }
  } else {
    const tiers = Object.fromEntries(tierArgs.map(t => {
      const m = t.match(/^(\w+)=(\d+),(\d+),(\d+)$/)
      if (!m) throw new Error(`--tier ${t}: expected <name>=<monsters>,<items>,<traps>`)
      return [m[1], { monsters: +m[2], items: +m[3], traps: +m[4] }]
    }))
    const picked = tieredSample(idsByKind, tiers, seed, exclude)
    body = { tiers: picked, inputSize: Object.fromEntries(Object.entries(picked).map(([name, ids]) => [name, sizeReport(repo, ids, `${name}: `)])) }
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ ...header, ...body }, null, 2) + '\n')
  console.log(`Wrote ${out}`)
}

if (require.main === module) main()
