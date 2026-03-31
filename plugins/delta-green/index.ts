import type { SystemPlugin } from '../../src/common/types/system-plugin'

const deltaGreen: SystemPlugin = {
  id: 'delta-green',
  name: 'Delta Green',
  version: '0.1.0',
  conditions: [
    { id: 'unconscious', name: 'Unconscious', description: 'Agent is unconscious from wounds or shock.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'stunned', name: 'Stunned', description: 'Agent loses next turn.', hasValue: false, durationTypes: ['rounds'], automation: [{ type: 'decrement' }, { type: 'remove-at-zero' }], appliedAt: 'start' },
    { id: 'prone', name: 'Prone', description: 'Agent is on the ground.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'helpless', name: 'Helpless', description: 'Agent cannot act.', hasValue: false, durationTypes: ['unlimited'], automation: [] },
    { id: 'temporary-insanity', name: 'Temporary Insanity', description: 'Agent has temporary insanity from SAN loss.', hasValue: false, durationTypes: ['encounter'], automation: [] },
  ],
  statBlockSchema: [
    { key: 'str', label: 'STR', type: 'number' },
    { key: 'con', label: 'CON', type: 'number' },
    { key: 'dex', label: 'DEX', type: 'number' },
    { key: 'int', label: 'INT', type: 'number' },
    { key: 'pow', label: 'POW', type: 'number' },
    { key: 'cha', label: 'CHA', type: 'number' },
    { key: 'armor', label: 'Armor', type: 'text' },
    { key: 'attacks', label: 'Attacks', type: 'textarea' },
    { key: 'skills', label: 'Skills', type: 'textarea' },
  ],
  pcSchema: [
    { key: 'profession', label: 'Profession', type: 'text' },
    { key: 'employer', label: 'Employer', type: 'text' },
    { key: 'str', label: 'STR', type: 'number' },
    { key: 'con', label: 'CON', type: 'number' },
    { key: 'dex', label: 'DEX', type: 'number' },
    { key: 'int', label: 'INT', type: 'number' },
    { key: 'pow', label: 'POW', type: 'number' },
    { key: 'cha', label: 'CHA', type: 'number' },
    { key: 'san', label: 'SAN', type: 'number' },
    { key: 'bp', label: 'Breaking Point', type: 'number' },
    { key: 'wp', label: 'Willpower Points', type: 'number' },
  ],
  itemSchema: [
    { key: 'type', label: 'Type', type: 'select', options: [
      { value: 'weapon', label: 'Weapon' },
      { value: 'armor', label: 'Armor' },
      { value: 'equipment', label: 'Equipment' },
      { value: 'tome', label: 'Tome/Unnatural' },
    ]},
    { key: 'damage', label: 'Damage', type: 'dice' },
    { key: 'armorRating', label: 'Armor Rating', type: 'number' },
    { key: 'lethality', label: 'Lethality %', type: 'number', min: 0, max: 100 },
  ],
  initiativeRules: {
    diceExpression: '1d20',
    modifierFields: ['dex'],
    tiebreaker: 'modifier',
  },
  hpDescriptors: [
    { minPercent: 100, maxPercent: Infinity, label: 'Unharmed', color: '#2f9e44' },
    { minPercent: 50, maxPercent: 100, label: 'Hurt', color: '#f08c00' },
    { minPercent: 25, maxPercent: 50, label: 'Seriously Wounded', color: '#e03131' },
    { minPercent: 1, maxPercent: 25, label: 'At Death\'s Door', color: '#c92a2a' },
    { minPercent: 0, maxPercent: 1, label: 'Down', color: '#868e96' },
  ],
  turnHooks: {
    onTurnStart(_combatantId, _conditions) { return [] },
    onTurnEnd(_combatantId, _conditions) { return [] },
  },
}

export default deltaGreen
