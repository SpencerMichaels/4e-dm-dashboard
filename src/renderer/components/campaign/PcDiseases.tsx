// Diseases the party carries (DMG p.49). Exposed PCs resolve the disease's attack after the
// encounter (contracted at stage 1, or fought off); infected PCs make an Endurance check after each
// extended rest, which moves them a stage (improve, stay, worsen). Stage 0 is cured.

import { useMemo, useState } from 'react'
import type { Disease } from '@kit'
import type { DiseaseRef, PcDisease, PlayerCharacter } from '@common/types'
import { Icon } from '../shared/Icon'
import { enduranceOutcome, finalStage, nextStage, stageText, type EnduranceOutcome } from '@common/rules/diseases'
import { diseaseKey, useDisease, useDiseaseNames } from '../disease/disease-refs'
import { DiseaseStatblock } from '../disease/DiseaseStatblock'

const dc = (v: number | { text: string }) => typeof v === 'number' ? `DC ${v}` : v.text

export function PcDiseases({ pcs, onSave }: { pcs: PlayerCharacter[]; onSave: (pc: PlayerCharacter) => void }) {
  const rows = pcs.flatMap(pc => (pc.diseases ?? []).map(d => ({ pc, d })))
  const set = (pc: PlayerCharacter, key: string, next: PcDisease | null) => onSave({
    ...pc,
    diseases: (pc.diseases ?? []).flatMap(d => diseaseKey(d) !== key ? [d] : next ? [next] : []),
  })
  return (
    <section className="pc-diseases" style={{ marginTop: 'var(--space-5)' }}>
      <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-2)' }}>Diseases</h2>
      {rows.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>No one is exposed or infected. In combat, click a disease named in a power's text, then the PC; or add one here.</p>}
      {rows.map(({ pc, d }) => <PcDiseaseRow key={pc.id + diseaseKey(d)} pc={pc} carried={d} onChange={next => set(pc, diseaseKey(d), next)} />)}
      <AddDisease pcs={pcs} onAdd={(pc, ref) => {
        if ((pc.diseases ?? []).some(d => diseaseKey(d) === diseaseKey(ref))) return
        onSave({ ...pc, diseases: [...(pc.diseases ?? []), { ...ref, stage: 1, since: new Date().toISOString() }] })
      }} />
    </section>
  )
}

function PcDiseaseRow({ pc, carried, onChange }: { pc: PlayerCharacter; carried: PcDisease; onChange: (next: PcDisease | null) => void }) {
  const disease = useDisease(carried)
  const [open, setOpen] = useState(false)
  const [roll, setRoll] = useState('')
  const now = () => new Date().toISOString()
  if (disease === undefined) return null
  const name = disease?.name ?? 'This disease no longer exists'
  const small = { fontSize: 'var(--font-size-xs)', padding: '1px 8px' }

  const move = (d: Disease, stage: number, outcome: EnduranceOutcome) => {
    const next = nextStage(d, stage, outcome)
    setRoll('')
    onChange(next === 0 ? null : { ...carried, stage: next, since: now() })
  }

  return (
    <div className="pc-disease" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)', marginBottom: 'var(--space-2)', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <b>{pc.name}</b>
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

function AddDisease({ pcs, onAdd }: { pcs: PlayerCharacter[]; onAdd: (pc: PlayerCharacter, ref: DiseaseRef) => void }) {
  const names = useDiseaseNames()
  const [pcId, setPcId] = useState('')
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? names.filter(n => n.name.toLowerCase().includes(q)).slice(0, 8) : []
  }, [query, names])
  const pc = pcs.find(p => p.id === pcId) ?? pcs[0]
  if (!pcs.length) return null
  return (
    <div className="add-disease" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 'var(--font-size-sm)' }}>
      <select value={pc?.id ?? ''} onChange={e => setPcId(e.target.value)} aria-label="PC">
        {pcs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div style={{ position: 'relative' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="+ Add a disease (stage 1)…" aria-label="Search diseases to add"
          onKeyDown={e => { if (e.key === 'Enter' && results[0] && pc) { onAdd(pc, results[0].ref); setQuery('') } }} style={{ width: 240 }} />
        {results.length > 0 && (
          <div className="disease-search-results" role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {results.map(r => (
              <button key={diseaseKey(r.ref)} role="option" aria-selected={false} onClick={() => { if (pc) onAdd(pc, r.ref); setQuery('') }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '1px 6px', cursor: 'pointer', color: 'inherit' }}>{r.name}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
