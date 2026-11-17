import { nanoid } from 'nanoid'

/**
 * A 12-character random id. It never starts with "_": entity files are named by id, and files starting
 * with "_" are the app's own (`_legacy-*.json` backups), which entity listings skip (`listJsonFiles`).
 * Nor with "-", which reads as a flag in a shell.
 */
export function generateId(): string {
  for (;;) {
    const id = nanoid(12)
    if (id[0] !== '_' && id[0] !== '-') return id
  }
}
