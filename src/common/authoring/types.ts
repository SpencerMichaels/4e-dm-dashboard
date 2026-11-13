import type { Monster, Item, Trap, Disease, MonsterTemplate, MonsterTheme } from '@kit'

export type ContentKind = 'monster' | 'item' | 'trap' | 'disease' | 'template' | 'theme'
export const CONTENT_KINDS: readonly ContentKind[] = ['monster', 'item', 'trap', 'disease', 'template', 'theme']
export type Content = Monster | Item | Trap | Disease | MonsterTemplate | MonsterTheme
export type Actor = 'dm' | 'agent'
export interface Destination {
  // Homebrew libraries were removed (2026-11-13); every kind saves to a campaign.
  type: 'campaign'
  id: string
  /** Omit to create a copy; updates require a matching hash. */
  entityId?: string
  expectedHash?: string
}
export interface Comment {
  id: string
  target: string
  revision: number
  author: Actor
  text: string
  at: string
  question: boolean
  resolved: boolean
  replies: { author: Actor; text: string; at: string }[]
}
export interface Finding {
  severity: 'info' | 'concern' | 'high'
  target: string
  message: string
  suggestion: string
}
export interface Review {
  revision: number
  assumptions: string
  findings: Finding[]
  author: Actor
  at: string
}
export interface Draft {
  version: 1
  schemaVersion: number
  id: string
  kind: ContentKind
  revision: number
  event: number
  createdAt: string
  updatedAt: string
  content: Content
  intent: string
  decisions: string
  policy: string
  recipe?: NumberRecipe
  /** Stable node IDs, parallel to named node arrays. */
  nodes: Record<string, string[]>
  /** Semantic paths locked by direct DM edits. */
  overrides: string[]
  stale: string[]
  destinations: Destination[]
  comments: Comment[]
  review?: Review
  /** The last save; it stays when the draft changes afterwards (`receipt.revision < revision`). */
  receipt?: { revision: number; at: string; targets: { destination: Destination; entityId: string }[] }
  /** Who made the event this snapshot records, for the version history. Older snapshots lack it. */
  lastChange?: { by: Actor; action: DraftAction }
}
export type DraftAction = 'created' | 'edited' | 'restored' | 'saved' | 'commented' | 'reviewed' | 'save-abandoned'
/** One content version (or save) in a draft's history, newest first in `versions`. */
export interface DraftVersion {
  event: number
  revision: number
  at: string
  by?: Actor
  action: DraftAction
  /** What changed from the previous version, by readable field name. */
  changes: FieldChange[]
  /** Campaign names are resolved by the renderer. */
  savedTo?: Destination[]
}
export interface FieldChange { label: string; change: 'added' | 'removed' | 'changed'; before?: string; after?: string }
export interface Change { path: string; value: unknown }
export interface Patch {
  id: string
  revision: number
  changes: Change[]
  /** DM-only: release explicit overrides before applying changes. */
  release?: string[]
  /** Confirm interpretation of these freshly reconciled nodes/fields. */
  reconciled?: string[]
}
export interface Validation {
  errors: { path: string; message: string }[]
  flags: { path: string; message: string }[]
}
export interface SearchQuery {
  text?: string
  kind?: ContentKind
  role?: string
  level?: number
  clause?: string
  condition?: string
  limit?: number
}
export interface SearchEntry { key: string; kind: ContentKind; content: Content; source: string }
export interface NumberRecipe {
  hpMultiplier?: number
  defenseOffsets?: Partial<Record<'ac' | 'fortitude' | 'reflex' | 'will', number>>
  initiativeOffset?: number
  speed?: number
  powers?: Record<string, { accuracy?: number; damageBand?: 'low' | 'medium' | 'high'; limited?: boolean }>
}
