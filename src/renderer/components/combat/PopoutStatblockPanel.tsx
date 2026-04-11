import type { Creature, CombatantState } from '@common/types'
import { FloatingPanel } from '../shared/FloatingPanel'
import { Dnd4eCreatureViewer } from '../../plugins/dnd-4e/Dnd4eCreatureViewer'
import { useGlossary } from '../../plugins/dnd-4e/use-glossary'

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
    statBlock: combatant.statBlock ?? {},
    createdAt: '',
    updatedAt: '',
  }

  // Cascade popouts diagonally so multiple windows don't overlap exactly
  const baseX = 80 + offsetIndex * 30
  const baseY = 80 + offsetIndex * 30

  return (
    <FloatingPanel
      title={`📑 ${combatant.name}`}
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
