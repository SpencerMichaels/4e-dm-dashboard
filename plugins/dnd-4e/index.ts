import type { SystemPlugin } from '../../src/common/types/system-plugin'
import { statDefs, normalDamageDice, limitedDamageDice, resistWeakDefault, attackVsAC, attackVsOther, dcTable } from './benchmarks'
import { allDamageTypes, creatureTraits, attackTraits, speedTypes } from './known-values'

const dnd4e: SystemPlugin = {
  id: 'dnd-4e',
  name: 'D&D 4th Edition',
  version: '0.1.0',
  conditions: [
    { id: 'combat-advantage', name: 'Grants CA', description: 'Enemies gain +2 to attack rolls against this creature.', hasValue: false, durationTypes: ['rounds', 'encounter', 'unlimited'], automation: [] },
    { id: 'blinded', name: 'Blinded', description: 'Grant combat advantage. Can\'t see any target. -10 to Perception.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'dazed', name: 'Dazed', description: 'Grant combat advantage. Can take one action per turn. No opportunity/immediate.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'dominated', name: 'Dominated', description: 'Dazed. Dominator chooses one action per turn.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'dying', name: 'Dying', description: 'Unconscious. Make death saves each turn.', hasValue: false, durationTypes: ['unlimited'], automation: [{ type: 'prompt-save' }] },
    { id: 'helpless', name: 'Helpless', description: 'Grant combat advantage. Can be coup de grace\'d.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'immobilized', name: 'Immobilized', description: 'Can\'t move from current space.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'marked', name: 'Marked', description: '-2 to attack rolls for attacks not targeting marker.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'petrified', name: 'Petrified', description: 'Turned to stone. Unconscious. Resist 20 all.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'prone', name: 'Prone', description: 'Grant combat advantage to melee. +2 to defenses vs ranged.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'restrained', name: 'Restrained', description: 'Immobilized, grant combat advantage. -2 to attack rolls.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'slowed', name: 'Slowed', description: 'Speed becomes 2.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'stunned', name: 'Stunned', description: 'Grant combat advantage. Can\'t take actions.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'surprised', name: 'Surprised', description: 'Grant combat advantage. Can\'t take actions (surprise round).', hasValue: false, durationTypes: ['rounds'], automation: [] },
    { id: 'unconscious', name: 'Unconscious', description: 'Helpless. -5 to all defenses. Can\'t take actions.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'weakened', name: 'Weakened', description: 'Attacks deal half damage.', hasValue: false, durationTypes: ['rounds', 'encounter'], automation: [] },
    { id: 'bloodied', name: 'Bloodied', description: 'At or below half HP. Triggers bloodied abilities.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    {
      id: 'ongoing-damage', name: 'Ongoing Damage', description: 'Take damage at start of turn, then save ends.',
      hasValue: true, durationTypes: ['unlimited'],
      automation: [{ type: 'prompt-save', dc: '10' }], appliedAt: 'start',
    },
  ],
  statBlockSchema: [
    { key: 'level', label: 'Level', type: 'number', required: true },
    { key: 'role', label: 'Role', type: 'select', options: [
      { value: 'artillery', label: 'Artillery' }, { value: 'brute', label: 'Brute' },
      { value: 'controller', label: 'Controller' }, { value: 'lurker', label: 'Lurker' },
      { value: 'minion', label: 'Minion' }, { value: 'skirmisher', label: 'Skirmisher' },
      { value: 'soldier', label: 'Soldier' }, { value: 'solo', label: 'Solo' },
      { value: 'elite', label: 'Elite' },
    ]},
    {
      key: 'defenses', label: 'Defenses', type: 'group', fields: [
        { key: 'ac', label: 'AC', type: 'number' },
        { key: 'fort', label: 'Fortitude', type: 'number' },
        { key: 'ref', label: 'Reflex', type: 'number' },
        { key: 'will', label: 'Will', type: 'number' },
      ],
    },
    { key: 'initiative', label: 'Initiative', type: 'number' },
    { key: 'speed', label: 'Speed', type: 'number' },
    { key: 'powers', label: 'Powers', type: 'textarea' },
    { key: 'traits_text', label: 'Traits', type: 'textarea' },
  ],
  pcSchema: [
    { key: 'class', label: 'Class', type: 'text', required: true },
    { key: 'level', label: 'Level', type: 'number', required: true },
    { key: 'race', label: 'Race', type: 'text' },
    { key: 'role', label: 'Role', type: 'select', options: [
      { value: 'controller', label: 'Controller' }, { value: 'defender', label: 'Defender' },
      { value: 'leader', label: 'Leader' }, { value: 'striker', label: 'Striker' },
    ]},
    { key: 'initiative', label: 'Initiative', type: 'number' },
    { key: 'surges', label: 'Healing Surges', type: 'number' },
    { key: 'surgeValue', label: 'Surge Value', type: 'number' },
  ],
  itemSchema: [
    { key: 'level', label: 'Item Level', type: 'number' },
    { key: 'slot', label: 'Slot', type: 'text' },
    { key: 'enhancement', label: 'Enhancement', type: 'number' },
    { key: 'property', label: 'Property', type: 'textarea' },
    { key: 'power', label: 'Power', type: 'textarea' },
  ],
  initiativeRules: {
    diceExpression: '1d20',
    modifierFields: ['initiative'],
    tiebreaker: 'modifier',
  },
  hpDescriptors: [
    { minPercent: 100, maxPercent: Infinity, label: 'Unharmed', color: '#2f9e44' },
    { minPercent: 51, maxPercent: 100, label: 'Wounded', color: '#f59e0b' },
    { minPercent: 1, maxPercent: 51, label: 'Bloodied', color: '#e03131' },
    { minPercent: 0, maxPercent: 1, label: 'Down', color: '#868e96' },
  ],
  turnHooks: {
    onTurnStart(combatant) {
      const actions: any[] = []
      // Ongoing damage
      const ongoingAll = combatant.conditions.filter(c => c.conditionId.startsWith('ongoing-damage'))
      for (const ongoing of ongoingAll) {
        if (ongoing.value) {
          const dmgType = ongoing.customDescription ? ` ${ongoing.customDescription}` : ''
          actions.push({
            type: 'auto',
            description: `Take ${ongoing.value} ongoing${dmgType} damage`,
            apply: () => {},
          })
        }
      }
      // Recharge prompts for spent recharge powers (4e: recharge at start of turn)
      const statBlock = combatant.statBlock as any
      if (statBlock?.actions && Object.keys(combatant.usedPowers).length > 0) {
        for (const [idxStr, count] of Object.entries(combatant.usedPowers)) {
          const powerIdx = parseInt(idxStr)
          if (!count) continue
          const power = statBlock.actions[powerIdx]
          if (!power || power.usage !== 'recharge') continue
          const threshold = parseInt(power.rechargeCondition) || 6
          actions.push({
            type: 'prompt',
            description: `Recharge ${power.name} (${threshold}+)`,
            choices: [
              { label: `Recharged (remove from used)`, action: `recharge-power:${powerIdx}` },
              { label: 'Failed', action: 'none' },
            ],
          })
        }
      }
      return actions
    },
    onTurnEnd(combatant) {
      const actions: any[] = []
      // Prompt saving throw for each save-ends condition
      const saveEnds = combatant.conditions.filter(c =>
        (c.duration?.type === 'save-ends' || c.duration?.type === 'unlimited') && c.conditionId !== 'dying'
      )
      for (const cond of saveEnds) {
        let condName = cond.customName ?? cond.conditionId
        if (cond.conditionId.startsWith('ongoing-damage')) {
          const dmgType = cond.customDescription ? ` ${cond.customDescription}` : ''
          condName = `ongoing ${cond.value ?? ''}${dmgType} damage`
        }
        actions.push({
          type: 'prompt',
          description: `Save vs ${condName} (DC 10)`,
          choices: [
            { label: 'Save (remove)', action: `remove-condition:${cond.conditionId}` },
            { label: 'Fail (keep)', action: 'none' },
          ],
        })
      }
      return actions
    },
  },
  rechargeRoll: { die: '1d6', defaultThreshold: 4 },
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
    resistWeakDefault,
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
    monsterModifiers: [
      { value: 'standard', label: 'Standard' },
      { value: 'elite', label: 'Elite', description: 'Saves +2, 1 AP, 2x HP' },
      { value: 'solo', label: 'Solo', description: 'Saves +5, 2 AP, ~5x HP' },
    ],
    weaknessLabel: 'Vulnerabilities',
    encounterCreatureModifiers: [
      { value: 'minion', label: 'Minion', hpOverride: 1 },
    ],
    useGroupedActions: true,
    defaultSpeed: 6,
    speedStep: 1,
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
    actionsLabel: 'Powers',
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
}

export default dnd4e
