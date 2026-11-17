import type { Disease, Monster, MonsterTemplate, MonsterTheme, SkillChallenge, Trap, Item as KitItem } from '@kit'

/** Campaign presentation that isn't part of the kit content: artwork and its map token. */
export interface RecordArt {
  imageId?: string
  /** Circular token; defaults to a crop of imageId. */
  tokenImageId?: string
  /** Last crop region used to make the token, so re-cropping starts there. */
  tokenCrop?: { x: number; y: number; size: number }
}

/**
 * A campaign's own creature, item, trap, disease, template, theme, or skill challenge: kit content in an envelope.
 * Bookkeeping stays outside `content`, so the content validates against the kit schema
 * and goes to agents or packs unchanged. Stored at campaigns/<id>/<kind dir>/<id>.json.
 */
export interface CampaignRecord<T> {
  id: string
  createdAt: string
  updatedAt: string
  /** The published entry this was cloned from: "published/trap/<compendium id>". */
  basedOn?: string
  content: T
  art?: RecordArt
}

export type CreatureRecord = CampaignRecord<Monster>
export type ItemRecord = CampaignRecord<KitItem>
export type TrapRecord = CampaignRecord<Trap>
export type DiseaseRecord = CampaignRecord<Disease>
export type TemplateRecord = CampaignRecord<MonsterTemplate>
export type ThemeRecord = CampaignRecord<MonsterTheme>
export type ChallengeRecord = CampaignRecord<SkillChallenge>
