// D&D 4e creature importer — runtime module
// Reads pre-parsed structured JSON from data/parsed/monsters.json.
// The HTML parser lives in html-parser.ts and is only used by the build script.

import { generateId } from '../../src/common/utils/id'
import type { Creature } from '../../src/common/types'
import parsedMonsters from './data/parsed/monsters.json'

export function parseIwsCreatureId(url: string): string | null {
  const match = url.match(/view=(monster\d+)/)
  return match ? match[1] : null
}

export async function importDnd4eCreature(url: string, warnings: string[] = []): Promise<Creature> {
  const monsterId = parseIwsCreatureId(url)
  if (!monsterId) throw new Error('Could not parse monster ID from URL: ' + url)
  const data = parsedMonsters as Record<string, any>
  const entry = data[monsterId]
  if (!entry) throw new Error('Monster not found: ' + monsterId)

  const now = new Date().toISOString()
  if (entry._importWarnings) warnings.push(...entry._importWarnings)
  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    ...entry,
  }
}
