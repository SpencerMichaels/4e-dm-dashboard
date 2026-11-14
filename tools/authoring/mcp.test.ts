import { it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { startBridge, bridgeCall } from '../../src/main/authoring/bridge'
import { AuthoringService } from '../../src/main/authoring/service'
import { readJson } from '../../src/main/authoring/store'

it('negotiates MCP and completes draft/feedback tools without exposing approval', async () => {
  const root = await mkdtemp(join(tmpdir(), '4e-mcp-'))
  const service = new AuthoringService(root, join(root, 'empty-compendium'))
  const connection = join(root, 'connection.json')
  const bridge = await startBridge(connection, (method, args) => service.call(method, args, 'agent'))
  const client = new Client({ name: 'test-client', version: '1' })
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', 'tsconfig.node.json', 'tools/authoring/cli.ts', '--mcp', '--connection', connection], cwd: process.cwd() }))
    const tools = await client.listTools()
    expect(tools.tools.some(t => t.name === 'approve')).toBe(false)
    expect(tools.tools.some(t => t.name === 'suggest_numbers')).toBe(true)
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args })
      if (result.isError) throw new Error(JSON.stringify(result.content))
      return JSON.parse((result.content as { text: string }[])[0].text)
    }
    // New content goes into a campaign: without one it is refused.
    await expect(call('create_draft', { kind: 'monster', name: 'Synthetic test', level: 7, role: 'lurker' })).rejects.toThrow('needs a home')
    await mkdir(join(root, 'campaigns', 'c1'), { recursive: true })
    await writeFile(join(root, 'campaigns', 'c1', 'campaign.json'), JSON.stringify({ id: 'c1', name: 'Test' }))
    const d = await call('create_draft', { kind: 'monster', name: 'Synthetic test', level: 7, role: 'lurker', destinations: [{ type: 'campaign', id: 'c1' }] })
    await service.drafts.patch({ id: d.id, revision: 1, changes: [{ path: '/content/hp', value: 40 }] }, 'dm')
    await service.drafts.comment(d.id, 'Keep the low HP', '/content/hp', 'dm')
    const current = await call('get_draft', { id: d.id })
    expect(current.content.hp).toBe(40)
    expect(current.comments).toHaveLength(1)
    const proposal = await call('suggest_numbers', { id: d.id, recipe: { hpMultiplier: 2 } })
    expect(proposal.protectedFields).toContain('/content/hp')
    await call('review', { id: d.id, revision: 2, assumptions: 'Single creature.', findings: [] })
    expect((await call('get_draft', { id: d.id })).review.revision).toBe(2)
    await expect(bridgeCall(connection, 'approve', { id: d.id })).rejects.toThrow('Unknown authoring operation')
    const wrong = join(root, 'wrong.json')
    await writeFile(wrong, JSON.stringify({ ...await readJson<any>(connection), token: 'incorrect' }))
    await expect(bridgeCall(wrong, 'list_drafts', {})).rejects.toThrow('Unauthorized')
  } finally { await client.close(); await bridge.close(); await rm(root, { recursive: true, force: true }) }
}, 20000)

// The installed server (`4e-dm-dashboard-mcp`, default.nix) is the bundled CLI run by Electron as Node.
// Needs `npm run build`; uses the Nix shell's Electron when present, else Node.
const built = join(process.cwd(), 'out/main/authoring-cli.js')
const electron = process.env.ELECTRON_OVERRIDE_DIST_PATH ? join(process.env.ELECTRON_OVERRIDE_DIST_PATH, 'electron') : null
it.skipIf(!existsSync(built))('serves MCP from the built bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), '4e-mcp-built-'))
  const service = new AuthoringService(root, join(root, 'empty-compendium'))
  const connection = join(root, 'connection.json')
  const bridge = await startBridge(connection, (method, args) => service.call(method, args, 'agent'))
  const client = new Client({ name: 'test-client', version: '1' })
  try {
    await client.connect(new StdioClientTransport({
      command: electron ?? process.execPath, args: [built, '--mcp', '--connection', connection], cwd: root,
      env: { ...process.env as Record<string, string>, ELECTRON_RUN_AS_NODE: '1' },
    }))
    expect((await client.listTools()).tools.some(t => t.name === 'current_entry')).toBe(true)
    const result = await client.callTool({ name: 'current_entry', arguments: {} })
    expect(result.isError).toBeFalsy()
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual({ open: null })
  } finally { await client.close(); await bridge.close(); await rm(root, { recursive: true, force: true }) }
}, 20000)
