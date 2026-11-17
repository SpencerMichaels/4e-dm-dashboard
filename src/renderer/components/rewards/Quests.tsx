// Quests: an XP (and treasure) reward for reaching a goal, planned for a level like an encounter. Their XP
// comes from their kind and level (`questXp`: Minor shares one monster's XP, Moderate gives each PC half a
// monster's, Major a whole one's). Listed by level on the Rewards page and by place on a location's page;
// each row's reward treasure opens under it (the same treasure records, placed on the quest).

import { useState } from 'react'
import type { Quest, QuestKind } from '@common/types'
import { QUEST_KIND_LABELS, questXp } from '@common/rules/rewards'
import { useCampaignStore } from '../../stores/campaign-store'
import { Icon } from '../shared/Icon'
import { TreasureSection } from '../treasure/TreasureSection'
import { createQuest, useLiveRecord, useParty } from '../treasure/treasure-data'

const small = { fontSize: 'var(--font-size-xs)' }
const KINDS = Object.keys(QUEST_KIND_LABELS) as QuestKind[]
const xpEach = (kind: QuestKind, level: number, size: number) => Math.round(questXp(kind, level, size) / size).toLocaleString('en-US')

/** The quests of a level (Rewards) or of a location; adding one plans it for that level, or the party's level now. */
export function QuestSection({ level, locationId, label }: { level?: number; locationId?: string; label?: React.ReactNode }) {
  const quests = useCampaignStore(s => s.quests)
  const party = useParty()
  const shown = quests
    .filter(q => level != null ? q.level === level : q.locationId === locationId)
    .sort((a, b) => a.level - b.level || a.createdAt.localeCompare(b.createdAt))
  const add = () => void createQuest({ level: level ?? party.level ?? 1, locationId })
  return (
    <div className="quest-section" style={label ? { marginBottom: 'var(--space-3)' } : { borderTop: '1px solid var(--sb-separator)' }}>
      <div className={label ? undefined : 'sb-row'} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        {label ?? <b className="sb-label">Quests</b>}
        <button className="btn btn-sm" onClick={add} title="A quest: XP and treasure for reaching its goal (DMG p. 122)">+ Quest</button>
      </div>
      {shown.map(q => <QuestRow key={q.id} quest={q} partySize={party.size} showLevel={level == null} showLocation={locationId == null} />)}
      {shown.length === 0 && <div style={{ ...small, color: 'var(--muted)', padding: '2px var(--space-2)' }}>{level != null ? 'No quests planned for this level.' : 'No quests here.'}</div>}
    </div>
  )
}

function QuestRow({ quest, partySize, showLevel, showLocation }: { quest: Quest; partySize: number; showLevel: boolean; showLocation: boolean }) {
  const [q, update] = useLiveRecord(quest, 'quest')
  const locations = useCampaignStore(s => s.locations)
  const treasures = useCampaignStore(s => s.treasures)
  const [open, setOpen] = useState(false)
  const rewards = treasures.filter(t => t.questId === q.id).length
  const kindTitle: Record<QuestKind, string> = {
    minor: 'One monster of its level, shared by the party (DMG p. 122, RC p. 294)',
    moderate: 'Half a monster of its level to each PC: the RC\'s weightier minor quest (RC p. 295)',
    major: 'One monster of its level to each PC, a whole encounter\'s worth (DMG p. 122, RC p. 294)',
  }
  return (
    <div className="quest-row-wrap">
      <div className="quest-row sb-row" style={{ gap: 6, alignItems: 'center', ...small }}>
        <input type="checkbox" checked={!!q.done} onChange={e => update({ done: e.target.checked || undefined })} title="The party has completed this quest" aria-label="Done" />
        <input className="ghost" value={q.name} onChange={e => update({ name: e.target.value })} placeholder="Quest" aria-label="Quest name" style={{ ...small, flex: 1, minWidth: 0, fontWeight: 600 }} />
        <select className="ghost" value={q.kind} onChange={e => update({ kind: e.target.value as QuestKind })} aria-label="Quest kind" title={kindTitle[q.kind]} style={small}>
          {KINDS.map(k => <option key={k} value={k} title={kindTitle[k]}>{QUEST_KIND_LABELS[k]} ({xpEach(k, q.level, partySize)} XP each)</option>)}
        </select>
        {showLevel && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--muted)', whiteSpace: 'nowrap' }} title="The quest's level (its XP, and the level it is planned for)">
            L<input className="ghost" type="number" min={1} max={30} value={q.level} aria-label="Quest level"
              onChange={e => update({ level: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} style={{ ...small, width: 34, textAlign: 'center' }} />
          </label>
        )}
        {showLocation && (
          <select className="ghost" value={q.locationId ?? ''} onChange={e => update({ locationId: e.target.value || undefined })} aria-label="Quest location" title="Where the quest is set"
            style={{ ...small, maxWidth: 140, color: q.locationId ? 'inherit' : 'var(--muted)' }}>
            <option value="">No location</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <button className="btn btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open} title="The treasure this quest rewards">
          Reward{rewards ? ` (${rewards})` : ''}
        </button>
        <button onClick={() => void window.api.entity.delete('quest', q.id)} title="Remove this quest" aria-label="Remove this quest"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="x" /></button>
      </div>
      {open && <div style={{ paddingLeft: 'var(--space-4)' }}><TreasureSection place={{ questId: q.id }} level={q.level} encounterStyle /></div>}
    </div>
  )
}
