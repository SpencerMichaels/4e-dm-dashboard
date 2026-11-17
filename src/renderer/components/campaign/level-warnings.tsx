// Level warnings as 4ecb's builder shows unresolved choices and warnings: a small icon in the
// warning color beside what it concerns, the details in its tooltip. A triangle for a PC off the
// party level, a question mark for a PC with no level.

import type { PlayerCharacter } from '@common/types'
import { isActivePc, pcLevel } from '@common/rules/party'
import { Icon } from '../shared/Icon'

// Tooltips stay short; for a PC two or more levels off, the books' fix is "Making Things Level" (DMG2 p.34).
const name = (pc: PlayerCharacter) => pc.name || 'Unnamed Character'

/** A warning in 4ecb's style: a small icon in the warning color, its text in the tooltip. */
export function WarningIcon({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="level-warning" title={text} style={{ color: 'var(--warning)', display: 'inline-flex', flexShrink: 0 }}>
      <Icon name={icon} label={text} />
    </span>
  )
}

/** Beside the party level: shown when the active PCs' levels differ or one has none. */
export function PartyLevelWarning({ pcs }: { pcs: PlayerCharacter[] }) {
  const active = pcs.filter(isActivePc)
  const leveled = active.filter(pc => pcLevel(pc) != null)
  const unleveled = active.filter(pc => pcLevel(pc) == null)
  const differ = new Set(leveled.map(pcLevel)).size > 1
  if (!differ && unleveled.length === 0) return null
  const lines = [
    differ ? `Levels differ: ${leveled.map(pc => `${name(pc)} ${pcLevel(pc)}`).join(', ')}` : '',
    unleveled.length ? `No level: ${unleveled.map(name).join(', ')}` : '',
  ].filter(Boolean)
  return <WarningIcon icon={differ ? 'triangle-exclamation-point' : 'circle-question-mark'} text={lines.join('\n')} />
}

/** Beside one active PC: shown when its level is off the party level, or it has none. */
export function PcLevelWarning({ pc, partyLevel }: { pc: PlayerCharacter; partyLevel: number | undefined }) {
  if (!isActivePc(pc)) return null
  const level = pcLevel(pc)
  if (level == null) return <WarningIcon icon="circle-question-mark" text="No level" />
  if (partyLevel == null || level === partyLevel) return null
  const gap = Math.abs(level - partyLevel)
  return <WarningIcon icon="triangle-exclamation-point" text={`${gap} level${gap > 1 ? 's' : ''} ${level < partyLevel ? 'below' : 'above'} the party`} />
}
