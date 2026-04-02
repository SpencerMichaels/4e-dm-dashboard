import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { CompendiumEntry } from '@common/types'

export interface CompendiumFilters {
  search: string
  levelMin: number
  levelMax: number
  role: string
  size: string
  modifier: string
  origin: string
  type: string
  alignment: string
}

const defaultFilters: CompendiumFilters = {
  search: '',
  levelMin: 1,
  levelMax: 40,
  role: '',
  size: '',
  modifier: '',
  origin: '',
  type: '',
  alignment: '',
}

export function useCompendium() {
  const [index, setIndex] = useState<CompendiumEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<CompendiumFilters>(defaultFilters)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    window.api.compendium.index('dnd-4e')
      .then((entries: CompendiumEntry[]) => setIndex(entries))
      .finally(() => setLoading(false))
  }, [])

  const filterOptions = useMemo(() => {
    if (!index) return { roles: [], sizes: [], origins: [], types: [], alignments: [] }
    const roles = new Set<string>()
    const sizes = new Set<string>()
    const origins = new Set<string>()
    const types = new Set<string>()
    const alignments = new Set<string>()
    for (const e of index) {
      if (e.role) roles.add(e.role)
      if (e.size) sizes.add(e.size)
      if (e.origin) origins.add(e.origin)
      if (e.type) types.add(e.type)
      if (e.alignment) alignments.add(e.alignment)
    }
    return {
      roles: [...roles].sort(),
      sizes: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].filter(s => sizes.has(s)),
      origins: [...origins].sort(),
      types: [...types].sort(),
      alignments: ['Lawful Good', 'Good', 'Unaligned', 'Evil', 'Chaotic Evil'].filter(a =>
        alignments.has(a) || alignments.has(a.toLowerCase())),
    }
  }, [index])

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
      if (filters.origin && e.origin !== filters.origin) return false
      if (filters.type && e.type !== filters.type) return false
      if (filters.alignment && e.alignment.toLowerCase() !== filters.alignment.toLowerCase()) return false
      return true
    })
  }, [index, filters])

  const updateFilter = useCallback(<K extends keyof CompendiumFilters>(key: K, value: CompendiumFilters[K]) => {
    setFilters(f => ({ ...f, [key]: value }))
  }, [])

  const resetFilters = useCallback(() => setFilters(defaultFilters), [])
  const focusSearch = useCallback(() => searchRef.current?.focus(), [])

  return {
    index, loading, filters, filtered, filterOptions,
    updateFilter, resetFilters, searchRef, focusSearch,
    totalCount: index?.length ?? 0,
  }
}
