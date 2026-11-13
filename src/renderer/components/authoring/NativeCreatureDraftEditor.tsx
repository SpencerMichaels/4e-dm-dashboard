import { useEffect } from 'react'
import type { Change, Draft } from '@common/authoring/types'
import type { Creature } from '@common/types'
import { creatureEditorChanges, draftToCreatureEditor } from '@common/authoring/creature-editor-adapter'
import { isUnsaved } from '@common/authoring/unsaved'
import { useUiStore } from '../../stores/ui-store'
import { Dnd4eCreatureDetails } from '../creature/Dnd4eCreatureDetails'
import { DraftNotes } from './DraftNotes'
import { useLiveEdits, type EditStatus } from './live-edits'
import type { Monster } from '@kit'

interface Props {
  draft: Draft
  status: (s: EditStatus) => void
  apply: (changes: Change[], revision: number) => Promise<Draft>
}
/** The Creatures compendium editor on a draft; edits go into the draft as you make them (see live-edits). */
export function NativeCreatureDraftEditor({ draft, status, apply }: Props) {
  const config = useUiStore(s => s.systemPlugin?.creatureBuilder)
  // The rules normally load when a campaign opens; the workshop works without one.
  useEffect(() => { if (!config) void window.api.system.getRules().then(useUiStore.getState().setSystemPlugin) }, [config])
  const { value: creature, edit, busy, notice } = useLiveEdits<Creature>({
    draft, apply, status, project: draftToCreatureEditor,
    diff: (base, sent) => creatureEditorChanges(base, draftToCreatureEditor(base), sent),
  })
  const description = String(creature.statBlock.description ?? '')
  return <>
    {isUnsaved(draft) && <p className="authoring-notice authoring-edit-bar">{busy ? 'Creating the draft…' : 'Not saved yet. Your first change creates the draft.'}</p>}
    {notice}
    <div className="native-draft-editor">
      {config ? <Dnd4eCreatureDetails creature={creature} onSave={edit} config={config} compact showImages={false} showDescription={false} /> : <p>Loading the creature editor…</p>}
      <DraftNotes monster={draft.content as Monster} edit={{ value: description, change: value => edit({ ...creature, statBlock: { ...creature.statBlock, description: value } }) }} />
    </div>
  </>
}
