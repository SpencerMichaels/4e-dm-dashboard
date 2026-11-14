import { useState, useEffect, useCallback, useMemo } from 'react'
import { cachedPerVersion, useContentStore } from '../../stores/content-store'

export interface GlossaryEntry {
  name: string
  category: string
  definition: string
  source: string
}

type Glossary = Record<string, GlossaryEntry>

const loadGlossary = cachedPerVersion<Glossary>(() => window.api.compendium.glossary())

export function useGlossary() {
  const version = useContentStore(s => s.version)
  const [glossary, setGlossary] = useState<Glossary>(() => loadGlossary.peek(version) ?? {})
  const [loading, setLoading] = useState(!loadGlossary.peek(version))

  useEffect(() => {
    if (!loadGlossary.peek(version)) setLoading(true)
    void loadGlossary(version).then(data => {
      setGlossary(data)
      setLoading(false)
    })
  }, [version])

  /** Look up a term (case-insensitive) */
  const lookup = useCallback((term: string): GlossaryEntry | undefined => {
    return glossary[term.toLowerCase()]
  }, [glossary])

  /** Get all entries for a given category */
  const byCategory = useCallback((category: string): GlossaryEntry[] => {
    return Object.values(glossary).filter(e => e.category === category)
  }, [glossary])

  /** Get sorted names for a given category */
  const namesForCategory = useCallback((category: string): string[] => {
    return Object.values(glossary)
      .filter(e => e.category === category)
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [glossary])

  /** Build a title-attribute tooltip for a term, or empty string if not found */
  const tooltip = useCallback((term: string): string => {
    const entry = glossary[term.toLowerCase()]
    return entry ? entry.definition : ''
  }, [glossary])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const e of Object.values(glossary)) cats.add(e.category)
    return [...cats].sort()
  }, [glossary])

  return { glossary, loading, lookup, byCategory, namesForCategory, tooltip, categories }
}
