// The content pack format (docs/content-pack-plan.md), shared by the pack builder
// (tools/content/pack.ts) and the app's import. No Electron imports here.

import { createHash } from 'crypto'
import { SCHEMA_VERSION } from '@kit'
import { readZip, ZipError, type ZipFile } from './zip'

export const PACK_FORMAT = 1

/** Entry folders, as in the content repo, and the kit kind each holds. */
export const PACK_DIRS = { monsters: 'monster', items: 'item', traps: 'trap', diseases: 'disease', templates: 'template', themes: 'theme', challenges: 'challenge' } as const
export type PackDir = keyof typeof PACK_DIRS
export type PackKind = (typeof PACK_DIRS)[PackDir]
export const dirOf = (kind: PackKind): PackDir => (Object.keys(PACK_DIRS) as PackDir[]).find(d => PACK_DIRS[d] === kind)!

/** Top-level data files besides the entry folders. */
export const PACK_FILES = ['glossary.json', 'conditions.json'] as const

export interface PackManifest {
  format: number
  /** Content version: build date plus the content repo's short commit hash. */
  content: string
  /** 4e-kit schema version of the entries. */
  schema: number
  /** Every packed file except manifest.json, with its sha256 (hex). */
  files: Record<string, string>
}

/** Entry ids are source ids ("monster4940") or kebab-case names ("battle-champion"). */
export const ENTRY_ID = /^[\w-]+$/
const ENTRY_NAME = new RegExp(`^(${Object.keys(PACK_DIRS).join('|')})/[\\w-]+\\.json$`)

/** A path the pack may hold: an entry, a top-level data file, or the manifest. */
export const isPackPath = (name: string): boolean =>
  name === 'manifest.json' || (PACK_FILES as readonly string[]).includes(name) || ENTRY_NAME.test(name)

export const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

export class PackError extends Error {}

/** The manifest's fields, or why it can't be used by this app. */
export function checkManifest(raw: unknown): PackManifest {
  const m = raw as Partial<PackManifest> | null
  if (!m || typeof m !== 'object' || typeof m.format !== 'number' || typeof m.content !== 'string' || typeof m.schema !== 'number' || !m.files || typeof m.files !== 'object') {
    throw new PackError('This is not a content pack: its manifest.json is missing fields.')
  }
  if (m.format !== PACK_FORMAT) throw new PackError(`This content pack has format ${m.format}; this version of the app reads format ${PACK_FORMAT}.`)
  if (m.schema > SCHEMA_VERSION) throw new PackError(`This content pack needs a newer version of the app (content schema ${m.schema}; this app reads up to ${SCHEMA_VERSION}).`)
  for (const [path, hash] of Object.entries(m.files)) {
    if (path === 'manifest.json' || !isPackPath(path) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new PackError(`The content pack's manifest lists an invalid file: ${path}`)
    }
  }
  return m as PackManifest
}

/**
 * The files of a pack zip, verified: a known manifest, every listed file present with its sha256,
 * and no file the manifest does not list.
 */
export async function readPack(zip: Buffer): Promise<{ manifest: PackManifest; files: ZipFile[] }> {
  let files: ZipFile[]
  try {
    files = await readZip(zip, isPackPath)
  } catch (e) {
    if (e instanceof ZipError) throw new PackError(`This file is not a valid content pack: ${e.message}`)
    throw e
  }
  const manifestFile = files.find(f => f.name === 'manifest.json')
  if (!manifestFile) throw new PackError('This file is not a content pack: it has no manifest.json.')
  let raw: unknown
  try { raw = JSON.parse(manifestFile.data.toString('utf-8')) } catch { throw new PackError('This content pack\'s manifest.json is not valid JSON.') }
  const manifest = checkManifest(raw)
  const data = files.filter(f => f !== manifestFile)
  for (const f of data) {
    const want = manifest.files[f.name]
    if (!want) throw new PackError(`The content pack holds a file its manifest does not list: ${f.name}`)
    if (sha256(f.data) !== want) throw new PackError(`The content pack is damaged: ${f.name} does not match its checksum.`)
  }
  const present = new Set(data.map(f => f.name))
  const missing = Object.keys(manifest.files).filter(p => !present.has(p))
  if (missing.length) throw new PackError(`The content pack is incomplete: ${missing.length} file(s) missing, e.g. ${missing[0]}.`)
  return { manifest, files }
}
