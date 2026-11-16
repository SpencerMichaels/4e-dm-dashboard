import { describe, expect, it } from 'vitest'
import type { Item as KitItem } from '@kit'
import { normalizeContent, scaffold, validate } from './core'
import { applyPatch } from './patch'
import { draftToItemEditor, itemEditorChanges } from './item-editor-adapter'
import { entryAnchorTarget } from './anchors'
import { testPower } from './fixtures'
import type { Draft } from './types'

let seq = 0
const newId = () => `n${++seq}`

function draft(edit: (i: KitItem) => void = () => {}): Draft {
  const it = scaffold('item', 'Ember Blade', 5) as KitItem
  Object.assign(it, {
    category: 'weapon', rarity: 'uncommon', slot: 'weapon', itemType: 'Any heavy blade', flavor: 'It smolders.',
    levels: [{ level: 5, enhancement: 1, price: 1000 }],
    critical: { text: '+1d6 fire damage per plus', clauses: [] },
    properties: [{ text: 'Resist 5 fire.', clauses: [] }],
    powers: [testPower()],
    weapon: { damage: '1d8', proficiency: 3, groups: ['heavy blade'], properties: [], category: 'military melee' },
    description: [{ type: 'text', text: 'Forged in a volcano.' }],
    sources: [{ book: 'Homebrew', page: 2 }],
  })
  edit(it)
  const content = normalizeContent(it)
  return { version: 1, schemaVersion: 5, id: 'd', kind: 'item', revision: 1, event: 0, createdAt: '', updatedAt: '', content, intent: '', decisions: '', policy: '', nodes: { powers: content.powers.map((_, i) => `p${i}`), properties: content.properties.map((_, i) => `q${i}`) }, overrides: [], stale: [], destinations: [], comments: [] }
}

function edit(d: Draft, change: (x: Record<string, any>) => void) {
  const before = draftToItemEditor(d), after = structuredClone(before)
  change(after.extra)
  after.name = after.extra.name as string
  const changes = itemEditorChanges(d, before, after)
  for (const c of changes) expect(c.value).not.toBeUndefined()
  return { changes, item: applyPatch(d, { id: d.id, revision: 1, changes }, 'dm', newId).content as KitItem }
}

describe('item editor adapter', () => {
  it('changes nothing for an untouched projection', () => {
    const d = draft()
    const view = draftToItemEditor(d)
    expect(itemEditorChanges(d, view, structuredClone(view))).toEqual([])
    expect(view.extra).toMatchObject({ rarity: 'Uncommon', price: '1,000', slot: 'Weapon', critDie: '1d6', critType: 'fire', critExtra: '', proficiency: '+3', enhancement: 'attack rolls and damage rolls' })
    // Power entries carry their draft node IDs, so comment markers anchor to the cards.
    expect((view.extra.powers as { _draftNode?: string }[]).map(e => e._draftNode)).toEqual(['p0'])
    expect(entryAnchorTarget(d, (view.extra.powers as object[])[0])?.target).toBe('/content/powers/@p0')
  })

  it('maps scalar and weapon edits to kit fields, keeping what the editor cannot show', () => {
    const { changes, item } = edit(draft(), x => { x.rarity = 'Rare'; x.price = '1,800'; x.damage = '1d10'; x.proficiency = '+2'; x.name = 'Cinder Blade' })
    expect(changes.map(c => c.path).sort()).toEqual(['/content/levels', '/content/name', '/content/rarity', '/content/weapon/damage', '/content/weapon/proficiency'])
    expect(item).toMatchObject({ name: 'Cinder Blade', rarity: 'rare', levels: [{ level: 5, enhancement: 1, price: 1800 }] })
    expect(item.weapon).toMatchObject({ damage: '1d10', proficiency: 2, groups: ['heavy blade'], category: 'military melee' })
    expect(item.description).toEqual([{ type: 'text', text: 'Forged in a volcano.' }])
    expect(validate('item', item).errors).toEqual([])
  })

  it('recombines the critical line only when its parts change', () => {
    const { item } = edit(draft(), x => { x.critType = 'radiant'; x.critExtra = 'and the target is blinded until the end of your next turn' })
    expect(item.critical!.text).toBe('+1d6 radiant damage per plus and the target is blinded until the end of your next turn')
    const unmatched = draft(i => { i.critical = { text: 'The target is pushed 2 squares.', clauses: [] } })
    expect(draftToItemEditor(unmatched).extra).toMatchObject({ critDie: '', critExtra: 'The target is pushed 2 squares.' })
    expect(itemEditorChanges(unmatched, draftToItemEditor(unmatched), draftToItemEditor(unmatched))).toEqual([])
  })

  it('keeps unedited properties and powers, and unsets cleared lines', () => {
    const { item } = edit(draft(i => { i.special = { text: 'Only a fire giant can wield it.', clauses: [] } }), x => {
      x.properties = [...x.properties, 'You can shed bright light 5.']
      x.powers = [{ ...x.powers[0], name: 'Flame burst' }]
      x.special = ''
    })
    expect(item.properties.map(p => p.text)).toEqual(['Resist 5 fire.', 'You can shed bright light 5.'])
    expect(item.powers[0]).toMatchObject({ name: 'Flame burst', attacks: testPower().attacks.map(a => ({ ...a, hit: { text: a.hit!.text } })) })
    expect(item.special).toBeUndefined()
  })

  it('moves non-slot labels to the subtype', () => {
    const { item } = edit(draft(), x => { x.slot = 'Consumable' })
    expect(item.slot).toBeUndefined()
    expect(item.subtype).toBe('Consumable')
  })

  it('shows and edits what the enhancement applies to', () => {
    // Printed targets win over what the category implies (an armor that also raises the defenses).
    const view = draftToItemEditor(draft(i => { i.enhancementTargets = ['ac', 'fortitude', 'reflex', 'will'] }))
    expect(view.extra.enhancement).toBe('AC, Fortitude, Reflex, and Will')
    expect(edit(draft(), x => { x.enhancement = 'AC' }).item.enhancementTargets).toEqual(['ac'])
    expect(edit(draft(i => { i.enhancementTargets = ['attack', 'damage'] }), x => { x.enhancement = '' }).item.enhancementTargets).toBeUndefined()
  })
})
