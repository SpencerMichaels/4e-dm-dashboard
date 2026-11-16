export interface Campaign {
  id: string
  name: string
  systemId: string
  createdAt: string       // ISO 8601
  lastOpenedAt: string
}

/** A trap by reference: a campaign trap record, a Library one, or a published trap. */
export interface TrapRef {
  trapId?: string
  /** A Library entry (shared by every campaign), used live like a published one. */
  libraryId?: string
  compendiumId?: string
}

export interface Location {
  id: string
  name: string
  description: string      // TipTap JSON serialized as string (rich text notes)
  imageId?: string          // Reference to uploaded image
  sceneImageId?: string     // Background for player screen
  parentId?: string         // Parent location for hierarchy
  encounterIds?: string[]   // Encounters associated with this location
  traps?: TrapRef[]         // Traps and hazards here, shown as stat blocks
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MapData {
  id: string
  name: string
  imageId: string
  pins: MapPin[]
  createdAt: string
  updatedAt: string
}

export interface MapPin {
  id: string
  x: number               // 0-1 normalized
  y: number               // 0-1 normalized
  label: string
  linkedEntityType?: EntityType
  linkedEntityId?: string
}

export type EntityType =
  | 'creature'
  | 'encounter'
  | 'location'
  | 'item'
  | 'player-character'
  | 'map'
  // Kit-native records in a CampaignRecord envelope
  | 'trap'
  | 'disease'
  | 'template'
  | 'theme'
  // Treasure (per level frame) and per-level plans
  | 'treasure'
  | 'level'
