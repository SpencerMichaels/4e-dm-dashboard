import type { Power } from '@kit'

/** Synthetic, original test data; no private compendium text. */
export const testPower = (): Power => ({ name: 'Draining touch', action: 'standard', usage: 'at-will', keywords: ['necrotic'], attacks: [{ label: 'primary', range: { kind: 'melee', reach: 1 }, target: 'one creature', bonus: { kind: 'fixed', value: 10 }, vs: 'fortitude', hit: { text: '5 necrotic damage and the target loses one healing surge.', clauses: [] } }] })
