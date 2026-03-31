import { ipcMain } from 'electron'
import { CMD } from '@common/ipc-channels'
import type { CompendiumEntry } from '@common/types'
import { allParsedMonsters, creatureFromCompendium } from '../../../plugins/dnd-4e/importer'

let indexCache: CompendiumEntry[] | null = null

function buildIndex(): CompendiumEntry[] {
  if (indexCache) return indexCache

  indexCache = []
  for (const [id, entry] of Object.entries(allParsedMonsters)) {
    const sb = (entry as any).statBlock
    if (!sb) continue
    const traits: string[] = sb.traits ?? []
    indexCache.push({
      id,
      name: (entry as any).name ?? 'Unknown',
      level: sb.level ?? 1,
      role: sb.role ?? '',
      modifier: sb.monsterModifier ?? '',
      size: sb.size ?? 'Medium',
      origin: traits[0] ?? '',
      type: traits[1] ?? '',
      alignment: sb.alignment ?? '',
      xp: sb.xp ?? 0,
    })
  }

  // Sort by level then name
  indexCache.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  return indexCache
}

export function registerCompendiumHandlers(): void {
  ipcMain.handle(CMD.COMPENDIUM_INDEX, async (_e, systemId: string): Promise<CompendiumEntry[]> => {
    if (systemId !== 'dnd-4e') return []
    return buildIndex()
  })

  ipcMain.handle(CMD.COMPENDIUM_GET, async (_e, systemId: string, monsterId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    return creatureFromCompendium(monsterId)
  })
}
