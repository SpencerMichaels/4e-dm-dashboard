// The Rewards page: experience and treasure by level frame (the party level an encounter or a treasure is
// planned for). Like the Home board it shows records kept elsewhere in one place: encounters (planned for
// a level, `Encounter.level`, or the party's level now) and treasure (placed in a location or an
// encounter, and added there too), against each level's budget: the XP the next level takes (PHB p. 29)
// and the treasure mode the DM picks for the level: DMG parcels (slots derived from the level and party
// size), RC rolls (rolled treasures as slots), or free (no slots; the bars use the DMG's numbers as a
// guide). Suggest fills the empty slots: money as rolled or printed, items at random from those of the
// slot's level.

import { useEffect, useMemo, useState } from 'react'
import type { Encounter, LevelPlan, Treasure, TreasureMode, TreasureSlot } from '@common/types'
import { MODE_LABELS, planSlots, rollRcLevel, tallyTreasure, treasureBudget, treasureShare, type ItemFacts, type TreasureTally } from '@common/rules/treasure'
import { encounterFrame, xpToNextLevel } from '@common/rules/rewards'
import { useCampaignStore } from '../../stores/campaign-store'
import { useLibraryStore } from '../../stores/library-store'
import { useUiStore } from '../../stores/ui-store'
import { useCampaignActions } from '../../hooks/use-campaign'
import { Icon } from '../shared/Icon'
import { ItemSearch, randomItem, useItemChoices, useItemFacts } from '../treasure/item-refs'
import { TreasureRow } from '../treasure/TreasureRow'
import { createTreasure, gp, levelPlan, planMode, saveLevelPlan, saveTreasure, useParty, usePlaces } from '../treasure/treasure-data'
import { RewardsMeter } from './RewardsMeter'
import '../creature/statblock.css'

const LIST_COLUMNS = 'max-content 1fr 1fr 1fr max-content'
const small = { fontSize: 'var(--font-size-xs)' }

interface LevelSummary {
  level: number
  plan: LevelPlan
  encounters: Encounter[]
  /** XP of the level's encounters, all PCs together. */
  xp: number
  slots: TreasureSlot[]
  budget: { items: number; gp: number }
  tally: TreasureTally
  treasures: Treasure[]
}

/** Every encounter's XP (main resolves each row as combat would), refreshed when what it depends on changes. */
function useEncounterXp(): Record<string, number> {
  const encounters = useCampaignStore(s => s.encounters)
  const locations = useCampaignStore(s => s.locations)
  const creatures = useCampaignStore(s => s.creatures)
  const traps = useCampaignStore(s => s.traps)
  const templates = useCampaignStore(s => s.templates)
  const library = useLibraryStore(s => s.creatures)
  const [xp, setXp] = useState<Record<string, number>>({})
  useEffect(() => {
    let cancelled = false
    void window.api.combat.encounterXp().then(r => { if (!cancelled) setXp(r) })
    return () => { cancelled = true }
  }, [encounters, locations, creatures, traps, templates, library])
  return xp
}

