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
// cmd and PowerShell both take a double-quoted path; Windows paths can't contain '"'.
const windowsQuote = (s: string) => /^[\w.:\\/-]+$/.test(s) ? s : `"${s}"`

/** How the app was installed, which decides how the MCP server is started. */
export type McpServer =
  | { sourceRoot: string }                       // a source checkout: from source, in the Nix dev shell
  | { launcher: string, platform: NodeJS.Platform } // an electron-builder build: the app itself with --mcp
  | null                                         // the Nix package: its 4e-dm-dashboard-mcp command

/**
 * The `claude mcp add` line for Settings › AI agent. A connection file other than the default is passed along.
 */
export function mcpSetupCommand(server: McpServer, connectionFile: string, defaultFile = defaultConnectionFile()): string {
  const quote = server && 'launcher' in server && server.platform === 'win32' ? windowsQuote : shellQuote
  const connection = connectionFile === defaultFile ? '' : ` --connection ${quote(connectionFile)}`
  if (!server) return `claude mcp add 4e-dashboard -- ${MCP_COMMAND} --mcp${connection}`
  if ('launcher' in server) return `claude mcp add 4e-dashboard -- ${quote(server.launcher)} --mcp${connection}`
  const { sourceRoot } = server
  const inner = `cd ${shellQuote(sourceRoot)} && exec nix develop --quiet -c npm run --silent authoring -- --mcp${connection}`
  return `claude mcp add 4e-dashboard -- bash -c ${shellQuote(inner)}`
}
