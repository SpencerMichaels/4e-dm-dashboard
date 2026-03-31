import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { CompendiumEntry } from '@common/types'

export interface CompendiumFilters {
  search: string
  levelMin: number
  levelMax: number
  role: string
  size: string
  modifier: string
}

const defaultFilters: CompendiumFilters = {
  search: '',
  levelMin: 1,
  levelMax: 40,
  role: '',
  size: '',
  modifier: '',
}

export function useCompendium() {
  const [index, setIndex] = useState<CompendiumEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<CompendiumFilters>(defaultFilters)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load index on first mount
  useEffect(() => {
    setLoading(true)
    window.api.compendium.index('dnd-4e')
      .then((entries: CompendiumEntry[]) => setIndex(entries))
      .finally(() => setLoading(false))
  }, [])

  // Derive unique filter options from index
  const filterOptions = useMemo(() => {
    if (!index) return { roles: [], sizes: [] }
    const roles = new Set<string>()
    const sizes = new Set<string>()
    for (const e of index) {
      if (e.role) roles.add(e.role)
      if (e.size) sizes.add(e.size)
    }
    return {
      roles: [...roles].sort(),
      sizes: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].filter(s => sizes.has(s)),
    }
  }, [index])

  // Filter index
  const filtered = useMemo(() => {
    if (!index) return []
    const searchLower = filters.search.toLowerCase()
    return index.filter(e => {
      if (searchLower && !e.name.toLowerCase().includes(searchLower)) return false
      if (e.level < filters.levelMin || e.level > filters.levelMax) return false
      if (filters.role && e.role !== filters.role) return false
      if (filters.size && e.size !== filters.size) return false
      if (filters.modifier) {
        if (filters.modifier === 'standard' && e.modifier) return false
        else if (filters.modifier !== 'standard' && e.modifier !== filters.modifier) return false
      }
      return true
    })
  }, [index, filters])

  const updateFilter = useCallback(<K extends keyof CompendiumFilters>(key: K, value: CompendiumFilters[K]) => {
    setFilters(f => ({ ...f, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => setFilters(defaultFilters), [])

  const focusSearch = useCallback(() => searchRef.current?.focus(), [])

  return {
    index,
    loading,
    filters,
    filtered,
    filterOptions,
    updateFilter,
    resetFilters,
    searchRef,
    focusSearch,
    totalCount: index?.length ?? 0,
  }
}
