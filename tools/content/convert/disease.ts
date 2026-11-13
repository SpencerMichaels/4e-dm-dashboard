// Parsed disease (disease-parser output) -> kit Disease.

import type { Disease } from '@kit'
import type { ParsedDisease } from '../disease-parser'
import { Notes, compact, line, normText, parseSource, provenanceFor, type ConvertContext } from './common'

/**
 * Endurance DCs from the check table: "N or higher" improves, "N or lower"
 * worsens (maintain = N + 1). Level-relative rows ("15 + encounter level")
 * and "Easy DC" rows are not numeric and leave 0 with a note.
 */
export function enduranceFrom(d: ParsedDisease, notes: Notes): Disease['endurance'] {
  let improveDc = 0
  let maintainDc = 0
  for (const row of d.checkTable ?? []) {
    const r = normText(row.result)
    const hi = r.match(/^(\d+) or higher$/i)
    const lo = r.match(/^(\d+) or lower$/i)
    const range = r.match(/^(\d+)-(\d+)$/)
    if (hi) improveDc = parseInt(hi[1])
    else if (lo) maintainDc = maintainDc || parseInt(lo[1]) + 1
    else if (range) maintainDc = parseInt(range[1])
    else notes.add(`check row "${r}: ${row.effect}" is not numeric`)
  }
  if (!improveDc || !maintainDc) notes.add('endurance DCs incomplete')
  return { improveDc, maintainDc }
}

export function convertDisease(id: string, d: ParsedDisease, ctx: ConvertContext): Disease {
  const notes = new Notes()
  if (d.check) notes.add(`check: ${normText(d.check)}`)
  const last = Math.max(...d.stages.map(s => s.stage))
  const disease: Disease = {
    id,
    name: d.name,
    level: d.level,
    endurance: enduranceFrom(d, notes),
    stages: d.stages.map(s => compact({ stage: s.stage, final: s.stage === last ? true as const : undefined, line: line(s.text) })),
    flavor: d.flavor ?? '',
    source: parseSource(d.source ?? '', notes),
    provenance: undefined as never,
  }
  disease.provenance = provenanceFor(ctx, notes)
  return compact(disease)
}
