import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { Content, SearchEntry } from '../../common/authoring/types'
import { PACK_DIRS, type PackDir, type PackManifest } from '../content/pack'

/**
 * Published content for search and fetch: the entries of the content pack installed in
 * `contentDir` (src/main/content/store.ts), as the pack has them. Empty when none is installed.
 * Reads the folder directly, without Electron, so the CLI's `search-local` can use it too.
 */
export class Catalog {
  private cache: { content: string; entries: SearchEntry[] } | null = null
  constructor(readonly contentDir: string) {}
  async entries(): Promise<SearchEntry[]> {
    let manifest: PackManifest
    try { manifest = JSON.parse(await readFile(join(this.contentDir, 'manifest.json'), 'utf-8')) } catch { return [] }
    if (this.cache?.content === manifest.content) return this.cache.entries
    const entries: SearchEntry[] = []
    for (const dir of Object.keys(PACK_DIRS) as PackDir[]) {
      const kind = PACK_DIRS[dir]
      let files: string[]
      try { files = (await readdir(join(this.contentDir, dir))).filter(f => f.endsWith('.json')).sort() } catch { continue }
      for (const f of files) {
        let content: Content
        try { content = JSON.parse(await readFile(join(this.contentDir, dir, f), 'utf-8')) } catch { continue }
        const books = (content.sources ?? []).map(s => s.book).filter(Boolean).join('; ')
        entries.push({ key: `published/${kind}/${f.slice(0, -5)}`, kind, content, source: `Content pack ${manifest.content}${books ? `; ${books}` : ''}` })
      }
    }
    this.cache = { content: manifest.content, entries }
    return entries
  }
}
