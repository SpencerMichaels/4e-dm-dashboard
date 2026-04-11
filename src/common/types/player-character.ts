export interface PlayerCharacter {
  id: string
  name: string
  playerName: string
  imageId?: string
  tokenImageId?: string
  tokenCrop?: { x: number; y: number; size: number }  // Last crop region used to generate the token
  color?: string                  // Characteristic chip color (CSS color string)
  active?: boolean                // Whether this PC counts toward the active party (default true)
  createdAt: string
  updatedAt: string
}
