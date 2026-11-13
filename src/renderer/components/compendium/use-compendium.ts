import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react'
import type { CompendiumEntry } from '@common/types'
import { XP_BY_LEVEL } from '../creature/dnd4e-utils'

// Minion detection: native minions in the parsed data have an empty modifier
// (no monsterModifier set) but their xp is exactly 1/4 of the standard XP for
// their level. We use that to identify them since the index doesn't carry hp.
export function isMinionEntry(e: CompendiumEntry): boolean {
  if (e.modifier) return false
  const std = XP_BY_LEVEL[e.level]
  if (!std) return false
  return e.xp > 0 && e.xp === Math.round(std / 4)
}

/** Parse a level filter string into a test function.
 *  Formats: "10" (exact), "1-5" (range), ">5" (greater), "<5" (less), "" (any) */
export function parseLevelFilter(str: string): (level: number) => boolean {
  const s = str.trim()
  if (!s) return () => true
  const rangeMatch = s.match(/^(\d+)\s*[-–]\s*(\d+)$/)
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]), max = parseInt(rangeMatch[2])
    return (lvl) => lvl >= min && lvl <= max
  }
  const gtMatch = s.match(/^>\s*(\d+)$/)
  if (gtMatch) { const n = parseInt(gtMatch[1]); return (lvl) => lvl > n }
  const ltMatch = s.match(/^<\s*(\d+)$/)
  if (ltMatch) { const n = parseInt(ltMatch[1]); return (lvl) => lvl < n }
  const exact = parseInt(s)
  if (!isNaN(exact)) return (lvl) => lvl === exact
  return () => true
}

export interface CompendiumFilters {
  search: string
  level: string
  role: string[]
  size: string
  modifier: string
  origin: string
  type: string
  alignment: string
  source: string
}

const defaultFilters: CompendiumFilters = {
  search: '',
  level: '',
  role: [],
  size: '',
  modifier: '',
  origin: '',
  type: '',
  alignment: '',
  source: '',
}

export function useCompendium() {
  const [index, setIndex] = useState<CompendiumEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<CompendiumFilters>(defaultFilters)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    window.api.compendium.index()
      .then((entries: CompendiumEntry[]) => setIndex(entries))
      .finally(() => setLoading(false))
  }, [])

  // Reload index when campaign creatures change (custom creatures appear in merged index)
  const reloadIndex = useCallback(() => {
    window.api.compendium.index()
      .then((entries: CompendiumEntry[]) => setIndex(entries))
  }, [])

  const filterOptions = useMemo(() => {
    if (!index) return { roles: [], sizes: [], origins: [], types: [], alignments: [], sources: [] }
    const roles = new Set<string>()
    const sizes = new Set<string>()
    const origins = new Set<string>()
    const types = new Set<string>()
    const alignments = new Set<string>()
    const sources = new Set<string>()
    for (const e of index) {
      if (e.role) roles.add(e.role)
      if (e.size) sizes.add(e.size)
      if (e.origin) origins.add(e.origin)
      if (e.type) types.add(e.type)
      if (e.alignment) alignments.add(e.alignment)
      if (e.source) sources.add(e.source)
    }
    return {
      roles: [...roles].sort(),
      sizes: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].filter(s => sizes.has(s)),
      origins: [...origins].sort(),
      types: [...types].sort(),
      alignments: ['Lawful Good', 'Good', 'Unaligned', 'Evil', 'Chaotic Evil'].filter(a =>
        alignments.has(a) || alignments.has(a.toLowerCase())),
      sources: [...sources].sort((a, b) => a === 'Custom' ? -1 : b === 'Custom' ? 1 : a.localeCompare(b)),
    }
  }, [index])

  const deferredFilters = useDeferredValue(filters)
  const filtering = deferredFilters !== filters

  const filtered = useMemo(() => {
    if (!index) return []
    const searchLower = deferredFilters.search.toLowerCase()
    const levelTest = parseLevelFilter(deferredFilters.level)
    return index.filter(e => {
      if (searchLower && !e.name.toLowerCase().includes(searchLower)) return false
      if (deferredFilters.level && !levelTest(e.level)) return false
      if (deferredFilters.role.length > 0 && !deferredFilters.role.includes(e.role)) return false
      if (deferredFilters.size && e.size !== deferredFilters.size) return false
      if (deferredFilters.modifier) {
        const minion = isMinionEntry(e)
        if (deferredFilters.modifier === 'minion') {
          if (!minion) return false
        } else if (deferredFilters.modifier === 'standard') {
          if (e.modifier || minion) return false
        } else if (e.modifier !== deferredFilters.modifier) {
          return false
        }
      }
      if (deferredFilters.origin && e.origin !== deferredFilters.origin) return false
      if (deferredFilters.type && e.type !== deferredFilters.type) return false
      if (deferredFilters.alignment && e.alignment.toLowerCase() !== deferredFilters.alignment.toLowerCase()) return false
      if (deferredFilters.source && e.source !== deferredFilters.source) return false
      return true
    })
  }, [index, deferredFilters])

  const updateFilter = useCallback(<K extends keyof CompendiumFilters>(key: K, value: CompendiumFilters[K]) => {
    setFilters(f => ({ ...f, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => setFilters(defaultFilters), [])
  const focusSearch = useCallback(() => searchRef.current?.focus(), [])

  const hasActiveFilters = !!(
    filters.search || filters.level || filters.role.length > 0 ||
    filters.size || filters.modifier || filters.origin ||
    filters.type || filters.alignment || filters.source
  )

  return {
    index, loading, filtering, filters, filtered, filterOptions,
    updateFilter, resetFilters, hasActiveFilters, searchRef, focusSearch, reloadIndex,
    totalCount: index?.length ?? 0,
  }
}
