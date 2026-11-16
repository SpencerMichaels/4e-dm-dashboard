// Treasure records and level plans in the open campaign: saving them, and what the treasure views
// need around them (the party, where a treasure is placed).

import { useMemo, useReducer, useRef } from 'react'
import type { LevelPlan, Treasure, TreasureMode } from '@common/types'
import { generateId } from '@common/utils/id'
import { BASE_PARTY_SIZE } from '@common/rules/treasure'
import { isActivePc, partyLevel } from '@common/rules/party'
import { useCampaignStore } from '../../stores/campaign-store'

const now = () => new Date().toISOString()

export const saveTreasure = (t: Treasure) => window.api.entity.save('treasure', { ...t, updatedAt: now() } as unknown as Record<string, unknown>)
export const deleteTreasure = (id: string) => window.api.entity.delete('treasure', id)

export function createTreasure(level: number, patch: Partial<Treasure>): Promise<unknown> {
  const t: Treasure = { id: generateId(), level, createdAt: now(), updatedAt: now(), ...patch }
  return saveTreasure(t)
}

/** A level's plan, as stored or the default (DMG parcels). */
export function levelPlan(plans: LevelPlan[], level: number): LevelPlan {
  return plans.find(p => p.level === level) ?? { id: String(level), level, treasure: { mode: 'dmg' }, updatedAt: '' }
}
export const planMode = (plan: LevelPlan): TreasureMode => plan.treasure?.mode ?? 'dmg'

export const saveLevelPlan = (plan: LevelPlan) => window.api.entity.save('level', { ...plan, id: String(plan.level), updatedAt: now() } as unknown as Record<string, unknown>)

/** The active party: its level (undefined with no levelled PC) and size (the books' five when none is active). */
export function useParty(): { level: number | undefined; size: number } {
  const pcs = useCampaignStore(s => s.playerCharacters)
  return useMemo(() => {
    const active = pcs.filter(isActivePc).length
    return { level: partyLevel(pcs), size: active || BASE_PARTY_SIZE }
  }, [pcs])
}

/** Where a treasure is, resolved: its location or encounter, or null (unplaced, or the place was deleted). */
export function usePlaces() {
  const locations = useCampaignStore(s => s.locations)
  const encounters = useCampaignStore(s => s.encounters)
  return useMemo(() => {
    const placeOf = (t: Treasure): { kind: 'location' | 'encounter'; id: string; name: string } | null => {
      if (t.locationId) { const l = locations.find(x => x.id === t.locationId); if (l) return { kind: 'location', id: l.id, name: l.name } }
      if (t.encounterId) { const e = encounters.find(x => x.id === t.encounterId); if (e) return { kind: 'encounter', id: e.id, name: e.name } }
      return null
    }
    return { locations, encounters, placeOf }
  }, [locations, encounters])
}

export const gp = (n: number) => `${Math.round(n).toLocaleString('en-US')} gp`

/**
 * A treasure being edited in place: edits apply to the latest version at once and are saved whole, and
 * a broadcast older than the last edit is ignored, so quick edits to several fields never undo each other.
 */
export function useLiveTreasure(treasure: Treasure): [Treasure, (patch: Partial<Treasure>) => void] {
  const latest = useRef(treasure)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  if (treasure.updatedAt > latest.current.updatedAt || treasure.id !== latest.current.id) latest.current = treasure
  const update = (patch: Partial<Treasure>) => {
    latest.current = { ...latest.current, ...patch, updatedAt: now() }
    rerender()
    void window.api.entity.save('treasure', latest.current as unknown as Record<string, unknown>)
  }
  return [latest.current, update]
}
