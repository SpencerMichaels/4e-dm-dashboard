import { create } from 'zustand'
import type { Campaign, Creature, Encounter, Location, Item, PlayerCharacter, Note, NoteTreeNode, LinkIndex, CompendiumAnnotation, MapData } from '@common/types'

export interface CampaignState {
  campaignId: string | null
  campaign: Campaign | null
  creatures: Creature[]
  encounters: Encounter[]
  locations: Location[]
  maps: MapData[]
  items: Item[]
  playerCharacters: PlayerCharacter[]
  notes: Note[]
  noteTree: NoteTreeNode[]
  links: LinkIndex
  annotations: Record<string, CompendiumAnnotation>

  // Actions — populated from IPC broadcasts, not local mutations
  setCampaignState: (state: Partial<CampaignState>) => void
  reset: () => void
}

const initialState = {
  campaignId: null as string | null,
  campaign: null as Campaign | null,
  creatures: [] as Creature[],
  encounters: [] as Encounter[],
  locations: [] as Location[],
  maps: [] as MapData[],
  items: [] as Item[],
  playerCharacters: [] as PlayerCharacter[],
  notes: [] as Note[],
  noteTree: [] as NoteTreeNode[],
  links: { links: [] } as LinkIndex,
  annotations: {} as Record<string, CompendiumAnnotation>,
}

export const useCampaignStore = create<CampaignState>()((set) => ({
  ...initialState,
  setCampaignState: (state) => set(state),
  reset: () => set(initialState),
}))
