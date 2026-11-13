import { monsterXp } from '@kit'
import type { Monster, Power, Rank } from '@kit'
import type { Creature } from '../types/creature'
import type { Change, Draft } from './types'
import { monsterToCreature, powerToLegacy } from './legacy'
import { clone, entryToPower, equal, textLine, toEditorEntry } from './power-adapter'
export { splitHitDamage } from './power-adapter'
import { applyPatch } from './patch'
import { strip } from './kit-editor-adapter'
import { unsavedDraft } from './unsaved'

const join = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v ?? '')
const groupFor = (e: any) => e.entryType === 'trait' ? 'traits' : e.entryType === 'aura' ? 'auras' : 'powers'
const sourceText = (s: { book: string; page?: number | string }) => `${s.book}${s.page ? ', ' + s.page : ''}`

/** Tags each stat block entry with its stable draft node ID (`_draftNode`), for editing and comment anchors. */
export function withDraftNodes(c: Creature, d: Draft): Creature {
  const m = d.content as Monster
  const sb = c.statBlock as any
  sb.actions = sb.actions.map((e: any, i: number) => {
    const group = groupFor(e)
    const index = group === 'traits' ? i : group === 'auras' ? i - m.traits.length : i - m.traits.length - m.auras.length
    return { ...e, _draftNode: d.nodes[group]?.[index] }
  })
  return c
}

/** The native compendium editor receives its own model; kit-only data stays in the draft. */
export function draftToCreatureEditor(d: Draft): Creature {
  const m = d.content as Monster
  return editorModel(withDraftNodes(monsterToCreature(m), d), m.description)
}

/**
 * A legacy-shaped creature in the creature editor's conventions: capitalized size and sense names,
 * spaced creature type, language and equipment lists, and editor power entries (leading hit damage
 * split into damage parts). `description`, when given, replaces the stat block's.
 */
export function editorModel(c: Creature, description?: string): Creature {
  const sb = c.statBlock as any
  const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).split(/,\s*/).filter(Boolean)
  const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
  sb.size = cap(String(sb.size ?? ''))
  sb.creatureType = sb.creatureType ? String(sb.creatureType).replace(/-/g, ' ') : ''
  if (description !== undefined) sb.description = description
  sb.languages = list(sb.languages)
  sb.equipment = list(sb.equipment)
  sb.senses = (Array.isArray(sb.senses) ? sb.senses : list(sb.senses)).map((s: string) => cap(String(s).replace(/-/g, ' ')))
  sb.actions = (sb.actions ?? []).map(toEditorEntry)
  return c
}

/** A kit monster as a stand-alone draft (positional node IDs), for editing it outside the Workshop. */
export function draftOf(m: Monster): Draft {
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
  return { ...unsavedDraft('monster'), id: m.id, content: structuredClone(m), nodes: { traits: ids('t', m.traits.length), auras: ids('a', m.auras.length), powers: ids('p', m.powers.length) } }
}

/** A kit monster as the creature editor's model (entries tagged for `monsterFromEditor`). */
export const monsterToEditor = (m: Monster): Creature => draftToCreatureEditor(draftOf(m))

/**
 * The kit monster with only what changed between two editor models applied, through the same
 * field-level changes the Workshop makes; kit-only mechanics (clauses, secondary attacks) are kept.
 * `before` and `after` come from `monsterToEditor(m)`.
 */
export function monsterFromEditor(m: Monster, before: Creature, after: Creature): Monster {
  const d = draftOf(m)
  const changes = creatureEditorChanges(d, before, after)
  if (!changes.length) return m
  let n = 0
  return strip(applyPatch(d, { id: d.id, revision: d.revision, changes }, 'dm', () => `new-${++n}`).content) as Monster
}

