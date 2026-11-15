// The UI suites' invented content repo (tools/ui-smoke/fixtures/make-content-repo.cjs) stays valid kit
// content, so the suites exercise the app on content shaped like the real pack.

import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { validateRepo } from './index'

describe('UI test content repo', () => {
  it('has no validation errors', () => {
    const { entries } = validateRepo(join(__dirname, '../../ui-smoke/fixtures/content-repo'))
    expect(entries.filter(e => e.errors.length).map(e => [e.id, e.errors])).toEqual([])
  })
})
