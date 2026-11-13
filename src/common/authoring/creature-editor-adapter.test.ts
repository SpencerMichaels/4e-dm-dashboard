import { describe, it, expect } from 'vitest'
import type { Monster, Power } from '@kit'
import { normalizeContent, scaffold, validate } from './core'
import { applyPatch } from './patch'
import { creatureEditorChanges, draftToCreatureEditor, splitHitDamage } from './creature-editor-adapter'
import { testPower } from './fixtures'
import type { Draft } from './types'

let seq = 0
const newId = () => `new-${++seq}`

function draft(edit: (m: Monster) => void = () => {}): Draft {
  const m = scaffold('monster', 'Synthetic shade', 7, 'lurker') as Monster
  m.sources = [{ book: 'Homebrew notes', page: 3 }]
  m.traits.push({ name: 'Shadow step', keywords: [], text: { text: 'The shade ignores difficult terrain.', clauses: [] } })
  const touch = testPower()
  touch.attacks[0].hit!.clauses = [{ kind: 'lose-healing-surge', count: 1, who: 'target', quote: 'loses one healing surge' } as any]
  touch.attacks[0].failedSaves = [{ n: 1, line: { text: 'The target is weakened.', clauses: [] } }]
  touch.attacks.push({ label: 'secondary', after: 'hit', range: { kind: 'melee', reach: 1 }, target: 'the same creature', bonus: { kind: 'fixed', value: 8 }, vs: 'will', hit: { text: 'The target is dazed (save ends).', clauses: [] } })
  touch.special = { text: 'Usable only in dim light.', clauses: [] }
  const burst: Power = { name: 'Gloom burst', action: 'standard', usage: 'recharge', recharge: { kind: 'roll', min: 5 }, keywords: [], attacks: [{ label: 'primary', range: { kind: 'area-burst', size: 2, within: 10 }, target: 'each creature in the burst', bonus: { kind: 'level', plus: 5 }, vs: 'reflex', hit: { text: '2d6 + 4 cold damage.', clauses: [] } }] }
  const veil: Power = { name: 'Veil', action: 'minor', usage: 'encounter', keywords: ['illusion'], range: { kind: 'personal' }, attacks: [], effect: { text: 'The shade becomes invisible until the end of its next turn.', clauses: [] } }
  m.powers.push(touch, burst, veil)
  edit(m)
  const content = normalizeContent(m)
  return { version: 1, schemaVersion: 4, id: 'd', kind: 'monster', revision: 1, event: 0, createdAt: '', updatedAt: '', content, intent: '', decisions: '', policy: 'dashboard-dmg-v1', nodes: { powers: content.powers.map((_, i) => `p${i}`), traits: content.traits.map((_, i) => `t${i}`), auras: [] }, overrides: [], stale: [], destinations: [], comments: [] }
}

/** Simulates native editor edits on the projected model and applies the resulting patch as the DM. */
function edit(d: Draft, change: (sb: any, c: any) => void) {
  const before = draftToCreatureEditor(d)
  const after = structuredClone(before)
  change(after.statBlock, after)
  const changes = creatureEditorChanges(d, before, after)
  for (const c of changes) expect(c.value).not.toBeUndefined()
  // IPC serializes the patch; it must survive JSON unchanged.
  expect(JSON.parse(JSON.stringify(changes))).toEqual(changes)
  return { changes, next: applyPatch(d, { id: d.id, revision: d.revision, changes }, 'dm', newId) }
}
const power = (sb: any, name: string) => sb.actions.find((e: any) => e.name === name)
const content = (d: Draft) => d.content as Monster

