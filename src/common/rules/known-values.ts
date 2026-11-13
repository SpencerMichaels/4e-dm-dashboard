// Known D&D 4e values for autocomplete fields

import { DAMAGE_TYPES } from '@kit'

// 4e damage types (PHB), from the shared 4e-kit vocabulary
export const damageTypes = DAMAGE_TYPES

export const allDamageTypes: string[] = [...damageTypes]

// 4e creature keywords/types
export const creatureTraits = [
  // Origins
  'Aberrant', 'Elemental', 'Fey', 'Immortal', 'Natural', 'Shadow',
  // Types
  'Animate', 'Beast', 'Humanoid', 'Magical Beast',
  // Common keywords
  'Aquatic', 'Blind', 'Construct', 'Demon', 'Devil', 'Dragon',
  'Giant', 'Goblin', 'Homunculus', 'Living Construct',
  'Ooze', 'Plant', 'Reptile', 'Spider', 'Swarm', 'Undead',
  // Roles (for reference)
  'Artillery', 'Brute', 'Controller', 'Lurker', 'Skirmisher', 'Soldier',
  'Elite', 'Solo', 'Minion',
] as const

// 4e weapon/attack keywords
export const attackTraits = [
  // Power sources
  'Arcane', 'Divine', 'Martial', 'Primal', 'Psionic', 'Shadow',
  // Damage keywords
  'Acid', 'Cold', 'Fire', 'Force', 'Lightning',
  'Necrotic', 'Poison', 'Psychic', 'Radiant', 'Thunder',
  // Effect keywords
  'Charm', 'Conjuration', 'Disease', 'Fear', 'Gaze', 'Healing', 'Illusion',
  'Mount', 'Polymorph', 'Rage', 'Rattling', 'Reliable', 'Sleep',
  'Stance', 'Summoning', 'Teleportation', 'Zone',
  // Weapon keywords
  'Weapon', 'Implement',
] as const

export const speedTypes = [
  { key: 'land', label: 'Land' },
  { key: 'fly', label: 'Fly' },
  { key: 'overland_flight', label: 'Overland Flight' },
  { key: 'swim', label: 'Swim' },
  { key: 'climb', label: 'Climb' },
  { key: 'burrow', label: 'Burrow' },
  { key: 'teleport', label: 'Teleport' },
  { key: 'phasing', label: 'Phasing' },
] as const
