// Assemble the per-entry agent brief: the source text (from the raw HTML), the
// current converted JSON (clause spans shown as quotes), the kit schema
// declarations the kind needs, the cleaning rules (tools/content/agent/prompt.md)
// and the exact command that checks the reply.
//
// Run: npm run content:agent:prompt -- <kind> <id> --repo <content repo> [--responses <dir>] [--app <host app dir>] [--out <file>]
//   kind: monsters | items | traps | diseases
// Many at once: npm run content:agent:briefs (briefs.ts).

import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { atToQuote } from './quotes'

const ROOT = join(__dirname, '..', '..', '..')
const RAW = join(ROOT, 'content', 'raw')
const KIT = join(ROOT, 'vendor', '4e-kit', 'src')

export type AgentKind = 'monsters' | 'items' | 'traps' | 'diseases'
export const AGENT_KINDS: AgentKind[] = ['monsters', 'items', 'traps', 'diseases']

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

/** Declarations agents never write: provenance is rewritten by apply. */
const SCHEMA_SKIP = new Set(['Provenance'])

const rawCache = new Map<string, Record<string, string>>()

export function rawHtml(kind: AgentKind, id: string): string {
  for (const file of RAW_FILES[kind]) {
    if (!rawCache.has(file)) rawCache.set(file, JSON.parse(readFileSync(join(RAW, file), 'utf-8')))
    const html = rawCache.get(file)![id]
    if (html) return html
  }
  throw new Error(`No raw HTML for ${kind}/${id}`)
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', mdash: '—', ndash: '–' }

/** The published HTML as plain text: one block per line, table cells joined with " | ". */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/?(?:p|h\d|tr|div|li|table)\b[^>]*>/gi, '\n')
    .replace(/<\/?t[dh]\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => e.startsWith('#') ? String.fromCharCode(parseInt(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m)
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').replace(/(?:\s*\|\s*)+/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim())
    .filter(Boolean)
    .join('\n')
}

/** JSON with short objects and arrays on one line (fewer tokens than 2-space pretty printing). */
export function compactJson(value: unknown, indent = '', width = 100): string {
  const flat = JSON.stringify(value)
  if (flat === undefined) return 'null'
  if (typeof value !== 'object' || value === null || flat.length + indent.length <= width) return flat
  const inner = indent + '  '
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map(v => inner + compactJson(v, inner, width)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, inner, width)}`).join(',\n')}\n${indent}}`
}

interface Decl { names: string[]; text: string }

/** Top-level declarations of a kit source file (blank-line separated, doc comments attached). */
function declarations(source: string): Decl[] {
  const decl = /^(?:export )?(?:const|type|interface|function) (\w+)/gm
  return source.split(/\n{2,}/).map(text => text.trim())
    .map(text => ({ text, names: [...text.matchAll(decl)].map(m => m[1]) }))
    .filter(d => d.names.length > 0)
}

/** Code without comments and string literals, for finding referenced names. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/'[^'\n]*'/g, "''")
}

/** Shorter, agent-facing form: no `export`/`readonly`, vocab lists as union types. */
function agentForm(text: string): string {
  return text
    .replace(/export const (\w+) = \[([\s\S]*?)\] as const\nexport type (\w+) = \(typeof \1\)\[number\]/g,
      (_, _list: string, body: string, type: string) => {
        const values = body.replace(/\/\/.*$/gm, '').split(',').map(v => v.trim()).filter(Boolean)
        const comments = [...body.matchAll(/\/\/\s*(.*)$/gm)].map(m => `// ${m[1]}\n`).join('')
        return `${comments}type ${type} = ${values.join(' | ')}`
      })
    .replace(/^export /gm, '')
    .replace(/readonly /g, '')
    .split(/\n(?=\/\/ |type |interface )/).map(oneLine).join('\n')
}