describe('native creature editor adapter', () => {
  it('produces no changes for an untouched projection', () => {
    const d = draft()
    const view = draftToCreatureEditor(d)
    expect(creatureEditorChanges(d, view, structuredClone(view))).toEqual([])
  })

  it('patches and protects only the edited scalar', () => {
    const { changes, next } = edit(draft(), (_, c) => { c.hp = 77; c.maxHp = 77 })
    expect(changes).toEqual([{ path: '/content/hp', value: 77 }])
    expect(next.overrides).toEqual(['/content/hp'])
    expect(next.stale).toEqual([])
  })

  it('maps title-cased editor enums back to kit vocabulary', () => {
    const { next } = edit(draft(), sb => {
      sb.size = 'Large'; sb.creatureType = 'magical beast'; sb.senses = ['Darkvision', 'Low-light vision', 'Tremorsense 10']
      power(sb, 'Draining touch').defense = 'Reflex'
    })
    const m = content(next)
    expect(m.size).toBe('large')
    expect(m.type).toBe('magical-beast')
    expect(m.senses).toEqual([{ kind: 'darkvision' }, { kind: 'low-light-vision' }, { kind: 'tremorsense', range: 10 }])
    expect(m.powers[0].attacks[0].vs).toBe('reflex')
    expect(validate('monster', m).errors).toEqual([])
  })

  it('splits leading damage into native parts and recombines only when edited', () => {
    const d = draft()
    const sb = draftToCreatureEditor(d).statBlock as any
    expect(power(sb, 'Draining touch').damage).toEqual([{ expr: '5', type: 'necrotic', ongoing: false }])
    expect(power(sb, 'Draining touch').hit).toBe('and the target loses one healing surge.')
    expect(power(sb, 'Gloom burst').hit).toBe('')
    expect(splitHitDamage('The target is dazed.')).toBeUndefined()

    const hitOnly = edit(d, s => { power(s, 'Draining touch').hit = 'and the target is slowed.' })
    expect(content(hitOnly.next).powers[0].attacks[0].hit!.text).toBe('5 necrotic damage and the target is slowed.')

    const damage = edit(d, s => { power(s, 'Draining touch').damage = [{ expr: '2d6 + 3', type: 'necrotic', ongoing: false }] })
    expect(damage.changes).toEqual([{ path: '/content/powers/@p0/attacks/0/hit/text', value: '2d6 + 3 necrotic damage and the target loses one healing surge.' }])
    // Clause metadata is kept for reconciliation; the node is marked stale.
    expect(content(damage.next).powers[0].attacks[0].hit!.clauses).toHaveLength(1)
    expect(damage.next.stale).toEqual(['/content/powers/@p0'])

    const burst = edit(d, s => { power(s, 'Gloom burst').damage = [{ expr: '3d6 + 4', type: 'cold', ongoing: false }, { expr: '5', type: 'cold', ongoing: true }] })
    expect(content(burst.next).powers[1].attacks[0].hit!.text).toBe('3d6 + 4 cold damage and ongoing 5 cold damage (save ends).')
  })

  it('keeps clauses, secondary attacks, failed saves, and special lines on prose edits', () => {
    const d = draft()
    const { changes, next } = edit(d, s => { power(s, 'Draining touch').miss = 'Half damage.' })
    expect(changes).toEqual([{ path: '/content/powers/@p0/attacks/0/miss', value: { text: 'Half damage.', clauses: [] } }])
    const p = content(next).powers[0]
    expect(p.attacks).toHaveLength(2)
    expect(p.attacks[0].failedSaves).toEqual(content(d).powers[0].attacks[0].failedSaves)
    expect(p.attacks[0].hit).toEqual(content(d).powers[0].attacks[0].hit)
    expect(p.special).toEqual(content(d).powers[0].special)
  })

  it('removes cleared lines instead of saving empty text or undefined values', () => {
    const { changes, next } = edit(draft(), s => { power(s, 'Veil').effect = ''; power(s, 'Draining touch').hit = ''; power(s, 'Draining touch').damage = [] })
    expect(changes.map(c => c.path)).toEqual(['/content/powers/@p0/attacks/0', '/content/powers/@p2'])
    expect(content(next).powers[2].effect).toBeUndefined()
    expect(content(next).powers[0].attacks[0].hit).toBeUndefined()
    expect(content(next).powers[0].attacks[0].failedSaves).toHaveLength(1)
  })

  it('edits, adds, and clears special lines as their own field', () => {
    const d = draft()
    expect(power(draftToCreatureEditor(d).statBlock, 'Draining touch').special).toBe('Usable only in dim light.')
    const added = edit(d, s => { power(s, 'Gloom burst').special = 'The burst ignores cover.' })
    expect(added.changes).toEqual([{ path: '/content/powers/@p1/special', value: { text: 'The burst ignores cover.', clauses: [] } }])
    const cleared = edit(d, s => { power(s, 'Draining touch').special = '' })
    expect(content(cleared.next).powers[0].special).toBeUndefined()
    expect(content(cleared.next).powers[0].attacks).toEqual(content(d).powers[0].attacks)
  })

  it('preserves formula attack bonuses unless the DM types a number', () => {
    const d = draft()
    const target = edit(d, s => { power(s, 'Gloom burst').target = 'each enemy in the burst' })
    expect(content(target.next).powers[1].attacks[0].bonus).toEqual({ kind: 'level', plus: 5 })
    expect(content(target.next).powers[1].attacks[0].target).toBe('each enemy in the burst')
    const typed = edit(d, s => { power(s, 'Gloom burst').attackBonus = 12 })
    expect(content(typed.next).powers[1].attacks[0].bonus).toEqual({ kind: 'fixed', value: 12 })
  })

  it('keeps range details and notes when only the range kind changes', () => {
    const { next } = edit(draft(), s => { power(s, 'Gloom burst').rangeType = 'close-burst'; power(s, 'Gloom burst').rangeValue = '3 (centered on an ally)' })
    expect(content(next).powers[1].attacks[0].range).toEqual({ kind: 'close-burst', size: 3, note: '(centered on an ally)' })
    const area = edit(draft(), s => { power(s, 'Gloom burst').rangeType = 'area-wall' })
    expect(content(area.next).powers[1].attacks[0].range).toEqual({ kind: 'area-wall', size: 2, within: 10 })
  })

  it('removes only the primary attack with the native × control', () => {
    const { next } = edit(draft(), s => Object.assign(power(s, 'Draining touch'), { attackBonus: null, attackNotes: '', rangeType: '', rangeValue: '', target: '', defense: 'AC', damage: [] }))
    const attacks = content(next).powers[0].attacks
    expect(attacks).toHaveLength(1)
    expect(attacks[0]).toMatchObject({ label: 'primary', vs: 'will', target: 'the same creature' })
    expect(attacks[0].after).toBeUndefined()
  })

  it('keeps stable IDs through rename, reorder, add, delete, and duplicate', () => {
    const d = draft()
    const { changes, next } = edit(d, s => {
      const [touch, burst, veil] = ['Draining touch', 'Gloom burst', 'Veil'].map(n => power(s, n))
      touch.name = 'Withering touch'
      const copy = { ...structuredClone(touch), name: 'Withering touch (copy)' }
      const added = { name: 'New power', entryType: 'action', actionType: 'minor', usage: 'at-will', keywords: [], rangeType: 'melee', rangeValue: '1', target: 'One creature', attackBonus: null, attackNotes: '', defense: 'AC', damage: [], hit: '', miss: '', effect: 'The shade shifts 1 square.', trigger: '', requirement: '', sustain: '' }
      s.actions = [...s.actions.filter((e: any) => e.entryType !== 'action'), added, veil, touch, copy]
      void burst
    })
    expect(changes.filter(c => !c.path.startsWith('/content/'))).toEqual([
      { path: '/remove/powers/@p1', value: null },
      { path: '/order/powers', value: ['p2', 'p0'] },
      expect.objectContaining({ path: '/append/powers/0' }),
      expect.objectContaining({ path: '/append/powers/3' }),
    ])
    expect(next.nodes.powers.slice(1, 3)).toEqual(['p2', 'p0'])
    const m = content(next)
    expect(m.powers.map(p => p.name)).toEqual(['New power', 'Veil', 'Withering touch', 'Withering touch (copy)'])
    expect(m.powers[0]).toEqual({ name: 'New power', action: 'minor', usage: 'at-will', keywords: [], attacks: [], range: { kind: 'melee', reach: 1 }, effect: { text: 'The shade shifts 1 square.', clauses: [] } })
    // The duplicate starts from its source node, so kit-only mechanics carry over.
    expect(m.powers[3].attacks).toEqual(m.powers[2].attacks)
    expect(m.powers[3].special).toEqual(content(d).powers[0].special)
    expect(next.overrides).toContain('/content/powers/@p0/name')
    expect(next.overrides).not.toContain('/content/powers/@p0')
    expect(validate('monster', m).errors).toEqual([])
  })

  it('edits trait text without touching clauses of unchanged traits', () => {
    const { changes } = edit(draft(), s => { s.actions[0].name = 'Shadow stride' })
    expect(changes).toEqual([{ path: '/content/traits/@t0/name', value: 'Shadow stride' }])
  })

  it('updates XP with level and rank unless XP was customized', () => {
    const d = draft()
    expect(content(edit(d, s => { s.level = 8 }).next).xp).toBe(350)
    expect(content(edit(d, s => { s.monsterModifier = 'minion' }).next)).toMatchObject({ rank: 'minion', xp: 75 })
    const custom = draft(m => { m.xp = 999 })
    expect(edit(custom, s => { s.level = 8 }).changes).toEqual([{ path: '/content/level', value: 8 }])
  })

  it('maps speeds, skills, languages, and sources without losing unedited detail', () => {
    const d = draft(m => { m.speed = { walk: 6, fly: 8, notes: 'hover' }; m.languages = 'Common, Elven' })
    const { next } = edit(d, s => {
      s.speeds = { climb: 4 }; s.skills = { stealth: '' }; s.languages = [...s.languages, 'Abyssal']
      s.source = 'Homebrew notes, 3; Campaign journal'
    })
    const m = content(next)
    expect(m.speed).toEqual({ walk: 6, climb: 4, notes: 'hover' })
    expect(m.skills).toEqual({ stealth: 0 })
    expect(m.languages).toBe('Common, Elven, Abyssal')
    expect(m.sources).toEqual([{ book: 'Homebrew notes', page: 3 }, { book: 'Campaign journal' }])
  })

  it('rejects a batch built on a stale revision instead of overwriting newer edits', () => {
    const d = draft()
    const agent = applyPatch(d, { id: d.id, revision: 1, changes: [{ path: '/content/initiative', value: 9 }] }, 'agent', newId)
    const before = draftToCreatureEditor(d), after = structuredClone(before)
    after.hp = 50
    expect(() => applyPatch(agent, { id: d.id, revision: d.revision, changes: creatureEditorChanges(d, before, after) }, 'dm', newId)).toThrow('Revision conflict')
  })
})

