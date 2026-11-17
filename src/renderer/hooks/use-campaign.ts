import { useCallback } from 'react'
import type { EntityType, CreatureRecord, Encounter, Location, ItemRecord, PlayerCharacter, MapData } from '@common/types'
import type { Item as KitItem, Monster } from '@kit'
import { newRecord } from '@common/campaign-records'
import { scaffold } from '@common/authoring/core'
import { generateId } from '@common/utils/id'
import { isActivePc, partyLevel } from '@common/rules/party'
import { useCampaignStore } from '../stores/campaign-store'

// Convenience wrappers around window.api for use in components

export function useCampaignActions() {
  const saveEntity = useCallback(async (entityType: EntityType, entity: any) => {
    return window.api.entity.save(entityType, entity)
  }, [])

  const deleteEntity = useCallback(async (entityType: EntityType, entityId: string) => {
    return window.api.entity.delete(entityType, entityId)
  }, [])

  const createCreature = useCallback(async (name: string): Promise<CreatureRecord> => {
    const creature = newRecord(generateId(), scaffold('monster', name, 1) as Monster, new Date().toISOString())
    await window.api.entity.save('creature', creature as unknown as Record<string, unknown>)
    return creature
  }, [])

  /** `level`: the party level it is planned for (default the party's level now). */
  const createEncounter = useCallback(async (name: string, level?: number): Promise<Encounter> => {
    const now = new Date().toISOString()
    const encounter: Encounter = {
      id: generateId(),
      name,
      creatures: [],
      // Planned for the party's level now (its level frame), so its difficulty holds as the party levels up.
      level: level ?? partyLevel(useCampaignStore.getState().playerCharacters),
      // And for the active party's size now (with the level, its frame).
      partySize: useCampaignStore.getState().playerCharacters.filter(isActivePc).length || undefined,
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    await window.api.entity.save('encounter', encounter)
    return encounter
  }, [])

  const createLocation = useCallback(async (name: string): Promise<Location> => {
    const now = new Date().toISOString()
    const location: Location = {
      id: generateId(),
      name,
      description: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    await window.api.entity.save('location', location)
    return location
  }, [])

  // Items are kit records like traps (2026-11-13); a new one starts from the item scaffold.
  const createItem = useCallback(async (name: string): Promise<ItemRecord> => {
    const item = newRecord(generateId(), scaffold('item', name, 1) as KitItem, new Date().toISOString())
    await window.api.entity.save('item', item as unknown as Record<string, unknown>)
    return item
  }, [])

  const createPC = useCallback(async (name: string, playerName: string): Promise<PlayerCharacter> => {
    const now = new Date().toISOString()
    const pc: PlayerCharacter = {
      id: generateId(),
      name,
      playerName,
      createdAt: now,
      updatedAt: now,
    }
    await window.api.entity.save('player-character', pc)
    return pc
  }, [])

  const createMap = useCallback(async (name: string, imageId: string): Promise<MapData> => {
    const now = new Date().toISOString()
    const map: MapData = {
      id: generateId(),
      name,
      imageId,
      pins: [],
      createdAt: now,
      updatedAt: now,
    }
    await window.api.entity.save('map', map)
    return map
  }, [])

  return {
    saveEntity,
    deleteEntity,
    createCreature,
    createEncounter,
    createLocation,
    createItem,
    createPC,
    createMap,
  }
}
