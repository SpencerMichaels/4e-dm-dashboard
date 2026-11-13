// Diseases (DMG p.49): finding the disease a power exposes its target to, and moving a carrier
// between stages after an extended rest.

import type { Disease } from '@kit'

export interface DiseaseName<R> { ref: R; name: string }

const EXPOSURE = /\bexpos|\bcontract|\bdisease|\binfect/i

/**
 * Diseases named in power text ("the target is exposed to filth fever"). Only text that talks about
 * exposure or disease counts, and the longest name wins where names nest ("Dire Rat Filth Fever"
 * over "Filth Fever").
 */
export function findDiseaseMentions<R>(text: string, diseases: DiseaseName<R>[]): DiseaseName<R>[] {
  return locateDiseaseMentions(text, diseases).map(m => m.disease)
}

/** The same mentions with their positions in the text, for highlighting. */
export function locateDiseaseMentions<R>(text: string, diseases: DiseaseName<R>[]): { disease: DiseaseName<R>; start: number; end: number }[] {
  if (!text || !EXPOSURE.test(text)) return []
  const lower = text.toLowerCase()
  const found: { d: DiseaseName<R>; start: number; end: number }[] = []
  for (const d of [...diseases].sort((a, b) => b.name.length - a.name.length)) {
    const start = lower.indexOf(d.name.toLowerCase())
    if (start < 0) continue
    const end = start + d.name.length
    // Whole words only, and not inside a longer name already found.
    if (/\w/.test(lower[start - 1] ?? '') || /\w/.test(lower[end] ?? '')) continue
    if (found.some(f => start < f.end && end > f.start)) continue
    found.push({ d, start, end })
  }
  return found.sort((a, b) => a.start - b.start).map(f => ({ disease: f.d, start: f.start, end: f.end }))
}

export type EnduranceOutcome = 'improve' | 'maintain' | 'worsen'

/** The outcome of an Endurance check against the disease's DCs; undefined when a DC is printed as text. */
export function enduranceOutcome(d: Disease, result: number): EnduranceOutcome | undefined {
  const { improveDc, maintainDc } = d.endurance
  if (typeof improveDc !== 'number' || typeof maintainDc !== 'number') return undefined
  return result >= improveDc ? 'improve' : result >= maintainDc ? 'maintain' : 'worsen'
}

export const finalStage = (d: Disease) => d.stages.find(s => s.final)?.stage ?? Math.max(...d.stages.map(s => s.stage))

/** The next stage: improving from stage 1 reaches 0 (cured); worsening stops at the final stage. */
export function nextStage(d: Disease, stage: number, outcome: EnduranceOutcome): number {
  if (outcome === 'improve') return Math.max(0, stage - 1)
  if (outcome === 'worsen') return Math.min(finalStage(d), stage + 1)
  return stage
}

/** The printed line for a stage ("The target is weakened."). */
export const stageText = (d: Disease, stage: number) => d.stages.find(s => s.stage === stage)?.line.text ?? ''

/** All printed text of a monster's or trap's traits, auras, and powers, where diseases are named. */
export function contentText(c: { traits: { text: { text: string } }[]; auras: { text: { text: string } }[]; powers: import('@kit').Power[] }): string {
  const lines: string[] = [...c.traits.map(t => t.text.text), ...c.auras.map(a => a.text.text)]
  for (const p of c.powers) {
    for (const a of p.attacks) lines.push(a.hit?.text ?? '', a.miss?.text ?? '', a.aftereffect?.text ?? '', ...(a.failedSaves ?? []).map(f => f.line.text))
    lines.push(p.effect?.text ?? '', p.special?.text ?? '')
  }
  return lines.filter(Boolean).join('\n')
}
