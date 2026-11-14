// Lucide icons by name (kebab case, as lucide.dev lists them: "app-window", "flame"). Names also come from
// shared tables (src/common/rules/power-card.ts, condition and damage-type styles) so the app and 4ecb agree
// on what each action, range, and condition shows. A desktop app, so the whole icon set is bundled.

import type { LucideIcon, LucideProps } from 'lucide-react'
import { icons } from 'lucide-react'
import { ACTION_TYPE_ICON, RANGE_KIND_ICON } from '@common/rules/power-card'

const pascal = (name: string) => name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())

/** The Lucide component for a kebab-case name, if there is one. */
export const lucideIcon = (name: string): LucideIcon | undefined => (icons as Record<string, LucideIcon>)[pascal(name)]

/** An icon by name, sized to the surrounding text; unknown names draw nothing. */
export function Icon({ name, label, size = '1em', ...rest }: { name: string; label?: string } & Omit<LucideProps, 'ref'>) {
  const Component = lucideIcon(name)
  if (!Component) return null
  return <Component size={size} aria-label={label} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} strokeWidth={2.25} {...rest} />
}

/**
 * An icon that may be a Lucide name or text: condition, mark, and damage-type icons are Lucide names, but a
 * DM's custom condition can carry any emoji or text, which draws as itself.
 */
export function Glyph({ icon, label, size = '1em' }: { icon: string; label?: string; size?: string | number }) {
  if (lucideIcon(icon)) return <Icon name={icon} label={label} size={size} style={{ verticalAlign: '-0.125em' }} />
  return <span role={label ? 'img' : undefined} aria-label={label}>{icon}</span>
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
