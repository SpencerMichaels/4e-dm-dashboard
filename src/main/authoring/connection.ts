import { homedir } from 'os'
import { join } from 'path'

/** The installed MCP server command (`bin/4e-dm-dashboard-mcp` in default.nix). */
export const MCP_COMMAND = '4e-dm-dashboard-mcp'

/**
 * Where the app writes connection.json when it runs with the default userData:
 * Electron's appData folder plus the app name, as app.getPath('userData') resolves it.
 */
export function defaultConnectionFile(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  const appData = platform === 'win32' ? env.APPDATA || join(home, 'AppData', 'Roaming')
    : platform === 'darwin' ? join(home, 'Library', 'Application Support')
    : env.XDG_CONFIG_HOME || join(home, '.config')
  return join(appData, '4e-dm-dashboard', 'authoring', 'connection.json')
}

const shellQuote = (s: string) => /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`

/**
 * The `claude mcp add` line for Settings › AI agent. From a source checkout (`sourceRoot`, the app path
 * when it holds the CLI's source) the server runs in the Nix dev shell; otherwise it is the installed command.
 * A connection file other than the default is passed along.
 */
export function mcpSetupCommand(sourceRoot: string | null, connectionFile: string, defaultFile = defaultConnectionFile()): string {
  const connection = connectionFile === defaultFile ? '' : ` --connection ${shellQuote(connectionFile)}`
  if (!sourceRoot) return `claude mcp add 4e-dashboard -- ${MCP_COMMAND} --mcp${connection}`
  const inner = `cd ${shellQuote(sourceRoot)} && exec nix develop --quiet -c npm run --silent authoring -- --mcp${connection}`
  return `claude mcp add 4e-dashboard -- bash -c ${shellQuote(inner)}`
}
