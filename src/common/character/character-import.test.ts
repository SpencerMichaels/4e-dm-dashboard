import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { applySnapshots, readCharacterFile, snapshotFromDnd4e, snapshotsFrom4ecb } from './character-import'
import { parseXml } from '../utils/xml'

const stat = (value: number, ...aliases: string[]) =>
  `<Stat value="${value}" >${aliases.map(a => `<alias name="${a}" />`).join('')}<statadd value="${value}" /></Stat>`

/** A trimmed Character Builder save (synthetic): the computed sheet only, in the builder's layout. Also used by the combat UI smoke test. */
const FIXTURE = readFileSync(new URL('./fixtures/brannoc.dnd4e', import.meta.url), 'utf8')
const save = (extra = '') => FIXTURE.replace('</StatBlock>', `${extra}</StatBlock>`)

describe('parseXml', () => {
  it('reads elements, attributes, entities, and skips comments and declarations', () => {
    const doc = parseXml(`<?xml version="1.0"?><!-- c --><a x="1 &gt; 0" y='q'><b/>t&#x41;<![CDATA[<raw>]]></a>`)
    expect(doc.name).toBe('a')
    expect(doc.attrs).toEqual({ x: '1 > 0', y: 'q' })
    expect(doc.children.map(c => c.name)).toEqual(['b'])
    expect(doc.text).toBe('tA<raw>')
  })
  it('rejects unbalanced tags', () => {
    expect(() => parseXml('<a><b></a>')).toThrow()
    expect(() => parseXml('<a>')).toThrow()
  })
})

describe('snapshotFromDnd4e', () => {
  const s = snapshotFromDnd4e(save(), '2026-11-13T00:00:00.000Z')

  it('reads the computed sheet', () => {
    expect(s).toMatchObject({
      version: 1, name: 'Brannoc & Sons', player: 'Jo', level: 4, race: 'Dwarf', class: 'Fighter', markType: 'combat-challenge',
      source: { app: 'character-builder', appVersion: '0.07a', exportedAt: '2026-11-13T00:00:00.000Z' },
      sourceId: 'character-builder:brannoc & sons',
      hp: { max: 45, bloodied: 22, surgeValue: 12, surgesPerDay: 11 },
      defenses: { ac: 20, fortitude: 18, reflex: 13, will: 14 },
      initiative: 3, speed: 5, passivePerception: 13, passiveInsight: 11, savingThrowBonus: 0, actionPoints: 1,
      resist: [{ type: 'fire', value: 5 }],
      powers: [],
    })
    // Modifiers as the sheet prints them: half level added.
    expect(s.abilities.str).toEqual({ score: 18, modifier: 6 })
    expect(s.abilities.cha).toEqual({ score: 8, modifier: 1 })
    expect(s.skills.athletics).toEqual({ total: 11, trained: true })
    expect(s.skills.thievery).toEqual({ total: 3, trained: false })
  })

  it('names magic armor by its enchantment and drops sold items', () => {
    expect(s.items).toEqual([{ name: 'Dwarven Armor +1', equipped: true }, { name: "Adventurer's Kit", equipped: false }])
  })

  it('takes a general saving throw bonus', () => {
    expect(snapshotFromDnd4e(save(stat(1, 'Saving Throws'))).savingThrowBonus).toBe(1)
  })

  it('says which stat is missing', () => {
    expect(() => snapshotFromDnd4e(save().replace(stat(5, 'Speed'), ''))).toThrow(/"Speed"/)
    expect(() => snapshotFromDnd4e('<D20Character></D20Character>')).toThrow(/CharacterSheet/)
  })
})

describe('snapshotsFrom4ecb', () => {
  const snap = snapshotFromDnd4e(save())
  it('reads embedded snapshots', () => {
    const file = JSON.stringify({ format: '4ecb-character-backup', version: 2, characters: [{}], snapshots: [{ ...snap, sourceId: 'abc', source: { app: '4ecb', exportedAt: 'x' } }] })
    expect(snapshotsFrom4ecb(file).map(x => x.sourceId)).toEqual(['abc'])
    expect(readCharacterFile('Brannoc.4ecb', file)).toHaveLength(1)
  })
  it('explains a backup without snapshots', () => {
    expect(() => snapshotsFrom4ecb(JSON.stringify({ format: '4ecb-character-backup', version: 2, characters: [{}] }))).toThrow(/no evaluated/)
    expect(() => snapshotsFrom4ecb('{}')).toThrow(/Not a 4ecb/)
  })
})

// The 4ecb repo's Character Builder samples, when present: FOUR_E_SAMPLE_CHARS=<dir> npm test
const samples = process.env.FOUR_E_SAMPLE_CHARS
describe.skipIf(!samples || !existsSync(samples))('Character Builder sample saves', () => {
  it('every sample imports with sane numbers', () => {
    const files = readdirSync(samples!).filter(f => f.endsWith('.dnd4e'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const s = snapshotFromDnd4e(readFileSync(join(samples!, f), 'utf8'))
      const where = `${f}: ${s.name}`
      expect(s.level, where).toBeGreaterThanOrEqual(1)
      expect(s.hp.max, where).toBeGreaterThan(0)
      expect(s.defenses.ac, where).toBeGreaterThanOrEqual(10)
      expect(s.race && s.class, where).toBeTruthy()
    }
  })
})

describe('applySnapshots', () => {
  let n = 0
  const newId = () => `pc${++n}`
  const now = '2026-11-13T00:00:00.000Z'
  const file = { name: 'brannoc.dnd4e', text: save() }

  it('creates a PC, then updates the same one on re-import, keeping the DM\'s edits', () => {
    const first = applySnapshots([], [file], { newId, now })
    expect(first.result).toEqual({ created: ['Brannoc & Sons'], updated: [], errors: [] })
    const pc = first.save[0]
    expect(pc).toMatchObject({ name: 'Brannoc & Sons', playerName: 'Jo', markType: 'combat-challenge', sheetFile: 'brannoc.dnd4e' })
    const edited = { ...pc, name: 'Brannoc', markType: 'divine-challenge', color: '#f00' }
    const again = applySnapshots([edited], [file], { newId, now })
    expect(again.result.updated).toEqual(['Brannoc'])
    expect(again.save[0]).toMatchObject({ id: pc.id, name: 'Brannoc', markType: 'divine-challenge', color: '#f00' })
  })

  it('updates the target PC and reports bad files', () => {
    const target = { id: 'x', name: 'Bran', playerName: '', createdAt: now, updatedAt: now }
    const { save: saved, result } = applySnapshots([target], [file, { name: 'notes.txt', text: 'hello' }], { newId, now, targetId: 'x' })
    expect(saved.map(p => [p.id, p.name, p.playerName, p.sheet?.level])).toEqual([['x', 'Bran', 'Jo', 4]])
    expect(result.errors).toEqual(['notes.txt: Not a .dnd4e or .4ecb character file'])
  })
})
