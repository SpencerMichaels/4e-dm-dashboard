export interface Creature {
  id: string
  name: string
  hp: number
  maxHp: number
  imageId?: string
  tags: string[]
  statBlock: Record<string, unknown>  // Schema-driven by system plugin
  createdAt: string
  updatedAt: string
}
