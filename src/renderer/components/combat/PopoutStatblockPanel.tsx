import type { Creature, CombatantState } from '@common/types'
import { combatStatBlock } from './combat-view'
import { FloatingPanel } from '../shared/FloatingPanel'
import { Icon } from '../shared/Icon'
import { Dnd4eCreatureViewer } from '../creature/Dnd4eCreatureViewer'
import { useGlossary } from '../compendium/use-glossary'

interface Props {
  combatant: CombatantState
  offsetIndex: number
  onClose: () => void
}

/** Floating window showing a combatant's full stat block. */
export function PopoutStatblockPanel({ combatant, offsetIndex, onClose }: Props) {
  const { tooltip } = useGlossary()

  // Build a synthetic Creature from the combatant state so we can reuse the viewer
  const synthetic: Creature = {
    id: combatant.id,
    name: combatant.name,
    hp: combatant.hp,
    maxHp: combatant.maxHp,
    imageId: combatant.imageId,
    tokenImageId: combatant.tokenImageId,
    statBlock: combatStatBlock(combatant),
    createdAt: '',
    updatedAt: '',
  }

  // Cascade popouts diagonally so multiple windows don't overlap exactly
  const baseX = 80 + offsetIndex * 30
  const baseY = 80 + offsetIndex * 30

  return (
    <FloatingPanel
      title={<><Icon name="file-text" style={{ verticalAlign: '-0.125em' }} /> {combatant.name}</>}
      popoutKey={`combat-statblock:${combatant.id}`} popoutPlace="statblock" windowTitle={combatant.name}
      initialX={baseX}
      initialY={baseY}
      width={420}
      maxHeight="80vh"
      onClose={onClose}
    >
      <Dnd4eCreatureViewer creature={synthetic} tooltip={tooltip} />
    </FloatingPanel>
  )
}
