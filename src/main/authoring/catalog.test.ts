import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), getAppPath: () => tmpdir() } }))
const { Catalog } = await import('./catalog')

const root = mkdtempSync(join(tmpdir(), 'authoring-catalog-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

// From content/raw/monsters.json (monster4940, trimmed to one power).
const MEENLOCK = "<h1 class=monster>Meenlock Stalker<br><span class=type>Small aberrant humanoid</span><br><span class=level>Level 9 Controller<span class=xp> XP 400</span></span></h1><table class=bodytable><tr><td><b>HP</b> 97; <b>Bloodied</b> 48<td class=rightalign><b>Initiative</b> +8<tr><td><b>AC</b> 23, <b>Fortitude</b> 20, <b>Reflex</b> 21, <b>Will</b> 22<td class=rightalign><b>Perception</b>+4<tr><td><b>Speed</b> 5<td class=rightalign>Darkvision<tr><td colspan=2></table><h2>Standard Actions</h2><p class='flavor alt'>➶ <b>Maddening Whispers</b> (psychic) ✦ <b>At-Will</b></p><p class=flavorIndent><i>Attack:</i> Ranged 10 (one creature); +12 vs. Will</p><p class=flavorIndent><i>Hit:</i> 1d6 + 4 psychic damage, and the target is dazed (save ends).</p><p class='flavor alt'><b>Str</b> 10 (+4)                <b>Dex</b> 18 (+8)                <b>Wis</b> 11 (+4)<br><b>Con</b> 17 (+7)                <b>Int</b> 13 (+5)                <b>Cha</b> 20 (+9)</p><p class=flavor><b>Alignment</b> chaotic evil       <b> Languages</b> Common</p><p class=publishedIn>Published in Monster Manual 3, page(s) 132.</p>"

describe('authoring catalog', () => {
  it('converts monsters from the raw HTML, keeping printed hit text for search and fetch', async () => {
    mkdirSync(join(root, 'raw'), { recursive: true })
    writeFileSync(join(root, 'raw', 'monsters.json'), JSON.stringify({ monster4940: MEENLOCK }))
    const entries = await new Catalog(root).entries()
    const meenlock = entries.find(e => e.key === 'published/monster/monster4940')!.content as any
    expect(meenlock.powers[0].attacks[0].hit.text).toBe('1d6 + 4 psychic damage, and the target is dazed (save ends).')
    // Kinds whose files are missing are skipped, not errors.
    expect(entries.filter(e => e.kind === 'item' || e.kind === 'trap' || e.kind === 'disease')).toEqual([])
  })
})
