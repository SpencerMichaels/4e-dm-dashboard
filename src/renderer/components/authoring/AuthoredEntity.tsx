import { useState } from 'react'
import type { Content, ContentKind } from '@common/authoring/types'
import { ContentPreview } from './ContentPreview'
import { useCampaignStore } from '../../stores/campaign-store'
import { useUiStore } from '../../stores/ui-store'
import { useAuthoringStore } from '../../stores/authoring-store'

export function AuthoredEntity({ content, kind, entityId }: { content: Content; kind: ContentKind; entityId: string }) {
  const campaignId = useCampaignStore(s => s.campaignId)
  const setView = useUiStore(s => s.setView)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const edit = async () => {
    setBusy(true)
    try {
      const destination = { type: 'campaign', id: campaignId, entityId }
      const { hash } = await window.api.authoring.call('destination_entity', { destination, kind, entityId })
      const d = await window.api.authoring.call('create_draft', { kind, content, destinations: [{ ...destination, expectedHash: hash }], intent: `Revise ${content.name}, preserving its existing mechanics unless changed explicitly.` })
      useAuthoringStore.getState().receive(d)
      setView({ type: 'authoring', draftId: d.id })
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <section style={{ padding: 20 }}><button disabled={busy} onClick={() => void edit()}>Edit in Workshop</button>{error && <p role="alert">{error}</p>}<ContentPreview content={content} kind={kind} /></section>
}
