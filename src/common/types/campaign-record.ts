import type { Disease, MonsterTemplate, MonsterTheme, Trap, Item as KitItem } from '@kit'

/**
 * A campaign's own trap, disease, template, or theme: kit content in an envelope.
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
}

export type ItemRecord = CampaignRecord<KitItem>
export type TrapRecord = CampaignRecord<Trap>
export type DiseaseRecord = CampaignRecord<Disease>
export type TemplateRecord = CampaignRecord<MonsterTemplate>
export type ThemeRecord = CampaignRecord<MonsterTheme>
