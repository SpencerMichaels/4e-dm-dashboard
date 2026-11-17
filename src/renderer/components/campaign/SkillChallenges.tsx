// Skill challenges in encounters (RC p. 157: standing on their own as a noncombat encounter, or part of a combat
// one), by reference to challenge entries (campaign, Shared, published). In the encounter builder each is one
// line like a creature row (level here, complexity, XP), its statblock in the right pane; they're added from the
// builder's Skill challenges tab. A standalone one sits on a location ("a skill challenge to cross the bridge in
// B6") and is stored as an encounter holding only it, so it has a level, variants, treasure, XP on the Rewards
// page and a done flag like any encounter. While one runs, ChallengeCounter counts its successes and failures on
// its row: on the location page (the at-table reference) or in the combat strip. The builder only builds.

import { useEffect, useMemo, useState } from 'react'
import type { SkillChallenge } from '@kit'
import type { ChallengeRecord, Encounter, EncounterChallenge, Location } from '@common/types'
import { challengeLevel, challengeOutcome, challengeSuccesses, challengeXp, CHALLENGE_FAILURES, isSkillChallenge, recordChallengeCheck, type ChallengeProgress } from '@common/rules/rewards'
import { newRecord } from '@common/campaign-records'
import { scaffold } from '@common/authoring/core'
import { generateId } from '@common/utils/id'
import { isActivePc } from '@common/rules/party'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { useUiStore } from '../../stores/ui-store'
import { Icon } from '../shared/Icon'
import { WarningIcon } from './level-warnings'
import { useLiveRecord, useParty } from '../treasure/treasure-data'
import { ChallengeStatblock } from '../challenge/ChallengeStatblock'
import { challengeKey, useChallenge, useChallengeFacts } from '../challenge/challenge-refs'

const small = { fontSize: 'var(--font-size-xs)' }
const now = () => new Date().toISOString()

/** A new skill challenge entry in the open campaign (following the party's level), saved; returns its row reference. */
export async function createChallenge(name = 'New Skill Challenge'): Promise<{ challengeId: string; content: SkillChallenge }> {
  const id = generateId()
  const record = newRecord(id, scaffold('challenge', name) as SkillChallenge, now())
  await window.api.entity.save('challenge', record as unknown as Record<string, unknown>)
  return { challengeId: id, content: record.content }
}

/** The encounter's rows with one more challenge (a challenge appears once; adding it again does nothing). */
export function withChallenge(rows: EncounterChallenge[], ref: EncounterChallenge): EncounterChallenge[] {
  return rows.some(r => challengeKey(r) === challengeKey(ref)) ? rows : [...rows, ref]
}

/**
 * The builder's skill challenges: one line each like a creature row (name, level here, complexity, XP); clicking
 * one shows its statblock in the right pane. A complexity 3+ challenge in a fight gets a warning (DMG2 ch. 3).
 */
