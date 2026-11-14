// A minimal zip reader and writer on node:zlib, for content packs (docs/content-pack-plan.md).
// It covers what the pack builder writes: stored or deflated entries, UTF-8 names, one disk,
// no zip64, no encryption. The reader refuses anything else rather than guessing.

import { crc32, deflateRawSync, inflateRaw } from 'zlib'
import { promisify } from 'util'

const inflate = promisify(inflateRaw)

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const UTF8 = 0x0800
// 1980-01-01 00:00 in DOS time: packs are reproducible, so no real timestamps.
const DOS_DATE = (0 << 9) | (1 << 5) | 1

export interface ZipFile { name: string; data: Buffer }

/** A zip of `files`, deflated when that is smaller, in the order given. */
export function writeZip(files: ZipFile[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf-8')
    const deflated = deflateRawSync(f.data, { level: 9 })
    const stored = deflated.length >= f.data.length
    const body = stored ? f.data : deflated
    const crc = crc32(f.data)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(LOCAL, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(UTF8, 6)
    head.writeUInt16LE(stored ? 0 : 8, 8)
    head.writeUInt16LE(0, 10)
    head.writeUInt16LE(DOS_DATE, 12)
    head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(body.length, 18)
    head.writeUInt32LE(f.data.length, 22)
    head.writeUInt16LE(name.length, 26)
    head.writeUInt16LE(0, 28)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(CENTRAL, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(UTF8, 8)
    dir.writeUInt16LE(stored ? 0 : 8, 10)
    dir.writeUInt16LE(0, 12)
    dir.writeUInt16LE(DOS_DATE, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(body.length, 20)
    dir.writeUInt32LE(f.data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, name)
    parts.push(head, name, body)
    offset += head.length + name.length + body.length
  }
  if (files.length > 0xfffe || offset > 0xfffffff0) throw new Error('Too large for a zip without zip64')
  const dirSize = central.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dirSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...central, end])
}

export class ZipError extends Error {}

interface Entry { name: string; method: number; crc: number; size: number; csize: number; offset: number }

function entries(zip: Buffer): Entry[] {
  // The end record is the last 22 bytes plus a comment of up to 64 KB.
  let end = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === END) { end = i; break }
  }
  if (end < 0) throw new ZipError('Not a zip file')
  if (zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0) throw new ZipError('Multi-disk zips are not supported')
  const count = zip.readUInt16LE(end + 10)
  let p = zip.readUInt32LE(end + 16)
  if (count === 0xffff || p === 0xffffffff) throw new ZipError('Zip64 is not supported')
  const out: Entry[] = []
  for (let i = 0; i < count; i++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== CENTRAL) throw new ZipError('Damaged zip directory')
    const flags = zip.readUInt16LE(p + 8)
    if (flags & 1) throw new ZipError('Encrypted zips are not supported')
    const nameLen = zip.readUInt16LE(p + 28)
    const entry: Entry = {
      method: zip.readUInt16LE(p + 10),
      crc: zip.readUInt32LE(p + 16),
      csize: zip.readUInt32LE(p + 20),
      size: zip.readUInt32LE(p + 24),
      offset: zip.readUInt32LE(p + 42),
      name: zip.toString('utf-8', p + 46, p + 46 + nameLen),
    }
    if (entry.method !== 0 && entry.method !== 8) throw new ZipError(`Unsupported compression in ${entry.name}`)
    out.push(entry)
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32)
  }
  return out
}

/**
 * Every file in `zip` whose name `accept` allows; any other name (a folder, a path with `..`) is an
 * error. Sizes and CRCs are checked, and inflation stops at the size the directory gives.
 */
export async function readZip(zip: Buffer, accept: (name: string) => boolean): Promise<ZipFile[]> {
  const files: ZipFile[] = []
  const seen = new Set<string>()
  for (const e of entries(zip)) {
    if (!accept(e.name)) throw new ZipError(`Unexpected file in the zip: ${e.name}`)
    if (seen.has(e.name)) throw new ZipError(`Duplicate file in the zip: ${e.name}`)
    seen.add(e.name)
    if (e.offset + 30 > zip.length || zip.readUInt32LE(e.offset) !== LOCAL) throw new ZipError(`Damaged zip entry: ${e.name}`)
    const start = e.offset + 30 + zip.readUInt16LE(e.offset + 26) + zip.readUInt16LE(e.offset + 28)
    if (start + e.csize > zip.length) throw new ZipError(`Truncated zip entry: ${e.name}`)
    const body = zip.subarray(start, start + e.csize)
    let data: Buffer
    try {
      data = e.method === 0 ? Buffer.from(body) : await inflate(body, { maxOutputLength: Math.max(1, e.size) })
    } catch {
      throw new ZipError(`Damaged zip entry: ${e.name}`)
    }
    if (data.length !== e.size || crc32(data) !== e.crc) throw new ZipError(`Damaged zip entry: ${e.name}`)
    files.push({ name: e.name, data })
  }
  return files
}
