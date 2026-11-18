// Kit powers, traits, and auras in any kit-native statblock. Powers reuse the creature power card
// and power editor through the shared power adapter, so kit-only detail (secondary attacks,
// clauses, theme fields) survives editing.

import { useEffect, useId } from 'react'
import type { Aura, Power, Trait } from '@kit'
import type { CreatureBuilderConfig } from '@common/types'
import { auraSize, powerToLegacy } from '@common/authoring/legacy'
import { entryToPower, powerToEntry } from '@common/authoring/power-adapter'
import { PowerCardView, type PowerCardEntry } from '../creature/PowerCardView'
import { PowerEntryEditor } from '../creature/PowerEntryEditor'
import { Annotation } from '../creature/annotations'
import { powerEditorConfig } from '../creature/power-config'
import { useUiStore } from '../../stores/ui-store'
import { Add, LineText, listOps, Move, Num, Remove, Tags, Text } from './fields'
import { useDragReorder, type DragReorder } from '../shared/drag-reorder'

const node = (v: object) => (v as { _draftNode?: string })._draftNode

export function KitPowers<P extends Power>({ powers, onChange, level, role, blank }: {
  powers: P[]; onChange?: (next: P[]) => void; level?: number; role?: string
  /** Fields a new power needs beyond the kit Power (a theme power's category). */
  blank?: Partial<P>
}) {
  const rules = useUiStore(s => s.systemPlugin?.creatureBuilder) as CreatureBuilderConfig | undefined
  const list = useId()
  // The rules normally load when a campaign opens; editors also work without one.
  useEffect(() => { if (onChange && !rules) void window.api.system.getRules().then(useUiStore.getState().setSystemPlugin) }, [onChange, rules])
  if (!onChange || !rules) return <>{powers.map((p, i) => <div key={i} style={{ position: 'relative' }}>
    <PowerCardView entry={{ ...powerToLegacy(p), kit: p } as PowerCardEntry} />
    <Annotation anchor={{ kind: 'entry', entry: { entryType: 'action', name: p.name, _draftNode: node(p) } }} />
  </div>)}</>
  // Entries remember which power they came from (per list, so pasted entries never match the wrong one).
  const entries = powers.map((p, i) => ({ ...powerToEntry(p), _src: `${list}:${i}`, _draftNode: node(p) }))
  const update = (next: any[]) => onChange(next.map(e => {
    const i = typeof e._src === 'string' && e._src.startsWith(list + ':') ? Number(e._src.slice(list.length + 1)) : -1
    const original = i >= 0 ? powers[i] : undefined
    const power = entryToPower(original ?? (blank as Power | undefined), original ? entries[i] : {}, e) as P & { _draftNode?: string }
    // A duplicate keeps its source's mechanics but not its identity.
    if (!original || next.filter(x => x._src === e._src).indexOf(e) > 0) delete power._draftNode
    return power
  }))
  return <PowerEntryEditor entries={entries as any} onChange={update} config={powerEditorConfig(rules, true)} level={level} statBlock={{ role }} />
}

/** Traits and, when given, auras: name, keywords, and printed text. */
export function KitTraits({ traits, auras, onTraits, onAuras }: {
  traits: Trait[]; auras?: Aura[]; onTraits?: (next: Trait[]) => void; onAuras?: (next: Aura[]) => void
}) {
  const t = listOps(traits, onTraits)
  const a = listOps(auras ?? [], onAuras)
  const dragTraits = useDragReorder(traits.length, t.move)
  const dragAuras = useDragReorder(auras?.length ?? 0, a.move)
  const row = <T extends Trait>(x: T, i: number, ops: ReturnType<typeof listOps<any>>, kind: 'trait' | 'aura', length: number, drag?: DragReorder) => <div key={i} className="sb-trait" {...drag?.row(i)} style={{ position: 'relative', display: 'flex', ...drag?.row(i).style }}>
    <Move index={i} length={length} move={ops.move} drag={drag} />
    <div style={{ flex: 1, minWidth: 0 }}>
      {ops.set ? <div style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
          <Text value={x.name} placeholder={kind === 'aura' ? 'Aura name' : 'Trait name'} style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }} onChange={name => ops.set!(i, { ...x, name })} />
          {kind === 'aura' && <span>aura {(x as unknown as Aura).range === undefined && (x as unknown as Aura).rangeText && !ops.set
            // A printed size that isn't a number ("aura sight") shows as printed; editing sets a number.
            ? auraSize(x as unknown as Aura)
            : <Num value={(x as unknown as Aura).range} min={1} label="Aura size" onChange={range => ops.set!(i, { ...x, range: range ?? 1 } as unknown as T)} />}</span>}
          <Tags values={x.keywords} placeholder="keywords" onChange={keywords => ops.set!(i, { ...x, keywords })} />
          <span style={{ marginLeft: 'auto' }}><Remove label={`Remove ${x.name || kind}`} onClick={() => ops.remove!(i)} /></span>
        </div>
        <div style={{ paddingLeft: 12 }}><LineText line={x.text} placeholder="Effect" onChange={text => ops.set!(i, { ...x, text })} /></div>
      </div>
        : <PowerCardView entry={{ name: x.name, usage: 'trait', keywords: x.keywords, ...(kind === 'aura' ? { rangeType: 'aura', rangeValue: String((x as unknown as Aura).range) } : {}), effect: x.text.text, kitLine: x.text } as PowerCardEntry} />}
    </div>
    <Annotation anchor={{ kind: 'entry', entry: { entryType: kind, name: x.name, _draftNode: node(x) } }} />
  </div>
  return <>
    {(onTraits || onAuras) && <div style={{ display: 'flex', gap: 4, padding: '4px 8px' }}>
      <Add onClick={t.add && (() => t.add!({ name: '', keywords: [], text: { text: '', clauses: [] } }, 0))}>Trait</Add>
      {auras && <Add onClick={a.add && (() => a.add!({ name: '', keywords: [], range: 1, text: { text: '', clauses: [] } }, 0))}>Aura</Add>}
    </div>}
    {traits.map((x, i) => row(x, i, t, 'trait', traits.length, dragTraits))}
    {(auras ?? []).map((x, i) => row(x, i, a, 'aura', auras!.length, dragAuras))}
  </>
}