export function EncounterChallenges({ encounter, frame, save, selectedKey, onSelect }: {
  encounter: Encounter
  frame: number | undefined
  save: (patch: Partial<Encounter>) => void
  selectedKey: string | null
  onSelect: (key: string | null) => void
}) {
  const facts = useChallengeFacts()
  const rows = encounter.challenges ?? []
  if (!rows.length) return null
  const alone = isSkillChallenge(encounter)
  const update = (key: string, patch: Partial<EncounterChallenge>) => save({ challenges: rows.map(r => challengeKey(r) === key ? { ...r, ...patch } : r) })
  return (
    <div className="encounter-challenges" style={{ borderTop: '1px solid var(--sb-separator)' }}>
      <div className="sb-row"><b className="sb-label">Skill challenges</b></div>
      {rows.map(row => {
        const key = challengeKey(row)
        const f = facts(row)
        const level = challengeLevel(row, f, frame)
        return (
          <div key={key} className="encounter-challenge-row sb-row" onClick={() => onSelect(selectedKey === key ? null : key)}
            style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', background: selectedKey === key ? 'var(--active)' : undefined }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f === undefined ? 'Loading…' : f === null ? 'This skill challenge no longer exists' : f.name}</span>
            {f && !alone && f.complexity >= 3 && <WarningIcon icon="triangle-exclamation-point"
              text={'Complexity 3 or higher in the midst of combat: not enough monsters to keep the characters busy, or the challenge takes too much of the party\'s attention (DMG2 ch. 3, In-Combat Challenges). In a fight, use 1 or 2 (RC p. 159).'} />}
            <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 2, color: 'var(--muted)', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}
              title={f?.level == null ? 'Its level here (it follows the party\'s: empty is the encounter\'s level)' : 'Its level here (empty: its own)'}>
              L<input className="ghost" type="number" min={1} max={30} value={row.level ?? ''} placeholder={String(level)} aria-label="Skill challenge level"
                onChange={e => { const l = Number(e.target.value); update(key, { level: Number.isInteger(l) && l >= 1 && l <= 30 ? l : undefined }) }} style={{ ...small, width: 34, textAlign: 'center' }} />
            </label>
            <span style={{ ...small, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{f ? `Complexity ${f.complexity} · ${challengeXp(level, f.complexity).toLocaleString('en-US')} XP` : ''}</span>
            <button onClick={e => { e.stopPropagation(); save({ challenges: rows.filter(r => challengeKey(r) !== key) }); if (selectedKey === key) onSelect(null) }}
              title="Remove" aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="x" /></button>
          </div>
        )
      })}
    </div>
  )
}

/** A challenge's statblock by reference at a level, with an Edit link to its compendium page for the campaign's own. */
export function ChallengePreview({ challenge: ref, level }: { challenge: EncounterChallenge; level?: number }) {
  const c = useChallenge(ref)
  const setView = useUiStore(s => s.setView)
  if (!c) return null
  return <>
    <ChallengeStatblock challenge={c} level={level} />
    {(ref.challengeId || ref.libraryId) && <div style={{ padding: 'var(--space-2)' }}>
      <button className="btn btn-sm" onClick={() => setView({ type: 'compendium', kind: 'challenge', id: ref.challengeId ?? ref.libraryId })}>Edit on the Skill Challenges page</button>
    </div>}
  </>
}

/** A search over campaign, Shared, and published challenges; Enter adds the first match. */
function ChallengeSearch({ onAdd }: { onAdd: (ref: EncounterChallenge, name: string) => void }) {
  const records = useCampaignStore(s => s.challenges)
  const library = useLibraryStore(s => s.challenges)
  const [published, setPublished] = useState<{ id: string; name: string; level: number }[] | null>(null)
  const [query, setQuery] = useState('')
  // The published index, once there's something to search for.
  useEffect(() => { if (query && !published) void window.api.compendium.kitIndex('challenge').then(setPublished) }, [query, published])
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const label = (level: number | null) => level == null ? 'Party level' : `L${level}`
    return [
      ...records.filter(r => r.content.name.toLowerCase().includes(q)).map(r => ({ ref: { challengeId: r.id }, name: r.content.name, label: `Custom · ${label(r.content.level)}` })),
      ...library.filter(r => r.content.name.toLowerCase().includes(q)).map(r => ({ ref: { libraryId: r.id }, name: r.content.name, label: `Shared · ${label(r.content.level)}` })),
      ...(published ?? []).filter(e => e.name.toLowerCase().includes(q)).map(e => ({ ref: { compendiumId: e.id }, name: e.name, label: label(e.level || null) })),
    ].slice(0, 8)
  }, [query, records, library, published])
  const add = (r: (typeof results)[number]) => { onAdd(r.ref, r.name); setQuery('') }
  return (
    <div className="challenge-search" style={{ position: 'relative', flex: 1, maxWidth: 240 }}>
      <input className="ghost" value={query} onChange={e => setQuery(e.target.value)} placeholder="+ Add a skill challenge…" aria-label="Search skill challenges to add"
        onKeyDown={e => { if (e.key === 'Enter' && results[0]) add(results[0]); if (e.key === 'Escape') setQuery('') }} style={{ ...small, width: '100%' }} />
      {results.length > 0 && (
        <div className="challenge-search-results" role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 6px' }}>
          {results.map(r => (
            <button key={challengeKey(r.ref)} role="option" aria-selected={false} onClick={() => add(r)}
              style={{ ...small, display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0', color: 'inherit', textAlign: 'left' }}>
              <span>{r.name}</span><span style={{ color: 'var(--muted)' }}>{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A location's standalone skill challenges: each an encounter holding one challenge. Added from the challenge
 * search or as a new campaign challenge; shown as its statblock at its level, run with the counter here.
 */
export function LocationChallenges({ location, label, onLocation }: { location: Location; label: React.ReactNode; onLocation: (patch: Partial<Location>) => void }) {
  const encounters = useCampaignStore(s => s.encounters)
  const party = useParty()
  const standalone = encounters.filter(e => e.locationId === location.id && isSkillChallenge(e))
  const place = async (ref: EncounterChallenge, name: string) => {
    const e: Encounter = { id: generateId(), name, creatures: [], tags: [], challenges: [ref], locationId: location.id, createdAt: now(), updatedAt: now() }
    // Planned for the party's level now, like any new encounter (a challenge that follows the party runs at it).
    if (party.level != null) e.level = party.level
    const active = useCampaignStore.getState().playerCharacters.filter(isActivePc).length
    if (active) e.partySize = active
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
          <ChallengeSearch onAdd={(ref, name) => void place(ref, name)} />
          <button className="btn btn-sm" onClick={async () => { const c = await createChallenge(); await place({ challengeId: c.challengeId }, c.content.name) }}
            title="A new skill challenge here (a campaign entry that follows the party's level; edit it here)">+ New</button>
        </span>
      </div>
      {standalone.map(e => <LocationChallenge key={e.id} encounter={e} partyLevel={party.level} onRemove={() => void remove(e)} />)}
    </div>
  )
}

function LocationChallenge({ encounter, partyLevel, onRemove }: { encounter: Encounter; partyLevel: number | undefined; onRemove: () => void }) {
  const [e, update] = useLiveRecord(encounter, 'encounter')
  const setView = useUiStore(s => s.setView)
  const row = e.challenges![0]
  const c = useChallenge(row)
  const record = useCampaignStore(s => row.challengeId ? s.challenges.find(r => r.id === row.challengeId) : undefined)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const level = challengeLevel(row, c, e.level ?? partyLevel)
  return (
    <div className="location-challenge" style={{ marginBottom: 'var(--space-2)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', ...small }}>
        <button onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Collapse' : 'Expand'} aria-label={open ? 'Collapse' : 'Expand'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 4px', display: 'inline-flex' }}><Icon name={open ? 'chevron-down' : 'chevron-right'} /></button>
        <input type="checkbox" checked={!!e.done} onChange={ev => update({ done: ev.target.checked || undefined })} aria-label="Done" title="The party has completed this challenge (RC p. 158: XP either way)" />
        <span style={{ flex: 1, fontWeight: 600 }}>{c === undefined ? 'Loading…' : c === null ? 'This skill challenge no longer exists' : open ? '' : c.name}</span>
        {record && <button className="btn btn-sm" aria-pressed={editing} onClick={() => setEditing(!editing)} title="Edit this campaign's skill challenge here">{editing ? 'Done editing' : 'Edit'}</button>}
        <button className="btn btn-sm" onClick={() => setView({ type: 'encounter', encounterId: e.id })} title="Open it in the encounter builder (level, treasure, variants)">Open</button>
        <button onClick={onRemove} title="Remove this skill challenge from the location (the entry stays)" aria-label="Remove this skill challenge"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="x" /></button>
      </div>
      {open && c && (record && editing
        ? <RecordEditor record={record} onName={name => { if (name && name !== e.name) update({ name }) }} />
        : <ChallengeStatblock challenge={c} level={level} />)}
      {c && <ChallengeCounter complexity={c.complexity} progress={row}
        onChange={p => update({ challenges: [{ ...row, ...p }, ...e.challenges!.slice(1)], done: challengeDone(c.complexity, p, e.done) })} />}
    </div>
  )
}

/** The campaign's own challenge edited in place (its record saved as it changes); a standalone encounter takes its name. */
function RecordEditor({ record, onName }: { record: ChallengeRecord; onName: (name: string) => void }) {
  const [r, update] = useLiveRecord(record, 'challenge')
  return <ChallengeStatblock challenge={r.content} onChange={content => { update({ content }); onName(content.name) }} />
}

/**
 * Successes and failures while a challenge runs: click counts one, right click takes one back; it ends at
 * its successes or three failures (RC p. 158). `onCheck` hears each check and how the challenge ended, if it did.
 */
export function ChallengeCounter({ complexity, progress: p, onChange, onCheck }: {
  complexity: number
  progress: ChallengeProgress
  onChange: (p: ChallengeProgress) => void
  onCheck?: (outcome: 'success' | 'failure', count: string, result: 'success' | 'failure' | undefined) => void
}) {
  const ended = challengeOutcome(complexity, p)
  const goals = { success: challengeSuccesses(complexity), failure: CHALLENGE_FAILURES }
  const count = (outcome: 'success' | 'failure', delta: 1 | -1) => {
    const next = recordChallengeCheck(complexity, { successes: p.successes, failures: p.failures }, outcome, delta)
    if (next.successes === p.successes && next.failures === p.failures) return
    onChange(next)
    if (delta > 0) onCheck?.(outcome, `${next[outcome === 'success' ? 'successes' : 'failures'] ?? 0}/${goals[outcome]}`, challengeOutcome(complexity, next))
  }
  const counter = (outcome: 'success' | 'failure', n: number, text: string) => (
    <button className="btn btn-sm" disabled={!!ended && n < goals[outcome]} onClick={() => count(outcome, 1)}
      onContextMenu={e => { e.preventDefault(); if (n > 0) count(outcome, -1) }}
      title={`A ${outcome} (${goals[outcome]} ${outcome === 'success' ? 'succeed' : 'fail'} the challenge). Right click: take one back`}>
      {text} {n}/{goals[outcome]}
    </button>
  )
  return (
    <div className="sb-row challenge-counter" style={{ display: 'flex', gap: 6, alignItems: 'center', ...small }}>
      {counter('success', p.successes ?? 0, 'Successes')}
      {counter('failure', p.failures ?? 0, 'Failures')}
      {ended && <b className="challenge-result" style={{ color: ended === 'success' ? 'var(--success)' : 'var(--danger)' }}>{ended === 'success' ? 'Succeeded' : 'Failed'}</b>}
      <span style={{ flex: 1 }} />
      {(p.successes || p.failures) && <button className="btn btn-sm" onClick={() => onChange({ successes: undefined, failures: undefined })} title="Clear the count to run it again">Reset</button>}
    </div>
  )
}

/** A standalone challenge is done once it ends (XP either way, RC p. 158); a reset count clears that, otherwise the DM's mark stays. */
const challengeDone = (complexity: number, p: ChallengeProgress, done: boolean | undefined) =>
  challengeOutcome(complexity, p) ? true : p.successes || p.failures ? done : undefined
