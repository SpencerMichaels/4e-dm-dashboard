import { create } from 'zustand'
import type { MonsterTemplate, MonsterTheme } from '@kit'

/**
 * The installed content pack (docs/content-pack-plan.md): its version (null: none installed;
 * undefined: not loaded yet) and its templates and themes for the encounter editor. Populated from
 * main at startup and on each CONTENT_STATE broadcast; components that cache published content key
 * their loads on `version`.
 */
export interface ContentState {
  version: string | null | undefined
  templates: MonsterTemplate[]
  themes: MonsterTheme[]
}

export const useContentStore = create<ContentState>(() => ({ version: undefined, templates: [], themes: [] }))

/** Load the installed pack's state, then the templates and themes it holds. */
export async function loadContentState(version: string | null): Promise<void> {
  const [templates, themes] = version
    ? await Promise.all([window.api.compendium.kitList('template'), window.api.compendium.kitList('theme')])
    : [[], []]
  useContentStore.setState({ version, templates: templates as MonsterTemplate[], themes: themes as MonsterTheme[] })
}

/** A load of published content, cached until the installed pack changes; `peek` gives a finished load at once. */
export function cachedPerVersion<T>(load: () => Promise<T>): ((version: string | null | undefined) => Promise<T>) & { peek: (version: string | null | undefined) => T | undefined } {
  let cached: { version: string | null | undefined; value: Promise<T>; done?: T } | null = null
  const get = (version: string | null | undefined) => {
    if (cached && cached.version === version) return cached.value
    const entry: { version: string | null | undefined; value: Promise<T>; done?: T } = { version, value: load() }
    void entry.value.then(v => { entry.done = v })
    cached = entry
    return entry.value
  }
  const peek = (version: string | null | undefined) => cached && cached.version === version ? cached.done : undefined
  return Object.assign(get, { peek })
}
