import { createServer, createConnection } from 'net'
import { mkdir, chmod, unlink } from 'fs/promises'
import { randomBytes, timingSafeEqual } from 'crypto'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { atomicJson, readJson } from './store'

const MAX_BYTES = 2 * 1024 * 1024
export interface ConnectionInfo { version: 1; socket: string; token: string }
export async function startBridge(connectionFile: string, call: (method: string, args: unknown) => Promise<unknown>) {
  const token = randomBytes(32).toString('hex')
  const suffix = randomBytes(12).toString('hex')
  const socket = process.platform === 'win32' ? `\\\\.\\pipe\\4e-authoring-${suffix}` : join(tmpdir(), `4e-authoring-${suffix}.sock`)
  const server = createServer(client => {
    client.setTimeout(15000, () => client.destroy())
    let data = Buffer.alloc(0), handled = false
    client.on('error', () => {})
    client.on('data', async chunk => {
      if (handled) return
      data = Buffer.concat([data, chunk])
      if (data.length > MAX_BYTES) { client.destroy(); return }
      const end = data.indexOf(10)
      if (end < 0) return
      handled = true
      try {
        const request = JSON.parse(data.subarray(0, end).toString('utf8'))
        const supplied = Buffer.from(typeof request.token === 'string' ? request.token : '')
        const expected = Buffer.from(token)
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Unauthorized bridge connection')
        const result = await call(request.method, request.args)
        client.end(JSON.stringify({ result }) + '\n')
      } catch (e) { client.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) + '\n') }
    })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socket, () => { server.off('error', reject); resolve() }) })
  if (process.platform !== 'win32') await chmod(socket, 0o600)
  await mkdir(dirname(connectionFile), { recursive: true, mode: 0o700 })
  await atomicJson(connectionFile, { version: 1, socket, token } satisfies ConnectionInfo)
  return { server, close: async () => {
    server.close()
    if ((await readJson<ConnectionInfo>(connectionFile))?.token === token) await unlink(connectionFile).catch(() => {})
    if (process.platform !== 'win32') await unlink(socket).catch(() => {})
  } }
}

export async function bridgeCall(connectionFile: string, method: string, args: unknown): Promise<unknown> {
  const info = await readJson<ConnectionInfo>(connectionFile)
  if (!info || info.version !== 1) throw new Error('Dashboard is unavailable. Start it and use the connection-file path shown in Authoring.')
  const message = JSON.stringify({ token: info.token, method, args }) + '\n'
  if (Buffer.byteLength(message) > MAX_BYTES) throw new Error('Request exceeds 2 MiB')
  return new Promise((resolve, reject) => {
    const socket = createConnection(info.socket)
    let data = Buffer.alloc(0)
    socket.setTimeout(30000, () => socket.destroy(new Error('Dashboard request timed out')))
    socket.on('error', reject)
    socket.on('connect', () => socket.write(message))
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk])
      if (data.length > 16 * MAX_BYTES) socket.destroy(new Error('Response too large'))
    })
    socket.on('end', () => {
      try { const response = JSON.parse(data.toString('utf8')); if (response.error) reject(new Error(response.error)); else resolve(response.result) } catch (e) { reject(e) }
    })
  })
}