/** A short declaration with no comments on one line: "interface Sense { kind: SenseKind; range?: number }". */
function oneLine(decl: string): string {
  if (/\/\*|\/\/|\{\n[^}]*\{\n/.test(decl)) return decl
  const body = decl.match(/^(interface [^{]+\{)\n([\s\S]*)\n\}$/)
  const flat = body ? `${body[1]} ${body[2].split('\n').map(l => l.trim()).join('; ')} }`
    : /^type \w+ =\n/.test(decl) ? decl.replace(/\n\s*/g, ' ') : decl
  return flat.length <= 160 ? flat : decl
}

/** Agents give `quote` instead of the stored `at` span (apply resolves it). */
const AGENT_CLAUSE_BASE = `interface ClauseBase {
  /** Exact words from the owning Line.text (see the quote rules). Every kind except unparsed. */
  quote: string
  /** The printed condition: exact fragment(s) of the Line.text, never the clause's own quote; a split condition is a list. */
  if?: string | string[]
  /** Exact printed fragment(s) of the condition under which the clause does NOT apply. */
  unless?: string | string[]
  /** The print makes the effect optional ("can shift 4 squares"). */
  optional?: true
}`

/** Agents write an unparsed clause as just { text }: no kind, no quote. */
const AGENT_UNPARSED = "| { text: string } // unparsed: the exact printed words; no kind, no quote"

/**
 * The kit declarations an entry of this kind uses: the entry type and
 * everything its code references, transitively, in file order (vocab first).
 * Display labels, the XP tables and Provenance are left out.
 */
export function schemaExcerpt(kind: AgentKind): string {
  const strip = (s: string) => s.replace(/^\/\/ ── .* ──\n/gm, '')
  const vocab = declarations(readFileSync(join(KIT, 'vocab.ts'), 'utf-8'))
  const schema = declarations(strip(readFileSync(join(KIT, 'schema.ts'), 'utf-8')))
  const byName = new Map<string, Decl>()
  for (const d of [...vocab, ...schema]) for (const n of d.names) byName.set(n, d)
  const needed = new Set<Decl>()
  const visit = (name: string) => {
    const d = byName.get(name)
    if (!d || needed.has(d) || SCHEMA_SKIP.has(name)) return
    needed.add(d)
    for (const m of codeOnly(d.text).matchAll(/\b[A-Z]\w+\b/g)) if (!d.names.includes(m[0])) visit(m[0])
  }
  visit(KIND_LABEL[kind][1])
  const part = (decls: Decl[]) => decls.filter(d => needed.has(d))
    .map(d => d.names.includes('ClauseBase') ? AGENT_CLAUSE_BASE : agentForm(d.text).replace(/\| \{ kind: 'unparsed'; text: string \}/, AGENT_UNPARSED))
    .join('\n\n')
  return `// vocab.ts\n${part(vocab)}\n\n// schema.ts\n${part(schema)}`
}

/**
 * Keep `{{#name}}...{{/name}}` blocks whose name is one of `keep` (the kind and
 * the mode, single or batch); a block may list several: {{#items,traps}}.
 */
function keepBlocks(template: string, keep: string[]): string {
  return template.replace(/\{\{#([\w,]+)\}\}\n?([\s\S]*?)\{\{\/\1\}\}\n?/g, (_, names: string, body: string) => names.split(',').some(n => keep.includes(n)) ? body : '')
}

const ENTRY_PART = /<!-- entry -->\n([\s\S]*?)<!-- \/entry -->\n/
const HEAD_PART = /<!-- batch-head -->\n([\s\S]*?)<!-- \/batch-head -->\n/

/**
 * The template for this kind and mode, split into the shared text (with the
 * per-entry part still marked `<!-- entry -->`), the per-entry part, and the
 * batch brief's head (`<!-- batch-head -->`, dropped from the shared text).
 */
function templateParts(kind: AgentKind, mode: 'single' | 'batch'): { shared: string; entry: string; head: string } {
  const template = keepBlocks(readFileSync(join(__dirname, 'prompt.md'), 'utf-8'), [kind, mode]).replace(/^<!--[\s\S]*?-->\n+/, '')
  const m = template.match(ENTRY_PART)
  const h = template.match(HEAD_PART)
  if (!m || !h) throw new Error('prompt.md needs an <!-- entry --> and a <!-- batch-head --> part')
  return { shared: template.replace(HEAD_PART, ''), entry: m[1], head: h[1] }
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m)
}

function kindValues(kind: AgentKind): Record<string, string> {
  const [label, type] = KIND_LABEL[kind]
  return { KIND: kind, KIND_LABEL: label, KIND_TYPE: type, SCHEMA_EXCERPT: schemaExcerpt(kind) }
}

function entryValues(kind: AgentKind, id: string, p: BriefPaths): Record<string, string> {
  const current = atToQuote(JSON.parse(readFileSync(join(p.repo, kind, `${id}.json`), 'utf-8')))
  return {
    ID: id, SOURCE_TEXT: htmlToText(rawHtml(kind, id)), CURRENT_JSON: compactJson(current, '', 140),
    REPLY_PATH: p.reply, CHECK_COMMAND: checkCommand(kind, id, p),
  }
}

export interface BriefPaths {
  /** Content repo, as the host sees it (it is mounted at the same path in the container). */
  repo: string
  /** Where the agent writes its reply. */
  reply: string
  /** The app checkout on the host (mounted at /workspace). */
  app: string
}

/** The one command an agent runs to check its reply. */
export function checkCommand(kind: AgentKind, id: string, p: BriefPaths): string {
  const mounts = [`-v ${p.app}:/workspace`, `-v ${p.repo}:${p.repo}`]
  if (!resolve(p.reply).startsWith(resolve(p.repo) + '/')) mounts.push(`-v ${resolve(p.reply, '..')}:${resolve(p.reply, '..')}`)
  return `docker run --rm --network none ${mounts.join(' ')} -w /workspace tabletop-dev npm run -s content:agent:apply -- ${kind} ${id} ${p.reply} --repo ${p.repo} --check`
}

export function replyPath(responses: string, kind: AgentKind, id: string): string {
  return join(responses, kind, `${id}.json`)
}

/** One entry per brief: steps, rules, the entry, then the schema. */
export function buildBrief(kind: AgentKind, id: string, p: BriefPaths): string {
  const { shared, entry } = templateParts(kind, 'single')
  const values = { ...kindValues(kind), ...entryValues(kind, id, p) }
  return fill(shared.replace(ENTRY_PART, () => entry), values)
}

/** File name of a kind's rules file in a brief dir: "monsters-rules.md". */
export function rulesFile(kind: AgentKind): string {
  return `${kind}-rules.md`
}

/**
 * A kind's rules file for batch briefs: the steps, rules, examples and schema
 * that apply to every entry, written once per brief dir.
 */
export function buildRulesFile(kind: AgentKind): string {
  const { shared } = templateParts(kind, 'batch')
  return fill(shared.replace(ENTRY_PART, ''), kindValues(kind)).replace(/\n+$/, '\n')
}

/**
 * Several entries of one kind in one brief: a pointer to the kind's rules file
 * (`rules`, its path as the agent sees it), then per entry its reply path,
 * check command, source text and current JSON (headings one level down).
 * `name` labels the batch ("batch 1").
 */
export function buildBatchBrief(kind: AgentKind, entries: { id: string; reply: string }[], p: Omit<BriefPaths, 'reply'>, name: string, rules: string): string {
  const { entry, head } = templateParts(kind, 'batch')
  const [label] = KIND_LABEL[kind]
  const common = { KIND: kind, KIND_LABEL: label, COUNT: String(entries.length), BATCH: name, IDS: entries.map(e => e.id).join(', '), RULES_PATH: rules }
  const parts = entries.map((e, i) => fill(entry.replace(/^(#+) /gm, '#$1 '), { ...common, N: String(i + 1), ...entryValues(kind, e.id, { ...p, reply: e.reply }) }))
  return fill(head, common) + parts.join('\n')
}

/** @deprecated name kept for older callers; the brief needs reply and app paths. */
export function buildPrompt(kind: AgentKind, id: string, repo: string): string {
  return buildBrief(kind, id, { repo, reply: replyPath(join(repo, 'pilot', 'responses'), kind, id), app: ROOT })
}

export function contentRepo(args: string[]): string {
  const i = args.indexOf('--repo')
  const repo = i >= 0 ? args[i + 1] : process.env.CONTENT_REPO
  if (!repo) throw new Error('Pass --repo <content repo> or set CONTENT_REPO')
  return resolve(repo)
}

/** The app checkout as the host sees it: --app, $APP_HOST_DIR, or this checkout. */
export function appDir(args: string[]): string {
  const i = args.indexOf('--app')
  return i >= 0 ? args[i + 1] : process.env.APP_HOST_DIR ?? ROOT
}

export function isAgentKind(k: string | undefined): k is AgentKind {
  return !!k && (AGENT_KINDS as string[]).includes(k)
}

function main() {
  const args = process.argv.slice(2)
  const valued = new Set(['--repo', '--out', '--responses', '--app'])
  const [kind, id] = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]))
  if (!isAgentKind(kind) || !id) throw new Error('Usage: prompt <monsters|items|traps|diseases> <id> --repo <dir> [--responses <dir>] [--app <dir>] [--out <file>]')
  const repo = contentRepo(args)
  const ri = args.indexOf('--responses')
  const responses = resolve(ri >= 0 ? args[ri + 1] : join(repo, 'pilot', 'responses'))
  const brief = buildBrief(kind, id, { repo, reply: replyPath(responses, kind, id), app: appDir(args) })
  const outIdx = args.indexOf('--out')
  if (outIdx >= 0) writeFileSync(args[outIdx + 1], brief)
  else process.stdout.write(brief)
}

if (require.main === module) main()
