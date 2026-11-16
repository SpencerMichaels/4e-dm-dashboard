// Writes the UI suites' content repo (fixtures/content-repo): a small, invented stand-in for the private
// content repo, so the suites run without it (CI, a public checkout). Every name and line of text here
// is invented; only the shapes follow the kit schema. Clause spans are given by quote and resolved here.
// The numbers the suites check are set on purpose (XP, levels, initiative, regeneration).
//
// Run after changing it: node tools/ui-smoke/fixtures/make-content-repo.cjs   (rewrites content-repo/)

const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const out = join(__dirname, 'content-repo')
const provenance = { origin: 'human', at: '2026-11-14' }

/** A kit Line with its clauses given by `quote` (the first occurrence after the previous quote). */
function line(text, clauses = []) {
  let from = 0
  return { text, clauses: clauses.map(({ quote, ...c }) => {
    const i = text.indexOf(quote, from)
    if (i < 0) throw new Error(`quote not found in "${text}": ${quote}`)
    from = i + quote.length
    const resolved = { at: [i, i + quote.length], ...c }
    if (c.kind === 'unparsed') resolved.text = quote
    if (c.kind === 'choice') resolved.options = c.options.map(o => o.map(({ quote: q, ...oc }) => { const j = text.indexOf(q, i); return { at: [j, j + q.length], ...oc } }))
    return resolved
  }) }
}
const saveEnds = { kind: 'save-ends' }
const melee = (reach = 1) => ({ kind: 'melee', reach })
const fixed = value => ({ kind: 'fixed', value })

const monster = m => ({
  size: 'medium', origin: 'natural', type: 'humanoid', keywords: [], perception: 2, senses: [], speed: { walk: 6 },
  savingThrowBonus: 0, actionPoints: 0, immune: [], resist: [], vulnerable: [], abilities: { str: 12, con: 12, dex: 12, int: 10, wis: 10, cha: 10 },
  skills: {}, alignment: 'unaligned', languages: '', equipment: '', traits: [], auras: [], description: '', provenance, ...m,
})
const trap = t => ({ kind: 'trap', role: 'lurker', rank: 'standard', detect: [], immune: [], resist: [], traits: [], auras: [], countermeasures: [], flavor: '', description: '', provenance, ...t })

const monsters = [
  monster({
    id: 'monster9001', name: 'Moss Troll', level: 9, role: 'brute', rank: 'standard', size: 'large', xp: 400, hp: 120, initiative: 8, perception: 6,
    speed: { walk: 8 }, defenses: { ac: 21, fortitude: 22, reflex: 18, will: 18 },
    regeneration: { value: 5, suppressedBy: ['fire', 'acid'], text: 'Fire or acid damage stops its regeneration until the end of its next turn.' },
    traits: [{ name: 'Regrowth', keywords: [], text: line('The troll has regeneration 5. Fire or acid damage stops its regeneration until the end of its next turn.', [
      { quote: 'has regeneration 5', kind: 'regeneration', value: 5, who: 'self', duration: { kind: 'permanent' } },
      { quote: 'Fire or acid damage stops its regeneration until the end of its next turn.', kind: 'unparsed' },
    ]) }],
    powers: [{ name: 'Raking Claw', action: 'standard', usage: 'at-will', basic: 'melee', keywords: [], attacks: [{ label: 'primary', range: melee(2), target: 'one creature', bonus: fixed(14), vs: 'ac',
      hit: line('3d6 + 7 damage, and the target is knocked prone.', [
        { quote: '3d6 + 7 damage', kind: 'damage', dice: '3d6+7', types: [], who: 'target' },
        { quote: 'knocked prone', kind: 'condition', condition: 'prone', who: 'target', duration: { kind: 'indefinite' } },
      ]) }] }],
    sources: [{ book: 'Fixture Bestiary', page: 12 }, { book: 'Dungeon Magazine 901' }],
  }),
  monster({
    id: 'monster9002', name: 'Gutter Knifer', level: 1, role: 'skirmisher', rank: 'minion', size: 'small', xp: 25, hp: 1, initiative: 6,
    defenses: { ac: 16, fortitude: 12, reflex: 14, will: 12 },
    powers: [
      { name: 'Shiv', action: 'standard', usage: 'at-will', basic: 'melee', keywords: ['weapon'], attacks: [{ label: 'primary', range: melee(), target: 'one creature', bonus: fixed(6), vs: 'ac',
        hit: line('4 damage.', [{ quote: '4 damage', kind: 'damage', dice: '4', types: [], who: 'target' }]) }] },
      { name: 'Duck and Weave', action: 'immediate-reaction', usage: 'at-will', keywords: [], trigger: line('when missed by a melee attack'), attacks: [],
        effect: line('The knifer shifts 1 square.', [{ quote: 'shifts 1 square', kind: 'move', move: 'shift', squares: 1, who: 'self' }]) },
    ],
    sources: [{ book: 'Dungeon Magazine 902' }],
  }),
  monster({
    id: 'monster9003', name: 'Mire Rat', level: 1, role: 'brute', rank: 'standard', size: 'small', type: 'beast', xp: 100, hp: 38, initiative: 2, perception: 5,
    senses: [{ kind: 'low-light-vision' }], speed: { walk: 6, climb: 3 }, defenses: { ac: 13, fortitude: 13, reflex: 11, will: 9 },
    powers: [{ name: 'Bite', action: 'standard', usage: 'at-will', basic: 'melee', keywords: ['disease'], attacks: [{ label: 'primary', range: melee(), target: 'one creature', bonus: fixed(6), vs: 'ac',
      hit: line('1d10 + 5 damage. At the end of the encounter, the target makes a saving throw. On a failure, the target contracts mire fever (stage 1).', [
        { quote: '1d10 + 5', kind: 'damage', dice: '1d10+5', types: [], who: 'target' },
        { quote: 'the target makes a saving throw', kind: 'saving-throw', who: 'target', if: 'At the end of the encounter' },
        { quote: 'the target contracts mire fever (stage 1)', kind: 'disease', disease: 'mire fever', diseaseId: 'disease9001', stage: 1, who: 'target', if: 'On a failure' },
      ]) }] }],
    sources: [{ book: 'Fixture Bestiary', page: 30 }],
  }),
]

