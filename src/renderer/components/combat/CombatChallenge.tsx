// The skill challenges of the encounter in combat (RC p. 157: part of a combat encounter), as a strip beside
// Triggered traps: each one's name, level and complexity, and its successes and failures, logged as they come.
// The counts are the encounter rows' own (`EncounterChallenge.successes`/`failures`), the same the location page shows.

import type { CombatEventType, CombatState, Encounter, EncounterChallenge } from '@common/types'
import { challengeLevel } from '@common/rules/rewards'
import { partyLevel } from '@common/rules/party'
import { useCampaignStore } from '../../stores/campaign-store'
import { ChallengeCounter } from '../campaign/SkillChallenges'
import { challengeKey, useChallengeFacts } from '../challenge/challenge-refs'
import { useLiveRecord } from '../treasure/treasure-data'

type AddEvent = (type: CombatEventType, targetId: string, targetName: string, data?: Record<string, unknown>) => void

export function CombatChallenge({ combat, addEvent }: { combat: CombatState; addEvent: AddEvent }) {
  const encounter = useCampaignStore(s => s.encounters.find(e => e.id === combat.encounterId))
  if (!encounter?.challenges?.length) return null
  return <Strip encounter={encounter} addEvent={addEvent} />
}

function Strip({ encounter, addEvent }: { encounter: Encounter; addEvent: AddEvent }) {
  const [e, update] = useLiveRecord(encounter, 'encounter')
  const facts = useChallengeFacts()
  const party = partyLevel(useCampaignStore(s => s.playerCharacters))
  const rows = e.challenges ?? []
  const setRow = (key: string, patch: Partial<EncounterChallenge>) => update({ challenges: rows.map(r => challengeKey(r) === key ? { ...r, ...patch } : r) })
  return (
    <div className="combat-challenge" style={{ flexShrink: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 6px' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginBottom: 2 }}>Skill challenges</div>
      {rows.map(row => {
        const f = facts(row)
        if (!f) return null
        const key = challengeKey(row)
        return <div key={key} className="combat-challenge-row">
          <div style={{ fontSize: 'var(--font-size-xs)' }}>
            <b>{f.name}</b> <span style={{ color: 'var(--muted)' }}>(level {challengeLevel(row, f, e.level ?? party)}, complexity {f.complexity})</span>
          </div>
          <ChallengeCounter complexity={f.complexity} progress={row} onChange={p => setRow(key, { successes: p.successes, failures: p.failures })}
            onCheck={(outcome, count, result) => addEvent('skill-challenge-check', key, f.name, { outcome, count, result })} />
        </div>
      })}
    </div>
  )
}
