import { create } from 'zustand'
import type { ContentKind, Draft } from '@common/authoring/types'

/** A draft (an AI editing session) as main lists it (`list_drafts`): enough for compendium rows and the command palette. */
export interface DraftRow {
  id: string; kind: ContentKind; name: string; level?: number; revision: number; updatedAt?: string
  openQuestions?: number
  /** Where it saves: a campaign, and the entry it revises (none: a new entry). */
  destinations?: { id: string; entityId?: string }[]
}

export const useAuthoringStore = create<{
  drafts: Record<string, Draft>
  /** Every draft, refreshed when main reports a draft change. */
  list: DraftRow[]
  pendingFields: string[]
  markPending: (path: string, dirty: boolean) => void
  receive: (draft: Draft) => void
  refreshList: () => Promise<void>
}>((set) => ({
  drafts: {},
  list: [],
  pendingFields: [],
  markPending: (path, dirty) => set(s => ({ pendingFields: dirty ? [...new Set([...s.pendingFields, path])] : s.pendingFields.filter(p => p !== path) })),
  receive: draft => set(s => {
    if ((s.drafts[draft.id]?.event ?? 0) > draft.event) return s
    return { drafts: { ...s.drafts, [draft.id]: draft } }
  }),
  refreshList: async () => set({ list: await window.api.authoring.call('list_drafts') }),
}))
