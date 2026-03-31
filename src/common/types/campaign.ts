export interface Campaign {
  id: string
  name: string
  systemId: string
  createdAt: string       // ISO 8601
  lastOpenedAt: string
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

export interface Location {
  id: string
  name: string
  description: string
  imageId?: string        // Reference to uploaded image
  sceneImageId?: string   // Background for player screen
  parentId?: string       // Parent location for hierarchy
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

export interface LinkEntry {
  sourceType: EntityType
  sourceId: string
  targetType: EntityType
  targetId: string
}

export interface LinkIndex {
  links: LinkEntry[]
}
