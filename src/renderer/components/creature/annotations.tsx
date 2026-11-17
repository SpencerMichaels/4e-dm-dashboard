import { createContext, useContext, type ReactNode } from 'react'

/** Stat block rows that can carry annotations (comments, review findings). */
export type StatAnchor = 'header' | 'senses' | 'speed' | 'saves' | 'hp' | 'defenses' | 'resistances' | 'skills' | 'abilities' | 'alignment' | 'languages' | 'equipment'
  // Other kinds' sections (see STAT_ANCHOR_PATHS in common/authoring/anchors.ts): 'trap-detect', 'disease-check', …
  | `${'item' | 'trap' | 'disease' | 'template' | 'theme' | 'challenge'}-${string}`
  // Hosts that render the description outside the stat block (the Workshop) anchor it here.
  | 'description'
/** An entry anchor is the stat block's own action entry; the provider maps it back to its source. */
export type Anchor = { kind: 'stat'; key: StatAnchor } | { kind: 'entry'; entry: object }

/**
 * Optional annotation layer for the stat block viewer and editor. Without a provider
 * (the compendium and campaign pages) nothing extra renders. The Workshop
 * provides one to anchor comment threads to rows and power cards.
 */
export const AnnotationContext = createContext<((anchor: Anchor) => ReactNode) | null>(null)

/** Renders the provider's annotation for an anchor inside the current row. */
export function Annotation({ anchor }: { anchor: Anchor }) {
  const annotate = useContext(AnnotationContext)
  return annotate ? <span className="sb-annotation-slot">{annotate(anchor)}</span> : null
}