const traps = [
  trap({
    id: 'trap9001', name: 'Spark Jets', level: 4, xp: 175, initiative: 6,
    detect: [{ skill: 'perception', dc: 16, text: 'The character notices scorched nozzles in the wall.' }],
    trigger: line('The jets fire when a creature enters the hall.'),
    powers: [{ name: 'Gout', action: 'standard', usage: 'at-will', keywords: ['fire'], attacks: [{ label: 'primary', range: { kind: 'close-blast', size: 3 }, target: 'each creature in the blast', bonus: fixed(7), vs: 'reflex',
      hit: line('2d6 + 3 fire damage.', [{ quote: '2d6 + 3 fire damage', kind: 'damage', dice: '2d6+3', types: ['fire'], who: 'target' }]) }] }],
    countermeasures: [line('Thievery DC 16: An adjacent character plugs a nozzle.', [{ quote: 'Thievery DC 16: An adjacent character plugs a nozzle.', kind: 'countermeasure', effect: 'disable', checks: [{ skill: 'thievery', dc: 16 }], action: 'standard' }])],
    sources: [{ book: 'Fixture Guide', page: 3 }],
  }),
  trap({
    id: 'trap9002', name: 'Swinging Blade', level: 6, xp: 250, initiative: 6,
    trigger: line('The blade swings when a creature crosses the marked tiles.'),
    powers: [{ name: 'Sweep', action: 'standard', usage: 'at-will', keywords: [], attacks: [{ label: 'primary', range: { kind: 'melee', note: 'touch' }, target: 'one creature on the tiles', bonus: fixed(11), vs: 'ac',
      hit: line('2d6 + 4 damage, and the target falls prone.', [
        { quote: '2d6 + 4 damage', kind: 'damage', dice: '2d6+4', types: [], who: 'target' },
        { quote: 'falls prone', kind: 'condition', condition: 'prone', who: 'target', duration: { kind: 'indefinite' } },
      ]) }] }],
    countermeasures: [line('A character can attack the arm (AC 20, other defenses 15; hp 30). Destroying it stops the blade.', [
      { quote: 'A character can attack the arm (AC 20, other defenses 15; hp 30).', kind: 'countermeasure', effect: 'destroy', defenses: { ac: 20, fortitude: 15, reflex: 15, will: 15 }, hp: 30 },
      { quote: 'Destroying it stops the blade.', kind: 'unparsed' },
    ])],
    sources: [{ book: 'Dungeon Magazine 903' }],
  }),
  // Two published traps of one name at different levels (the suite picks the level-2 hazard): a level-2 copy sorts between them.
  ...[2, 7].map((level, i) => trap({
    id: `trap900${3 + i}`, name: 'Falling Rubble', kind: level === 2 ? 'hazard' : 'trap', level, xp: level === 2 ? 125 : 300,
    trigger: line('Loose stones fall when a creature steps under the cracked arch.'),
    powers: [{ name: 'Rockfall', action: 'opportunity', usage: 'at-will', keywords: [], attacks: [{ label: 'primary', range: { kind: 'area-burst', size: 1 }, target: 'each creature in the burst', bonus: fixed(level + 5), vs: 'reflex',
      hit: line(`${level === 2 ? '2d6' : '3d8'} damage, and the target is dazed until the end of its next turn.`, [
        { quote: `${level === 2 ? '2d6' : '3d8'} damage`, kind: 'damage', dice: level === 2 ? '2d6' : '3d8', types: [], who: 'target' },
        { quote: 'dazed until the end of its next turn', kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'turn-end', whose: 'target', next: true } },
      ]) }] }],
    countermeasures: [line(`Dungeoneering DC ${level + 12}: A character props up the arch.`, [{ quote: `Dungeoneering DC ${level + 12}: A character props up the arch.`, kind: 'countermeasure', effect: 'disable', checks: [{ skill: 'dungeoneering', dc: level + 12 }], action: 'standard' }])],
    sources: [{ book: i ? 'Fixture Guide' : 'Dungeon Magazine 904', page: 20 + i }],
  })),
  // The triggered trap (no initiative): countermeasures of every kind, a "save ends both" hit, a secondary attack.
  trap({
    id: 'trap41', name: 'Leg Breaker Trap', level: 5, xp: 200,
    detect: [{ skill: 'perception', dc: 17, text: 'The character spots the plate.' }],
    trigger: line('The trap attacks a creature that steps on its plate.'),
    powers: [{ name: 'Snap', action: 'opportunity', usage: 'at-will', keywords: [], attacks: [
      { label: 'primary', range: { kind: 'melee' }, target: 'The triggering creature', bonus: fixed(8), vs: 'reflex',
        hit: line('1d10 + 4 damage, and the target is slowed and weakened (save ends both).', [
          { quote: '1d10 + 4 damage', kind: 'damage', dice: '1d10+4', types: [], who: 'target' },
          { quote: 'slowed', kind: 'condition', condition: 'slowed', who: 'target', duration: saveEnds, saveGroup: 'a' },
          { quote: 'weakened (save ends both)', kind: 'condition', condition: 'weakened', who: 'target', duration: saveEnds, saveGroup: 'a' },
        ]) },
      { label: 'secondary', after: 'hit', range: melee(), target: 'the same creature', bonus: fixed(6), vs: 'fortitude', hit: line('The target falls prone.') },
    ] }],
    countermeasures: [
      line('Thievery DC 17: An adjacent character jams the plate.', [{ quote: 'Thievery DC 17: An adjacent character jams the plate.', kind: 'countermeasure', effect: 'disable', checks: [{ skill: 'thievery', dc: 17 }], action: 'standard' }]),
      line('A character can smash the plate (AC 10, other defenses 10; hp 20).', [{ quote: 'A character can smash the plate (AC 10, other defenses 10; hp 20).', kind: 'countermeasure', effect: 'destroy', defenses: { ac: 10, fortitude: 10, reflex: 10, will: 10 }, hp: 20 }]),
      line('Dungeoneering DC 17: Three successes before two failures take the springs apart.', [{ quote: 'Dungeoneering DC 17: Three successes before two failures take the springs apart.', kind: 'countermeasure', effect: 'disable', checks: [{ skill: 'dungeoneering', dc: 17 }], complexity: { successes: 3, failures: 2 } }]),
    ],
    description: 'An invented trap for the UI tests.', sources: [{ book: 'Fixture Guide', page: 9 }],
  }),
  trap({
    id: 'trap9005', name: 'Snare Line', level: 3, xp: 150,
    trigger: line('A creature that walks into the cord trips it.'),
    powers: [{ name: 'Snap Shut', action: 'opportunity', usage: 'at-will', keywords: [], attacks: [{ label: 'primary', range: { kind: 'melee' }, target: 'the triggering creature', bonus: fixed(6), vs: 'reflex',
      hit: line('The target is immobilized (save ends).', [{ quote: 'immobilized (save ends)', kind: 'condition', condition: 'immobilized', who: 'target', duration: saveEnds }]) }] }],
    sources: [{ book: 'Fixture Guide', page: 8 }],
  }),
]

