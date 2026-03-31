/** Compact index entry for compendium browsing — ~150 bytes per creature */
export interface CompendiumEntry {
  id: string          // e.g. "monster5320"
  name: string
  level: number
  role: string        // "skirmisher", "brute", etc.
  modifier: string    // "elite" | "solo" | ""
  size: string        // "Small", "Medium", etc.
  type: string        // "humanoid" (creature type)
  origin: string      // "natural" (creature origin)
  alignment: string   // "Unaligned"
  xp: number
}
