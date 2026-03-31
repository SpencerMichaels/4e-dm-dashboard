import type { PluginUIComponents } from './plugin-types'

const builtinRegistry: Record<string, () => Promise<PluginUIComponents>> = {
  'pathfinder-2e': () => import('./pathfinder-2e').then(m => m.default),
  'dnd-4e': () => import('./dnd-4e').then(m => m.default),
}

const cache = new Map<string, PluginUIComponents>()

export async function getPluginUI(systemId: string): Promise<PluginUIComponents | null> {
  if (cache.has(systemId)) return cache.get(systemId)!
  const loader = builtinRegistry[systemId]
  if (!loader) return null
  const components = await loader()
  cache.set(systemId, components)
  return components
}