const stages = texts => texts.map((t, i) => ({ stage: i, ...(i === texts.length - 1 ? { final: true } : {}), line: line(t) }))
const diseases = [
  { id: 'disease9001', name: 'Mire Fever', level: 1, endurance: { improveDc: 12, maintainDc: 8 },
    stages: stages(['The target recovers.', 'The target feels feverish and loses a healing surge.', 'The target is weakened while the fever lasts.', 'The target is bedridden until cured.']),
    flavor: 'A sweating sickness carried by swamp vermin.', sources: [{ book: 'Fixture Bestiary', page: 31 }], provenance },
  { id: 'disease9002', name: 'Grey Shakes', level: 5, endurance: { improveDc: 16, maintainDc: 11 },
    stages: stages(['The target recovers.', 'The target takes a -2 penalty to attack rolls.', 'The target is slowed while the shakes last.']),
    flavor: 'Tremors that start in the hands.', sources: [{ book: 'Fixture Guide', page: 40 }], provenance },
]

const items = [
  { id: 'weapon9001', name: 'Ember Weapon', category: 'weapon', level: 5, rarity: 'uncommon',
    levels: [5, 10, 15].map((level, i) => ({ level, enhancement: i + 1, price: [1000, 5000, 25000][i] })), enhancementTargets: ['attack', 'damage'],
    slot: 'weapon', itemType: 'Any', critical: line('+1d6 fire damage per plus'), properties: [],
    powers: [
      { name: 'Power', action: 'free', usage: 'at-will', keywords: ['fire'], attacks: [], effect: line('The weapon glows with banked coals, or stops glowing.') },
      { name: 'Power', action: 'free', usage: 'daily', keywords: ['fire'], trigger: line('You hit with the weapon.'), attacks: [], effect: line('The target takes ongoing 5 fire damage (save ends).'),
        levelSteps: [{ level: 15, text: 'Ongoing 10 fire damage.' }] },
    ],
    flavor: 'Warm to the touch, even in snow.', description: [{ type: 'text', text: 'An invented weapon for the UI tests.' }], sources: [{ book: 'Fixture Guide', page: 50 }], provenance },
  { id: 'armor9001', name: 'Quilted Coat', category: 'armor', level: 3, rarity: 'uncommon',
    levels: [{ level: 3, enhancement: 1, price: 680 }], enhancementTargets: ['ac'], slot: 'body', itemType: 'Cloth', properties: [line('Gain a +1 item bonus to Endurance checks.')], powers: [],
    flavor: 'Layers of padded cloth.', description: [], sources: [{ book: 'Fixture Guide', page: 51 }], provenance },
  { id: 'wondrous9001', name: 'Lantern of Paths', category: 'item', level: 4, rarity: 'uncommon',
    levels: [{ level: 4, price: 840 }], slot: 'wondrous', properties: [], powers: [{ name: 'Power', action: 'minor', usage: 'daily', keywords: [], attacks: [], effect: line('The lantern points toward the nearest exit.') }],
    flavor: 'A tin lantern with a needle in its lid.', description: [], sources: [{ book: 'Fixture Guide', page: 52 }], provenance },
  // Unpriced and consumable: sorts after every price, and is the one item the "use" filter's Consumable keeps.
  { id: 'item9001', name: 'Ashen Draught', category: 'item', level: 6, rarity: 'common',
    levels: [{ level: 6, price: null, priceText: 'Special' }], subtype: 'Consumable', properties: [], powers: [{ name: 'Power', action: 'minor', usage: 'consumable', keywords: ['healing'], attacks: [], effect: line('Drink the draught: you regain 10 hit points.') }],
    flavor: 'Grey and bitter.', description: [], sources: [{ book: 'Fixture Guide', page: 53 }], provenance },
]

