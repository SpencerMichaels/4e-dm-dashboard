import { useEffect } from 'react'
import type { Change, Draft } from '@common/authoring/types'
import type { Creature, RecordArt } from '@common/types'
import { creatureEditorChanges, draftToCreatureEditor } from '@common/authoring/creature-editor-adapter'
import { isUnsaved } from '@common/authoring/unsaved'
import { useUiStore } from '../../stores/ui-store'
import { Dnd4eCreatureDetails } from '../creature/Dnd4eCreatureDetails'
import { useLiveEdits, type EditStatus } from './live-edits'

interface Props {
  draft: Draft
  status: (s: EditStatus) => void
  apply: (changes: Change[], revision: number) => Promise<Draft>
  /** The entry's artwork (record-side, not draft content): shown and edited in the image panel. */
  art?: RecordArt
  onArtChange?: (art: RecordArt) => void
}
/** The Creatures compendium editor on an entry's working copy; edits go into it as you make them (see live-edits). */
export function NativeCreatureDraftEditor({ draft, status, apply, art, onArtChange }: Props) {
  const config = useUiStore(s => s.systemPlugin?.creatureBuilder)
  // The rules normally load when a campaign opens; the workshop works without one.
  useEffect(() => { if (!config) void window.api.system.getRules().then(useUiStore.getState().setSystemPlugin) }, [config])
  const { value: creature, edit, busy, notice } = useLiveEdits<Creature>({
    draft, apply, status, project: draftToCreatureEditor,
    diff: (base, sent) => creatureEditorChanges(base, draftToCreatureEditor(base), sent),
  })
  // Artwork goes to the entry; everything else into the draft.
  const view: Creature = onArtChange ? { ...creature, ...art } : creature
  const save = (next: Creature) => {
    if (onArtChange && (next.imageId !== view.imageId || next.tokenImageId !== view.tokenImageId || next.tokenCrop !== view.tokenCrop))
      onArtChange({ imageId: next.imageId, tokenImageId: next.tokenImageId, tokenCrop: next.tokenCrop })
    edit({ ...next, imageId: creature.imageId, tokenImageId: creature.tokenImageId, tokenCrop: creature.tokenCrop })
  }
  return <>
    {isUnsaved(draft) && <p className="authoring-notice authoring-edit-bar">{busy ? 'Adding it to the campaign…' : 'New: your first change adds it to the campaign.'}</p>}
    {notice}
    <div className="native-draft-editor">
      {config ? <Dnd4eCreatureDetails creature={view} onSave={save} config={config} compact showImages={!!onArtChange} /> : <p>Loading the creature editor…</p>}
    </div>
  </>
}
