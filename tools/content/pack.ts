// Build a content pack (docs/content-pack-plan.md) from the private content repo: its entry folders,
// glossary.json and conditions.json, plus manifest.json with each file's sha256.
//
// Run: npm run content:pack [-- --repo <content repo>] [--out <file.zip>] [--overlay <dir>] [--install <new dir>]
//   repo: $CONTENT_REPO or ~/Projects/4e-content; out: ./4e-content-<version>.zip (gitignored)
//   overlay: a folder laid out like the repo whose files replace or add to the repo's (UI test fixtures)
//   install: write the pack's files unzipped into a new folder, as the app installs them, instead of a zip
//     (the UI suites point FOUR_E_CONTENT_DIR at it; tools/ui-smoke/test-content.cjs)
//
// The pack holds WotC-derived text: never commit or publish it.

import { execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { SCHEMA_VERSION } from '@kit'
import { PACK_DIRS, PACK_FILES, PACK_FORMAT, ENTRY_ID, sha256, type PackManifest } from '../../src/main/content/pack'
import { writeZip, type ZipFile } from '../../src/main/content/zip'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** "2026.11.14-e6b99df", with "-dirty" when the content repo has uncommitted changes. */
function contentVersion(repo: string): string {
  const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
  let rev = 'unversioned'
  try {
    rev = git('rev-parse --short HEAD')
    if (git('status --porcelain')) rev += '-dirty'
  } catch { /* not a git checkout */ }
  return `${date}-${rev}`
}

export function buildPack(repo: string, version: string, overlay?: string): { zip: Buffer; manifest: PackManifest; files: ZipFile[]; warnings: string[] } {
  const files: ZipFile[] = []
  /** The overlay's copy of a file when it has one. */
  const source = (path: string) => overlay && existsSync(join(overlay, path)) ? join(overlay, path) : join(repo, path)
  const warnings: string[] = []
  for (const dir of Object.keys(PACK_DIRS)) {
    let names: string[]
    const list = (root: string) => { try { return readdirSync(join(root, dir)).filter(f => f.endsWith('.json')) } catch { return null } }
    const inRepo = list(repo), inOverlay = overlay ? list(overlay) : null
    if (!inRepo && !inOverlay) { warnings.push(`${dir}/ is missing`); continue }
    names = [...new Set([...inRepo ?? [], ...inOverlay ?? []])].sort()
    for (const name of names) {
      const id = name.slice(0, -5)
      const data = readFileSync(source(join(dir, name)))
      if (!ENTRY_ID.test(id)) { warnings.push(`skipped ${dir}/${name}: not an entry id`); continue }
      let entry: { id?: string }
      try { entry = JSON.parse(data.toString('utf-8')) } catch { warnings.push(`skipped ${dir}/${name}: not valid JSON`); continue }
      // The app reads <dir>/<id>.json, so the file name has to be the entry's id.
      if (entry.id !== id) { warnings.push(`skipped ${dir}/${name}: its id is ${JSON.stringify(entry.id)}`); continue }
      files.push({ name: `${dir}/${name}`, data })
    }
  }
  for (const name of PACK_FILES) {
    try { files.push({ name, data: readFileSync(source(name)) }) } catch { warnings.push(`${name} is missing`) }
  }
  const manifest: PackManifest = {
    format: PACK_FORMAT,
    content: version,
    schema: SCHEMA_VERSION,
    files: Object.fromEntries(files.map(f => [f.name, sha256(f.data)])),
  }
  const all = [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') }, ...files]
  return { zip: writeZip(all), manifest, files: all, warnings }
}

function main() {
  const repo = resolve(arg('repo') ?? process.env.CONTENT_REPO ?? join(homedir(), 'Projects', '4e-content'))
  const version = contentVersion(repo)
  const overlay = arg('overlay') && resolve(arg('overlay')!)
  const { zip, manifest, files, warnings } = buildPack(repo, version, overlay)
  for (const w of warnings) console.warn(`warning: ${w}`)
  const install = arg('install')
  if (install) {
    // Only into a new folder: this never replaces an install (the app's own import does that).
    const dir = resolve(install)
    if (existsSync(dir)) throw new Error(`${dir} already exists`)
    for (const f of files) { mkdirSync(dirname(join(dir, f.name)), { recursive: true }); writeFileSync(join(dir, f.name), f.data) }
    console.log(`Installed content ${version} into ${dir} (${files.length - 1} files)`)
    return
  }
  const out = resolve(arg('out') ?? `4e-content-${version}.zip`)
  writeFileSync(out, zip)
  const counts = Object.keys(PACK_DIRS).map(d => `${Object.keys(manifest.files).filter(f => f.startsWith(`${d}/`)).length} ${d}`)
  console.log(`Wrote ${out} (${(zip.length / 1024 / 1024).toFixed(1)} MB): content ${version}, schema ${manifest.schema}, ${counts.join(', ')}`)
}

if (require.main === module) main()
