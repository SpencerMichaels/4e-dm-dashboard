export interface Creature {
  /** Original kit-schema content retained by the authoring import adapter. */
  authoredContent?: import('@kit').Monster
  id: string
  compendiumId?: string         // Set when cloned from a compendium source — tracks origin
  name: string
  hp: number
  maxHp: number
  imageId?: string              // Full-body artwork
  tokenImageId?: string         // Circular token (optional override — defaults to cropped imageId)
  tokenCrop?: { x: number; y: number; size: number }  // Last crop region used to generate the token (so re-crop starts from previous position)
  statBlock: Record<string, unknown>  // Schema-driven by system plugin
  createdAt: string
  updatedAt: string
}
