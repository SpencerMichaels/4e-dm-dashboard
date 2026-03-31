import type { EntityType, LinkEntry } from '../types/campaign'

// Pattern: [[type:id]] or [[type:id|display text]]
const LINK_PATTERN = /\[\[(\w[\w-]*):([\w-]+)(?:\|[^\]]+)?\]\]/g

export function extractLinks(
  sourceType: EntityType,
  sourceId: string,
  content: string
): LinkEntry[] {
  const links: LinkEntry[] = []
  const seen = new Set<string>()

  let match: RegExpExecArray | null
  while ((match = LINK_PATTERN.exec(content)) !== null) {
    const targetType = match[1] as EntityType
    const targetId = match[2]
    const key = `${targetType}:${targetId}`
    if (!seen.has(key)) {
      seen.add(key)
      links.push({ sourceType, sourceId, targetType, targetId })
    }
  }

  return links
}

export function buildBidirectionalIndex(allLinks: LinkEntry[]): Map<string, LinkEntry[]> {
  const index = new Map<string, LinkEntry[]>()

  for (const link of allLinks) {
    const sourceKey = `${link.sourceType}:${link.sourceId}`
    const targetKey = `${link.targetType}:${link.targetId}`

    if (!index.has(sourceKey)) index.set(sourceKey, [])
    index.get(sourceKey)!.push(link)

    // Reverse link
    if (!index.has(targetKey)) index.set(targetKey, [])
    index.get(targetKey)!.push({
      sourceType: link.targetType,
      sourceId: link.targetId,
      targetType: link.sourceType,
      targetId: link.sourceId,
    })
  }

  return index
}
