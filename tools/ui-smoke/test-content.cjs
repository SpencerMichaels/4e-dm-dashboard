// The published content the UI suites run on: the invented content repo in fixtures/content-repo
// (written by fixtures/make-content-repo.cjs; no book content, so the suites run without the private
// content repo, in CI or a public checkout), packed and installed unzipped into a temporary folder.
// The suites point FOUR_E_CONTENT_DIR at it, so they never touch the DM's installed content. `npm run test:ui`
// builds it once per run ($FOUR_E_TEST_CONTENT); a suite run on its own builds its own.

const { spawnSync } = require('child_process')
const { existsSync, mkdtempSync, rmSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')

const root = resolve(__dirname, '../..')

/** Build the test content into a new folder under `parent`; returns its path, or throws. */
function buildTestContent(parent = mkdtempSync(join(tmpdir(), '4e-test-content-'))) {
  const dir = join(parent, 'content')
  const r = spawnSync(join(root, 'node_modules', '.bin', 'tsx'), ['--tsconfig', 'tsconfig.node.json', 'tools/content/pack.ts',
    '--repo', join(__dirname, 'fixtures', 'content-repo'), '--install', dir], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0 || !existsSync(join(dir, 'manifest.json'))) throw new Error('Could not build the UI test content from fixtures/content-repo')
  return dir
}

/** The test content folder: $FOUR_E_TEST_CONTENT, or a fresh one, deleted when the process exits. */
function testContentDir() {
  if (process.env.FOUR_E_TEST_CONTENT) return process.env.FOUR_E_TEST_CONTENT
  const parent = mkdtempSync(join(tmpdir(), '4e-test-content-'))
  process.on('exit', () => rmSync(parent, { recursive: true, force: true }))
  return buildTestContent(parent)
}

module.exports = { buildTestContent, testContentDir }
