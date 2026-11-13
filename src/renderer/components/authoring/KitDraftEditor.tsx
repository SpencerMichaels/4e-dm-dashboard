// Workshop editing for kit-native kinds (traps, diseases, templates, themes) with the same
// statblock component the compendium uses, and items with the item editor. Edits go into the
// draft as you make them, as field-level patches, like the creature editor (see live-edits).

import { type ReactNode } from 'react'
import type { Disease, MonsterTemplate, MonsterTheme, Trap } from '@kit'
import type { Change, Content, Draft } from '@common/authoring/types'
import { decorate, kitEditorChanges } from '@common/authoring/kit-editor-adapter'
import { isUnsaved } from '@common/authoring/unsaved'
import { TrapStatblock } from '../trap/TrapStatblock'
import { DiseaseStatblock } from '../disease/DiseaseStatblock'
import { TemplateStatblock } from '../template/TemplateStatblock'
import { ThemeStatblock } from '../theme/ThemeStatblock'
import { Dnd4eItemEditor } from '../campaign/Dnd4eItemEditor'
import { draftToItemEditor, itemEditorChanges } from '@common/authoring/item-editor-adapter'
import { useLiveEdits, type EditStatus } from './live-edits'

/** The statblock for a kit-native draft; read-only without onChange. */
export function KitStatblock({ kind, content, onChange }: { kind: Draft['kind']; content: Content; onChange?: (next: Content) => void }): ReactNode {
  const change = onChange as ((next: any) => void) | undefined
  if (kind === 'trap') return <TrapStatblock trap={content as Trap} onChange={change} />
  if (kind === 'disease') return <DiseaseStatblock disease={content as Disease} onChange={change} />
  if (kind === 'template') return <TemplateStatblock template={content as MonsterTemplate} onChange={change} />
  if (kind === 'theme') return <ThemeStatblock theme={content as MonsterTheme} onChange={change} />
  return null
}

export const isKitNative = (kind: Draft['kind']) => kind === 'trap' || kind === 'disease' || kind === 'template' || kind === 'theme'

interface Props {
  draft: Draft
  status: (s: EditStatus) => void
  apply: (changes: Change[], revision: number) => Promise<Draft>
}

export const KitDraftEditor = (props: Props) => <LiveDraftEditor {...props} project={d => decorate<Content>(d)} diff={kitEditorChanges}
  render={(value, edit) => <KitStatblock kind={props.draft.kind} content={value} onChange={edit} />} />

/** Items use the item statblock editor through the item adapter. */
export const ItemDraftEditor = (props: Props) => <LiveDraftEditor {...props} project={draftToItemEditor} diff={(base, value) => itemEditorChanges(base, draftToItemEditor(base), value)}
  render={(value, edit) => <Dnd4eItemEditor item={value} onSave={edit} />} />

function LiveDraftEditor<V>({ draft, status, apply, project, diff, render }: Props & {
  project: (d: Draft) => V; diff: (base: Draft, value: V) => Change[]; render: (value: V, edit: (next: V) => void) => ReactNode
}) {
  const { value, edit, busy, notice } = useLiveEdits<V>({ draft, apply, status, project, diff })
  return <>
    {isUnsaved(draft) && <p className="authoring-notice authoring-edit-bar">{busy ? 'Creating the draft…' : 'Not saved yet. Your first change creates the draft.'}</p>}
    {notice}
    <div className="native-draft-editor">{render(value, edit)}</div>
  </>
}