describe('positional append', () => {
  it('inserts at a validated index with a fresh stable ID', () => {
    const d = draft()
    const value = { name: 'Inserted', action: 'minor', usage: 'at-will', keywords: [], attacks: [] }
    const next = applyPatch(d, { id: d.id, revision: 1, changes: [{ path: '/append/powers/1', value }] }, 'agent', () => 'ins')
    expect(next.nodes.powers).toEqual(['p0', 'ins', 'p1', 'p2'])
    expect(content(next).powers[1].name).toBe('Inserted')
    for (const bad of ['-1', '4', '1.5', 'x']) expect(() => applyPatch(d, { id: d.id, revision: 1, changes: [{ path: `/append/powers/${bad}`, value }] }, 'agent', newId)).toThrow('Invalid insertion position')
  })
})

describe('clause spans after prose edits', () => {
  const stealth = 'The shade can hide when it has concealment instead of total concealment.'
  const withClauses = () => draft(m => {
    m.traits[0].text = { text: stealth, clauses: [{ text: stealth } as any] }
    m.powers[0].attacks[0].hit!.text = '5 necrotic damage and the target loses one healing surge. The shade shifts 2 squares.'
    m.powers[0].attacks[0].hit!.clauses = [
      { kind: 'lose-healing-surge', count: 1, who: 'target', quote: 'loses one healing surge' } as any,
      { text: 'The shade shifts 2 squares.' } as any,
    ]
  })

  it('updates a whole-line unparsed clause when the DM rewords the line', () => {
    const { next } = edit(withClauses(), s => { s.actions[0].effect = 'The shade can hide when it has only concealment, instead of total concealment.' })
    expect(validate('monster', next.content).errors).toEqual([])
    expect(content(next).traits[0].text.clauses[0]).toMatchObject({ kind: 'unparsed', text: 'The shade can hide when it has only concealment, instead of total concealment.' })
    expect(next.stale).toEqual(['/content/traits/@t0'])
  })

  it('moves structured spans with their words and drops unparsed spans whose words are gone', () => {
    const { next } = edit(withClauses(), s => { power(s, 'Draining touch').hit = 'and then the target loses one healing surge.' })
    const hit = content(next).powers[0].attacks[0].hit!
    expect(validate('monster', next.content).errors).toEqual([])
    expect(hit.clauses).toHaveLength(1)
    expect(hit.text.substring(...(hit.clauses[0] as any).at as [number, number])).toBe('loses one healing surge')
    expect(next.stale).toEqual(['/content/powers/@p0'])
  })

  it('also re-anchors when a container is replaced, but not when the patch sets clauses itself', () => {
    const d = withClauses()
    const line = content(d).powers[0].attacks[0].hit!
    const reworded = 'Ongoing 5 necrotic damage and the target loses one healing surge. The shade shifts 2 squares.'
    const replaced = applyPatch(d, { id: d.id, revision: 1, changes: [{ path: '/content/powers/@p0/attacks/0/hit', value: { ...line, text: reworded } }] }, 'agent', newId)
    expect(validate('monster', replaced.content).errors).toEqual([])
    const explicit = applyPatch(d, { id: d.id, revision: 1, changes: [
      { path: '/content/powers/@p0/attacks/0/hit/text', value: 'The target is dazed.' },
      { path: '/content/powers/@p0/attacks/0/hit/clauses', value: [{ kind: 'status', status: 'dazed', who: 'target', duration: 'eont', quote: 'dazed' }] },
    ] }, 'agent', newId)
    expect((content(explicit).powers[0].attacks[0].hit!.clauses[0] as any).at).toEqual([14, 19])
  })
})

