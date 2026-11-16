// The installed content pack: <userData>/content/ (or $FOUR_E_CONTENT_DIR), its entries, the
// indexes the app builds from them, the glossary and condition text, and importing a pack file.
// With nothing installed every list is empty and every lookup is null. See docs/content-pack-plan.md.

import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { Disease, Item, Monster, MonsterTemplate, MonsterTheme, Trap } from '@kit'
import {
  EMPTY_INDEXES, diseaseIndexRow, itemIndexRow, monsterIndexRow, sortIndexes, templateIndexRow, themeIndexRow, trapIndexRow,
  type PublishedIndexes,
} from '@common/compendium-index'
import { ENTRY_ID, PACK_DIRS, PackError, dirOf, readPack, type PackDir, type PackKind, type PackManifest } from './pack'

/** Bump when the index row shapes change, so installed indexes are rebuilt. */
const INDEX_VERSION = 2

export type GlossaryEntry = { name: string; category: string; definition: string; source: string }

/** Where the pack is installed. Tests point $FOUR_E_CONTENT_DIR at a fixture pack's files. */
export const contentDir = (): string => process.env.FOUR_E_CONTENT_DIR || join(app.getPath('userData'), 'content')
const isDefaultDir = () => !process.env.FOUR_E_CONTENT_DIR

let manifest: PackManifest | null | undefined
let indexes: PublishedIndexes | null = null
let glossary: Record<string, GlossaryEntry> | null = null
let conditions: Record<string, string> | null = null
const entries = new Map<string, unknown>()

function readJsonSync<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf-8')) as T } catch { return null }
}

/** The installed pack's manifest, or null when none is installed. */
export function installedManifest(): PackManifest | null {
  if (manifest === undefined) manifest = readJsonSync<PackManifest>(join(contentDir(), 'manifest.json'))
  return manifest
}

/** The installed content version ("2026.11.14-e6b99df"), or null. */
export const contentVersion = (): string | null => installedManifest()?.content ?? null

/** A published entry as the pack has it, or null (no pack, unknown id, unreadable file). Cached; callers get a copy. */
export function readEntry<T = unknown>(kind: PackKind, id: string): T | null {
  if (!ENTRY_ID.test(id) || !installedManifest()) return null
  const key = `${kind}/${id}`
  if (!entries.has(key)) entries.set(key, readJsonSync(join(contentDir(), dirOf(kind), `${id}.json`)))
  const value = entries.get(key)
  return value == null ? null : structuredClone(value) as T
}

/** Every entry of a kind, for the authoring catalog's search. Not cached: callers keep their own. */
export function readAllEntries<T = unknown>(kind: PackKind): T[] {
  if (!installedManifest()) return []
  const dir = join(contentDir(), dirOf(kind))
  let files: string[]
  try { files = readdirSync(dir).filter(f => f.endsWith('.json')) } catch { return [] }
  return files.flatMap(f => { const e = readJsonSync<T>(join(dir, f)); return e ? [e] : [] })
}

function buildIndexes(entriesOf: (dir: PackDir) => Iterable<unknown>): PublishedIndexes {
  const ix: PublishedIndexes = { monsters: [], items: [], traps: [], diseases: [], templates: [], themes: [] }
  // A malformed entry is left out of the index rather than failing the whole build.
  const each = <T>(dir: PackDir, row: (e: T) => void) => { for (const e of entriesOf(dir)) { try { row(e as T) } catch { /* skip */ } } }
  each<Monster>('monsters', m => ix.monsters.push(monsterIndexRow(m, m.id, m.sources[0]?.book ?? '')))
  each<Item>('items', i => ix.items.push(itemIndexRow(i)))
  each<Trap>('traps', t => ix.traps.push(trapIndexRow(t)))
  each<Disease>('diseases', d => ix.diseases.push(diseaseIndexRow(d)))
  each<MonsterTemplate>('templates', t => ix.templates.push(templateIndexRow(t)))
  each<MonsterTheme>('themes', t => ix.themes.push(themeIndexRow(t)))
  return sortIndexes(ix)
}