export function RewardsView({ initialLevel }: { initialLevel?: number }) {
  const treasures = useCampaignStore(s => s.treasures)
  const plans = useCampaignStore(s => s.levelPlans)
  const encounters = useCampaignStore(s => s.encounters)
  const party = useParty()
  const facts = useItemFacts()
  const encounterXp = useEncounterXp()
  const { placeOf } = usePlaces()
  const [level, setLevel] = useState(initialLevel ?? party.level ?? 1)

  const summaries = useMemo(() => {
    const frameOf = (e: Encounter) => encounterFrame(e, party.level)
    const levels = new Set<number>([...treasures.map(t => t.level), ...plans.map(p => p.level), ...encounters.flatMap(e => frameOf(e) ?? []), level])
    if (party.level != null) levels.add(party.level)
    return [...levels].sort((a, b) => a - b).map((l): LevelSummary => {
      const plan = levelPlan(plans, l)
      const mode = planMode(plan)
      const here = treasures.filter(t => t.level === l)
      const fights = encounters.filter(e => frameOf(e) === l)
      return {
        level: l, plan, treasures: here, encounters: fights,
        xp: fights.reduce((sum, e) => sum + (encounterXp[e.id] ?? 0), 0),
        slots: planSlots(mode, l, party.size, plan.treasure?.rolled),
        budget: treasureBudget(mode, l, party.size, plan.treasure?.rolled),
        tally: tallyTreasure(here, t => t.item ? facts(t.item) : undefined, t => !!placeOf(t)),
      }
    })
  }, [treasures, plans, encounters, encounterXp, party, facts, placeOf, level])
  const current = summaries.find(s => s.level === level)!

  return (
    <div className="stat-block-4e compendium-split rewards-page">
      <div className="compendium-list" style={{ flex: '0 0 auto', minWidth: 380 }}>
        <div className="sb-header" style={{ flexShrink: 0 }}>
          <span className="sb-name" style={{ flex: 1 }}>Rewards</span>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'normal' }}>{party.size} {party.size === 1 ? 'PC' : 'PCs'}</span>
        </div>
        <div className="sb-subheader" style={{ flexShrink: 0, minHeight: 18 }} aria-hidden />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="sb-columns" style={{ gridTemplateColumns: LIST_COLUMNS }}>
            <span>Level</span><span title="XP per PC from the level's encounters, of what the next level takes">XP per PC</span><span>Magic items</span><span>Monetary</span><span>Treasure</span>
          </div>
          <div className="striped-rows" role="list">
            {summaries.map(s => {
              const items = s.tally.items.found + s.tally.items.placed + s.tally.items.planned
              const money = s.tally.gp.found + s.tally.gp.placed + s.tally.gp.planned
              const need = xpToNextLevel(s.level)
              return (
                <div key={s.level} role="listitem" className="sb-list-row rewards-level-row" aria-selected={s.level === level} onClick={() => setLevel(s.level)}
                  style={{ gridTemplateColumns: LIST_COLUMNS, cursor: 'pointer', padding: '3px var(--space-2)', background: s.level === level ? 'var(--active)' : undefined, fontWeight: s.level === level ? 600 : undefined }}>
                  <span>Level {s.level}{s.level === party.level ? ' (party)' : ''}</span>
                  <span>{Math.round(s.xp / party.size).toLocaleString('en-US')}{need != null ? ` / ${need.toLocaleString('en-US')}` : ''}</span>
                  <span>{items} / {s.budget.items}</span>
                  <span>{gp(money)} / {gp(s.budget.gp)}</span>
                  <span style={{ color: 'var(--muted)' }}>{MODE_LABELS[planMode(s.plan)]}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ color: 'var(--muted)', padding: 'var(--space-2)', flexShrink: 0, fontSize: 'var(--font-size-xs)' }}>
          {encounters.length} {encounters.length === 1 ? 'encounter' : 'encounters'}; {treasures.length} {treasures.length === 1 ? 'treasure' : 'treasures'}, {treasures.filter(t => t.found).length} found
        </div>
      </div>

      <div className="compendium-preview">
        <LevelPane key={level} summary={current} encounterXp={encounterXp} partySize={party.size} isPartyLevel={level === party.level} facts={facts} onLevel={l => setLevel(Math.min(30, Math.max(1, l)))} />
      </div>
    </div>
  )
}

