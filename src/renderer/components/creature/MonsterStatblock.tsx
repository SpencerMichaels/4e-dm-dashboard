// A kit Monster as its printed stat block (the creature viewer, with art and pop-out) or, with
// onChange, the benchmark-guided creature editor. The editor works on its own model; each change is
// applied to the monster field by field through the Workshop's creature adapter, so kit-only
// mechanics (clauses, secondary attacks) are kept.

import { useEffect, useState } from 'react'
import type { Monster } from '@kit'
import type { Creature } from '@common/types'
import { monsterFromEditor, monsterToEditor } from '@common/authoring/creature-editor-adapter'
import { useUiStore } from '../../stores/ui-store'
import { useGlossary } from '../compendium/use-glossary'
import type { StatblockProps } from '../compendium/RecordCompendium'
import { Dnd4eCreatureViewer } from './Dnd4eCreatureViewer'
import { Dnd4eCreatureDetails } from './Dnd4eCreatureDetails'
import { kitViewCreature } from './kit-view'

export function MonsterStatblock(props: StatblockProps<Monster>) {
  return props.onChange ? <MonsterEditor {...props} onChange={props.onChange} /> : <MonsterView {...props} />
}

function MonsterView({ value, art, onArtChange, onPopout }: StatblockProps<Monster>) {
  const { tooltip } = useGlossary()
  return <Dnd4eCreatureViewer creature={kitViewCreature(value, undefined, { ...art })} tooltip={tooltip}
    onImageChange={onArtChange && (imageId => onArtChange({ imageId }))}
    onTokenChange={onArtChange && ((tokenImageId, tokenCrop) => onArtChange({ tokenImageId, tokenCrop }))}
    onPopout={onPopout} />
}

function MonsterEditor({ value, onChange, art, onArtChange }: StatblockProps<Monster> & { onChange: (next: Monster) => void }) {
  const config = useUiStore(s => s.systemPlugin?.creatureBuilder)
  useEffect(() => { if (!config) void window.api.system.getRules().then(useUiStore.getState().setSystemPlugin) }, [config])
  // The model stays local: re-deriving it from the monster on every keystroke would trim what is being
  // typed. Each change is applied to the monster as it was when editing started.
  const [base] = useState(value)
  const [baseView] = useState(() => monsterToEditor(value))
  const [view, setView] = useState<Creature>(() => ({ ...baseView, ...art }))
  const save = (next: Creature) => {
    setView(next)
    if (onArtChange && (next.imageId !== view.imageId || next.tokenImageId !== view.tokenImageId || next.tokenCrop !== view.tokenCrop))
      onArtChange({ imageId: next.imageId, tokenImageId: next.tokenImageId, tokenCrop: next.tokenCrop })
    onChange(monsterFromEditor(base, baseView, next))
  }
  if (!config) return <p style={{ color: 'var(--muted)' }}>Loading the creature editor…</p>
  return <Dnd4eCreatureDetails creature={view} onSave={save} config={config} compact showImages={!!onArtChange} />
}
