import type { Campaign, EntityType, NoteTreeNode, LinkIndex, LinkEntry } from '@common/types'
import type { CompendiumAnnotation, Creature, CompendiumEntry } from '@common/types'
import {
  getCampaignsRoot,
  getCampaignDir,
  getCampaignMetaPath,
  getEntityDir,
  getEntityPath,
  getNoteTreePath,
  getLinksPath,
  getAnnotationsPath,
  getAssetsDir,
} from './paths'
import { atomicWriteJson, readJson, deleteFile, listJsonFiles, ensureDir, copyFile } from './file-io'
import { generateId } from '@common/utils/id'
import { extractLinks } from '@common/utils/links'
import { join, extname } from 'path'
import { readdir } from 'fs/promises'

let activeCampaignId: string | null = null
let linkDebounceTimer: ReturnType<typeof setTimeout> | null = null

export function getActiveCampaignId(): string | null {
  return activeCampaignId
}

export async function listCampaigns(): Promise<Campaign[]> {
  const root = getCampaignsRoot()
  await ensureDir(root)
  const dirs = await readdir(root, { withFileTypes: true })
  const campaigns: Campaign[] = []

  for (const entry of dirs) {
    if (entry.isDirectory()) {
      const meta = await readJson<Campaign>(getCampaignMetaPath(entry.name))
      if (meta) campaigns.push(meta)
    }
  }

  return campaigns.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
}

export async function createCampaign(name: string, systemId: string): Promise<Campaign> {
  const id = generateId()
  const now = new Date().toISOString()
  const campaign: Campaign = { id, name, systemId, createdAt: now, lastOpenedAt: now }

  const dir = getCampaignDir(id)
  await ensureDir(dir)
  await ensureDir(join(dir, 'story', 'notes'))
  await ensureDir(join(dir, 'creatures'))
  await ensureDir(join(dir, 'encounters'))
  await ensureDir(join(dir, 'locations'))
  await ensureDir(join(dir, 'items'))
  await ensureDir(join(dir, 'player-characters'))
  await ensureDir(join(dir, 'maps'))
  await ensureDir(join(dir, 'assets', 'images'))

  await atomicWriteJson(getCampaignMetaPath(id), campaign)
  await atomicWriteJson(getNoteTreePath(id), [])
  await atomicWriteJson(getLinksPath(id), { links: [] })

  activeCampaignId = id
  return campaign
}

export async function openCampaign(campaignId: string): Promise<Campaign | null> {
  const meta = await readJson<Campaign>(getCampaignMetaPath(campaignId))
  if (!meta) return null

  meta.lastOpenedAt = new Date().toISOString()
  await atomicWriteJson(getCampaignMetaPath(campaignId), meta)
  activeCampaignId = campaignId
  return meta
}

export async function saveEntity(entityType: EntityType, entity: { id: string; [key: string]: unknown }): Promise<void> {
  if (!activeCampaignId) throw new Error('No active campaign')
  const path = getEntityPath(activeCampaignId, entityType, entity.id)
  await atomicWriteJson(path, entity)

  // Schedule link index rebuild
  scheduleLinkRebuild()
}

export async function deleteEntity(entityType: EntityType, entityId: string): Promise<void> {
  if (!activeCampaignId) throw new Error('No active campaign')
  const path = getEntityPath(activeCampaignId, entityType, entityId)
  await deleteFile(path)
  scheduleLinkRebuild()
}

export async function getEntity<T>(entityType: EntityType, entityId: string): Promise<T | null> {
  if (!activeCampaignId) return null
  return readJson<T>(getEntityPath(activeCampaignId, entityType, entityId))
}

export async function listEntities<T>(entityType: EntityType): Promise<T[]> {
  if (!activeCampaignId) return []
  const dir = getEntityDir(activeCampaignId, entityType)
  const files = await listJsonFiles(dir)
  const entities: T[] = []
  for (const file of files) {
    const entity = await readJson<T>(join(dir, file))
    if (entity) entities.push(entity)
  }
  return entities
}

// Note tree
export async function getNoteTree(): Promise<NoteTreeNode[]> {
  if (!activeCampaignId) return []
  return (await readJson<NoteTreeNode[]>(getNoteTreePath(activeCampaignId))) || []
}

export async function saveNoteTree(tree: NoteTreeNode[]): Promise<void> {
  if (!activeCampaignId) throw new Error('No active campaign')
  await atomicWriteJson(getNoteTreePath(activeCampaignId), tree)
}

// Links
export async function getLinks(): Promise<LinkIndex> {
  if (!activeCampaignId) return { links: [] }
  return (await readJson<LinkIndex>(getLinksPath(activeCampaignId))) || { links: [] }
}

function scheduleLinkRebuild(): void {
  if (linkDebounceTimer) clearTimeout(linkDebounceTimer)
  linkDebounceTimer = setTimeout(() => rebuildLinkIndex(), 1000)
}

async function rebuildLinkIndex(): Promise<void> {
  if (!activeCampaignId) return

  const allLinks: LinkEntry[] = []
  const entityTypes: EntityType[] = ['note', 'creature', 'encounter', 'location', 'item', 'player-character']

  for (const entityType of entityTypes) {
    const entities = await listEntities<{ id: string; content?: string; description?: string }>(entityType)
    for (const entity of entities) {
      const text = entity.content || entity.description || ''
      if (text) {
        allLinks.push(...extractLinks(entityType, entity.id, text))
      }
    }
  }

  await atomicWriteJson(getLinksPath(activeCampaignId), { links: allLinks })
}

// Images
export async function importImage(campaignId: string, sourcePath: string): Promise<string> {
  const imageId = generateId()
  const ext = extname(sourcePath)
  const destPath = join(getAssetsDir(campaignId), `${imageId}${ext}`)
  await copyFile(sourcePath, destPath)
  return imageId + ext
}

export async function getImagePath(campaignId: string, imageId: string): Promise<string> {
  return join(getAssetsDir(campaignId), imageId)
}

// Annotations
export async function loadAnnotations(campaignId: string): Promise<Record<string, CompendiumAnnotation>> {
  return (await readJson<Record<string, CompendiumAnnotation>>(getAnnotationsPath(campaignId))) ?? {}
}

export async function saveAnnotation(campaignId: string, compendiumId: string, annotation: CompendiumAnnotation): Promise<Record<string, CompendiumAnnotation>> {
  const all = await loadAnnotations(campaignId)
  if (Object.keys(annotation).length === 0) {
    delete all[compendiumId]
  } else {
    all[compendiumId] = annotation
  }
  await atomicWriteJson(getAnnotationsPath(campaignId), all)
  return all
}

// Custom creature index — builds CompendiumEntry[] from campaign creatures
export async function buildCreatureIndex(campaignId: string): Promise<CompendiumEntry[]> {
  const creatures = await listEntities<Creature>('creature')
  return creatures.map(c => {
    const sb = c.statBlock ?? {}
    return {
      id: c.id,
      name: c.name,
      level: (sb.level as number) ?? 1,
      role: (sb.role as string) ?? '',
      modifier: (sb.monsterModifier as string) ?? '',
      size: (sb.size as string) ?? 'Medium',
      type: (sb.creatureType as string) ?? '',
      origin: (sb.origin as string) ?? '',
      alignment: (sb.alignment as string) ?? '',
      xp: (sb.xp as number) ?? 0,
      source: 'Custom',
    }
  })
}
