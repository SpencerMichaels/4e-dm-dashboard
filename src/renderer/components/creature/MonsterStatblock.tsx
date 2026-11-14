// A kit Monster as its printed stat block (the creature viewer, with art and pop-out). Editing is the
// entry's working-copy editor (authoring/EntryEditor), the same for every campaign entry.

import type { StatblockProps } from '../compendium/RecordCompendium'
import type { Monster } from '@kit'
import { withDraftNodes } from '@common/authoring/creature-editor-adapter'
import { useGlossary } from '../compendium/use-glossary'
import { Dnd4eCreatureViewer } from './Dnd4eCreatureViewer'
import { kitViewCreature } from './kit-view'

export function MonsterStatblock({ value, draft, art, onArtChange, onPopout }: StatblockProps<Monster>) {
  const { tooltip } = useGlossary()
  // With a working copy, entries carry its node ids so comment markers anchor to them.
  const creature = kitViewCreature(value, undefined, { ...art })
  return <Dnd4eCreatureViewer creature={draft ? withDraftNodes(creature, draft) : creature} tooltip={tooltip}
    onImageChange={onArtChange && (imageId => onArtChange({ imageId }))}
    onTokenChange={onArtChange && ((tokenImageId, tokenCrop) => onArtChange({ tokenImageId, tokenCrop }))}
    onPopout={onPopout} />
}
