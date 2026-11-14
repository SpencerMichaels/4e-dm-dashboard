// Importing a content pack (docs/content-pack-plan.md): the button Settings › Content and the empty
// published lists share. A successful import needs no message (the version and lists change); a
// failed one opens a dialog with the reason.

import { useState } from 'react'
import { Modal } from '../shared/Modal'
import { useContentStore } from '../../stores/content-store'

export function ImportContentButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    try {
      const result = await window.api.content.import()
      if (result && 'error' in result) setError(result.error)
    } finally {
      setBusy(false)
    }
  }
  return <>
    <button className="btn" onClick={() => void run()} disabled={busy}>{busy ? 'Importing…' : 'Import content pack…'}</button>
    {error && <Modal title="Content pack not imported" onClose={() => setError(null)} maxWidth={440}
      footer={<button className="btn btn-primary" onClick={() => setError(null)}>OK</button>}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{error}</p>
      <p style={{ margin: 'var(--space-2) 0 0', lineHeight: 1.5, color: 'var(--muted)' }}>The installed content is unchanged.</p>
    </Modal>}
  </>
}

/** In place of an empty list of published entries when no pack is installed. */
export function NoContentNotice() {
  return (
    <div className="no-content-notice" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-4)', color: 'var(--muted)', textAlign: 'center' }}>
      <span>No content pack installed</span>
      <ImportContentButton />
    </div>
  )
}

/** True when the app knows that no content pack is installed (not while it is still asking). */
export const useNoContent = () => useContentStore(s => s.version === null)
