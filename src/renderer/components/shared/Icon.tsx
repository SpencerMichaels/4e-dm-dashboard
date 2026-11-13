// Lucide icons by name. Names come from shared tables (src/common/rules/power-card.ts) so the app and
// 4ecb agree on what each action and range shows; only the icons named there are bundled.

import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Bomb, BrickWall, Circle, CircleDashed, CircleDot, Contrast, Dices, Footprints, Minus, MoveUpRight, Pin, PinOff,
  Redo2, Sun, Sword, Target, TriangleRight, Undo2, User, Zap,
} from 'lucide-react'
import { ACTION_TYPE_ICON, RANGE_KIND_ICON } from '@common/rules/power-card'

const ICONS: Record<string, LucideIcon> = {
  bomb: Bomb, 'brick-wall': BrickWall, circle: Circle, 'circle-dashed': CircleDashed, 'circle-dot': CircleDot,
  contrast: Contrast, dices: Dices, footprints: Footprints, minus: Minus, 'move-up-right': MoveUpRight,
  pin: Pin, 'pin-off': PinOff, 'redo-2': Redo2, sun: Sun, sword: Sword, target: Target,
  'triangle-right': TriangleRight, 'undo-2': Undo2, user: User, zap: Zap,
}

/** An icon by name, sized to the surrounding text; unknown names draw nothing. */
export function Icon({ name, label, size = '1em', ...rest }: { name: string; label?: string } & Omit<LucideProps, 'ref'>) {
  const Component = ICONS[name]
  if (!Component) return null
  return <Component size={size} aria-label={label} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} strokeWidth={2.25} {...rest} />
}

const ACTION_WORDS: Record<string, string> = {
  standard: 'Standard action', move: 'Move action', minor: 'Minor action', free: 'Free action',
  'immediate-interrupt': 'Immediate interrupt', 'immediate-reaction': 'Immediate reaction', opportunity: 'Opportunity action',
  'no-action': 'No action', triggered: 'Triggered action',
}

/** The action type's icon (a filled circle for standard actions, as the book prints it). */
export function ActionTypeIcon({ action }: { action?: string }) {
  if (!action || !ACTION_TYPE_ICON[action]) return null
  return <Icon name={ACTION_TYPE_ICON[action]} label={ACTION_WORDS[action] ?? action} fill={action === 'standard' ? 'currentColor' : 'none'} />
}

export function RangeKindIcon({ kind }: { kind?: string }) {
  if (!kind || !RANGE_KIND_ICON[kind]) return null
  return <Icon name={RANGE_KIND_ICON[kind]} label={kind.replace(/-/g, ' ')} />
}