function LevelPane({ summary: s, encounterXp, partySize, isPartyLevel, facts, onLevel }: {
  summary: LevelSummary
  encounterXp: Record<string, number>
  partySize: number
  isPartyLevel: boolean
  facts: (item: Treasure['item']) => ItemFacts | null | undefined
  onLevel: (level: number) => void
}) {
  const choices = useItemChoices()
  const mode = planMode(s.plan)
  const slotKeys = new Set(s.slots.map(x => x.key))
  const filling = (slot: TreasureSlot) => s.treasures.find(t => t.slot === slot.key)
  const emptySlots = s.slots.filter(x => !filling(x))
  const others = s.treasures.filter(t => !t.slot || !slotKeys.has(t.slot))
  const kindOf = (t: Treasure) => treasureShare(t, t.item ? facts(t.item) : undefined).item ? 'item' : 'money'
  const need = xpToNextLevel(s.level)

  const setMode = (m: TreasureMode) => void saveLevelPlan({ ...s.plan, treasure: { ...s.plan.treasure, mode: m } })
  const roll = async () => {
    const slotted = s.treasures.filter(t => t.slot?.startsWith('rc:'))
    if (slotted.length && !window.confirm('Roll this level\'s treasures again? The treasure in the old slots stays, outside the slots.')) return
    await saveLevelPlan({ ...s.plan, treasure: { mode: 'rc', rolled: rollRcLevel(s.level, partySize) } })
    for (const t of slotted) await saveTreasure({ ...t, slot: undefined })
  }
  const suggest = async () => {
    for (const slot of emptySlots) {
      if (slot.kind === 'money') await createTreasure(s.level, { slot: slot.key, money: slotMoney(slot) })
      else {
        const item = randomItem(choices, slot.itemLevel!, slot.rarity)
        if (item) await createTreasure(s.level, { slot: slot.key, item })
      }
    }
  }

  return (
    <div className="stat-block-4e rewards-level">
      <div className="sb-header" style={{ alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <span className="sb-name">Level {s.level}</span>
          <span className="sb-header-actions">
            <button className="sb-icon-btn" onClick={() => onLevel(s.level - 1)} disabled={s.level <= 1} aria-label="Previous level" title="Previous level"><Icon name="chevron-left" /></button>
            <button className="sb-icon-btn" onClick={() => onLevel(s.level + 1)} disabled={s.level >= 30} aria-label="Next level" title="Next level"><Icon name="chevron-right" /></button>
          </span>
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'normal' }}>{isPartyLevel ? 'The party\'s level' : ''}</span>
      </div>
      <div className="sb-subheader" style={{ gap: 8, alignItems: 'center' }}>
        <span>Party of {partySize}{need != null ? `; the next level takes ${need.toLocaleString('en-US')} XP per PC (PHB p. 29)` : ''}</span>
      </div>

      <RewardsMeter xp={need != null ? { perPc: s.xp / partySize, need } : undefined} tally={s.tally} budget={s.budget} budgetLabel={mode === 'free' ? 'DMG budget' : 'budget'} />

      <LevelEncounters level={s.level} encounters={s.encounters} encounterXp={encounterXp} partySize={partySize} />

      <div className="treasure-plan" style={{ borderTop: '1px solid var(--sb-separator)' }}>
        <div className="sb-row" style={{ gap: 8, alignItems: 'center', ...small }}>
          <b className="sb-label">Treasure</b>
          <select className="ghost" value={mode} onChange={e => setMode(e.target.value as TreasureMode)} aria-label="Budget" title="How this level's treasure is budgeted">
            {(Object.keys(MODE_LABELS) as TreasureMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
          </select>
          <span style={{ flex: 1, color: 'var(--muted)' }}>{modeNote(mode, partySize, s.slots.length)}</span>
          {mode === 'rc' && <button className="btn btn-sm" onClick={() => void roll()} title="Roll ten treasures on the RC's Treasure by Party Level table">{s.plan.treasure?.rolled ? 'Roll again' : 'Roll'}</button>}
          {emptySlots.length > 0 && <button className="btn btn-sm" onClick={() => void suggest()} title="Fill the empty slots: money as given, items at random from those of the slot's level">Suggest</button>}
        </div>
      </div>

      {s.slots.length > 0 && (
        <div className="treasure-slots" role="list" aria-label="Slots" style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {s.slots.map(slot => {
            const t = filling(slot)
            return (
              <div key={slot.key} role="listitem" className="treasure-slot" data-slot={slot.key} style={{ borderBottom: '1px solid var(--sb-separator)' }}>
                <div className="sb-row" style={{ gap: 6, alignItems: 'center', ...small }}>
                  <b style={{ minWidth: 70 }}>{slot.label}</b>
                  <span style={{ flex: 1, color: 'var(--muted)' }}>
                    {slot.kind === 'item' ? `Magic item, level ${slot.itemLevel}${slot.rarity ? ` (${slot.rarity})` : ''}` : `${gp(slot.gp ?? 0)}${slot.text ? `: ${slot.text}` : ''}`}
                  </span>
                  {t
                    ? <button className="btn btn-sm" onClick={() => void saveTreasure({ ...t, slot: undefined })} title="Take this treasure out of the slot (it stays at this level)">Empty slot</button>
                    : slot.kind === 'item'
                      ? <ItemSearch level={slot.itemLevel} onAdd={item => void createTreasure(s.level, { slot: slot.key, item })} placeholder="+ Pick an item…" style={{ width: 200 }} />
                      : <button className="btn btn-sm" onClick={() => void createTreasure(s.level, { slot: slot.key, money: slotMoney(slot) })}>+ Add</button>}
                </div>
                {t && <TreasureRow treasure={t} facts={t.item ? facts(t.item) : undefined} />}
              </div>
            )
          })}
        </div>
      )}

      <div className="treasure-others" style={{ borderTop: '1px solid var(--sb-separator)' }}>
        <div className="sb-row" style={{ justifyContent: 'space-between', gap: 6 }}>
          <b className="sb-label">{s.slots.length ? 'Other treasure' : 'Treasure'}</b>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
            <ItemSearch level={s.level} onAdd={item => void createTreasure(s.level, { item })} style={{ flex: 1, maxWidth: 220 }} />
            <button className="btn btn-sm" onClick={() => void createTreasure(s.level, { money: { text: '', gp: 0 } })} title="Add coins, gems, or art objects">+ Money</button>
          </span>
        </div>
        {others.map(t => <TreasureRow key={t.id} treasure={t} facts={t.item ? facts(t.item) : undefined} slots={emptySlots.filter(x => x.kind === kindOf(t))} />)}
        {others.length === 0 && <div style={{ ...small, color: 'var(--muted)', padding: '2px var(--space-2)' }}>{s.slots.length ? 'Treasure outside the slots shows here; it counts toward the bars too.' : 'No treasure at this level yet.'}</div>}
      </div>
    </div>
  )
}

/** The level's encounters (planned for it, or with no level of their own at the party's level): each opens its editor. */
function LevelEncounters({ level, encounters, encounterXp, partySize }: { level: number; encounters: Encounter[]; encounterXp: Record<string, number>; partySize: number }) {
  const setView = useUiStore(s => s.setView)
  const locations = useCampaignStore(s => s.locations)
  const { createEncounter } = useCampaignActions()
  const add = async () => { const e = await createEncounter('New Encounter', level); setView({ type: 'encounter', encounterId: e.id }) }
  return (
    <div className="level-encounters" style={{ borderTop: '1px solid var(--sb-separator)' }}>
      <div className="sb-row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <b className="sb-label">Encounters</b>
        <button className="btn btn-sm" onClick={() => void add()} title={`A new encounter planned for level ${level}`}>+ New encounter</button>
      </div>
      <div className="striped-rows" role="list">
        {encounters.map(e => {
          const xp = encounterXp[e.id]
          const location = locations.find(l => l.id === e.locationId)
          return (
            <div key={e.id} role="listitem" className="sb-list-row sb-row-link level-encounter-row" style={{ height: 22 }}>
              <button className="sb-row-button" onClick={() => setView({ type: 'encounter', encounterId: e.id })}
                title={e.level == null ? 'No level of its own: counted at the party\'s level' : undefined}
                style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name || 'Untitled'}{e.level == null ? ' (party level)' : ''}</span>
                {location && <span style={{ color: 'var(--muted)' }}>{location.name}</span>}
                <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{xp != null ? `${xp.toLocaleString('en-US')} XP (${Math.round(xp / partySize).toLocaleString('en-US')} each)` : ''}</span>
              </button>
            </div>
          )
        })}
      </div>
      {encounters.length === 0 && <div style={{ ...small, color: 'var(--muted)', padding: '2px var(--space-2)' }}>No encounters planned for this level.</div>}
    </div>
  )
}

/** A money slot's treasure: what was rolled, or (a DMG parcel) its value in coins, the first way each parcel is printed. */
const slotMoney = (slot: TreasureSlot) => ({ text: slot.text ?? gp(slot.gp ?? 0), gp: slot.gp ?? 0 })

function modeNote(mode: TreasureMode, partySize: number, slots: number): string {
  const pcs = `${partySize} ${partySize === 1 ? 'PC' : 'PCs'}`
  if (mode === 'dmg') return `${slots} parcels for ${pcs} (DMG p. 125-129${partySize === 5 ? '' : '; the lists are for five, p. 125 adjusts them'})`
  if (mode === 'rc') return `Ten rolled treasures for ${pcs} (RC p. 298-302${partySize === 5 ? '' : '; rolls are ±2 per PC off five'})`
  return 'No slots; the bars compare with the DMG budget'
}
