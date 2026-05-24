import { useState, useEffect } from 'react'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import type { Campaign } from '@common/types'

export function HomeView() {
  const campaignId = useCampaignStore((s) => s.campaignId)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [systemId, setSystemId] = useState('')
  const [plugins, setPlugins] = useState<{ id: string; name: string }[]>([])
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
    window.api.system.listPlugins().then((list: { id: string; name: string }[]) => {
      setPlugins(list)
      if (!systemId && list.length > 0) setSystemId(list[0].id)
    })
  }, [])

  if (campaignId) {
    return <CampaignHome />
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const campaign = await window.api.campaign.create(name.trim(), systemId)
    const plugin = await window.api.system.getPlugin(systemId)
    setSystemPlugin(plugin)
    setCreating(false)
    setName('')
  }

  const handleOpen = async (id: string) => {
    const campaign = await window.api.campaign.open(id)
    if (campaign) {
      const plugin = await window.api.system.getPlugin(campaign.systemId)
      setSystemPlugin(plugin)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-6)' }}>
        Tabletop Dashboard
      </h1>

      {creating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input
            autoFocus
            placeholder="Campaign name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <select value={systemId} onChange={e => setSystemId(e.target.value)}>
            {plugins.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={handleCreate}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--color-accent)',
                color: 'var(--color-accent-text)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--color-bg-hover)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          style={{
            padding: 'var(--space-3) var(--space-6)',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-base)',
            marginBottom: 'var(--space-6)',
          }}
        >
          + New Campaign
        </button>
      )}

      {campaigns.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-3)', color: 'var(--color-text-secondary)' }}>
            Recent Campaigns
          </h2>
          {campaigns.map(c => (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <button
                onClick={() => handleOpen(c.id)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  {c.systemId} — Last opened {new Date(c.lastOpenedAt).toLocaleDateString()}
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(c.id) }}
                title="Delete campaign"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                x
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

function CampaignHome() {
  const { creatures, encounters, locations, notes, playerCharacters, items } = useCampaignStore()
  const { setView } = useUiStore()

  const stats = [
    { label: 'Notes', count: notes.length, action: () => setView({ type: 'entity-list', entityType: 'note' }) },
    { label: 'Creatures', count: creatures.length, action: () => setView({ type: 'entity-list', entityType: 'creature' }) },
    { label: 'Encounters', count: encounters.length, action: () => setView({ type: 'entity-list', entityType: 'encounter' }) },
    { label: 'Locations', count: locations.length, action: () => setView({ type: 'entity-list', entityType: 'location' }) },
    { label: 'Items', count: items.length, action: () => setView({ type: 'entity-list', entityType: 'item' }) },
    { label: 'PCs', count: playerCharacters.length, action: () => setView({ type: 'entity-list', entityType: 'player-character' }) },
  ]

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-6)' }}>
        Campaign Overview
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
        {stats.map(s => (
          <button
            key={s.label}
            onClick={s.action}
            style={{
              padding: 'var(--space-4)',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 600 }}>{s.count}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{s.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
