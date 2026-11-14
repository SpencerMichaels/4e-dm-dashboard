import { createContext, useContext, type ReactNode } from 'react'

/**
 * The compendium page's controls for the entry it shows (Edit/Done, where it lives, its menu), drawn by the
 * stat block in its title bar right after the name, so they sit in the stat block rather than above it.
 * Stat blocks shown anywhere else have no provider and draw nothing.
 */
export const RecordHeaderContext = createContext<ReactNode>(null)

/** The slot, placed right after the name in every stat block header. */
export function RecordHeaderActions() {
  const actions = useContext(RecordHeaderContext)
  return actions ? <span className="sb-header-actions">{actions}</span> : null
}
