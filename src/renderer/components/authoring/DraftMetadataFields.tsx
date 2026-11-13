import type { Change, Draft } from '@common/authoring/types'
import type { EditStatus } from './live-edits'
import { FieldTree } from './FieldEditor'

interface Props {
  draft: Draft
  save: (path: string, value: unknown) => Promise<void>
  comment: (path: string) => void
  status: (path: string, s: EditStatus) => void
  disabled: boolean
  change: (changes: Change[]) => void
}
const defaults: Record<string, unknown> = {
  powers: { name: 'New power', action: 'standard', usage: 'at-will', keywords: [], attacks: [], effect: { text: '', clauses: [] } },
  traits: { name: 'New trait', keywords: [], text: { text: '', clauses: [] } },
  auras: { name: 'New aura', range: 1, keywords: [], text: { text: '', clauses: [] } },
  stages: { stage: 1, line: { text: '', clauses: [] } }, properties: { text: '', clauses: [] }, countermeasures: { text: '', clauses: [] },
}
/** Escape hatch for kit fields not represented by the native editors. */
export function DraftMetadataFields({ draft: d, disabled, change, ...props }: Props) {
  return <>
    {Object.entries(d.content).filter(([k]) => !['id', 'provenance'].includes(k) && !d.nodes[k]).map(([key, value]) => <FieldTree key={key} {...props} path={`/content/${key}`} value={value} />)}
    {Object.entries(d.nodes).map(([group, ids]) => <section key={group}><h3>{group}</h3>{ids.map((id, i) => <details key={id}><summary>{(d.content as any)[group][i]?.name ?? `${group} ${i + 1}`}</summary><FieldTree {...props} path={`/content/${group}/@${id}`} value={(d.content as any)[group][i]} /><button disabled={disabled} onClick={() => change([{ path: `/remove/${group}/@${id}`, value: null }])}>Remove</button></details>)}<button disabled={disabled} onClick={() => change([{ path: `/append/${group}`, value: defaults[group] }])}>Add {group}</button></section>)}
  </>
}
