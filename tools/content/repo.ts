// The private content repo, for tests and scripts that run over the whole corpus: $CONTENT_REPO, or
// ~/Projects/4e-content when it exists. Tests skip when it is absent (it is never committed here).

import { existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export function contentRepoDir(): string | null {
  const dir = process.env.CONTENT_REPO ?? join(homedir(), 'Projects', '4e-content')
  return existsSync(join(dir, 'monsters')) ? dir : null
}

/** Every entry in one of the repo's folders ("templates", "themes", ...), by file name order. */
export function readRepoEntries<T>(dir: string): T[] {
  const repo = contentRepoDir()
  if (!repo) return []
  return readdirSync(join(repo, dir)).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(readFileSync(join(repo, dir, f), 'utf-8')) as T)
}
