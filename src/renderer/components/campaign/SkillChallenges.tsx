// Skill challenges (RC pp. 157-159): either part of a combat encounter (its section in the encounter editor)
// or standing on their own on a location ("a skill challenge to cross the bridge in B6"). A standalone
// challenge is stored as an encounter holding only the challenge, so it has a level, variants, treasure,
// XP on the Rewards page and a done flag like any encounter; the location page lists and edits it in place.

import type { Encounter, Location, SkillChallenge } from '@common/types'
import { challengeSuccesses, challengeXp, CHALLENGE_FAILURES, isSkillChallenge } from '@common/rules/rewards'
import { generateId } from '@common/utils/id'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { Icon } from '../shared/Icon'
import { useLiveRecord, useParty } from '../treasure/treasure-data'

const small = { fontSize: 'var(--font-size-xs)' }
const xp = (c: SkillChallenge) => challengeXp(c).toLocaleString('en-US')

/** A challenge's level, complexity (with its successes and XP), and notes; its name too when it is part of a combat. */
function ChallengeFields({ challenge: c, onChange, named }: { challenge: SkillChallenge; onChange: (c: SkillChallenge) => void; named: boolean }) {
  return <>
    <div className="sb-row skill-challenge-fields" style={{ display: 'flex', gap: 6, alignItems: 'center', ...small }}>
      {named && <input className="ghost" value={c.name ?? ''} onChange={e => onChange({ ...c, name: e.target.value || undefined })} placeholder="Goal (e.g. disrupt the ritual)"
        aria-label="Skill challenge goal" style={{ ...small, flex: 1, minWidth: 0 }} />}
      <label style={{ display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }} title="The challenge's level sets its DCs and XP">
        Level<input className="ghost" type="number" min={1} max={30} value={c.level} aria-label="Skill challenge level"
          onChange={e => onChange({ ...c, level: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} style={{ ...small, width: 34, textAlign: 'center' }} />
      </label>
      <select className="ghost" value={c.complexity} onChange={e => onChange({ ...c, complexity: Number(e.target.value) })} aria-label="Skill challenge complexity"
        title="Complexity: the successes needed before 3 failures (RC p. 159)" style={small}>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Complexity {n}: {challengeSuccesses(n)} successes before {CHALLENGE_FAILURES} failures</option>)}
      </select>
      {!named && <span style={{ flex: 1 }} />}
      <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }} title="Complexity x a standard monster of its level (RC p. 293)">{xp(c)} XP</span>
    </div>
    <div className="sb-row" style={{ ...small }}>
      <textarea className="ghost" value={c.notes ?? ''} onChange={e => onChange({ ...c, notes: e.target.value || undefined })} rows={2} aria-label="Skill challenge notes"
        placeholder="Primary skills and DCs, consequences of success and failure" style={{ ...small, width: '100%', resize: 'vertical' }} />
    </div>
  </>
}

/** The encounter editor's skill challenge: part of the fight (usually complexity 1 or 2, standing in for monsters; RC p. 159). */
export function EncounterChallenge({ encounter, frame, save }: { encounter: Encounter; frame: number | undefined; save: (patch: Partial<Encounter>) => void }) {
  const c = encounter.challenge
  const alone = isSkillChallenge(encounter)
  return (
    <div className="encounter-challenge" style={{ borderTop: '1px solid var(--sb-separator)' }}>
      <div className="sb-row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <b className="sb-label">Skill challenge</b>
        {c
          ? <button onClick={() => save({ challenge: undefined })} title="Remove the skill challenge" aria-label="Remove the skill challenge"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="x" /></button>
          : <button className="btn btn-sm" onClick={() => save({ challenge: { level: frame ?? 1, complexity: 1 } })}
              title="A skill challenge during this encounter: complexity x a monster of its level in XP (RC pp. 157-159)">+ Skill challenge</button>}
      </div>
      {c && <ChallengeFields challenge={c} named={!alone} onChange={challenge => save({ challenge })} />}
    </div>
  )
}

/** A location's standalone skill challenges, edited in place: done, name, fields, open in the encounter editor, remove. */
export function LocationChallenges({ location, label, onLocation }: { location: Location; label: React.ReactNode; onLocation: (patch: Partial<Location>) => void }) {
  const encounters = useCampaignStore(s => s.encounters)
  const party = useParty()
  const challenges = encounters.filter(e => e.locationId === location.id && isSkillChallenge(e))
  const add = async () => {
    const now = new Date().toISOString()
    const level = party.level ?? 1
    const e: Encounter = { id: generateId(), name: 'New skill challenge', creatures: [], tags: [], level, challenge: { level, complexity: 1 }, locationId: location.id, createdAt: now, updatedAt: now }
    await window.api.entity.save('encounter', e as unknown as Record<string, unknown>)
    onLocation({ encounterIds: [...(location.encounterIds ?? []), e.id] })
  }
  const remove = async (e: Encounter) => {
    await window.api.entity.delete('encounter', e.id)
    onLocation({ encounterIds: (location.encounterIds ?? []).filter(id => id !== e.id) })
  }
  return (
    <div className="location-challenges" style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        {label}
        <button className="btn btn-sm" onClick={() => void add()} title="A skill challenge here, standing on its own (RC p. 157)">+ Skill challenge</button>
      </div>
      {challenges.map(e => <LocationChallenge key={e.id} encounter={e} onRemove={() => void remove(e)} />)}
    </div>
  )
}

function LocationChallenge({ encounter, onRemove }: { encounter: Encounter; onRemove: () => void }) {
  const [e, update] = useLiveRecord(encounter, 'encounter')
  const setView = useUiStore(s => s.setView)
  const c = e.challenge!
  return (
    <div className="stat-block-4e location-challenge" style={{ marginBottom: 'var(--space-2)' }}>
      <div className="sb-row" style={{ gap: 6, alignItems: 'center', ...small }}>
        <input type="checkbox" checked={!!e.done} onChange={ev => update({ done: ev.target.checked || undefined })} aria-label="Done" title="The party has completed this challenge (RC p. 158: XP either way)" />
        <input className="ghost" value={e.name} onChange={ev => update({ name: ev.target.value })} placeholder="Skill challenge" aria-label="Skill challenge name" style={{ ...small, flex: 1, minWidth: 0, fontWeight: 600 }} />
        <button className="btn btn-sm" onClick={() => setView({ type: 'encounter', encounterId: e.id })} title="Open in the encounter editor (treasure, variants, add combatants)">Open</button>
        <button onClick={onRemove} title="Delete this skill challenge" aria-label="Delete this skill challenge"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="x" /></button>
      </div>
      {/* Its level frame follows the challenge's level while it stands alone. */}
      <ChallengeFields challenge={c} named={false} onChange={challenge => update({ challenge, level: challenge.level })} />
    </div>
  )
}
