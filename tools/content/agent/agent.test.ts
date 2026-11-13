import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { Disease } from '@kit'
import { applyAll } from './apply-all'
import { applyFile, applyResponse, describePath, parseResponse } from './apply'
import { briefDirs, defaultResponsesDir } from './briefs'
import { buildBrief, checkCommand, compactJson, htmlToText, schemaExcerpt } from './prompt'
import { atToQuote, resolveQuotes } from './quotes'
import { mulberry32, pick, sampleIds, tieredSample } from './sample'

const disease: Disease = {
  id: 'disease11', name: 'Test Rot', level: 4,
  endurance: { improveDc: 14, maintainDc: 10 },
  stages: [{ stage: 0, line: { text: 'The target recovers.', clauses: [] } }, { stage: 1, final: true, line: { text: 'The target is weakened.', clauses: [] } }],
  flavor: '', sources: [{ book: 'Test' }],
  provenance: { origin: 'parser', by: 'tools/content@test', at: '2026-11-12' },
}

/** A content repo holding the test disease. */
function repoWithDisease(): string {
  const repo = mkdtempSync(join(tmpdir(), 'content-'))
  mkdirSync(join(repo, 'diseases'))
  writeFileSync(join(repo, 'diseases', 'disease11.json'), JSON.stringify(disease))
  return repo
}

describe('sampler', () => {
  it('is deterministic for a seed and picks distinct ids', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `monster${i}`)
    const a = pick(ids, 10, mulberry32(4))
    expect(pick(ids, 10, mulberry32(4))).toEqual(a)
    expect(new Set(a).size).toBe(10)
    expect(pick(ids, 10, mulberry32(5))).not.toEqual(a)
  })

  it('makes nested tiers, excludes ids, and matches the untiered picks', () => {
    const ids = {
      monsters: Array.from({ length: 60 }, (_, i) => `monster${i}`),
      items: Array.from({ length: 20 }, (_, i) => `item${i}`),
      traps: Array.from({ length: 20 }, (_, i) => `trap${i}`),
    }
    const exclude = new Set(['monster1', 'monster2', 'item3'])
    const t = tieredSample(ids, { small: { monsters: 4, items: 2, traps: 2 }, full: { monsters: 30, items: 10, traps: 10 } }, 5, exclude)
    expect(t.small.monsters).toHaveLength(4)
    expect(t.full.monsters).toHaveLength(30)
    for (const kind of ['monsters', 'items', 'traps'] as const) {
      expect(t.full[kind]).toEqual(expect.arrayContaining(t.small[kind]!))
      for (const id of t.full[kind]!) expect(exclude.has(id)).toBe(false)
    }
    // One tier with no exclusions is the old single sample.
    const rand = mulberry32(4)
    const old = { monsters: pick(ids.monsters, 10, rand), items: pick(ids.items, 5, rand), traps: pick(ids.traps, 5, rand) }
    expect(tieredSample(ids, { all: { monsters: 10, items: 5, traps: 5 } }, 4).all).toEqual(old)
    expect(sampleIds({ tiers: t }, 'small')).toEqual(t.small)
    expect(() => sampleIds({ tiers: t })).toThrow(/--tier/)
    expect(sampleIds({ seed: 4, monsters: ['m1'], inputSize: {} })).toEqual({ monsters: ['m1'] })
  })
})

describe('quotes', () => {
  const line = () => ({
    text: 'The target is dazed until the end of your next turn, and the target is slowed (save ends).',
    clauses: [
      { quote: 'the target is dazed until the end of your next turn', kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'turn-end', whose: 'source', next: true } },
      { quote: 'the target is', kind: 'unparsed', text: 'x' },
      { text: 'slowed (save ends)' },
    ],
  })

  it('resolves quotes to spans in order, case-insensitively, and fills unparsed text', () => {
    const entry = { effect: line() }
    expect(resolveQuotes(entry)).toEqual([])
    const [a, b, c] = entry.effect.clauses as any[]
    expect(a.at).toEqual([0, 51])
    // The second "the target is" is the one after the first clause.
    expect(b).toEqual({ at: [57, 70], kind: 'unparsed', text: 'the target is' })
    expect(c).toEqual({ at: [71, 89], kind: 'unparsed', text: 'slowed (save ends)' })
    expect(Object.keys(a)[0]).toBe('at')
    expect(a.quote).toBeUndefined()
  })

  it('reports a quote that is not in the line, and keeps plain spans', () => {
    const entry = { hit: { text: '1d8 + 3 damage.', clauses: [{ at: [0, 14], kind: 'damage', dice: '1d8+3', types: [], who: 'target' }, { quote: '2d6 damage', kind: 'half-damage' }] } }
    const errors = resolveQuotes(entry)
    expect(errors).toEqual([{ path: '$.hit.clauses[1]', message: 'quote "2d6 damage" is not in the line text "1d8 + 3 damage."' }])
    expect(entry.hit.clauses[0].at).toEqual([0, 14])
  })

  it('turns spans into quotes for briefs and back again', () => {
    const entry = { effect: line() }
    resolveQuotes(entry)
    const quoted = atToQuote(entry) as any
    expect(quoted.effect.clauses[0].quote).toBe('The target is dazed until the end of your next turn')
    expect(quoted.effect.clauses[1]).toEqual({ text: 'the target is' })
    resolveQuotes(quoted)
    expect(quoted).toEqual(entry)
  })
})

