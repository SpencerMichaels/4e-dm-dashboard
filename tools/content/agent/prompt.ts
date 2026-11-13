// Assemble the per-entry agent prompt: raw HTML + current converted JSON +
// the relevant kit schema excerpt + the clause rules (tools/content/agent/prompt.md).
//
// Run: npm run content:agent:prompt -- <kind> <id> [--repo <content repo>] [--out <file>]
//   kind: monsters | items | traps | diseases

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..', '..')
const RAW = join(ROOT, 'content', 'raw')
const KIT = join(ROOT, 'vendor', '4e-kit', 'src')

export type AgentKind = 'monsters' | 'items' | 'traps' | 'diseases'

const RAW_FILES: Record<AgentKind, string[]> = {
  monsters: ['monsters.json'],
  items: ['item.json', 'weapon.json', 'armor.json', 'implement.json', 'ritual.json'],
  traps: ['trap.json'],
  diseases: ['disease.json'],
}

const KIND_LABEL: Record<AgentKind, [string, string]> = {
  monsters: ['monster', 'Monster'],
  items: ['magic item', 'Item'],
  traps: ['trap or hazard', 'Trap'],
  diseases: ['disease', 'Disease'],
}

/** Schema sections ("// ── Name ──") each kind needs. */
const SCHEMA_SECTIONS: Record<AgentKind, string[]> = {
  monsters: ['Shared pieces', 'Effect clauses', 'Powers and attacks', 'Monsters'],
  items: ['Shared pieces', 'Effect clauses', 'Powers and attacks', 'Items'],
  traps: ['Shared pieces', 'Effect clauses', 'Powers and attacks', 'Traps and diseases'],
  diseases: ['Shared pieces', 'Effect clauses', 'Powers and attacks', 'Traps and diseases'],
}

const rawCache = new Map<string, Record<string, string>>()

export function rawHtml(kind: AgentKind, id: string): string {
  for (const file of RAW_FILES[kind]) {
    if (!rawCache.has(file)) rawCache.set(file, JSON.parse(readFileSync(join(RAW, file), 'utf-8')))
    const html = rawCache.get(file)![id]
    if (html) return html
  }
  throw new Error(`No raw HTML for ${kind}/${id}`)
}

/** The schema sections for a kind, plus the closed vocabularies (minus display labels and the XP table). */
export function schemaExcerpt(kind: AgentKind): string {
  const schema = readFileSync(join(KIT, 'schema.ts'), 'utf-8')
  const parts = schema.split(/^(?=\/\/ ── )/m)
  // Declarations before the first section (DamageModifier), without the file header and imports.
  const preamble = parts[0].replace(/^[\s\S]*?\} from '\.\/vocab'\n/, '').replace(/^\/\*\*[^]*?\*\/\nexport const SCHEMA_VERSION.*\n/m, '').trim()
  const sections = [preamble + '\n\n', ...parts.filter(p => SCHEMA_SECTIONS[kind].some(name => p.startsWith(`// ── ${name} ──`)))]
  const vocab = readFileSync(join(KIT, 'vocab.ts'), 'utf-8')
    .replace(/^(?:\/\*\*.*\*\/\n)?export const \w+_(?:LABELS|SYMBOLS)[\s\S]*?^}\n/gm, '')
    .replace(/^\/\*\* (?:Experience|Rank multipliers|XP for)[\s\S]*$/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `// vocab.ts\n${vocab}\n\n// schema.ts\n${sections.join('').trim()}`
}

export function buildPrompt(kind: AgentKind, id: string, repo: string): string {
  const template = readFileSync(join(__dirname, 'prompt.md'), 'utf-8')
  const current = readFileSync(join(repo, kind, `${id}.json`), 'utf-8').trim()
  const [label, type] = KIND_LABEL[kind]
  const values: Record<string, string> = {
    ID: id, KIND: kind, KIND_LABEL: label, KIND_TYPE: type,
    RAW_HTML: rawHtml(kind, id), CURRENT_JSON: current, SCHEMA_EXCERPT: schemaExcerpt(kind),
  }
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m)
}

export function contentRepo(args: string[]): string {
  const i = args.indexOf('--repo')
  const repo = i >= 0 ? args[i + 1] : process.env.CONTENT_REPO
  if (!repo) throw new Error('Pass --repo <content repo> or set CONTENT_REPO')
  return repo
}

function main() {
  const args = process.argv.slice(2)
  const [kind, id] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
  if (!kind || !id || !(kind in RAW_FILES)) throw new Error('Usage: prompt <monsters|items|traps|diseases> <id> [--repo <dir>] [--out <file>]')
  const prompt = buildPrompt(kind as AgentKind, id, contentRepo(args))
  const outIdx = args.indexOf('--out')
  if (outIdx >= 0) writeFileSync(args[outIdx + 1], prompt)
  else process.stdout.write(prompt)
}

if (require.main === module) main()
