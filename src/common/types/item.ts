export interface Item {
  authoredContent?: import('@kit').Item
  id: string
  name: string
  description?: string
  tags: string[]
  extra: Record<string, unknown>  // Schema-driven by system plugin
  createdAt: string
  updatedAt: string
}
