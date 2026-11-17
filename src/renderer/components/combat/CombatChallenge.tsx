// The skill challenge of the encounter in combat (RC p. 157: part of a combat encounter), as a strip beside
// Triggered traps: its goal, level and complexity, and its successes and failures, logged as they come.
// The count is the encounter's own (`SkillChallenge.successes`/`failures`), the same one its pages show.

import type { CombatEventType, CombatState, Encounter } from '@common/types'
import { useCampaignStore } from '../../stores/campaign-store'
import { ChallengeCounter } from '../campaign/SkillChallenges'
import { useLiveRecord } from '../treasure/treasure-data'

type AddEvent = (type: CombatEventType, targetId: string, targetName: string, data?: Record<string, unknown>) => void

export function CombatChallenge({ combat, addEvent }: { combat: CombatState; addEvent: AddEvent }) {
  const encounter = useCampaignStore(s => s.encounters.find(e => e.id === combat.encounterId))
  if (!encounter?.challenge) return null
  return <Strip encounter={encounter} addEvent={addEvent} />
}

function Strip({ encounter, addEvent }: { encounter: Encounter; addEvent: AddEvent }) {
  const [e, update] = useLiveRecord(encounter, 'encounter')
  const c = e.challenge!
  const name = c.name || e.name
  return (
    <div className="combat-challenge" style={{ flexShrink: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 6px' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginBottom: 2 }}>
        Skill challenge: <b style={{ color: 'var(--text)' }}>{name}</b> (level {c.level}, complexity {c.complexity})
      </div>
      <ChallengeCounter challenge={c} onChange={challenge => update({ challenge })}
        onCheck={(outcome, count, result) => addEvent('skill-challenge-check', e.id, name, { outcome, count, result })} />
    </div>
  )
}
