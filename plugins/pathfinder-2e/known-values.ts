// Known PF2e values for autocomplete fields
// Damage types from Archives of Nethys (Rules ID 2308)

export const damageTypes = {
  physical: ['bludgeoning', 'piercing', 'slashing', 'bleed'],
  energy: ['acid', 'cold', 'electricity', 'fire', 'sonic', 'vitality', 'void', 'force'],
  other: ['spirit', 'mental', 'poison', 'precision'],
} as const

export const allDamageTypes: string[] = [
  ...damageTypes.physical,
  ...damageTypes.energy,
  ...damageTypes.other,
]

export const creatureTraits = [
  // Rarity
  'Common', 'Uncommon', 'Rare', 'Unique',
  // Creature types
  'Aberration', 'Animal', 'Astral', 'Beast', 'Celestial',
  'Construct', 'Dragon', 'Dream', 'Elemental', 'Ethereal',
  'Fey', 'Fiend', 'Fungus', 'Giant', 'Humanoid',
  'Monitor', 'Ooze', 'Petitioner', 'Plant', 'Spirit',
  'Time', 'Undead',
  // Common subtypes/tags
  'Amphibious', 'Aquatic', 'Incorporeal', 'Mindless', 'Swarm',
  'Air', 'Earth', 'Fire', 'Water', 'Metal', 'Wood',
] as const

// Attack/weapon traits from Archives of Nethys
export const attackTraits = [
  'Agile', 'Attached', 'Backstabber', 'Backswing', 'Brace', 'Brutal',
  'Capacity', 'Climbing', 'Cobbled', 'Combination', 'Concealable',
  'Concussive', 'Critical Fusion', 'Deadly d6', 'Deadly d8', 'Deadly d10', 'Deadly d12',
  'Disarm', 'Double Barrel',
  'Fatal d8', 'Fatal d10', 'Fatal d12', 'Fatal Aim d10', 'Fatal Aim d12',
  'Finesse', 'Forceful', 'Free-Hand', 'Grapple', 'Hampering',
  'Injection', 'Jousting d6',
  'Kickback', 'Modular', 'Mounted', 'Nonlethal',
  'Parry', 'Portable', 'Propulsive',
  'Range 10 ft.', 'Range 20 ft.', 'Range 30 ft.', 'Range 60 ft.', 'Range 100 ft.', 'Range 120 ft.',
  'Ranged Trip', 'Razing', 'Reach', 'Recovery',
  'Reload 0', 'Reload 1', 'Reload 2', 'Repeating', 'Resonant',
  'Scatter 5 ft.', 'Scatter 10 ft.', 'Shove', 'Sweep',
  'Tearing', 'Tethered',
  'Thrown 10 ft.', 'Thrown 20 ft.', 'Thrown 30 ft.',
  'Training', 'Trip', 'Twin',
  'Two-Hand d6', 'Two-Hand d8', 'Two-Hand d10', 'Two-Hand d12',
  'Versatile B', 'Versatile P', 'Versatile S',
  'Volley 20 ft.', 'Volley 30 ft.',
] as const

export const speedTypes = [
  { key: 'land', label: 'Land' },
  { key: 'fly', label: 'Fly' },
  { key: 'swim', label: 'Swim' },
  { key: 'climb', label: 'Climb' },
  { key: 'burrow', label: 'Burrow' },
] as const
