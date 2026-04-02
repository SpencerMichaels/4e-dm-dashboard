import { ipcMain } from 'electron'
import { CMD } from '@common/ipc-channels'
import type { CompendiumEntry, ItemIndexEntry } from '@common/types'
import { allParsedMonsters, creatureFromCompendium, allParsedItems } from '../../../plugins/dnd-4e/importer'

let monsterIndexCache: CompendiumEntry[] | null = null
let itemIndexCache: ItemIndexEntry[] | null = null

function buildMonsterIndex(): CompendiumEntry[] {
  if (monsterIndexCache) return monsterIndexCache
  monsterIndexCache = []
  for (const [id, entry] of Object.entries(allParsedMonsters)) {
    const sb = (entry as any).statBlock
    if (!sb) continue
    monsterIndexCache.push({
      id, name: (entry as any).name ?? 'Unknown',
      level: sb.level ?? 1, role: sb.role ?? '', modifier: sb.monsterModifier ?? '',
      size: sb.size ?? 'Medium', origin: sb.origin ?? '', type: sb.creatureType ?? '',
      alignment: sb.alignment ?? '', xp: sb.xp ?? 0,
    })
  }
  monsterIndexCache.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  return monsterIndexCache
}

function buildItemIndex(): ItemIndexEntry[] {
  if (itemIndexCache) return itemIndexCache
  itemIndexCache = []
  for (const [id, item] of Object.entries(allParsedItems)) {
    const i = item as any
    itemIndexCache.push({
      id, name: i.name ?? 'Unknown',
      category: i.category ?? 'item',
      level: i.level ?? 0,
      rarity: i.rarity ?? '',
      price: i.price ?? '',
      slot: i.slot ?? '',
    })
  }
  itemIndexCache.sort((a, b) => a.name.localeCompare(b.name))
  return itemIndexCache
}

export function registerCompendiumHandlers(): void {
  ipcMain.handle(CMD.COMPENDIUM_INDEX, async (_e, systemId: string) => {
    if (systemId !== 'dnd-4e') return []
    return buildMonsterIndex()
  })

  ipcMain.handle(CMD.COMPENDIUM_GET, async (_e, systemId: string, monsterId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    return creatureFromCompendium(monsterId)
  })

  ipcMain.handle(CMD.COMPENDIUM_ITEM_INDEX, async (_e, systemId: string) => {
    if (systemId !== 'dnd-4e') return []
    return buildItemIndex()
  })

  ipcMain.handle(CMD.COMPENDIUM_ITEM_GET, async (_e, systemId: string, itemId: string) => {
    if (systemId !== 'dnd-4e') throw new Error('Unsupported system: ' + systemId)
    const item = allParsedItems[itemId]
    if (!item) throw new Error('Item not found: ' + itemId)
    return item
  })
}
