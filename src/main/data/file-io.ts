import { readFile, writeFile, rename, mkdir, readdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

// Atomic write: write to .tmp, then rename
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  const tmpPath = filePath + '.tmp'
  const json = JSON.stringify(data, null, 2)
  await writeFile(tmpPath, json, 'utf-8')
  await rename(tmpPath, filePath)
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch {
    // File may not exist, that's fine
  }
}

export async function listJsonFiles(dirPath: string): Promise<string[]> {
  try {
    const files = await readdir(dirPath)
    return files.filter(f => f.endsWith('.json') && !f.startsWith('_'))
  } catch {
    return []
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true })
  }
}

export async function deleteDir(dirPath: string): Promise<void> {
  const { rm } = await import('fs/promises')
  await rm(dirPath, { recursive: true, force: true })
}

export async function copyFile(src: string, dest: string): Promise<void> {
  const dir = dirname(dest)
  await ensureDir(dir)
  const { copyFile: fsCopy } = await import('fs/promises')
  await fsCopy(src, dest)
}
