import { create } from 'zustand'
import type { Draft } from '@common/authoring/types'

export const useAuthoringStore = create<{ drafts: Record<string, Draft>; pendingFields: string[]; markPending: (path: string, dirty: boolean) => void; receive: (draft: Draft) => void }>((set) => ({
  drafts: {},
  pendingFields: [],
  markPending: (path, dirty) => set(s => ({ pendingFields: dirty ? [...new Set([...s.pendingFields, path])] : s.pendingFields.filter(p => p !== path) })),
  receive: draft => set(s => {
    if ((s.drafts[draft.id]?.event ?? 0) > draft.event) return s
    return { drafts: { ...s.drafts, [draft.id]: draft } }
  }),
}))
