// D&D 4e item reference data — properties, groups, and slots
// Descriptions stored once here; items reference by name only.

/** Weapon and implement properties with canonical descriptions */
export const itemProperties: Record<string, string> = {
  'Accurate': 'You gain a +1 bonus to implement attack rolls when you make an implement attack with an accurate implement.',
  'Blinking': 'When you hit with a teleportation attack power, you have concealment until the start of your next turn.',
  'Crit': 'A high crit weapon deals more damage when you score a critical hit with it. A critical hit deals maximum weapon damage and an extra 1[W] at 1st–10th levels, an extra 2[W] at 11th–20th levels, and an extra 3[W] at 21st–30th levels.',
  'Deadly': 'You gain a +1 bonus to damage rolls made with a deadly implement. The bonus increases to +2 at 11th level and +3 at 21st level.',
  'Defensive': 'A defensive weapon grants you a +1 bonus to AC while you wield the defensive weapon in one hand and wield another melee weapon in your other hand.',
  'Distant': 'The range of your area and ranged attack powers increases by 2 when they\'re used through a distant implement.',
  'Energized': 'When you use an attack power through an energized implement, you gain a +2 bonus to damage rolls if the power has the keyword that matches the implement\'s damage type. The bonus increases to +3 at 11th level and +4 at 21st level.',
  'Forceful': 'Whenever you pull, push, or slide a target with an attack power using a forceful implement, the distance of the forced movement increases by 1 square.',
  'Heavy Thrown': 'You hurl a heavy thrown weapon from your hand, rather than using it to loose a projectile. A basic attack with a heavy thrown weapon uses your Strength.',
  'Light Thrown': 'You hurl a light thrown weapon from your hand. A basic attack with a light thrown weapon uses your Dexterity. Light thrown weapons don\'t deal as much damage as heavy thrown weapons.',
  'Load Free': 'You draw and load ammunition as a free action, requiring no action at all.',
  'Load Minor': 'You draw and load ammunition as a minor action.',
  'Mobile': 'When you hit with an attack using a mobile implement, you can shift as a minor action before the end of your turn.',
  'Mounted': 'A mounted weapon is most effective when you use it while riding a mount. When not mounted, you take a -2 penalty to attack rolls.',
  'Off-Hand': 'An off-hand weapon is light enough that you can hold it and attack effectively with it while holding a weapon in your main hand.',
  'Reach': 'With a reach weapon, you can attack enemies that are 2 squares away from you as well as adjacent enemies.',
  'Reaching': 'You gain +1 reach with melee attacks using a reaching implement.',
  'Shielding': 'Whenever you hit at least one target with an attack power using a shielding implement, you gain a +1 shield bonus to AC and Reflex until the start of your next turn.',
  'Small': 'This weapon can be used by Small characters the same way a Medium character uses it.',
  'Stout': 'A weapon that has the stout property can be treated as a two-handed weapon.',
  'Undeniable': 'You gain a +1 bonus to attack rolls against Will when attacking with an undeniable implement.',
  'Unerring': 'You gain a +1 bonus to attack rolls against Reflex when attacking with an unerring implement.',
  'Unstoppable': 'You gain a +1 bonus to attack rolls against Fortitude when attacking with an unstoppable implement.',
  'Versatile': 'Versatile weapons are one-handed, but you can use them two-handed for an extra 1 point of damage.',
}

/** Weapon groups with descriptions */
export const weaponGroups: Record<string, string> = {
  'Axe': 'Axes are weapons that have bladed, heavy heads and deal vicious cuts.',
  'Bow': 'A bow is a shaft of strong, supple material with a string stretched between its two ends.',
  'Blowgun': 'A blowgun fires needles or darts using the force of one\'s breath.',
  'Crossbow': 'A crossbow is a point-and-shoot projectile weapon requiring little training to master.',
  'Flail': 'Weapons in the flail group have a flexible material, usually a length of chain, between handle and head.',
  'Garrote': 'A garrote is a length of wire or cord used to strangle a target.',
  'Hammer': 'A hammer has a blunt, heavy head with one or more flat striking surfaces attached to a haft.',
  'Heavy Blade': 'Heavy blades are balanced edged weapons used primarily for slashing cuts.',
  'Light Blade': 'Light blades reward accuracy as much as force. Pinpoint attacks and agile defenses are their strong points.',
  'Mace': 'Maces are blunt weapons with a heavier head than handle, useful for delivering crushing blows.',
  'Pick': 'A pick has a long, pointed head made to pierce and create deep wounds.',
  'Polearm': 'Polearms are weapons mounted at the end of long hafts. All polearms are reach weapons.',
  'Sling': 'Slings are leather straps used to hurl stones or metal pellets.',
  'Spear': 'A spear has a stabbing head on the end of a long shaft, great for lunging attacks.',
  'Staff': 'A staff is a long piece of wood or other substance, roughly the same diameter along its whole length.',
  'Unarmed': 'When you punch, kick, elbow, knee, or head butt an opponent, you\'re making an unarmed strike.',
  'Whip': 'A whip is a length of braided leather or cord with a handle on one end.',
}

/** Implement groups with descriptions */
export const implementGroups: Record<string, string> = {
  'Holy Symbol': 'A holy symbol channels divine power. Apply its enhancement bonus to attack and damage rolls of implement keyword powers.',
  'Ki Focus': 'A ki focus channels inner magical energy. Apply its enhancement bonus to attack and damage rolls of implement keyword powers.',
  'Orb': 'An orb channels arcane power. Apply its enhancement bonus to attack and damage rolls of implement keyword powers.',
  'Rod': 'A rod channels arcane power. Apply its enhancement bonus to attack and damage rolls of implement keyword powers.',
  'Staff': 'A staff can be used as both a weapon and an implement.',
  'Tome': 'A tome contains wizard spells and enhances their effectiveness.',
  'Totem': 'A totem is a short length of wood or bone carved to resemble a patron animal or nature spirit.',
  'Wand': 'A wand is a slender, tapered piece of wood, enchanted to channel arcane energy.',
}

/** Known item slots (body slots and item categories) */
export const itemSlots = [
  'Arms Slot', 'Feet Slot', 'Hands Slot', 'Head Slot', 'Neck Slot',
  'Ring Slot', 'Waist Slot',
  'Armor', 'Weapon', 'Implement',
  'Wondrous Item', 'Consumable', 'Alchemical Item',
  'Divine Boon', 'Legendary Boon', 'Fey Magic Gift',
  'Grandmaster Training', 'Mount',
] as const
