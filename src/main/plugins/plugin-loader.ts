import type { SystemPlugin } from '@common/types'
import { getUserPluginsDir } from '../data/paths'
import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'

const plugins = new Map<string, SystemPlugin>()

export function getPlugin(id: string): SystemPlugin | undefined {
  return plugins.get(id)
}

export function getAllPlugins(): SystemPlugin[] {
  return Array.from(plugins.values())
}

export function registerPlugin(plugin: SystemPlugin): void {
  plugins.set(plugin.id, plugin)
}

export async function loadBuiltinPlugins(): Promise<void> {
  // Built-in plugins are imported directly
  const { default: pf2e } = await import('../../../plugins/pathfinder-2e')
  registerPlugin(pf2e)

  const { default: dnd4e } = await import('../../../plugins/dnd-4e')
  registerPlugin(dnd4e)

  const { default: deltaGreen } = await import('../../../plugins/delta-green')
  registerPlugin(deltaGreen)
}

export async function loadUserPlugins(): Promise<void> {
  const dir = getUserPluginsDir()
  if (!existsSync(dir)) return

  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const indexPath = join(dir, entry.name, 'index.js')
      if (existsSync(indexPath)) {
        try {
          const mod = await import(indexPath)
          const plugin: SystemPlugin = mod.default || mod
          registerPlugin(plugin)
        } catch (err) {
          console.error(`Failed to load user plugin ${entry.name}:`, err)
        }
      }
    }
  }
}
