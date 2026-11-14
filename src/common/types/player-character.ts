export interface PlayerCharacter {
  id: string
  name: string
  playerName: string
  imageId?: string
  tokenImageId?: string
  tokenCrop?: { x: number; y: number; size: number }  // Last crop region used to generate the token
  color?: string                  // Characteristic chip color (CSS color string)
  active?: boolean                // Whether this PC counts toward the active party (default true)
  level?: number                  // The PC's level when no sheet is imported (a sheet's level wins; see pcLevel in src/common/rules/party.ts)
  markType?: string               // Class mark id (e.g. 'hunter-quarry') — see src/common/rules/class-marks.ts
  diseases?: PcDisease[]          // Diseases the PC is exposed to or carries, with the current stage
  /** Final numbers imported from a Character Builder .dnd4e or a 4ecb .4ecb file (src/common/character/character-import.ts). */
  sheet?: import('@kit').CharacterSnapshot
  /** The file the sheet came from, for the DM's reference. */
  sheetFile?: string
  createdAt: string
  updatedAt: string
}

/** A disease by reference: a campaign disease record, a Library one, or a published disease. */
export interface DiseaseRef {
  diseaseId?: string
  /** A Library entry (shared by every campaign), used live like a published one. */
  libraryId?: string
  compendiumId?: string
}

/**
 * A disease a PC carries. "exposed": hit by a disease attack, not yet contracted (the disease attacks
 * after the encounter). A number: the current stage (stage 1 on contracting; reaching 0 cures it).
 */
export interface PcDisease extends DiseaseRef {
  stage: number | 'exposed'
  /** When it was exposed or last changed, for the DM's reference. */
  since: string
}
