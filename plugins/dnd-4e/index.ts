import type { SystemPlugin } from '../../src/common/types/system-plugin'
import { statDefs, normalDamageDice, limitedDamageDice, attackVsAC, attackVsOther } from './benchmarks'
import { allDamageTypes, creatureTraits, attackTraits, speedTypes } from './known-values'
import { CLASS_MARKS } from './class-marks'
import { dnd4eCompendium } from './compendium'

const dnd4e: SystemPlugin = {
  id: 'dnd-4e',
  name: 'D&D 4th Edition',
  version: '0.1.0',
  conditions: [
    { id: 'combat-advantage', name: 'Grants CA', description: 'Enemies gain +2 to attack rolls against this creature.', hasValue: false },
    { id: 'blinded', name: 'Blinded', description: 'Grant combat advantage. Can\'t see any target. -10 to Perception.', hasValue: false },
    { id: 'dazed', name: 'Dazed', description: 'Grant combat advantage. Can take one action per turn. No opportunity/immediate.', hasValue: false },
    { id: 'dominated', name: 'Dominated', description: 'Dazed. Dominator chooses one action per turn.', hasValue: false },
    { id: 'dead', name: 'Dead', description: 'Creature is dead. Skipped in initiative.', hasValue: false },
    { id: 'dying', name: 'Dying', description: 'Unconscious. Make death saves each turn.', hasValue: false },
    { id: 'grabbed', name: 'Grabbed', description: 'Immobilized until escape (Acrobatics vs. Reflex or Athletics vs. Fortitude as a move action).', hasValue: false },
    { id: 'helpless', name: 'Helpless', description: 'Grant combat advantage. Can be coup de grace\'d.', hasValue: false },
    { id: 'immobilized', name: 'Immobilized', description: 'Can\'t move from current space.', hasValue: false },
    { id: 'invisible', name: 'Invisible', description: 'Can\'t be seen without special senses. Has total concealment and combat advantage against enemies that can\'t see it.', hasValue: false },
    { id: 'marked', name: 'Marked', description: '-2 to attack rolls for attacks not targeting marker.', hasValue: false },
    { id: 'petrified', name: 'Petrified', description: 'Turned to stone. Unconscious. Resist 20 all.', hasValue: false },
    { id: 'prone', name: 'Prone', description: 'Grant combat advantage to melee. +2 to defenses vs ranged.', hasValue: false },
    { id: 'restrained', name: 'Restrained', description: 'Immobilized, grant combat advantage. -2 to attack rolls.', hasValue: false },
    { id: 'slowed', name: 'Slowed', description: 'Speed becomes 2.', hasValue: false },
    { id: 'stunned', name: 'Stunned', description: 'Grant combat advantage. Can\'t take actions.', hasValue: false },
    { id: 'surprised', name: 'Surprised', description: 'Grant combat advantage. Can\'t take actions (surprise round).', hasValue: false },
    { id: 'unconscious', name: 'Unconscious', description: 'Helpless. -5 to all defenses. Can\'t take actions.', hasValue: false },
    { id: 'weakened', name: 'Weakened', description: 'Attacks deal half damage.', hasValue: false },
    { id: 'bloodied', name: 'Bloodied', description: 'At or below half HP. Triggers bloodied abilities.', hasValue: false },
    { id: 'reacted', name: 'Reacted', description: 'This creature has used its reaction for this round.', hasValue: false },
    {
      id: 'ongoing-damage', name: 'Ongoing Damage', description: 'Take damage at start of turn, then save ends.',
      hasValue: true,
    },
    {
      id: 'regenerating', name: 'Regenerating',
      description: 'Regains hit points at the start of each turn.',
      hasValue: true, hidden: false,
    },
    // Striker designation marks (Hunter's Quarry, Warlock's Curse, Oath of
    // Enmity) — hidden from the generic condition picker; applied via the
    // dedicated Class Marks UI. Defender marks share the existing `marked`
    // condition with a customName override and don't get their own def.
    ...CLASS_MARKS.filter(m => !m.appliesMarkedCondition).map(m => ({
      id: m.conditionId!,
      name: m.shortName,
      description: m.description,
      hasValue: false,
      hidden: true,
    })),
  ],
  hpDescriptors: [
    { minPercent: 100, maxPercent: Infinity, label: 'Unharmed', color: '#2f9e44' },
    { minPercent: 51, maxPercent: 100, label: 'Wounded', color: '#f59e0b' },
    { minPercent: 1, maxPercent: 51, label: 'Bloodied', color: '#e03131' },
    { minPercent: 0, maxPercent: 1, label: 'Down', color: '#868e96' },
  ],
  settings: [
    {
      key: 'hideActionTypeText',
      label: 'Hide action and power type text (icons only)',
      type: 'boolean',
      default: false,
      description: 'When enabled, the "(standard action; at-will)" line is hidden from power cards. The action icon and usage color already convey this info.',
    },
  ],
  creatureBuilder: {
    minLevel: 1,
    maxLevel: 30,
    statDefs,
    strikeDamageDice: normalDamageDice,
    limitedDamageDice: limitedDamageDice,
    attackBonusTables: [
      { key: 'attackVsAC', label: 'vs AC', table: attackVsAC },
      { key: 'attackVsOther', label: 'vs Other', table: attackVsOther },
    ],
    damageTypes: [...allDamageTypes],
    creatureTraits: [...creatureTraits],
    attackTraits: [...attackTraits],
    sizes: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'],
    alignments: ['Lawful Good', 'Good', 'Unaligned', 'Evil', 'Chaotic Evil'],
    skills: ['Acrobatics', 'Arcana', 'Athletics', 'Bluff', 'Diplomacy', 'Dungeoneering', 'Endurance', 'Heal', 'History', 'Insight', 'Intimidate', 'Nature', 'Perception', 'Religion', 'Stealth', 'Streetwise', 'Thievery'],
    speedTypes: speedTypes.map(s => ({ key: s.key, label: s.label })),
    useSharedRole: true,
    roles: ['skirmisher', 'brute', 'soldier', 'lurker', 'controller', 'artillery'],
    abilityScores: {
      names: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      pairs: [['str', 'con'], ['dex', 'int'], ['wis', 'cha']],
      defensePairs: [
        { defense: 'Fortitude', abilities: ['str', 'con'], baseOffset: 12 },
        { defense: 'Reflex', abilities: ['dex', 'int'], baseOffset: 12 },
        { defense: 'Will', abilities: ['wis', 'cha'], baseOffset: 12 },
      ],
      defaultPrimary: 16,
      defaultSecondary: 13,
      defaultLow: 10,
      hpAbility: 'con',
      hpBaseline: 14,
    },
    useGroupedActions: true,
    triggeredActionTypes: ['immediate-interrupt', 'immediate-reaction'],
    tierDisplay: {
      skirmisher: { color: '#2f9e44', label: 'Skirmisher' },
      brute: { color: '#e03131', label: 'Brute' },
      soldier: { color: '#1c7ed6', label: 'Soldier' },
      lurker: { color: '#7950f2', label: 'Lurker' },
      controller: { color: '#f08c00', label: 'Controller' },
      artillery: { color: '#e8590c', label: 'Artillery' },
      easy: { color: '#2f9e44', label: 'Easy' },
      moderate: { color: '#f08c00', label: 'Mod' },
      hard: { color: '#e03131', label: 'Hard' },
    },
    actionTypes: [
      { value: 'standard', label: 'Standard Action', icon: 'Std' },
      { value: 'move', label: 'Move Action', icon: 'Mov' },
      { value: 'minor', label: 'Minor Action', icon: 'Min' },
      { value: 'free', label: 'Free Action', icon: 'Free' },
      { value: 'immediate-interrupt', label: 'Immediate Interrupt', icon: 'Int' },
      { value: 'immediate-reaction', label: 'Immediate Reaction', icon: 'Rcn' },
    ],
    usageTypes: [
      { value: 'at-will', label: 'At-Will' },
      { value: 'encounter', label: 'Encounter' },
      { value: 'recharge', label: 'Recharge' },
      { value: 'recharge-bloodied', label: 'Recharge when bloodied' },
    ],
    rangeTypes: [
      { value: 'melee', label: 'Melee' },
      { value: 'ranged', label: 'Ranged' },
      { value: 'close-burst', label: 'Close burst' },
      { value: 'close-blast', label: 'Close blast' },
      { value: 'area-burst', label: 'Area burst' },
      { value: 'area-wall', label: 'Area wall' },
      { value: 'personal', label: 'Personal' },
    ],
    targetDefenses: ['AC', 'Fortitude', 'Reflex', 'Will'],
  },
  compendium: dnd4eCompendium,
}

export default dnd4e
