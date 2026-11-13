import { app } from 'electron'
import { join } from 'path'
import { ENTITY_DIRS } from '@common/campaign-records'
import type { EntityType } from '@common/types'

/** App-wide preferences (theme), outside any campaign */
export function getAppSettingsPath(): string {
  return join(app.getPath('userData'), 'app-settings.json')
}

export function getCampaignsRoot(): string {
  return join(app.getPath('userData'), 'campaigns')
}

export function getCampaignDir(campaignId: string): string {
  return join(getCampaignsRoot(), campaignId)
}

export function getEntityDir(campaignId: string, entityType: string): string {
  return join(getCampaignDir(campaignId), ENTITY_DIRS[entityType as EntityType] || entityType)
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
