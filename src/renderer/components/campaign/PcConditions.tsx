// A PC's lasting conditions (src/common/rules/pc-conditions.ts): diseases, standard conditions that
// outlast an encounter, and effects the DM names. They join the PC's combatant when combat starts.
//
// Diseases (DMG p.49): exposed PCs resolve the disease's attack after the encounter (contracted at
// stage 1, or fought off); infected PCs make an Endurance check after each extended rest, which moves
// them a stage (improve, stay, worsen). Stage 0 is cured.

import { useMemo, useState } from 'react'
import type { Disease } from '@kit'
import type { DiseaseRef, PcCondition, PcDisease, PcEffect, PcStatusCondition, PlayerCharacter } from '@common/types'
import { Icon } from '../shared/Icon'
import { enduranceOutcome, finalStage, nextStage, stageText, type EnduranceOutcome } from '@common/rules/diseases'
import { conditionName, lastingConditionDefs, pcConditionKey } from '@common/rules/pc-conditions'
import { generateId } from '@common/utils/id'
import { diseaseKey, useDisease, useDiseaseNames } from '../disease/disease-refs'
import { DiseaseStatblock } from '../disease/DiseaseStatblock'
import { Modal } from '../shared/Modal'

const dc = (v: number | { text: string }) => typeof v === 'number' ? `DC ${v}` : v.text
const now = () => new Date().toISOString()
const rowStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)', marginBottom: 'var(--space-2)', maxWidth: 720 }

/** One PC's lasting conditions, opened from the Home board's Party panel: each with its controls, and adding one. */
export function PcConditionsDialog({ pc, onClose }: { pc: PlayerCharacter; onClose: () => void }) {
  const conditions = pc.conditions ?? []
  const save = (next: PcCondition[]) => window.api.entity.save('player-character', { ...pc, conditions: next, updatedAt: now() })
  const set = (key: string, next: PcCondition | null) => save(conditions.flatMap(c => pcConditionKey(c) !== key ? [c] : next ? [next] : []))
  const add = (c: PcCondition) => { if (!conditions.some(o => pcConditionKey(o) === pcConditionKey(c))) save([...conditions, c]) }
  return (
    <Modal title={<>Conditions: {pc.name || 'Unnamed Character'}</>} onClose={onClose} minWidth={480} maxWidth={760}
      footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="pc-conditions">
        {conditions.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)' }}>No lasting conditions. They join this PC in every combat until removed. In combat, a disease named in a power's text exposes the PCs you pick.</p>}
        {conditions.map(c => {
          const key = pcConditionKey(c)
          const onChange = (next: PcCondition | null) => set(key, next)
          switch (c.kind) {
            case 'disease': return <PcDiseaseRow key={key} carried={c} onChange={onChange} />
            case 'condition': return <PcStatusRow key={key} condition={c} onChange={onChange} />
            case 'effect': return <PcEffectRow key={key} effect={c} onChange={onChange} />
          }
        })}
        <AddCondition onAdd={add} />
      </div>
    </Modal>
  )
}

const removeButton = (onRemove: () => void) => (
  <button onClick={onRemove} title="Remove" aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', alignSelf: 'center' }}><Icon name="x" /></button>
)

