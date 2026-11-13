// Published plus campaign templates and themes, as the app types the encounter editor applies.
// Encounters refer to them by `ref`: a published entry's name, or "campaign:<record id>" for the
// campaign's own, so a custom "Undead" never silently stands in for the published one.

import { useMemo } from 'react'
import { useCampaignStore } from '../../stores/campaign-store'
import { MONSTER_TEMPLATES, type MonsterTemplate } from './monster-templates'
import { MONSTER_THEMES, type MonsterTheme } from './monster-themes'
import { kitTemplateToApp, kitThemeToApp } from './kit-templates'

export type CatalogTemplate = MonsterTemplate & { ref: string; custom?: true }
export type CatalogTheme = MonsterTheme & { ref: string; custom?: true }

/** Converts what it can: a record mid-edit that no longer converts is left out, not fatal. */
function convertAll<K, A>(records: { id: string; content: K }[], convert: (k: K) => A): (A & { ref: string; custom: true })[] {
  return records.flatMap(r => { try { return [{ ...convert(r.content), ref: `campaign:${r.id}`, custom: true as const }] } catch { return [] } })
}

export function useTemplateCatalog() {
  const templates = useCampaignStore(s => s.templates)
  const themes = useCampaignStore(s => s.themes)
  return useMemo(() => ({
    templates: [...MONSTER_TEMPLATES.map(t => ({ ...t, ref: t.name })), ...convertAll(templates, kitTemplateToApp)] as CatalogTemplate[],
    themes: [...MONSTER_THEMES.map(t => ({ ...t, ref: t.name })), ...convertAll(themes, kitThemeToApp)] as CatalogTheme[],
  }), [templates, themes])
}
export type TemplateCatalog = ReturnType<typeof useTemplateCatalog>

/** By ref, falling back to the name (encounters saved before campaign templates existed). */
export function findByRef<T extends { ref: string; name: string }>(list: T[], ref: string | undefined): T | undefined {
  return ref === undefined ? undefined : list.find(t => t.ref === ref) ?? list.find(t => t.name === ref)
}
