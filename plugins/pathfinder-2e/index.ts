import type { SystemPlugin } from '../../src/common/types/system-plugin'
import { statDefs, strikeDamageDice, resistWeakRange, strikeAttack } from './benchmarks'
import { allDamageTypes, creatureTraits, attackTraits, speedTypes } from './known-values'

const pathfinder2e: SystemPlugin = {
  id: 'pathfinder-2e',
  name: 'Pathfinder 2e',
  version: '0.1.0',
  conditions: [
    { id: 'blinded', name: 'Blinded', description: 'All terrain is difficult terrain. Critical failure on sight-based Perception checks.', hasValue: false, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'clumsy', name: 'Clumsy', description: 'Penalty to Dex-based checks and DCs.', hasValue: true, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'confused', name: 'Confused', description: 'Off-guard, can\'t use reactions, attacks randomly.', hasValue: false, durationTypes: ['rounds'], automation: [] },
    { id: 'controlled', name: 'Controlled', description: 'Another creature determines your actions.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'dazzled', name: 'Dazzled', description: 'All creatures are concealed to you.', hasValue: false, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'deafened', name: 'Deafened', description: 'Automatically fail Perception checks that rely on hearing.', hasValue: false, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'doomed', name: 'Doomed', description: 'Die at dying value of 4 - doomed value.', hasValue: true, durationTypes: ['unlimited'], automation: [] },
    { id: 'drained', name: 'Drained', description: 'Penalty to Con-based checks. Lose max HP.', hasValue: true, durationTypes: ['unlimited'], automation: [] },
    { id: 'dying', name: 'Dying', description: 'Unconscious. Recovery checks each turn.', hasValue: true, durationTypes: ['unlimited'], automation: [{ type: 'remove-at-zero' }] },
    { id: 'encumbered', name: 'Encumbered', description: 'Clumsy 1, -10 feet to all speeds.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'enfeebled', name: 'Enfeebled', description: 'Penalty to Str-based checks and DCs.', hasValue: true, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'fascinated', name: 'Fascinated', description: '-2 to Perception and skill checks.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    {
      id: 'fleeing', name: 'Fleeing', description: 'Must spend actions to move away from source.',
      hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [],
    },
    {
      id: 'frightened', name: 'Frightened',
      description: 'Status penalty to all checks and DCs equal to frightened value.',
      hasValue: true, durationTypes: ['unlimited'],
      automation: [{ type: 'decrement' }, { type: 'remove-at-zero' }],
      appliedAt: 'end',
    },
    { id: 'grabbed', name: 'Grabbed', description: 'Immobilized, off-guard.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'hidden', name: 'Hidden', description: 'Creature knows your space but can\'t see you.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'immobilized', name: 'Immobilized', description: 'Can\'t use actions with the move trait.', hasValue: false, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'invisible', name: 'Invisible', description: 'Hidden from all creatures.', hasValue: false, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'off-guard', name: 'Off-Guard', description: '-2 to AC.', hasValue: false, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'paralyzed', name: 'Paralyzed', description: 'Off-guard, can\'t act.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'persistent-damage', name: 'Persistent Damage', description: 'Take damage at end of each turn, then flat check DC 15 to remove.', hasValue: true, durationTypes: ['unlimited'], automation: [{ type: 'prompt-save', dc: '15' }], appliedAt: 'end' },
    { id: 'petrified', name: 'Petrified', description: 'Turned to stone.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'prone', name: 'Prone', description: 'Off-guard, -2 to attack rolls, must Stand to remove.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'quickened', name: 'Quickened', description: 'Gain extra action each turn.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'restrained', name: 'Restrained', description: 'Immobilized, off-guard, can\'t attack.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'sickened', name: 'Sickened', description: 'Status penalty to all checks and DCs. Can\'t willingly ingest.', hasValue: true, durationTypes: ['unlimited'], automation: [] },
    { id: 'slowed', name: 'Slowed', description: 'Lose actions at start of turn equal to slowed value.', hasValue: true, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'stunned', name: 'Stunned', description: 'Lose actions. Value decrements each turn.', hasValue: true, durationTypes: ['rounds'], automation: [{ type: 'decrement' }, { type: 'remove-at-zero' }], appliedAt: 'start' },
    { id: 'stupefied', name: 'Stupefied', description: 'Penalty to Int/Wis/Cha checks. Flat check to cast spells.', hasValue: true, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'unconscious', name: 'Unconscious', description: 'Can\'t act, off-guard, -4 to AC/Perception/Reflex.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'wounded', name: 'Wounded', description: 'When you gain dying, increase by wounded value.', hasValue: true, durationTypes: ['unlimited'], automation: [] },
  ],
  statBlockSchema: [
    { key: 'level', label: 'Level', type: 'number', required: true },
    {
      key: 'abilities', label: 'Ability Modifiers', type: 'group', fields: [
        { key: 'str', label: 'STR', type: 'number' },
        { key: 'dex', label: 'DEX', type: 'number' },
        { key: 'con', label: 'CON', type: 'number' },
        { key: 'int', label: 'INT', type: 'number' },
        { key: 'wis', label: 'WIS', type: 'number' },
        { key: 'cha', label: 'CHA', type: 'number' },
      ],
    },
    { key: 'ac', label: 'AC', type: 'number', required: true },
    {
      key: 'saves', label: 'Saving Throws', type: 'group', fields: [
        { key: 'fort', label: 'Fortitude', type: 'number' },
        { key: 'ref', label: 'Reflex', type: 'number' },
        { key: 'will', label: 'Will', type: 'number' },
      ],
    },
    { key: 'perception', label: 'Perception', type: 'number' },
    { key: 'speed', label: 'Speed', type: 'number' },
    { key: 'traits', label: 'Traits', type: 'text', placeholder: 'e.g. Beast, Large' },
    { key: 'immunities', label: 'Immunities', type: 'text' },
    { key: 'resistances', label: 'Resistances', type: 'text' },
    { key: 'weaknesses', label: 'Weaknesses', type: 'text' },
    { key: 'attacks', label: 'Attacks', type: 'textarea', placeholder: 'Melee [1] jaws +14, Damage 2d8+6 piercing' },
    { key: 'abilities_text', label: 'Special Abilities', type: 'textarea' },
    { key: 'spells', label: 'Spells', type: 'textarea' },
  ],
  pcSchema: [
    { key: 'class', label: 'Class', type: 'text', required: true },
    { key: 'level', label: 'Level', type: 'number', required: true },
    { key: 'ancestry', label: 'Ancestry', type: 'text' },
    { key: 'heritage', label: 'Heritage', type: 'text' },
    { key: 'background', label: 'Background', type: 'text' },
    {
      key: 'abilities', label: 'Ability Scores', type: 'group', fields: [
        { key: 'str', label: 'STR', type: 'number' },
        { key: 'dex', label: 'DEX', type: 'number' },
        { key: 'con', label: 'CON', type: 'number' },
        { key: 'int', label: 'INT', type: 'number' },
        { key: 'wis', label: 'WIS', type: 'number' },
        { key: 'cha', label: 'CHA', type: 'number' },
      ],
    },
    { key: 'ac', label: 'AC', type: 'number' },
    { key: 'perception', label: 'Perception', type: 'number' },
    { key: 'speed', label: 'Speed', type: 'number' },
  ],
  itemSchema: [
    { key: 'level', label: 'Item Level', type: 'number' },
    { key: 'price', label: 'Price', type: 'text', placeholder: 'e.g. 5 gp' },
    { key: 'bulk', label: 'Bulk', type: 'text', placeholder: 'e.g. 1, L, -' },
    { key: 'traits', label: 'Traits', type: 'text' },
    { key: 'rarity', label: 'Rarity', type: 'select', options: [
      { value: 'common', label: 'Common' },
      { value: 'uncommon', label: 'Uncommon' },
      { value: 'rare', label: 'Rare' },
      { value: 'unique', label: 'Unique' },
    ]},
  ],
  initiativeRules: {
    diceExpression: '1d20',
    modifierFields: ['perception'],
    tiebreaker: 'modifier',
  },
  hpDescriptors: [
    { minPercent: 100, maxPercent: Infinity, label: 'Unharmed', color: '#2f9e44' },
    { minPercent: 75, maxPercent: 100, label: 'Healthy', color: '#74b816' },
    { minPercent: 50, maxPercent: 75, label: 'Hurt', color: '#f08c00' },
    { minPercent: 25, maxPercent: 50, label: 'Bloodied', color: '#e8590c' },
    { minPercent: 1, maxPercent: 25, label: 'Barely Standing', color: '#e03131' },
    { minPercent: 0, maxPercent: 1, label: 'Down', color: '#868e96' },
  ],
  turnHooks: {
    onTurnStart(combatantId, conditions) {
      const actions: any[] = []
      // Stunned: decrement at start
      const stunned = conditions.find(c => c.conditionId === 'stunned')
      if (stunned && stunned.value != null && stunned.value > 0) {
        actions.push({
          type: 'auto',
          description: `Stunned decreases to ${stunned.value - 1}`,
          apply: () => {},
        })
      }
      return actions
    },
    onTurnEnd(combatantId, conditions) {
      const actions: any[] = []
      // Frightened: decrement at end
      const frightened = conditions.find(c => c.conditionId === 'frightened')
      if (frightened && frightened.value != null && frightened.value > 0) {
        actions.push({
          type: 'auto',
          description: `Frightened decreases to ${frightened.value - 1}`,
          apply: () => {},
        })
      }
      // Persistent damage: prompt save
      const persistent = conditions.find(c => c.conditionId === 'persistent-damage')
      if (persistent) {
        actions.push({
          type: 'prompt',
          description: `Flat check DC 15 to remove persistent damage (${persistent.value})`,
          choices: [
            { label: 'Success (remove)', action: 'remove-condition:persistent-damage' },
            { label: 'Failure (keep)', action: 'none' },
          ],
        })
      }
      return actions
    },
  },
  creatureBuilder: {
    minLevel: -1,
    maxLevel: 24,
    statDefs,
    strikeDamageDice,
    resistWeakRange,
    attackBonusTables: [
      { key: 'strikeAttack', label: 'Strike', table: strikeAttack },
    ],
    damageTypes: [...allDamageTypes],
    creatureTraits: [...creatureTraits],
    attackTraits: [...attackTraits],
    sizes: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'],
    skills: ['Acrobatics', 'Arcana', 'Athletics', 'Crafting', 'Deception', 'Diplomacy', 'Intimidation', 'Lore', 'Medicine', 'Nature', 'Occultism', 'Performance', 'Religion', 'Society', 'Stealth', 'Survival', 'Thievery'],
    speedTypes: speedTypes.map(s => ({ key: s.key, label: s.label })),
    actionsLabel: 'Abilities',
    actionTypes: [
      { value: '1', label: '1 Action', icon: '\u25B6' },
      { value: '2', label: '2 Actions', icon: '\u25B6\u25B6' },
      { value: '3', label: '3 Actions', icon: '\u25B6\u25B6\u25B6' },
      { value: 'reaction', label: 'Reaction', icon: 'R' },
      { value: 'free', label: 'Free Action', icon: 'F' },
    ],
    rangeTypes: [
      { value: 'melee', label: 'Melee' },
      { value: 'ranged', label: 'Ranged' },
      { value: 'emanation', label: 'Emanation' },
      { value: 'burst', label: 'Burst' },
      { value: 'cone', label: 'Cone' },
      { value: 'line', label: 'Line' },
    ],
    targetDefenses: ['AC', 'Fortitude', 'Reflex', 'Will'],
    triggeredActionTypes: ['reaction', 'free'],
    defaultSpeed: 25,
    speedStep: 5,
    weaknessLabel: 'Weaknesses',
    useGroupedActions: true,
    tierDisplay: {
      extreme: { color: '#e03131', label: 'Ext' },
      high: { color: '#f08c00', label: 'High' },
      moderate: { color: '#2f9e44', label: 'Mod' },
      low: { color: '#1c7ed6', label: 'Low' },
      terrible: { color: '#868e96', label: 'Ter' },
    },
  },
}

export default pathfinder2e
