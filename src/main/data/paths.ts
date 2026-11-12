import { app } from 'electron'
import { join } from 'path'

export function getCampaignsRoot(): string {
  return join(app.getPath('userData'), 'campaigns')
}

export function getCampaignDir(campaignId: string): string {
  return join(getCampaignsRoot(), campaignId)
}

export function getEntityDir(campaignId: string, entityType: string): string {
  // Map entity types to directory names
  const dirMap: Record<string, string> = {
    note: 'story/notes',
    creature: 'creatures',
    encounter: 'encounters',
    location: 'locations',
    item: 'items',
    'player-character': 'player-characters',
    map: 'maps',
  }
  return join(getCampaignDir(campaignId), dirMap[entityType] || entityType)
}

export function getEntityPath(campaignId: string, entityType: string, entityId: string): string {
  return join(getEntityDir(campaignId, entityType), `${entityId}.json`)
}

export function getCampaignMetaPath(campaignId: string): string {
  return join(getCampaignDir(campaignId), 'campaign.json')
}

export function getNoteTreePath(campaignId: string): string {
  return join(getCampaignDir(campaignId), 'story', '_tree.json')
}

export function getLinksPath(campaignId: string): string {
  return join(getCampaignDir(campaignId), 'links.json')
}

export function getAnnotationsPath(campaignId: string): string {
  return join(getCampaignDir(campaignId), 'annotations.json')
}

export function getAssetsDir(campaignId: string): string {
  return join(getCampaignDir(campaignId), 'assets', 'images')
}

export function getUserPluginsDir(): string {
  return join(app.getPath('home'), '.4e-dm-dashboard', 'plugins')
}
