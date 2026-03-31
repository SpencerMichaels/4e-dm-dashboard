export interface PlayerCharacter {
  id: string
  name: string
  playerName: string
  hp: number
  maxHp: number
  imageId?: string
  stats: Record<string, unknown>  // Schema-driven by system plugin
  tags: string[]
  createdAt: string
  updatedAt: string
}
