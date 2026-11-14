import { describe, expect, it } from 'vitest'
import type { PlayerCharacter } from '../types'
import { partyLevel, pcLevel } from './party'

const pc = (patch: Partial<PlayerCharacter>): PlayerCharacter => ({ id: 'pc', name: 'PC', playerName: '', createdAt: '', updatedAt: '', ...patch })
const sheet = (level: number) => ({ level }) as PlayerCharacter['sheet']

describe('party level', () => {
  it("takes a PC's level from the sheet before the level the DM set", () => {
    expect(pcLevel(pc({ level: 3, sheet: sheet(5) }))).toBe(5)
    expect(pcLevel(pc({ level: 3 }))).toBe(3)
    expect(pcLevel(pc({}))).toBeUndefined()
  })

  it('is the most common level among the active PCs with a level', () => {
    expect(partyLevel([pc({ level: 3 }), pc({ level: 5 }), pc({ sheet: sheet(5) }), pc({ level: 9 })])).toBe(5)
    expect(partyLevel([pc({ level: 3 }), pc({ level: 3 }), pc({ level: 5, active: false }), pc({ level: 5, active: false }), pc({ level: 5 }), pc({})])).toBe(3)
  })

  it('takes the higher level on a tie', () => {
    expect(partyLevel([pc({ level: 4 }), pc({ level: 6 })])).toBe(6)
    expect(partyLevel([pc({ level: 6 }), pc({ level: 4 }), pc({ level: 4 }), pc({ level: 6 })])).toBe(6)
  })

  it('is undefined with no active PC that has a level', () => {
    expect(partyLevel([])).toBeUndefined()
    expect(partyLevel([pc({}), pc({ level: 4, active: false })])).toBeUndefined()
  })
})
