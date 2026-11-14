// Published plus campaign and Library templates and themes, as the app types the encounter editor applies.
// Encounters refer to them by `ref`: a published entry's name, "campaign:<record id>" for the campaign's own,
// or "library:<record id>" for the Library's, so a custom "Undead" never silently stands in for the published one.

import { useMemo } from 'react'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { useContentStore } from '../../stores/content-store'
import type { MonsterTemplate, MonsterTheme } from './template-types'
import { kitTemplateToApp, kitThemeToApp } from './kit-templates'

export type CatalogTemplate = MonsterTemplate & { ref: string; custom?: true; library?: true }
export type CatalogTheme = MonsterTheme & { ref: string; custom?: true; library?: true }

/** Converts what it can: a record mid-edit that no longer converts is left out, not fatal. */
function convertAll<K, A>(records: { id: string; content: K }[], convert: (k: K) => A, library = false): (A & { ref: string; custom: true; library?: true })[] {
  return records.flatMap(r => { try { return [{ ...convert(r.content), ref: `${library ? 'library' : 'campaign'}:${r.id}`, custom: true as const, ...(library ? { library: true as const } : {}) }] } catch { return [] } })
}

/** Published entries from the content pack, referred to by name. */
function convertPublished<K, A>(entries: K[], convert: (k: K) => A): (A & { ref: string })[] {
  return entries.flatMap(k => { try { const a = convert(k) as A & { name: string }; return [{ ...a, ref: a.name }] } catch { return [] } })
}

export function useTemplateCatalog() {
  const published = useContentStore(s => s.templates)
  const publishedThemes = useContentStore(s => s.themes)
  const templates = useCampaignStore(s => s.templates)
  const themes = useCampaignStore(s => s.themes)
  const libraryTemplates = useLibraryStore(s => s.templates)
  const libraryThemes = useLibraryStore(s => s.themes)
  return useMemo(() => ({
    templates: [...convertPublished(published, kitTemplateToApp), ...convertAll(templates, kitTemplateToApp), ...convertAll(libraryTemplates, kitTemplateToApp, true)] as CatalogTemplate[],
    themes: [...convertPublished(publishedThemes, kitThemeToApp), ...convertAll(themes, kitThemeToApp), ...convertAll(libraryThemes, kitThemeToApp, true)] as CatalogTheme[],
  }), [published, publishedThemes, templates, themes, libraryTemplates, libraryThemes])
}
export type TemplateCatalog = ReturnType<typeof useTemplateCatalog>

/** By ref, falling back to the name (encounters saved before campaign templates existed). */
export function findByRef<T extends { ref: string; name: string }>(list: T[], ref: string | undefined): T | undefined {
  return ref === undefined ? undefined : list.find(t => t.ref === ref) ?? list.find(t => t.name === ref)
}
