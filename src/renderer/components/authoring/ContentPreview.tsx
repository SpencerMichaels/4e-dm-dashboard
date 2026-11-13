import type { Content, ContentKind } from '@common/authoring/types'
import type { Monster, Item } from '@kit'
import { monsterToCreature } from '@common/authoring/legacy'
import { withDraftNodes } from '@common/authoring/creature-editor-adapter'
import type { Draft } from '@common/authoring/types'
import { Dnd4eCreatureViewer } from '../creature/Dnd4eCreatureViewer'
import { ItemStatblock } from '../item/ItemStatblock'
import { KitStatblock } from './KitDraftEditor'
import { decorate } from '@common/authoring/kit-editor-adapter'

/** Same legacy projection used for campaign saving; kit content remains intact. */
export function ContentPreview({ content, kind, draft }: { content: Content; kind: ContentKind; draft?: Draft }) {
  if (kind === 'monster') {
    if (!draft) return <Dnd4eCreatureViewer creature={monsterToCreature(content as Monster)} />
    // In the workshop, entries carry node IDs for comment anchors and the description renders as notes below.
    const creature = withDraftNodes(monsterToCreature(content as Monster), draft)
    creature.statBlock.description = ''
    return <Dnd4eCreatureViewer creature={creature} />
  }
  if (kind === 'item') return <ItemStatblock item={draft ? decorate<Item>(draft) : content as Item} />
  // In the Workshop, entries carry their draft node IDs so comment markers anchor to them.
  const tagged = draft ? decorate(draft) : content
  return <KitStatblock kind={kind} content={tagged} />
}
