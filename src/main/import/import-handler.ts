import { ipcMain } from 'electron'
import { CMD } from '@common/ipc-channels'
import { importPf2eCreature } from '../../../plugins/pathfinder-2e/importer'
import * as store from '../data/campaign-store'

export interface ImportResult {
  creature: any
  warnings: string[]
}

export function registerImportHandlers(): void {
  ipcMain.handle(CMD.IMPORT_CREATURE, async (_e, url: string): Promise<ImportResult> => {
    let creature
    const warnings: string[] = []

    if (url.includes('aonprd.com')) {
      creature = await importPf2eCreature(url)
    } else {
      throw new Error('Unsupported import URL. Use aonprd.com (PF2e). For D&D 4e, use the built-in compendium browser.')
    }
    await store.saveEntity('creature', creature)
    return { creature, warnings }
  })
}
