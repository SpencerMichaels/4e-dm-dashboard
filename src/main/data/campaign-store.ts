import type { Campaign, EntityType } from '@common/types'
import type { CompendiumAnnotation, CompendiumEntry, CreatureRecord } from '@common/types'
import {
  getCampaignsRoot,
  getCampaignDir,
  getCampaignMetaPath,
  getEntityDir,
  getEntityPath,
  getAnnotationsPath,
  getAssetsDir,
  getLibraryAssetsDir,
} from './paths'
import { atomicWriteJson, readJson, deleteFile, listJsonFiles, ensureDir, copyFile, deleteDir } from './file-io'
import { generateId } from '@common/utils/id'
import { join, extname } from 'path'
import { readdir } from 'fs/promises'
import { withWriteLock } from './write-lock'
import { migrateLegacyItems } from './legacy-items'
import { migrateLegacyCreatures } from './legacy-creatures'
import { RECORD_STORAGE, checkRecord, isLibrary, isRecordType } from '@common/campaign-records'

let activeCampaignId: string | null = null

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

export async function createCampaign(name: string): Promise<Campaign> {
  const id = generateId()
  const now = new Date().toISOString()
  // systemId is kept in campaign.json for compatibility; the app is 4e-only.
  const campaign: Campaign = { id, name, systemId: 'dnd-4e', createdAt: now, lastOpenedAt: now }

  const dir = getCampaignDir(id)
  await ensureDir(dir)
  await ensureDir(join(dir, 'creatures'))
  await ensureDir(join(dir, 'encounters'))
  await ensureDir(join(dir, 'locations'))
  await ensureDir(join(dir, 'items'))
  await ensureDir(join(dir, 'player-characters'))
  await ensureDir(join(dir, 'maps'))
  for (const { dir: sub } of Object.values(RECORD_STORAGE)) await ensureDir(join(dir, sub))
  await ensureDir(join(dir, 'assets', 'images'))

  await atomicWriteJson(getCampaignMetaPath(id), campaign)

  activeCampaignId = id
  return campaign
}

export async function openCampaign(campaignId: string): Promise<Campaign | null> {
  const meta = await readJson<Campaign>(getCampaignMetaPath(campaignId))
  if (!meta) return null
  // Items and creatures became kit records (2026-11-13); convert any legacy files once.
  await withWriteLock(getCampaignMetaPath(campaignId), async () => {
    await migrateLegacyItems(getEntityDir(campaignId, 'item'))
    await migrateLegacyCreatures(getEntityDir(campaignId, 'creature'))
  })

  meta.lastOpenedAt = new Date().toISOString()
  await atomicWriteJson(getCampaignMetaPath(campaignId), meta)
  activeCampaignId = campaignId
  return meta
}

export async function getActiveCampaign(): Promise<Campaign | null> {
  if (!activeCampaignId) return null
  return readJson<Campaign>(getCampaignMetaPath(activeCampaignId))
}

export async function updateCampaign(patch: Partial<Campaign>): Promise<Campaign | null> {
  if (!activeCampaignId) throw new Error('No active campaign')
  const meta = await readJson<Campaign>(getCampaignMetaPath(activeCampaignId))
  if (!meta) return null
  const updated = { ...meta, ...patch, id: meta.id }
  await atomicWriteJson(getCampaignMetaPath(activeCampaignId), updated)
  return updated
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const dir = getCampaignDir(campaignId)
  await withWriteLock(getCampaignMetaPath(campaignId), () => deleteDir(dir))
  if (activeCampaignId === campaignId) activeCampaignId = null
}

export async function saveEntity<T extends { id: string }>(entityType: EntityType, input: T): Promise<void> {
  if (!activeCampaignId) throw new Error('No active campaign')
  // Record envelopes are checked; their kit content is validated in the editor, not refused here.
  const entity = isRecordType(entityType) ? checkRecord(entityType, input) : input
  const campaignId = activeCampaignId
  const path = getEntityPath(campaignId, entityType, entity.id)
  await withWriteLock(getCampaignMetaPath(campaignId), async () => {
    if (!await readJson(getCampaignMetaPath(campaignId))) throw new Error('Campaign no longer exists')
    await withWriteLock(path, () => atomicWriteJson(path, entity))
  })
}

