/**
 * Simple in-memory clipboard for copying powers between creature stat blocks.
 * Module-level state — shared within the DM renderer window.
 */

import type { PowerEntry } from './PowerEntryEditor'

let clipboard: PowerEntry | null = null
let listeners: (() => void)[] = []

/** Copy a power to the clipboard. Strips template/theme attribution metadata. */
export function copyPower(power: PowerEntry): void {
  const clean = { ...power, damage: [...(power.damage ?? [])] } as any
  delete clean._templateSource
  delete clean._templateSourceIndex
  delete clean._templatePower
  delete clean._themeSource
  clipboard = clean
  listeners.forEach(fn => fn())
}

/** Get a clone of the clipboard contents, or null if empty. */
export function getPastedPower(): PowerEntry | null {
  if (!clipboard) return null
  return { ...clipboard, damage: [...(clipboard.damage ?? [])] }
}

/** Get the name of the power currently in the clipboard (for button labels). */
export function getClipboardPowerName(): string | null {
  return clipboard?.name ?? null
}

/** Subscribe to clipboard changes. Returns an unsubscribe function. */
export function onClipboardChange(fn: () => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}
