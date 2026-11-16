// The Treasure page: the campaign's treasure by level frame (the party level it is planned for). Like the
// Home board it shows records kept elsewhere (each treasure is placed in a location or an encounter, and
// added there too) in one place, here against each level's budget. A level's budget comes from the mode
// the DM picks for it: DMG parcels (slots derived from the level and party size), RC rolls (rolled
// treasures as slots), or free (no slots; the bars use the DMG's numbers as a guide). Suggest fills the
// empty slots: money as rolled or printed, items at random from those of the slot's level.

import { useMemo, useState } from 'react'
import type { LevelPlan, Treasure, TreasureMode, TreasureSlot } from '@common/types'
import { MODE_LABELS, planSlots, rollRcLevel, tallyTreasure, treasureBudget, treasureShare, type ItemFacts, type TreasureTally } from '@common/rules/treasure'
import { useCampaignStore } from '../../stores/campaign-store'
import { Icon } from '../shared/Icon'
import { ItemSearch, randomItem, useItemChoices, useItemFacts } from './item-refs'
import { TreasureMeter } from './TreasureMeter'
import { TreasureRow } from './TreasureRow'
import { createTreasure, gp, levelPlan, planMode, saveLevelPlan, saveTreasure, useParty, usePlaces } from './treasure-data'
import '../creature/statblock.css'

const LIST_COLUMNS = 'max-content 1fr 1fr max-content'
const small = { fontSize: 'var(--font-size-xs)' }

interface LevelSummary { level: number; plan: LevelPlan; slots: TreasureSlot[]; budget: { items: number; gp: number }; tally: TreasureTally; treasures: Treasure[] }

export function TreasureView({ initialLevel }: { initialLevel?: number }) {
  const treasures = useCampaignStore(s => s.treasures)
  const plans = useCampaignStore(s => s.levelPlans)
  const party = useParty()
  const facts = useItemFacts()
  const { placeOf } = usePlaces()
  const [level, setLevel] = useState(initialLevel ?? party.level ?? 1)

  const summaries = useMemo(() => {
    const levels = new Set<number>([...treasures.map(t => t.level), ...plans.map(p => p.level), level])
    if (party.level != null) levels.add(party.level)
    return [...levels].sort((a, b) => a - b).map((l): LevelSummary => {
      const plan = levelPlan(plans, l)
      const mode = planMode(plan)
      const here = treasures.filter(t => t.level === l)
      return {
        level: l, plan, treasures: here,
        slots: planSlots(mode, l, party.size, plan.treasure?.rolled),
        budget: treasureBudget(mode, l, party.size, plan.treasure?.rolled),
        tally: tallyTreasure(here, t => t.item ? facts(t.item) : undefined, t => !!placeOf(t)),
      }
    })
  }, [treasures, plans, party, facts, placeOf, level])
  const current = summaries.find(s => s.level === level)!

  return (
    <div className="stat-block-4e compendium-split treasure-page">
      <div className="compendium-list" style={{ flex: '0 0 auto', minWidth: 320 }}>
        <div className="sb-header" style={{ flexShrink: 0 }}>
          <span className="sb-name" style={{ flex: 1 }}>Treasure</span>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'normal' }}>{party.size} {party.size === 1 ? 'PC' : 'PCs'}</span>
        </div>
        <div className="sb-subheader" style={{ flexShrink: 0, minHeight: 18 }} aria-hidden />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="sb-columns" style={{ gridTemplateColumns: LIST_COLUMNS }}>
            <span>Level</span><span>Magic items</span><span>Monetary</span><span>Budget</span>
          </div>
          <div className="striped-rows" role="list">
            {summaries.map(s => {
              const items = s.tally.items.found + s.tally.items.placed + s.tally.items.planned
              const money = s.tally.gp.found + s.tally.gp.placed + s.tally.gp.planned
              return (
                <div key={s.level} role="listitem" className="sb-list-row treasure-level-row" aria-selected={s.level === level} onClick={() => setLevel(s.level)}
                  style={{ gridTemplateColumns: LIST_COLUMNS, cursor: 'pointer', padding: '3px var(--space-2)', background: s.level === level ? 'var(--active)' : undefined, fontWeight: s.level === level ? 600 : undefined }}>
                  <span>Level {s.level}{s.level === party.level ? ' (party)' : ''}</span>
                  <span>{items} / {s.budget.items}</span>
                  <span>{gp(money)} / {gp(s.budget.gp)}</span>
                  <span style={{ color: 'var(--muted)' }}>{MODE_LABELS[planMode(s.plan)]}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ color: 'var(--muted)', padding: 'var(--space-2)', flexShrink: 0, fontSize: 'var(--font-size-xs)' }}>
          {treasures.length} {treasures.length === 1 ? 'treasure' : 'treasures'}, {treasures.filter(t => t.found).length} found
        </div>
      </div>

      <div className="compendium-preview">
        <LevelPane key={level} summary={current} partySize={party.size} isPartyLevel={level === party.level} facts={facts} onLevel={l => setLevel(Math.min(30, Math.max(1, l)))} />
      </div>
    </div>
  )
}

function LevelPane({ summary: s, partySize, isPartyLevel, facts, onLevel }: {
  summary: LevelSummary
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
    <div className="stat-block-4e treasure-level">
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
      <div className="sb-subheader" style={{ gap: 8, alignItems: 'center', fontStyle: 'normal' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="How this level's treasure is budgeted">
          Budget
          <select className="ghost" value={mode} onChange={e => setMode(e.target.value as TreasureMode)} aria-label="Budget">
            {(Object.keys(MODE_LABELS) as TreasureMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
          </select>
        </label>
        <span style={{ flex: 1 }}>{modeNote(mode, partySize, s.slots.length)}</span>
        {mode === 'rc' && <button className="btn btn-sm" onClick={() => void roll()} title="Roll ten treasures on the RC's Treasure by Party Level table">{s.plan.treasure?.rolled ? 'Roll again' : 'Roll'}</button>}
        {emptySlots.length > 0 && <button className="btn btn-sm" onClick={() => void suggest()} title="Fill the empty slots: money as given, items at random from those of the slot's level">Suggest</button>}
      </div>

      <TreasureMeter tally={s.tally} budget={s.budget} budgetLabel={mode === 'free' ? 'DMG budget' : 'budget'} />

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

/** A money slot's treasure: what was rolled, or (a DMG parcel) its value in coins, the first way each parcel is printed. */
const slotMoney = (slot: TreasureSlot) => ({ text: slot.text ?? gp(slot.gp ?? 0), gp: slot.gp ?? 0 })

function modeNote(mode: TreasureMode, partySize: number, slots: number): string {
  const pcs = `${partySize} ${partySize === 1 ? 'PC' : 'PCs'}`
  if (mode === 'dmg') return `${slots} parcels for ${pcs} (DMG p. 125-129${partySize === 5 ? '' : '; the lists are for five, p. 125 adjusts them'})`
  if (mode === 'rc') return `Ten rolled treasures for ${pcs} (RC p. 298-302${partySize === 5 ? '' : '; rolls are ±2 per PC off five'})`
  return 'No slots; the bars compare with the DMG budget'
}
