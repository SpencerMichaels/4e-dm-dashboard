// Runs the UI smoke suites against a private build, so parallel agents never share state: each run
// builds into .ui-test-builds/<run>/build (inside the checkout, so the bundle finds node_modules),
// runs the suites with that folder as their working directory (screenshots land in <run>/out/), and
// deletes the build afterwards. The screenshots stay until a later run prunes runs over a day old.
//
// Run in the Nix shell: npm run test:ui [-- authoring compendium combat buttons]   (default: all four)

const { spawnSync } = require('child_process')
const { mkdirSync, readdirSync, rmSync, statSync } = require('fs')
const { join, resolve } = require('path')
const { buildTestContent } = require('./test-content.cjs')

const root = resolve(__dirname, '../..')
const SUITES = {
  authoring: 'tools/authoring/smoke-electron.cjs',
  compendium: 'tools/ui-smoke/compendium-smoke.cjs',
  combat: 'tools/ui-smoke/combat-smoke.cjs',
  buttons: 'tools/ui-smoke/button-smoke.cjs',
}
const names = process.argv.slice(2)
const unknown = names.filter(n => !SUITES[n])
if (unknown.length) { console.error(`Unknown suite(s): ${unknown.join(', ')}. Suites: ${Object.keys(SUITES).join(', ')}`); process.exit(2) }
const suites = names.length ? names : Object.keys(SUITES)

const runs = join(root, '.ui-test-builds')
mkdirSync(runs, { recursive: true })
for (const old of readdirSync(runs)) {
  const p = join(runs, old)
  try { if (Date.now() - statSync(p).mtimeMs > 24 * 3600 * 1000) rmSync(p, { recursive: true, force: true }) } catch {}
}
const run = join(runs, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
const build = join(run, 'build')
mkdirSync(join(run, 'out'), { recursive: true })

// Wayland locally; CI runs X11 under xvfb (FOUR_E_OZONE_PLATFORM=x11).
const ozone = process.env.FOUR_E_OZONE_PLATFORM || 'wayland'
const bin = name => join(root, 'node_modules', '.bin', name)
const step = (cmd, args, opts) => spawnSync(cmd, args, { stdio: 'inherit', ...opts }).status ?? 1

let failed = []
try {
  console.log(`Building into ${build}`)
  if (step(bin('electron-vite'), ['build', '--outDir', build], { cwd: root }) !== 0) { failed = ['build']; throw new Error('build failed') }
  // The published content every suite reads (test-content.cjs), built once and deleted with the build.
  const content = buildTestContent(build)
  for (const name of suites) {
    console.log(`\n== ${name}`)
    const env = { ...process.env, FOUR_E_HIDDEN_WINDOWS: '1', FOUR_E_OUT_DIR: build, FOUR_E_TEST_CONTENT: content }
    if (step(bin('electron'), [join(root, SUITES[name]), `--ozone-platform=${ozone}`, '--no-sandbox'], { cwd: run, env }) !== 0) failed.push(name)
  }
} catch (e) {
  if (!failed.length) { failed = ['setup']; console.error(e.message) }
} finally {
  rmSync(build, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${join(run, 'out')}`)
if (failed.length) { console.error(`FAILED: ${failed.join(', ')}`); process.exit(1) }
console.log(`UI suites passed: ${suites.join(', ')}`)
