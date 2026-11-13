// Parsed disease (disease-parser output) -> kit Disease.

import type { Disease } from '@kit'
import type { ParsedDisease } from '../disease-parser'
import { Notes, compact, line, normText, parseSources, provenanceFor, type ConvertContext } from './common'

type Dc = Disease['endurance']['improveDc']

/** A check-table row the parser ran into the check text: "... stage 1 or 2. 9-12: No Change". */
const STRAY_ROW = /(?:^|(?<=\.)\s+)([^.]+?):\s*No Change$/i

/** "15", "15 + two-thirds mummy's level", "Moderate DC" -> number or { text }. */
function dcOf(text: string): Dc {
  const t = normText(text)
  return /^\d+$/.test(t) ? parseInt(t) : { text: t }
}

/** One more than a printed "N or lower" bound: 9 -> 10, "9 + encounter level" -> "10 + encounter level". */
function plusOne(text: string): Dc {
  const t = normText(text)
  const m = t.match(/^(\d+)(.*)$/)
  return m ? dcOf(`${parseInt(m[1]) + 1}${m[2]}`) : { text: t }
}

/**
 * Endurance DCs from the check table: "N or higher" improves, "N or lower"
 * worsens (maintain = N + 1), "N-M" is the maintain band. Level-relative
 * rows ("15 + two-thirds mummy's level or higher") and the Easy/Moderate DC
 * rows keep their printed text as { text }.
 */
export function enduranceFrom(d: ParsedDisease, notes: Notes): Disease['endurance'] {
  let improveDc: Dc | undefined
  let maintainDc: Dc | undefined
  // The parser sometimes leaves the middle row in the check text ("9-12: No Change").
  const rows = [...(d.checkTable ?? [])]
  const stray = normText(d.check ?? '').match(STRAY_ROW)
  if (stray) rows.push({ result: stray[1], effect: 'No Change' })
  for (const row of rows) {
    const r = normText(row.result)
    const hi = r.match(/^(.+?) or higher$/i)
    const lo = r.match(/^(.+?) or lower$/i)
    // "10-13", "10 + two-thirds mummy's level-14 + two-thirds mummy's level"
    const range = r.match(/^(\d+.*?)\s*-\s*(?=\d)(\d+.*)$/)
    if (hi) improveDc = dcOf(hi[1])
    else if (/^lower than /i.test(r)) continue
    else if (lo) maintainDc ??= plusOne(lo[1])
    else if (range) maintainDc = dcOf(range[1])
    else if (/no change/i.test(row.effect)) maintainDc = dcOf(r)
    else if (/decreases/i.test(row.effect)) improveDc = dcOf(r)
    else notes.add(`check row "${r}: ${row.effect}" not read`)
  }
  if (improveDc === undefined || maintainDc === undefined) notes.add('endurance DCs incomplete')
  return { improveDc: improveDc ?? 0, maintainDc: maintainDc ?? 0 }
}

/** The check, when it isn't a plain Endurance check: "makes an Arcana or Insight check" / "makes a check". */
export function checkFrom(d: ParsedDisease): Disease['check'] {
  const text = normText(d.check ?? '').replace(STRAY_ROW, '').trim()
  const m = text.match(/makes an? (?:(.+?) )?check\b/i)
  if (!m || /^endurance$/i.test(m[1] ?? '')) return undefined
  return { skill: m[1] ?? '', text }
}

export function convertDisease(id: string, d: ParsedDisease, ctx: ConvertContext): Disease {
  const notes = new Notes()
  const last = Math.max(...d.stages.map(s => s.stage))
  const disease: Disease = {
    id,
    name: d.name,
    level: d.level,
    endurance: enduranceFrom(d, notes),
    check: checkFrom(d),
    stages: d.stages.map(s => compact({ stage: s.stage, final: s.stage === last ? true as const : undefined, line: line(s.text) })),
    flavor: d.flavor ?? '',
    sources: parseSources(d.source ?? '', notes),
    provenance: undefined as never,
  }
  disease.provenance = provenanceFor(ctx, notes)
  return compact(disease)
}
