import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useCampaignStore, type CampaignState } from '../../stores/campaign-store'
import { useCombatStore } from '../../stores/combat-store'
import { useUiStore, type ViewMode } from '../../stores/ui-store'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { Icon } from '../shared/Icon'
import { useDisease } from '../disease/disease-refs'
import { ConditionPill, buildConditionLabel } from '../combat/ConditionPill'
import { formatConditionName } from '../../utils/combat-utils'
import dnd4e from '@common/rules/dnd4e'
import { conditionName, pcConditionKey } from '@common/rules/pc-conditions'
import { CombatToken } from '../combat/CombatToken'
import { isActivePc, partyLevel, pcLevel } from '@common/rules/party'
import { PcLevelWarning } from './level-warnings'
import { PcConditionsDialog } from './PcConditions'
import { RECORD_STORAGE, RECORD_TYPES, type RecordType } from '@common/campaign-records'
import type { Campaign, CampaignRecord, PcCondition, PcDisease } from '@common/types'

export function HomeView() {
  const campaignId = useCampaignStore((s) => s.campaignId)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const setSystemPlugin = useUiStore((s) => s.setSystemPlugin)
  const skipAutoOpen = useUiStore((s) => s.skipAutoOpen)

  useEffect(() => {
    window.api.campaign.list().then((list: Campaign[]) => {
      setCampaigns(list)
      // Auto-open most recent campaign if none active (unless user explicitly closed)
      if (!campaignId && !skipAutoOpen && list.length > 0) {
        handleOpen(list[0].id)
      }
    })
  }, [])

  if (campaignId) {
    return <CampaignHome />
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    await window.api.campaign.create(name.trim())
    const plugin = await window.api.system.getRules()
    setSystemPlugin(plugin)
    setCreating(false)
    setName('')
  }

  const handleOpen = async (id: string) => {
    const campaign = await window.api.campaign.open(id)
    if (campaign) {
      const plugin = await window.api.system.getRules()
      setSystemPlugin(plugin)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-6)' }}>
        4e DM Dashboard
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
        No campaign is open. {campaigns.length > 0 ? 'Open one below or create a new one' : 'Create one to start'}: encounters, maps and PCs belong to a campaign. The compendium pages and shared entries work without one.
      </p>

      {creating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input
            autoFocus
            placeholder="Campaign name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={handleCreate}
              className="btn btn-primary"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="btn"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="btn btn-primary" style={{ padding: 'var(--space-2) var(--space-6)', marginBottom: 'var(--space-6)' }}
        >
          + New Campaign
        </button>
      )}

      {campaigns.length > 0 && (
        <div role="list" style={{ marginTop: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>
            Recent Campaigns
          </h2>
          {campaigns.map(c => (
            <div
              key={c.id}
              role="listitem"
              style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <button
                onClick={() => handleOpen(c.id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>
                  Last opened {c.lastOpenedAt ? new Date(c.lastOpenedAt).toLocaleDateString() : 'Never'}
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(c.id) }}
                title="Delete campaign"
                aria-label="Delete campaign"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', color: 'var(--muted)',
                  fontSize: 'var(--font-size-sm)',
                  display: 'inline-flex',
                }}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId && (() => {
        const campaign = campaigns.find(c => c.id === confirmDeleteId)
        return (
          <ConfirmDialog
            message={`Delete campaign "${campaign?.name ?? 'Unknown'}"? This cannot be undone.`}
            onConfirm={async () => {
              await window.api.campaign.delete(confirmDeleteId)
              setCampaigns(prev => prev.filter(p => p.id !== confirmDeleteId))
              setConfirmDeleteId(null)
            }}
            onCancel={() => setConfirmDeleteId(null)}
          />
        )
      })()}
    </div>
  )
}

// The session board: a one-page reference for running the campaign. It never scrolls and has no
// editable fields; its rows link to the pages where things are edited, and a few controls open
// dialogs that edit (a PC's diseases). Its panels are stat block panels with striped lists, like
// the compendium's.
function CampaignHome() {
  const campaignName = useCampaignStore((s) => s.campaign?.name)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-4)' }}>{campaignName}</h1>
      <CombatInProgress />
      <Party />
      <RecentlyChanged />
    </div>
  )
}

const panel = { flexShrink: 0, marginBottom: 'var(--space-4)' }

function CombatInProgress() {
  const combat = useCombatStore((s) => s.combat)
  const encounters = useCampaignStore((s) => s.encounters)
  const setView = useUiStore((s) => s.setView)
  if (!combat) return null
  const name = encounters.find(e => e.id === combat.encounterId)?.name ?? 'Combat'
  const where = combat.phase === 'initiative-entry' ? 'Rolling initiative' : combat.phase === 'ended' ? 'Ended' : `Round ${combat.round}`
  return (
    <div className="stat-block-4e home-combat" style={{ ...panel, alignSelf: 'flex-start', minWidth: 560 }}>
      <div className="sb-header" style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="sb-name" style={{ flex: 1 }}><Icon name="swords" style={{ verticalAlign: '-0.125em' }} /> {name}</span>
        <span>{where}</span>
        <button className="btn btn-sm" onClick={() => setView({ type: 'combat' })} title="Back to the combat tracker (C)" style={{ color: 'inherit', font: 'inherit' }}>Resume</button>
      </div>
    </div>
  )
}

// Party columns: character, AC, Fort, Ref, Will, passive Perception, passive Insight, conditions.
const PARTY_COLUMNS = 'minmax(200px, 1fr) repeat(6, 36px) minmax(120px, auto)'

/** The active PCs' numbers the DM asks about at the table, from their imported sheets. A row opens the PCs page. */
function Party() {
  const pcs = useCampaignStore((s) => s.playerCharacters)
  const setView = useUiStore((s) => s.setView)
  const combat = useCombatStore((s) => s.combat)
  const [conditionsOf, setConditionsOf] = useState<string | null>(null)
  const active = pcs.filter(isActivePc)
  const level = partyLevel(pcs)
  const conditionsPc = pcs.find(pc => pc.id === conditionsOf)
  const toPcs = () => setView({ type: 'entity-list', entityType: 'player-character' })
  const num = (n: number | undefined) => <span>{n ?? <span style={{ color: 'var(--muted)' }}>–</span>}</span>

  return (
    <div className="stat-block-4e home-party" style={{ ...panel, alignSelf: 'flex-start', minWidth: 560 }}>
      <div className="sb-header" style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="sb-name" style={{ flex: 1 }}>Party{level != null && ` (Level ${level})`}</span>
        <span>{active.length} {active.length === 1 ? 'Player' : 'Players'}</span>
      </div>
      {active.length === 0 ? (
        <div style={{ padding: 'var(--space-2)', color: 'var(--muted)', fontSize: 'var(--font-size-xs)' }}>
          No active PCs. Add or import them on the <button className="btn btn-sm" onClick={toPcs}>PCs</button> page.
        </div>
      ) : <>
        <div className="sb-columns" style={{ gridTemplateColumns: PARTY_COLUMNS }}>
          <span>Character</span>
          <span title="Armor Class">AC</span><span title="Fortitude">Fort</span><span title="Reflex">Ref</span><span title="Will">Will</span>
          <span title="Passive Perception">Perc</span><span title="Passive Insight">Ins</span>
          <span>Conditions</span>
        </div>
        <div className="striped-rows" role="list">
          {active.map(pc => {
            const sheet = pc.sheet
            const open = () => setConditionsOf(pc.id)
            // In combat, the encounter's own conditions on this PC, on top of its lasting ones (those were carried in).
            const combatant = combat && Object.values(combat.combatants).find(c => c.entityId === pc.id)
            const encounterOnly = (combatant?.conditions ?? []).filter(c => !c.carried && c.conditionId !== 'reacted')
            return (
              <div key={pc.id} role="listitem" className="sb-list-row" onClick={toPcs} title="Open the PCs page" style={{ gridTemplateColumns: PARTY_COLUMNS, cursor: 'pointer', padding: '3px var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <CombatToken name={pc.name || '?'} imageId={pc.imageId} tokenImageId={pc.tokenImageId} hp={1} maxHp={1} size={36} hideHpRing={!!pc.color} solidRingColor={pc.color} />
                  <div style={{ minWidth: 0 }}>
                    <b>{pc.name || 'Unnamed Character'}</b>
                    {pc.playerName && <span style={{ color: 'var(--muted)' }}> ({pc.playerName})</span>}
                    <div style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {[pcLevel(pc) != null ? `Level ${pcLevel(pc)}` : 'No level', sheet?.race, sheet?.class].filter(Boolean).join(' ')}{sheet ? '' : ' (no sheet)'}
                      <PcLevelWarning pc={pc} partyLevel={level} />
                    </div>
                  </div>
                </div>
                {num(sheet?.defenses.ac)}
                {num(sheet?.defenses.fortitude)}
                {num(sheet?.defenses.reflex)}
                {num(sheet?.defenses.will)}
                {num(sheet?.passivePerception)}
                {num(sheet?.passiveInsight)}
                {/* Lasting conditions open the PC's conditions dialog; the + adds one. */}
                <div className="home-pc-conditions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, whiteSpace: 'normal' }}>
                  {(pc.conditions ?? []).map(c => <LastingCondition key={pcConditionKey(c)} condition={c} onOpen={open} />)}
                  {encounterOnly.map((c, i) => {
                    const name = formatConditionName(c.conditionId, dnd4e.conditions, c.customName)
                    return <ConditionPill key={c.conditionId + i} conditionId={c.conditionId} customColor={c.customColor} customIcon={c.customIcon} damageType={c.customDescription} title={`${name}: this encounter only`}
                      label={buildConditionLabel({ conditionId: c.conditionId, name, value: c.value, customDescription: c.customDescription, damageType: c.customDescription })} />
                  })}
                  <button className="btn btn-icon btn-sm" aria-label="Add a condition" title="Add a lasting condition, disease, or effect for this PC"
                    onClick={(e) => { e.stopPropagation(); open() }}><Icon name="plus" /></button>
                </div>
              </div>
            )
          })}
        </div>
      </>}
      {conditionsPc && <PcConditionsDialog pc={conditionsPc} onClose={() => setConditionsOf(null)} />}
    </div>
  )
}

/** A chip for one of a PC's lasting conditions; it opens the PC's conditions dialog. */
function LastingCondition({ condition, onOpen }: { condition: PcCondition; onOpen: () => void }) {
  const chip = (className: string, title: string, label: React.ReactNode) => (
    <button className={`btn btn-sm home-pc-condition ${className}`} onClick={(e) => { e.stopPropagation(); onOpen() }} title={title}>{label}</button>
  )
  switch (condition.kind) {
    case 'disease': return <LastingDisease carried={condition} chip={chip} />
    case 'condition': return chip('home-pc-status', condition.note ? `Until ${condition.note}` : 'Lasting condition', conditionName(condition.conditionId))
    case 'effect': return chip('home-pc-effect', condition.description ?? 'Effect', condition.name)
  }
}

function LastingDisease({ carried, chip }: { carried: PcDisease; chip: (className: string, title: string, label: React.ReactNode) => React.ReactNode }) {
  const disease = useDisease(carried)
  if (disease === undefined) return null
  return chip('home-pc-disease', 'Stages and Endurance checks',
    <>{disease?.name ?? 'Unknown disease'} <span style={{ color: 'var(--muted)' }}>{carried.stage === 'exposed' ? 'exposed' : `stage ${carried.stage}`}</span></>)
}

const RECORD_LABELS: Record<RecordType, string> = { creature: 'Creatures', item: 'Items', trap: 'Traps', disease: 'Diseases', template: 'Templates', theme: 'Themes', challenge: 'Skill Challenges' }
// Every row has this height, so the rows that fit the remaining height can be counted.
const ROW_HEIGHT = 24

interface RecentRow { key: string; name: string; updatedAt: string; view: ViewMode }
interface RecentColumn { label: string; rows: RecentRow[] }

const newestFirst = (rows: RecentRow[]) => rows.filter(r => r.updatedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

/** The campaign's most recently changed entries (by the DM or the agent), a column per kind, as many as fit. */
function RecentlyChanged() {
  const state = useCampaignStore()
  const setView = useUiStore((s) => s.setView)
  const columns = useMemo(() => {
    const all: RecentColumn[] = [
      { label: 'Encounters', rows: state.encounters.map(e => ({ key: e.id, name: e.name, updatedAt: e.updatedAt, view: { type: 'encounter', encounterId: e.id } })) },
      { label: 'Locations', rows: state.locations.map(l => ({ key: l.id, name: l.name, updatedAt: l.updatedAt, view: { type: 'location', locationId: l.id } })) },
      { label: 'Maps', rows: state.maps.map(m => ({ key: m.id, name: m.name, updatedAt: m.updatedAt, view: { type: 'map', mapId: m.id } })) },
      ...RECORD_TYPES.map((type): RecentColumn => ({
        label: RECORD_LABELS[type],
        rows: (state[RECORD_STORAGE[type].storeKey as keyof CampaignState] as CampaignRecord<{ name: string }>[])
          .map(r => ({ key: r.id, name: r.content.name, updatedAt: r.updatedAt, view: { type: 'compendium', kind: type, id: r.id } })),
      })),
    ]
    return all.map(c => ({ ...c, rows: newestFirst(c.rows) })).filter(c => c.rows.length > 0)
  }, [state])

  // How many rows fit under the panel title bars.
  const listRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => setFit(Math.floor(el.clientHeight / ROW_HEIGHT))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [columns.length > 0])

  if (columns.length === 0) return null
  // A panel per kind, side by side: each its own list, so rows across panels don't read as one row.
  return (
    <nav className="home-recent" aria-label="Recently changed" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-2)' }}>Recently changed</h2>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(0, 220px))`, gridTemplateRows: 'minmax(0, 1fr)', gap: 'var(--space-3)' }}>
        {columns.map((c, i) => (
          <div key={c.label} className="stat-block-4e home-recent-kind" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="sb-header">
              <span className="sb-name" style={{ minWidth: 0 }}>{c.label}</span>
            </div>
            <div ref={i === 0 ? listRef : undefined} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="striped-rows" role="list">
                {c.rows.slice(0, fit).map(r => (
                  <div key={r.key} role="listitem" className="sb-list-row sb-row-link" style={{ height: ROW_HEIGHT }}>
                    <button className="sb-row-button" onClick={() => setView(r.view)} title={`${r.name}, changed ${when(r.updatedAt)}`}>{r.name}</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}

/** The time for today, otherwise the date. */
function when(iso: string): string {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? `today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString()
}
