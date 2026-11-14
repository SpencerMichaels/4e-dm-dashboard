import { describe, it, expect } from 'vitest'
import { defaultConnectionFile, mcpSetupCommand } from './connection'

describe('defaultConnectionFile', () => {
  it('follows XDG_CONFIG_HOME on Linux, as Electron does', () => {
    expect(defaultConnectionFile({}, 'linux', '/home/dm')).toBe('/home/dm/.config/4e-dm-dashboard/authoring/connection.json')
    expect(defaultConnectionFile({ XDG_CONFIG_HOME: '/x/cfg' }, 'linux', '/home/dm')).toBe('/x/cfg/4e-dm-dashboard/authoring/connection.json')
    expect(defaultConnectionFile({ XDG_CONFIG_HOME: '' }, 'linux', '/home/dm')).toBe('/home/dm/.config/4e-dm-dashboard/authoring/connection.json')
  })
  it('uses Application Support on macOS', () => {
    expect(defaultConnectionFile({}, 'darwin', '/Users/dm')).toBe('/Users/dm/Library/Application Support/4e-dm-dashboard/authoring/connection.json')
  })
})

describe('mcpSetupCommand', () => {
  const file = '/home/dm/.config/4e-dm-dashboard/authoring/connection.json'
  it('uses the installed command outside a source checkout', () => {
    expect(mcpSetupCommand(null, file, file)).toBe('claude mcp add 4e-dashboard -- 4e-dm-dashboard-mcp --mcp')
  })
  it('runs the source in the Nix shell from a checkout', () => {
    expect(mcpSetupCommand('/home/dm/td', file, file)).toBe(
      `claude mcp add 4e-dashboard -- bash -c 'cd /home/dm/td && exec nix develop --quiet -c npm run --silent authoring -- --mcp'`)
  })
  it('passes a non-default connection file, quoted', () => {
    expect(mcpSetupCommand(null, '/tmp/my data/connection.json', file)).toBe(
      `claude mcp add 4e-dashboard -- 4e-dm-dashboard-mcp --mcp --connection '/tmp/my data/connection.json'`)
    expect(mcpSetupCommand('/src', '/tmp/a b/c.json', file)).toBe(
      `claude mcp add 4e-dashboard -- bash -c 'cd /src && exec nix develop --quiet -c npm run --silent authoring -- --mcp --connection '\\''/tmp/a b/c.json'\\'''`)
  })
})
