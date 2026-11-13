import { stat } from 'fs/promises'
import { join } from 'path'
import { PUBLISHED_FILES, publishedEntries, type PublishedKind } from '../../../tools/content/convert/published'
import type { Content, SearchEntry } from '../../common/authoring/types'
import { getKitEntry, getKitIndex } from '../compendium/kit'

/**
 * Published content for search and fetch, converted like the content repo
 * (tools/content/convert/published.ts), so monsters keep their printed
 * hit/miss/effect text. `contentRoot` holds `raw/` and `parsed/`.
 */
export class Catalog {
  private cache = new Map<PublishedKind, { stamp: string; entries: SearchEntry[] }>()
  constructor(readonly contentRoot: string) {}
  async entries(): Promise<SearchEntry[]> {
    const entries: SearchEntry[] = []
    for (const kind of Object.keys(PUBLISHED_FILES) as PublishedKind[]) {
      // Missing optional files count as part of the stamp, so adding one rebuilds.
      const times = await Promise.all(PUBLISHED_FILES[kind].map(f => stat(join(this.contentRoot, f)).then(s => s.mtimeMs, () => null)))
      if (times[0] === null) continue
      const stamp = times.join(',')
      const cached = this.cache.get(kind)
      if (cached?.stamp === stamp) { entries.push(...cached.entries); continue }
      const at = new Date(times[0]).toISOString()
      const converted: SearchEntry[] = []
      for (const [id, convert] of await publishedEntries(this.contentRoot, kind, { provenance: { origin: 'parser', at, by: 'legacy-compendium-adapter' } })) {
        let content: Content
        try { content = convert() } catch { continue } // the content repo writer reports conversion failures
        converted.push({ key: `published/${kind}/${id}`, kind, content, source: `Legacy compendium (${at}); ${content.sources.map(s => s.book).join('; ')}` })
      }
      this.cache.set(kind, { stamp, entries: converted }); entries.push(...converted)
    }
    // Templates and themes are built-in data, converted like the parsed kinds.
    for (const kind of ['template', 'theme'] as const) for (const row of getKitIndex(kind)) {
      const content = getKitEntry(kind, row.id) as Content
      entries.push({ key: `published/${kind}/${row.id}`, kind, content, source: `Built-in; ${content.sources.map(s => s.book).filter(Boolean).join('; ')}` })
    }
    return entries
  }
}
