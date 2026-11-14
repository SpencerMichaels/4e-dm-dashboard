import { describe, expect, it } from 'vitest'
import type { MonsterTemplate, MonsterTheme } from '@kit'
import { convertTemplate, convertTheme } from './template'
import { kitTemplateToApp, kitThemeToApp } from '../../../src/renderer/components/creature/kit-templates'
import { contentRepoDir, readRepoEntries } from '../repo'

const ctx = { provenance: { origin: 'parser' as const, at: '', by: 'test' } }

// Applying templates and themes is tested on kit monsters (src/main/combat/encounter-adjustments.test.ts);
// the app types only display them in the encounter editor. Published ones come from the content repo.
describe.skipIf(!contentRepoDir())('content repo templates and themes back to the app types', () => {
  const templates = readRepoEntries<MonsterTemplate>('templates')
  const themes = readRepoEntries<MonsterTheme>('themes')
  const actions = (powers: any[]) => powers.map(p => [p.name, p.action, p.usage, JSON.stringify(p.recharge), (p.attacks[0]?.range ?? p.range)?.kind])

  it('keeps every power action, usage, recharge, and range through kit -> app -> kit', () => {
    for (const t of templates) expect(actions(convertTemplate(kitTemplateToApp(t), ctx).powers), t.name).toEqual(actions(t.powers))
    for (const t of themes) expect(actions(convertTheme(kitThemeToApp(t), ctx).powers), t.name).toEqual(actions(t.powers))
  })

  it('keeps the display fields', () => {
    for (const t of templates) {
      const app = kitTemplateToApp(t)
      expect([app.name, app.role, app.prerequisite, app.hpPerLevel, app.savingThrows, app.actionPoints], t.name)
        .toEqual([t.name, t.role, t.prerequisite.text, t.hpPerLevel, t.savingThrows, t.actionPoints])
    }
    for (const t of themes) expect(kitThemeToApp(t).powers.map(p => p.name), t.name).toEqual(t.powers.map(p => p.name))
  })
})
