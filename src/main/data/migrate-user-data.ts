import { app } from 'electron'
import { existsSync, readdirSync, renameSync, rmdirSync } from 'fs'
import { join } from 'path'

// The app was renamed from "Tabletop Dashboard" to "4e DM Dashboard" (2026-11),
// which moved Electron's userData dir. Carry the old data over once.
const LEGACY_DIR_NAME = 'tabletop-dashboard'

/** Must run before app 'ready', i.e. before Chromium populates the new userData dir. */
export function migrateLegacyUserData(): void {
  const oldDir = join(app.getPath('appData'), LEGACY_DIR_NAME)
  const newDir = app.getPath('userData')
  if (oldDir === newDir || !existsSync(oldDir)) return

  try {
    if (!existsSync(newDir)) {
      renameSync(oldDir, newDir)
      console.log(`[migrate] Moved ${oldDir} -> ${newDir}`)
      return
    }
    // New dir already exists: move only entries it doesn't have, never overwrite.
    for (const entry of readdirSync(oldDir)) {
      const target = join(newDir, entry)
      if (existsSync(target)) {
        console.warn(`[migrate] Skipping ${entry}: already present in ${newDir}`)
        continue
      }
      renameSync(join(oldDir, entry), target)
    }
    if (readdirSync(oldDir).length === 0) rmdirSync(oldDir)
    else console.warn(`[migrate] Left conflicting entries in ${oldDir}`)
  } catch (err) {
    console.error('[migrate] Failed to migrate legacy user data:', err)
  }
}