const INDEX_FILE = 'index.json'
type IndexFile = { content: string; indexVersion: number; indexes: PublishedIndexes }

/**
 * The published indexes: the installed pack's index.json when it matches this app's index version,
 * otherwise rebuilt from the entries (and saved, for the app's own install folder).
 */
export function publishedIndexes(): PublishedIndexes {
  if (indexes) return indexes
  const m = installedManifest()
  if (!m) return indexes = EMPTY_INDEXES
  const saved = readJsonSync<IndexFile>(join(contentDir(), INDEX_FILE))
  if (saved?.content === m.content && saved.indexVersion === INDEX_VERSION) return indexes = saved.indexes
  indexes = buildIndexes(dir => readAllEntries(PACK_DIRS[dir]))
  if (isDefaultDir()) {
    const file: IndexFile = { content: m.content, indexVersion: INDEX_VERSION, indexes }
    writeFile(join(contentDir(), INDEX_FILE), JSON.stringify(file)).catch(() => { /* rebuilt next time */ })
  }
  return indexes
}

/** The 4e glossary, by lowercase term; empty without a pack. */
export function publishedGlossary(): Record<string, GlossaryEntry> {
  return glossary ??= (installedManifest() && readJsonSync(join(contentDir(), 'glossary.json'))) || {}
}

/** Condition descriptions for the combat tracker's tooltips, by condition id; empty without a pack. */
export function conditionDescriptions(): Record<string, string> {
  return conditions ??= (installedManifest() && readJsonSync(join(contentDir(), 'conditions.json'))) || {}
}

const changeListeners: (() => void)[] = []
/** Called after a pack is installed, for caches derived from published content. */
export function onContentChanged(listener: () => void): void { changeListeners.push(listener) }

function resetCaches(): void {
  manifest = undefined
  indexes = null
  glossary = null
  conditions = null
  entries.clear()
  for (const l of changeListeners) l()
}

const stagingDir = () => contentDir() + '.new'
const previousDir = () => contentDir() + '.old'

/** Finish or undo an import that was interrupted between its renames. Call at startup. */
export async function recoverInterruptedImport(): Promise<void> {
  if (!isDefaultDir()) return
  if (!existsSync(contentDir()) && existsSync(previousDir())) await rename(previousDir(), contentDir())
  await rm(stagingDir(), { recursive: true, force: true })
  await rm(previousDir(), { recursive: true, force: true })
}

/**
 * Verify the pack file at `zipPath` and install it in place of the current content. Nothing in the
 * install folder changes unless the whole pack checks out (see readPack). Returns the new version.
 */
export async function importPack(zipPath: string): Promise<string> {
  const { manifest: m, files } = await readPack(await readFile(zipPath))
  const byDir = new Map<PackDir, unknown[]>()
  for (const f of files) {
    if (f.name === 'manifest.json') continue
    let value: unknown
    try { value = JSON.parse(f.data.toString('utf-8')) } catch { throw new PackError(`The content pack is damaged: ${f.name} is not valid JSON.`) }
    const dir = f.name.split('/')[0] as PackDir
    if (f.name.includes('/')) (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(value)
  }
  const staging = stagingDir()
  await rm(staging, { recursive: true, force: true })
  for (const f of files) {
    const path = join(staging, f.name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, f.data)
  }
  const file: IndexFile = { content: m.content, indexVersion: INDEX_VERSION, indexes: buildIndexes(dir => byDir.get(dir) ?? []) }
  await writeFile(join(staging, INDEX_FILE), JSON.stringify(file))
  // Swap: a crash between the renames leaves content.old, which recoverInterruptedImport restores.
  const dir = contentDir()
  await rm(previousDir(), { recursive: true, force: true })
  if (existsSync(dir)) await rename(dir, previousDir())
  await rename(staging, dir)
  await rm(previousDir(), { recursive: true, force: true })
  resetCaches()
  return m.content
}