export async function deleteEntity(entityType: EntityType, entityId: string): Promise<void> {
  if (!activeCampaignId) throw new Error('No active campaign')
  const path = getEntityPath(activeCampaignId, entityType, entityId)
  await withWriteLock(path, () => deleteFile(path))
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

// Images: a campaign's in its assets folder, a Library entry's in the Library's.
const assetsDir = (home: string) => isLibrary(home) ? getLibraryAssetsDir() : getAssetsDir(home)

export async function importImage(home: string, sourcePath: string): Promise<string> {
  await ensureDir(assetsDir(home))
  const imageId = generateId()
  const srcExt = extname(sourcePath).toLowerCase()
  // For PNGs (and other alpha-bearing formats), trim transparent borders so the
  // creature occupies the full image box. Re-save as PNG.
  const trimmable = srcExt === '.png' || srcExt === '.webp'
  if (trimmable) {
    const trimmed = await trimTransparentBorders(sourcePath)
    if (trimmed) {
      const destPath = join(assetsDir(home), `${imageId}.png`)
      const { writeFile } = await import('fs/promises')
      await writeFile(destPath, trimmed)
      return imageId + '.png'
    }
  }
  // Fallback (or non-alpha format): just copy as-is
  const destPath = join(assetsDir(home), `${imageId}${srcExt}`)
  await copyFile(sourcePath, destPath)
  return imageId + srcExt
}

// Use Electron's built-in nativeImage to find the bounding box of non-transparent
// pixels and return a cropped PNG buffer. Returns null if the image has no alpha
// channel, can't be loaded, or is already tight (no cropping needed).
async function trimTransparentBorders(sourcePath: string): Promise<Buffer | null> {
  const { nativeImage } = await import('electron')
  const img = nativeImage.createFromPath(sourcePath)
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  if (width <= 0 || height <= 0) return null
  // getBitmap() returns BGRA pixels in row-major order. width*4 bytes per row.
  const bitmap = img.toBitmap()
  if (bitmap.length < width * height * 4) return null
  const ALPHA_THRESHOLD = 0  // any non-zero alpha counts as content (preserves AA fringe)
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = bitmap[(y * width + x) * 4 + 3]
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null  // fully transparent
  // Add a small margin so we don't clip antialiased edges
  const margin = 2
  const x = Math.max(0, minX - margin)
  const y = Math.max(0, minY - margin)
  const w = Math.min(width - x, maxX - minX + 1 + margin * 2)
  const h = Math.min(height - y, maxY - minY + 1 + margin * 2)
  // No-op if the bounding box is already (close to) the full image
  if (w >= width - 2 && h >= height - 2) return null
  const cropped = img.crop({ x, y, width: w, height: h })
  return cropped.toPNG()
}

export async function getImagePath(home: string, imageId: string): Promise<string> {
  return join(assetsDir(home), imageId)
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
  return creatureIndexEntries(await listEntities<CreatureRecord>('creature'), 'Custom')
}

/** Index rows for custom creature records: the open campaign's ("Custom") or the Library's ("Library"). */
export function creatureIndexEntries(creatures: CreatureRecord[], source: 'Custom' | 'Library'): CompendiumEntry[] {
  const cap = (s: string | null | undefined) => s ? s[0].toUpperCase() + s.slice(1) : ''
  return creatures.filter(r => r.content).map(({ id, content: m }) => ({
    id,
    name: m.name,
    level: m.level ?? 1,
    role: m.role ?? '',
    // The published index marks elites and solos; minions show by their quarter XP.
    modifier: m.rank === 'elite' || m.rank === 'solo' ? m.rank : '',
    size: cap(m.size) || 'Medium',
    type: (m.type ?? '').replace(/-/g, ' '),
    origin: m.origin ?? '',
    alignment: m.alignment ?? '',
    xp: m.xp ?? 0,
    source,
  }))
}