describe('brief', () => {
  it('includes only the declarations the kind uses, with quote instead of at', () => {
    const s = schemaExcerpt('monsters')
    expect(s).toContain('interface Monster')
    expect(s).toContain('type Clause')
    expect(s).toContain("type ConditionId = 'blinded' | 'dazed'")
    expect(s).toContain('quote: string')
    expect(s).toContain('| { text: string } // unparsed')
    expect(s).not.toContain("kind: 'unparsed'")
    expect(s).toContain("kind: 'redirect-attack'")
    expect(s).not.toMatch(/\bat: \[number, number\]/)
    expect(s).not.toContain('interface Item')
    expect(s).not.toContain('MonsterTemplate')
    expect(s).not.toContain('XP_BY_LEVEL')
    expect(s).not.toContain('SCHEMA_VERSION')
    expect(s).not.toContain('interface Provenance')
    expect(s).not.toMatch(/^export /m)
    expect(schemaExcerpt('items')).toContain('propertyLevelSteps')
    expect(schemaExcerpt('traps')).toContain('interface Aura')
    expect(schemaExcerpt('traps')).not.toContain('interface Monster')
  })

  it('turns HTML into text and prints compact JSON', () => {
    expect(htmlToText('<h1>Rot<br><span>Level 4</span></h1><table><tr><td>Lvl 3<td><td>680 gp</table><p>A &amp; B&nbsp;C</p>'))
      .toBe('Rot\nLevel 4\nLvl 3 | 680 gp\nA & B C')
    expect(compactJson({ a: [1, 2], b: { c: 'x' } })).toBe('{"a":[1,2],"b":{"c":"x"}}')
    expect(compactJson({ a: 'x'.repeat(50), b: 'y'.repeat(50) }, '', 60)).toBe(`{\n  "a": "${'x'.repeat(50)}",\n  "b": "${'y'.repeat(50)}"\n}`)
  })

  it('fills every placeholder, keeps only the kind\'s blocks, and gives the check command', () => {
    const repo = repoWithDisease()
    const reply = join(repo, 'pilot', 'responses-2', 'diseases', 'disease11.json')
    const brief = buildBrief('diseases', 'disease11', { repo, reply, app: '/src/app' })
    expect(brief).not.toMatch(/\{\{[#/]?\w+\}\}/)
    expect(brief).not.toContain('<!--')
    expect(brief).not.toContain('Aura traits')
    expect(brief).toContain('"id": "disease11"')
    expect(brief).toContain('interface Disease')
    expect(brief).toContain(reply)
    expect(brief).toContain(`docker run --rm --network none -v /src/app:/workspace -v ${repo}:${repo} -w /workspace tabletop-dev npm run -s content:agent:apply -- diseases disease11 ${reply} --repo ${repo} --check`)
    expect(checkCommand('traps', 'trap1', { repo: '/r', reply: '/elsewhere/trap1.json', app: '/a' })).toContain('-v /elsewhere:/elsewhere')
    expect(defaultResponsesDir('/c/pilot/briefs-2')).toBe('/c/pilot/responses-2')
    expect(briefDirs(['--tag', '2b-opus'], '/c')).toEqual({ out: '/c/pilot/briefs-2b-opus', responses: '/c/pilot/responses-2b-opus' })
    expect(briefDirs(['--out', '/c/b', '--responses', '/c/r'], '/c')).toEqual({ out: '/c/b', responses: '/c/r' })
    expect(briefDirs([], '/c')).toBeUndefined()
  })
})

describe('apply', () => {
  const opts = { model: 'claude-test', date: '2026-11-13' }

  it('parses raw, fenced and wrapped replies, and explains bad ones', () => {
    expect(parseResponse('{"entry":{"id":"x"}}').entry).toEqual({ id: 'x' })
    expect(parseResponse('```json\n{"entry":{"id":"x"},"confidence":"high"}\n```').entry).toEqual({ id: 'x' })
    expect(parseResponse('Here it is:\n{"entry":{"id":"x"}}\nDone.').entry).toEqual({ id: 'x' })
    expect(() => parseResponse('{"entry": {"id": "x",}}')).toThrow(/not valid JSON/)
    expect(() => parseResponse('{"notes": []}')).toThrow(/no "entry" object/)
  })

  it('takes { text } with no kind as an unparsed clause', () => {
    const reply = JSON.parse(JSON.stringify(disease))
    reply.stages[1].line.clauses = [{ text: 'The target is weakened.' }]
    const { result, entry } = applyResponse('diseases', 'disease11', { entry: reply, confidence: 'high' }, disease, opts)
    expect(result.errors).toEqual([])
    expect((entry as any).stages[1].line.clauses[0]).toEqual({ at: [0, 23], kind: 'unparsed', text: 'The target is weakened.' })
    expect(Object.keys((entry as any).stages[1].line.clauses[0])).toEqual(['at', 'kind', 'text'])
  })

  it('accepts a valid entry, resolves quotes and rewrites provenance', () => {
    const reply = JSON.parse(JSON.stringify(disease))
    reply.stages[1].line.clauses = [{ quote: 'the target is weakened', kind: 'condition', condition: 'weakened', who: 'target', duration: { kind: 'indefinite' } }]
    const { result, entry } = applyResponse('diseases', 'disease11', { entry: reply, notes: ['fixed stage 1'], confidence: 'high' }, disease, opts)
    expect(result.errors).toEqual([])
    expect(result.written).toBe(true)
    expect((entry as any).stages[1].line.clauses[0].at).toEqual([0, 22])
    expect(entry!.provenance).toEqual({ origin: 'agent', by: 'claude-test', at: '2026-11-13', confidence: 'high', notes: ['fixed stage 1'] })
  })

  it('rejects a changed id, invalid output, unfound quotes and human-edited entries', () => {
    expect(applyResponse('diseases', 'disease11', { entry: { ...disease, id: 'disease12' } }, disease, opts).result.written).toBe(false)
    const bad = { ...disease, stages: [{ stage: 1, line: { text: 'Dazed.', clauses: [{ at: [0, 99], kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'save-ends' } }] } }] }
    const r = applyResponse('diseases', 'disease11', { entry: bad }, disease, opts).result
    expect(r.written).toBe(false)
    expect(r.errors[0].message).toMatch(/outside text/)
    const missing = { ...disease, stages: [{ stage: 1, line: { text: 'Dazed.', clauses: [{ quote: 'stunned', kind: 'condition', condition: 'stunned', who: 'target', duration: { kind: 'save-ends' } }] } }] }
    const m = applyResponse('diseases', 'disease11', { entry: missing }, disease, opts).result
    expect(m.errors).toEqual([{ path: '$.stages[0].line.clauses[0]', message: 'quote "stunned" is not in the line text "Dazed."' }])
    const human = { ...disease, provenance: { origin: 'human', at: '2026-11-12' } }
    expect(applyResponse('diseases', 'disease11', { entry: { ...disease } }, human, opts).result.reason).toMatch(/human/)
  })

  it('names powers and clause kinds in error locations', () => {
    const entry = { powers: [{ name: 'Bite', attacks: [{ hit: { text: 'x', clauses: [{ kind: 'damage' }] } }] }] }
    expect(describePath(entry, '$.powers[0].attacks[0].hit.clauses[0].dice')).toBe('powers[0] "Bite" > attacks[0].hit.clauses[0] (damage) > dice')
    expect(describePath(entry, '$.level')).toBe('level')
  })

  it('--check writes nothing; apply-all applies every reply and reports each', () => {
    const repo = repoWithDisease()
    const dir = join(repo, 'responses')
    mkdirSync(join(dir, 'diseases'), { recursive: true })
    const replyPath = join(dir, 'diseases', 'disease11.json')
    writeFileSync(replyPath, JSON.stringify({ entry: { ...disease, name: 'Fixed Rot' }, notes: ['renamed'], confidence: 'high' }))
    const check = applyFile('diseases', 'disease11', replyPath, repo, { check: true })
    expect(check.ok).toBe(true)
    expect(check.summary).toMatch(/check passed/)
    expect(JSON.parse(readFileSync(join(repo, 'diseases', 'disease11.json'), 'utf-8')).name).toBe('Test Rot')
    expect(applyFile('diseases', 'disease11', join(dir, 'nope.json'), repo, { check: true }).summary).toMatch(/does not exist/)

    writeFileSync(join(dir, 'diseases', 'disease99.json'), '{}')
    const results = applyAll(dir, repo, { model: 'claude-test' })
    expect(results.map(r => r.ok)).toEqual([true, false])
    expect(JSON.parse(readFileSync(join(repo, 'diseases', 'disease11.json'), 'utf-8')).name).toBe('Fixed Rot')
    expect(existsSync(join(repo, 'diseases', 'disease99.json'))).toBe(false)
  })
})
