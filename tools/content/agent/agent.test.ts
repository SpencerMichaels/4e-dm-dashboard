import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { Disease } from '@kit'
import { applyResponse, parseResponse } from './apply'
import { buildPrompt, schemaExcerpt } from './prompt'
import { mulberry32, pick } from './sample'

const disease: Disease = {
  id: 'disease11', name: 'Test Rot', level: 4,
  endurance: { improveDc: 14, maintainDc: 10 },
  stages: [{ stage: 0, line: { text: 'The target recovers.', clauses: [] } }, { stage: 1, final: true, line: { text: 'The target is weakened.', clauses: [] } }],
  flavor: '', sources: [{ book: 'Test' }],
  provenance: { origin: 'parser', by: 'tools/content@test', at: '2026-11-12' },
}

describe('sampler', () => {
  it('is deterministic for a seed and picks distinct ids', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `monster${i}`)
    const a = pick(ids, 10, mulberry32(4))
    expect(pick(ids, 10, mulberry32(4))).toEqual(a)
    expect(new Set(a).size).toBe(10)
    expect(pick(ids, 10, mulberry32(5))).not.toEqual(a)
  })
})

describe('prompt', () => {
  it('includes the kind\'s schema sections and the vocabularies, not the XP table', () => {
    const s = schemaExcerpt('monsters')
    expect(s).toContain('export interface Monster')
    expect(s).toContain('export type Clause')
    expect(s).toContain('CONDITION_IDS')
    expect(s).not.toContain('export interface Item')
    expect(s).not.toContain('XP_BY_LEVEL')
  })

  it('fills every placeholder', () => {
    const repo = mkdtempSync(join(tmpdir(), 'content-'))
    mkdirSync(join(repo, 'diseases'))
    writeFileSync(join(repo, 'diseases', 'disease11.json'), JSON.stringify(disease))
    const prompt = buildPrompt('diseases', 'disease11', repo)
    expect(prompt).not.toMatch(/\{\{\w+\}\}/)
    expect(prompt).toContain('"id":"disease11"')
    expect(prompt).toContain('export interface Disease')
  })
})

describe('apply', () => {
  const opts = { model: 'claude-test', date: '2026-11-13' }

  it('parses fenced replies', () => {
    expect(parseResponse('```json\n{"entry":{"id":"x"},"confidence":"high"}\n```').entry).toEqual({ id: 'x' })
  })

  it('accepts a valid entry and rewrites provenance', () => {
    const { result, entry } = applyResponse('diseases', 'disease11', { entry: { ...disease }, notes: ['fixed stage 1'], confidence: 'high' }, disease, opts)
    expect(result.written).toBe(true)
    expect(entry!.provenance).toEqual({ origin: 'agent', by: 'claude-test', at: '2026-11-13', confidence: 'high', notes: ['fixed stage 1'] })
  })

  it('rejects a changed id, invalid output, and human-edited entries', () => {
    expect(applyResponse('diseases', 'disease11', { entry: { ...disease, id: 'disease12' } }, disease, opts).result.written).toBe(false)
    const bad = { ...disease, stages: [{ stage: 1, line: { text: 'Dazed.', clauses: [{ at: [0, 99], kind: 'condition', condition: 'dazed', who: 'target', duration: { kind: 'save-ends' } }] } }] }
    const r = applyResponse('diseases', 'disease11', { entry: bad }, disease, opts).result
    expect(r.written).toBe(false)
    expect(r.errors[0].message).toMatch(/outside text/)
    const human = { ...disease, provenance: { origin: 'human', at: '2026-11-12' } }
    expect(applyResponse('diseases', 'disease11', { entry: { ...disease } }, human, opts).result.reason).toMatch(/human/)
  })
})