/** Diff only fields changed in the native editor, leaving unrepresented mechanics and clauses intact. */
export function creatureEditorChanges(d: Draft, before: Creature, after: Creature): Change[] {
  const changes: Change[] = []
  const m = d.content as Monster
  const b = before.statBlock as any, a = after.statBlock as any
  const set = (path: string, value: unknown) => {
    if (value === undefined) throw new Error(`No value for ${path}`)
    changes.push({ path: `/content/${path}`, value })
  }
  const scalar = (legacy: string, kit = legacy, convert = (v: any) => v) => { if (!equal(b[legacy], a[legacy])) set(kit, convert(a[legacy])) }
  const num = (v: unknown) => Number(v) || 0
  if (before.name !== after.name) set('name', after.name)
  if (before.hp !== after.hp) set('hp', num(after.hp))
  for (const key of ['level', 'initiative', 'perception', 'savingThrowBonus', 'actionPoints']) scalar(key, key, num)
  for (const key of ['alignment', 'description']) scalar(key)
  scalar('role', 'role', v => v || null)
  scalar('monsterModifier', 'rank', v => v || 'standard')
  // XP follows level and rank unless it no longer matched the printed formula (a deliberate choice).
  const rank = (v: unknown) => (v || 'standard') as Rank
  if ((!equal(b.level, a.level) || !equal(b.monsterModifier, a.monsterModifier)) && m.xp === monsterXp(num(b.level), rank(b.monsterModifier))) {
    const xp = monsterXp(num(a.level), rank(a.monsterModifier))
    if (xp !== m.xp) set('xp', xp)
  }
  scalar('size', 'size', v => String(v).toLowerCase())
  scalar('origin', 'origin', v => v || null)
  scalar('creatureType', 'type', v => v ? v.replace(/ /g, '-') : null)
  scalar('subtypes', 'keywords'); scalar('ac', 'defenses/ac', num)
  for (const k of ['fortitude', 'reflex', 'will']) if (b.defenses?.[k] !== a.defenses?.[k]) set(`defenses/${k}`, num(a.defenses[k]))
  for (const k of Object.keys(a.abilities ?? {})) if (b.abilities?.[k] !== a.abilities[k]) set(`abilities/${k}`, num(a.abilities[k]))
  scalar('skills', 'skills', v => Object.fromEntries(Object.entries(v ?? {}).map(([k, n]) => [k, num(n)])))
  scalar('languages', 'languages', join); scalar('equipment', 'equipment', join)
  if (!equal(b.speed, a.speed) || !equal(b.speeds, a.speeds)) {
    const notes = m.speed.notes
    const speed: Record<string, unknown> = { walk: num(a.speed) }
    for (const [k, v] of Object.entries(a.speeds ?? {})) speed[k] = num(v)
    if (notes) speed.notes = notes
    set('speed', speed)
  }
  scalar('senses', 'senses', v => (v ?? []).map((s: string) => { const match = s.match(/^(.*?)(?:\s+(\d+))?$/)!; return { kind: match[1].toLowerCase().replace(/ /g, '-'), ...(match[2] ? { range: Number(match[2]) } : {}) } }))
  scalar('immunities', 'immune'); scalar('resistances', 'resist'); scalar('weaknesses', 'vulnerable')
  scalar('source', 'sources', v => String(v).split(';').map(s => s.trim()).filter(Boolean).map(s => m.sources.find(o => sourceText(o) === s) ?? { book: s }))
  const oldEntries = (b.actions ?? []) as any[]
  const newEntries = (a.actions ?? []) as any[]
  const used = new Set<string>()
  for (const group of ['traits', 'auras', 'powers'] as const) {
    const old = oldEntries.filter(e => groupFor(e) === group)
    const next = newEntries.filter(e => groupFor(e) === group).map(e => {
      const id = e._draftNode
      const retained = id && d.nodes[group].includes(id) && !used.has(id)
      if (retained) used.add(id)
      return { e, id: retained ? id as string : undefined }
    })
    const retained = next.flatMap(n => n.id ? [n.id] : [])
    for (const id of d.nodes[group]) if (!retained.includes(id)) changes.push({ path: `/remove/${group}/@${id}`, value: null })
    if (!equal(d.nodes[group].filter(id => retained.includes(id)), retained)) changes.push({ path: `/order/${group}`, value: retained })
    next.forEach(({ e, id }, index) => {
      // A pasted or duplicated entry starts from its source node, so kit-only mechanics carry over.
      const sourceId: string | undefined = id ?? e._draftNode
      const previous = old.find(o => o._draftNode === sourceId)
      if (id && previous && equal(previous, e)) return
      const sourceIndex = sourceId ? d.nodes[group].indexOf(sourceId) : -1
      const original = sourceIndex < 0 ? undefined : m[group][sourceIndex]
      let value: any
      if (group === 'powers') value = entryToPower(original as Power | undefined, previous ?? (original ? powerToLegacy(original as Power) : {}), e)
      else {
        value = { ...clone(original ?? {}), name: e.name ?? '', keywords: e.keywords ?? [] }
        if (!equal(previous?.effect, e.effect) || !original) value.text = textLine(e.effect ?? '', (original as any)?.text)
        // A text-sized aura ("aura sight") has no number to write back; only a changed size is written.
        if (group === 'auras' && (!previous || !equal(previous.auraRange, e.auraRange))) value.range = Number(e.auraRange ?? 1) || 1
      }
      if (!id) changes.push({ path: `/append/${group}/${index}`, value })
      else {
        // Leaf patches protect only edited fields. Untouched power metadata must remain agent-editable.
        const diff = (x: any, y: any, path: string) => {
          if (equal(x, y)) return
          if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
            // A removed optional property cannot be patched as undefined; replace its container.
            if (Object.keys(x).some(key => !(key in y))) { changes.push({ path, value: y }); return }
            for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) diff(x[key], y[key], `${path}/${key}`)
          } else if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && path.endsWith('/attacks')) {
            x.forEach((v, i) => diff(v, y[i], `${path}/${i}`))
          } else changes.push({ path, value: y })
        }
        diff(original, value, `/content/${group}/@${id}`)
      }
    })
  }
  return changes
}