const templates = [
  { id: 'drillmaster', name: 'Drillmaster', kind: 'functional', role: 'soldier', rankChange: 'up', leader: true,
    prerequisite: { text: 'Humanoid', check: { kind: 'type', any: ['humanoid'] } }, senses: [], defenses: { ac: 2, fortitude: 2 }, hpPerLevel: 8, savingThrows: 2, actionPoints: 1,
    immune: [], resist: [], vulnerable: [],
    traits: [
      { name: 'Rally Cry', keywords: [], text: line('Allies within 5 squares of the drillmaster gain a +1 bonus to attack rolls.', [{ quote: 'gain a +1 bonus to attack rolls', kind: 'modifier', stat: 'attack', value: 1, who: 'ally', duration: { kind: 'while-in-aura' } }]) },
      { name: 'Steady Hands', keywords: [], text: line('The drillmaster scores a critical hit on a roll of 19 or 20.', [{ quote: 'scores a critical hit on a roll of 19 or 20', kind: 'crit-range', min: 19, who: 'self', duration: { kind: 'permanent' } }]) },
      { name: 'Press the Line', keywords: [], text: line('When the drillmaster hits, one ally adjacent to it can shift 1 square as a free action.') },
    ],
    auras: [], powers: [], description: 'An invented functional template for the UI tests.', sources: [{ book: 'Fixture Guide', page: 60 }], provenance },
  { id: 'hollow-king', name: 'Hollow King', kind: 'functional', role: 'controller', rankChange: 'up',
    prerequisite: { text: 'Level 11', check: { kind: 'min-level', level: 11 } }, keyword: 'undead', senses: [{ kind: 'darkvision' }], defenses: { ac: 2, fortitude: 4, will: 4 },
    hpPerLevel: 8, savingThrows: 2, actionPoints: 1, immune: [{ type: 'poison' }], resist: [{ type: 'necrotic', byTier: { heroic: 5, paragon: 10, epic: 15 } }], vulnerable: [],
    traits: [{ name: 'Crown of Dust', keywords: [], text: line('The hollow king ignores difficult terrain made of rubble or sand.') }],
    auras: [{ name: 'Withering Court', keywords: ['necrotic'], range: 3, text: line('Each enemy that starts its turn in the aura takes 5 necrotic damage.', [{ quote: 'takes 5 necrotic damage', kind: 'damage', dice: '5', types: ['necrotic'], who: 'enemies-in-area' }]) }],
    powers: [{ name: 'Grave Command', action: 'minor', usage: 'recharge', recharge: { kind: 'roll', min: 5 }, keywords: [], attacks: [], effect: line('One ally in the aura shifts 2 squares.', [{ quote: 'shifts 2 squares', kind: 'move', move: 'shift', squares: 2, who: 'ally' }]) }],
    description: 'An invented undead template for the UI tests.', sources: [{ book: 'Fixture Guide', page: 61 }], provenance },
]

