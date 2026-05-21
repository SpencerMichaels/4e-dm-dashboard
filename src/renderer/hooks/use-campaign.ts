import { useCallback } from 'react'
import type { EntityType, Note, Creature, Encounter, Location, Item, PlayerCharacter, MapData } from '@common/types'
import { generateId } from '@common/utils/id'

// Convenience wrappers around window.api for use in components

export function useCampaignActions() {
  const saveEntity = useCallback(async (entityType: EntityType, entity: any) => {
    return window.api.entity.save(entityType, entity)
  }, [])

  const deleteEntity = useCallback(async (entityType: EntityType, entityId: string) => {
    return window.api.entity.delete(entityType, entityId)
  }, [])

  const createNote = useCallback(async (title: string): Promise<Note> => {
    const now = new Date().toISOString()
    const note: Note = {
      id: generateId(),
      title,
      content: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    await window.api.note.save(note)
    return note
  }, [])

  const createCreature = useCallback(async (name: string): Promise<Creature> => {
    const now = new Date().toISOString()
    const creature: Creature = {
      id: generateId(),
      name,
      hp: 10,
      maxHp: 10,
      tags: [],
      statBlock: {},
      createdAt: now,
      updatedAt: now,
    }
    await window.api.entity.save('creature', creature)
    return creature
  }, [])

  const createEncounter = useCallback(async (name: string): Promise<Encounter> => {
    const now = new Date().toISOString()
    const encounter: Encounter = {
      id: generateId(),
      name,
      creatures: [],
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

  const createItem = useCallback(async (name: string): Promise<Item> => {
    const now = new Date().toISOString()
    const item: Item = {
      id: generateId(),
      name,
      tags: [],
      extra: {},
      createdAt: now,
      updatedAt: now,
    }
    await window.api.entity.save('item', item)
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
    createNote,
    createCreature,
    createEncounter,
    createLocation,
    createItem,
    createPC,
    createMap,
  }
}
