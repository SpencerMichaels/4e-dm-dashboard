export interface Campaign {
  id: string
  name: string
  systemId: string
  createdAt: string       // ISO 8601
  lastOpenedAt: string
  partyLevel?: number     // Whole-party level (PCs always level together)
}

export interface NoteTreeNode {
  id: string
  title: string
  children: NoteTreeNode[]
}

export interface Note {
  id: string
  title: string
  content: string         // TipTap JSON serialized as string
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** A trap by reference: a campaign trap record or a published trap. */
export interface TrapRef {
  trapId?: string
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
  | 'note'
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

export interface LinkEntry {
  sourceType: EntityType
  sourceId: string
  targetType: EntityType
  targetId: string
}

export interface LinkIndex {
  links: LinkEntry[]
}