describe('comment anchors', () => {
  it('gathers field and node targets at their stat block rows and names validator paths', async () => {
    const { statAnchorTarget, entryAnchorTarget, within, unanchored, jsonPathTarget, targetLabel } = await import('./anchors')
    const d = draft()
    expect(within('/content/defenses/ac', statAnchorTarget('defenses').paths)).toBe(true)
    expect(within('/content/resist', statAnchorTarget('resistances').paths)).toBe(true)
    const sb = draftToCreatureEditor(d).statBlock as any
    const touch = entryAnchorTarget(d, power(sb, 'Draining touch'))!
    expect(touch.target).toBe('/content/powers/@p0')
    expect(within('/content/powers/@p0/attacks/0/hit/text', touch.paths)).toBe(true)
    expect(entryAnchorTarget(d, { entryType: 'action', name: 'Unapplied' })).toBeUndefined()
    const comments = ['/', '/content/hp', '/content/powers/@gone', '/content/sources'].map(target => ({ target }) as any)
    expect(unanchored(d, comments).map(c => c.target)).toEqual(['/', '/content/powers/@gone', '/content/sources'])
    expect(targetLabel(d, jsonPathTarget(d, '$.traits[0].text.clauses[0]'))).toBe('Shadow step › text › clauses › 0')
    expect(targetLabel(d, '/content/defenses/ac')).toBe('Defenses › AC')
    expect(targetLabel(d, '/content/powers/@gone')).toBe('Removed powers entry')
  })
})

describe('unsaved new drafts', () => {
  it('start as valid scaffolds and are created with their first edits applied', async () => {
    const { unsavedDraft, contentWith, isUnsaved } = await import('./unsaved')
    for (const kind of ['monster', 'item', 'trap', 'disease'] as const) expect(validate(kind, unsavedDraft(kind).content).errors).toEqual([])
    const d = unsavedDraft('monster')
    expect(isUnsaved(d)).toBe(true)
    const before = draftToCreatureEditor(d), after = structuredClone(before)
    after.name = 'Ghoul'
    ;(after.statBlock as any).actions = [{ name: 'Claw', entryType: 'action', actionType: 'standard', usage: 'at-will', keywords: [], rangeType: 'melee', rangeValue: '1', target: 'One creature', attackBonus: 12, attackNotes: '', defense: 'AC', damage: [], hit: '', miss: '', effect: '', trigger: '', requirement: '', sustain: '' }]
    const content = contentWith(d, creatureEditorChanges(d, before, after)) as Monster
    expect(content.name).toBe('Ghoul')
    expect(content.powers.map(p => p.name)).toEqual(['Claw'])
    expect(validate('monster', content).errors).toEqual([])
  })
})