const themePower = (name, category, text) => ({ name, action: 'no-action', usage: 'at-will', keywords: [], attacks: [], effect: line(text), category, recommendedFor: ['brute', 'soldier'], flavor: '' })
const themes = [
  { id: 'smoke-born', name: 'Smoke-Born', description: 'Creatures raised in the chimney warrens.', skills: { always: ['stealth'], choices: [['acrobatics']], bonus: 2 },
    powers: [themePower('Choking Cloud', 'attack', 'When the creature hits, the target cannot see beyond 2 squares until the end of its next turn.'), themePower('Ash Step', 'utility', 'The creature can shift 1 square as a minor action.')],
    sources: [{ book: 'Fixture Guide', page: 70 }], provenance },
  { id: 'tide-cult', name: 'Tide Cult', description: 'Followers of a drowned shrine.', skills: { always: ['nature'], choices: [['athletics']], bonus: 2 },
    powers: [themePower('Undertow', 'attack', 'When the creature hits, it can pull the target 1 square.'), themePower('Salt Ward', 'utility', 'The creature gains a +2 bonus to saving throws.')],
    sources: [{ book: 'Fixture Guide', page: 71 }], provenance },
]

// Condition text: short invented summaries, not the books' wording.
const conditions = Object.fromEntries(['combat-advantage', 'blinded', 'dazed', 'dominated', 'dying', 'grabbed', 'helpless', 'immobilized', 'invisible', 'marked',
  'petrified', 'prone', 'restrained', 'slowed', 'stunned', 'surprised', 'unconscious', 'weakened', 'bloodied', 'ongoing-damage', 'regenerating']
  .map(id => [id, `Fixture summary of ${id.replace(/-/g, ' ')}.`]))
const glossary = {
  'fixture term': { name: 'Fixture Term', category: 'other', definition: 'An invented glossary entry for the UI tests.', source: 'Fixture Guide, page(s) 1' },
}

for (const [dir, entries] of Object.entries({ monsters, traps, diseases, items, templates, themes })) {
  mkdirSync(join(out, dir), { recursive: true })
  for (const e of entries) writeFileSync(join(out, dir, `${e.id}.json`), JSON.stringify(e, null, 2) + '\n')
}
writeFileSync(join(out, 'conditions.json'), JSON.stringify(conditions, null, 2) + '\n')
writeFileSync(join(out, 'glossary.json'), JSON.stringify(glossary, null, 2) + '\n')
console.log(`Wrote ${out}`)
