import { describe, expect, it } from 'vitest'
import { convertTemplate, convertTheme } from './template'
import { MONSTER_TEMPLATES } from '../../../src/renderer/components/creature/monster-templates'
import { MONSTER_THEMES } from '../../../src/renderer/components/creature/monster-themes'
import { kitTemplateToApp, kitThemeToApp } from '../../../src/renderer/components/creature/kit-templates'

const ctx = { provenance: { origin: 'parser' as const, at: '', by: 'test' } }

// Applying templates and themes is tested on kit monsters (src/main/combat/encounter-adjustments.test.ts);
// the app types only display them in the encounter editor.
describe('kit templates and themes back to the app types', () => {
  const actions = (powers: any[]) => powers.map(p => [p.name, p.action, p.usage, JSON.stringify(p.recharge), (p.attacks[0]?.range ?? p.range)?.kind])
  it('keeps every power action, usage, recharge, and range through kit -> app -> kit', () => {
    for (const t of MONSTER_TEMPLATES) {
      const kit = convertTemplate(t, ctx)
      expect(actions(convertTemplate(kitTemplateToApp(kit), ctx).powers), t.name).toEqual(actions(kit.powers))
    }
    for (const t of MONSTER_THEMES) {
      const kit = convertTheme(t, ctx)
      expect(actions(convertTheme(kitThemeToApp(kit), ctx).powers), t.name).toEqual(actions(kit.powers))
    }
  })

  it('keeps the display fields', () => {
    for (const t of MONSTER_TEMPLATES) {
      const back = kitTemplateToApp(convertTemplate(t, ctx))
      expect([back.name, back.role, back.prerequisite, back.hpPerLevel, back.savingThrows, back.actionPoints], t.name).toEqual([t.name, t.role, t.prerequisite, t.hpPerLevel, t.savingThrows, t.actionPoints])
    }
    for (const t of MONSTER_THEMES) expect(kitThemeToApp(convertTheme(t, ctx)).powers.map(p => p.name), t.name).toEqual(t.powers.map(p => p.name))
  })
})
