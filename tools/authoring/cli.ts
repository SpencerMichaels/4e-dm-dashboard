import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { bridgeCall } from '../../src/main/authoring/bridge'
import { defaultConnectionFile } from '../../src/main/authoring/connection'
import { benchmarks, scaffold, validate, normalizeContent, search } from '../../src/common/authoring/core'
import { itemBenchmarks } from '../../src/common/rules/items'
import { AUTHORING_TOOLS } from './tools'

async function main() {
  const args = process.argv.slice(2)
  const c = args.indexOf('--connection')
  const connection = c >= 0 ? args.splice(c, 2)[1] : process.env.FOUR_E_AUTHORING_CONNECTION || defaultConnectionFile()
  const command = args.shift() ?? 'help'
  if (command === 'help') {
    console.log('4e authoring: <operation> [arguments.json|-] [--connection path]\nUse --mcp for stdio MCP. Standalone: scaffold, benchmarks, validate, search-local. Live operations: ' + AUTHORING_TOOLS.map(t => t.name).join(', '))
    return
  }
  if (command === '--mcp') {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js')
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
    const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')
    const server = new Server({ name: '4e-dm-authoring', version: '1.0.0' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: AUTHORING_TOOLS }))
    server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        if (!AUTHORING_TOOLS.some(t => t.name === request.params.name)) throw new Error('Unknown tool')
        const result = await run(request.params.name, request.params.arguments ?? {})
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (e) { return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] } }
    })
    await server.connect(new StdioServerTransport())
    return
  }
  let inputText = ''
  if (args[0] === '-') { for await (const chunk of process.stdin) inputText += chunk }
  else if (args[0]) inputText = await readFile(args[0], 'utf8')
  const input = inputText ? JSON.parse(inputText) : {}
  console.log(JSON.stringify(await run(command, input), null, 2))

  async function run(method: string, a: any) {
    if (method === 'benchmarks') return a.kind === 'item' ? itemBenchmarks(a.level) : benchmarks(a.level, a.role, a.rank, a.abilities)
    if (method === 'scaffold') return scaffold(a.kind ?? 'monster', a.name, a.level, a.role, a.rank)
    if (method === 'validate') return validate(a.kind, normalizeContent(a.content), a.recipe)
    if (method === 'search-local') {
      // The installed content pack (<userData>/content, beside the connection file), or contentDir.
      const { Catalog } = await import('../../src/main/authoring/catalog')
      return search(await new Catalog(a.contentDir ?? join(dirname(dirname(defaultConnectionFile())), 'content')).entries(), a)
    }
    return bridgeCall(connection, method, a)
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