function PcStatusRow({ condition, onChange }: { condition: PcStatusCondition; onChange: (next: PcStatusCondition | null) => void }) {
  const def = lastingConditionDefs().find(d => d.id === condition.conditionId)
  return (
    <div className="pc-condition pc-status" style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <b>{conditionName(condition.conditionId)}</b>
        <span style={{ flex: 1, color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>{def?.description}</span>
        {removeButton(() => onChange(null))}
      </div>
      <input defaultValue={condition.note ?? ''} placeholder="Until… (e.g. an extended rest)" aria-label="How it ends" style={{ width: '100%', marginTop: 4, fontSize: 'var(--font-size-sm)' }}
        onBlur={e => { const note = e.target.value.trim() || undefined; if (note !== condition.note) onChange({ ...condition, note, since: now() }) }} />
    </div>
  )
}

function PcEffectRow({ effect, onChange }: { effect: PcEffect; onChange: (next: PcEffect | null) => void }) {
  const commit = (patch: Partial<PcEffect>) => onChange({ ...effect, ...patch, since: now() })
  return (
    <div className="pc-condition pc-effect" style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <input defaultValue={effect.name} aria-label="Effect name" style={{ flex: 1, fontWeight: 700 }}
          onBlur={e => { const name = e.target.value.trim(); if (name && name !== effect.name) commit({ name }) }} />
        {removeButton(() => onChange(null))}
      </div>
      <textarea defaultValue={effect.description ?? ''} placeholder="What it does, and how it ends" aria-label="Effect description" rows={2} style={{ width: '100%', marginTop: 4, fontSize: 'var(--font-size-sm)', resize: 'vertical' }}
        onBlur={e => { const description = e.target.value.trim() || undefined; if (description !== effect.description) commit({ description }) }} />
    </div>
  )
}

function PcDiseaseRow({ carried, onChange }: { carried: PcDisease; onChange: (next: PcDisease | null) => void }) {
  const disease = useDisease(carried)
  const [open, setOpen] = useState(false)
  const [roll, setRoll] = useState('')
  if (disease === undefined) return null
  const name = disease?.name ?? 'This disease no longer exists'
  const small = { fontSize: 'var(--font-size-xs)', padding: '1px 8px' }

  const move = (d: Disease, stage: number, outcome: EnduranceOutcome) => {
    const next = nextStage(d, stage, outcome)
    setRoll('')
    onChange(next === 0 ? null : { ...carried, stage: next, since: now() })
  }

  return (
    <div className="pc-condition pc-disease" style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Hide the stages' : 'Show the stages'} style={{ padding: '0 6px' }}><Icon name={open ? 'chevron-down' : 'chevron-right'} />{name}</button>
        <span style={{ flex: 1, color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>
          {carried.stage === 'exposed' ? 'Exposed' : `Stage ${carried.stage}${disease && carried.stage === finalStage(disease) ? ' (final)' : ''}`}
        </span>
        <button onClick={() => onChange(null)} title="Stop tracking" aria-label="Stop tracking" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', alignSelf: 'center' }}><Icon name="x" /></button>
      </div>
      {disease && carried.stage === 'exposed' && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
          <span>After the encounter, resolve the exposure as the power says (a saving throw, or the disease's attack{disease.attack ? ` +${disease.attack.bonus.kind === 'fixed' ? disease.attack.bonus.value : '?'} vs ${disease.attack.vs}` : ''}):</span>
          <button style={small} onClick={() => onChange({ ...carried, stage: 1, since: now() })}>Contracted</button>
          <button style={small} onClick={() => onChange(null)}>Fought off</button>
        </div>
      )}
      {disease && typeof carried.stage === 'number' && (
        <>
          <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 4 }}>{stageText(disease, carried.stage)}</div>
          {/* The final stage is permanent: no more checks (DMG p.49). */}
          {carried.stage === finalStage(disease) ? <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 4, color: 'var(--muted)' }}>Final stage: no more Endurance checks. Only magic (such as Cure Disease) ends it.</div> : (
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
            <span style={{ color: 'var(--muted)' }}>After an extended rest, Endurance: improve {dc(disease.endurance.improveDc)}, maintain {dc(disease.endurance.maintainDc)}{disease.endurance.worsenText ? `, ${disease.endurance.worsenText}` : ''}.</span>
            <input type="number" value={roll} onChange={e => setRoll(e.target.value)} placeholder="check" aria-label="Endurance check result" style={{ width: 64 }}
              onKeyDown={e => { const o = enduranceOutcome(disease, Number(roll)); if (e.key === 'Enter' && roll !== '' && o) move(disease, carried.stage as number, o) }} />
            {(['improve', 'maintain', 'worsen'] as const).map(o => {
              const suggested = roll !== '' && enduranceOutcome(disease, Number(roll)) === o
              return <button key={o} style={{ ...small, fontWeight: suggested ? 700 : 400 }} onClick={() => move(disease, carried.stage as number, o)}>{o === 'improve' ? 'Improve' : o === 'maintain' ? 'Stay' : 'Worsen'}</button>
            })}
          </div>
          )}
        </>
      )}
      {open && disease && <div style={{ marginTop: 'var(--space-2)' }}><DiseaseStatblock disease={disease} /></div>}
    </div>
  )
}

interface Choice { key: string; label: string; kind: string; make: () => PcCondition }

/** One search for a standard condition or a disease (stage 1); anything else becomes an effect by that name. */
function AddCondition({ onAdd }: { onAdd: (c: PcCondition) => void }) {
  const diseases = useDiseaseNames()
  const [query, setQuery] = useState('')
  const results = useMemo((): Choice[] => {
    const q = query.trim()
    if (!q) return []
    const has = (name: string) => name.toLowerCase().includes(q.toLowerCase())
    const conditions = lastingConditionDefs().filter(d => has(d.name)).map((d): Choice =>
      ({ key: `condition:${d.id}`, label: d.name, kind: 'Condition', make: (): PcStatusCondition => ({ kind: 'condition', conditionId: d.id, since: now() }) }))
    const found = diseases.filter(n => has(n.name)).slice(0, 6).map((n): Choice =>
      ({ key: diseaseKey(n.ref), label: n.name, kind: 'Disease', make: (): PcDisease => ({ kind: 'disease', ...(n.ref as DiseaseRef), stage: 1, since: now() }) }))
    const effect: Choice = { key: 'effect', label: `“${q}”`, kind: 'New effect', make: (): PcEffect => ({ kind: 'effect', id: generateId(), name: q, since: now() }) }
    return [...conditions, ...found, effect]
  }, [query, diseases])
  const pick = (c: Choice) => { onAdd(c.make()); setQuery('') }
  return (
    <div className="add-condition" style={{ position: 'relative', fontSize: 'var(--font-size-sm)', width: 320 }}>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="+ Add a condition, disease, or effect…" aria-label="Search conditions and diseases to add, or name an effect"
        onKeyDown={e => { if (e.key === 'Enter' && results[0]) pick(results[0]) }} style={{ width: '100%' }} />
      {results.length > 0 && (
        <div className="condition-search-results" role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {results.map(r => (
            <button key={r.key} role="option" aria-selected={false} onClick={() => pick(r)}
              style={{ display: 'flex', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '1px 6px', cursor: 'pointer', color: 'inherit' }}>
              <span style={{ flex: 1 }}>{r.label}</span><span style={{ color: 'var(--muted)' }}>{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
