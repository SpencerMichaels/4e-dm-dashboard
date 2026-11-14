// A kit Disease as its printed statblock. With onChange, the same layout becomes the editor.

import type { Attack, Disease, Power } from '@kit'
import { Annotation } from '../creature/annotations'
import { KitPowers } from '../statblock/KitPowers'
import { Add, Choice, LineText, listOps, Move, Num, Prose, Remove, Text } from '../statblock/fields'
import { RecordHeaderActions } from '../shared/record-header'
import '../creature/statblock.css'

const STAGE_LABELS: Record<number, string> = { 0: 'Cured' }
const node = (v: object) => (v as { _draftNode?: string })._draftNode
type Dc = Disease['endurance']['improveDc']
const dcText = (dc: Dc) => typeof dc === 'number' ? String(dc) : dc.text
/** "18" is a DC; anything else ("Easy DC", "15 + level") is kept as printed. */
const parseDc = (s: string): Dc => /^\s*\d+\s*$/.test(s) ? Number(s) : { text: s }

/** The infection attack shown and edited as a one-attack power, so it reuses the power card and editor. */
const attackPower = (a: Attack): Power => ({ name: 'Infection', action: 'no-action', usage: 'at-will', keywords: [], attacks: [a] })

export function DiseaseStatblock({ disease: d, onChange }: { disease: Disease; onChange?: (next: Disease) => void }) {
  const edit = !!onChange
  const set = onChange && (<K extends keyof Disease>(key: K, value: Disease[K] | undefined) => {
    const next = { ...d, [key]: value }
    if (value === undefined) delete next[key]
    onChange(next)
  })
  const stages = listOps(d.stages, set && (v => set('stages', v)))
  const endurance = d.endurance
  const setEndurance = set && ((patch: Partial<Disease['endurance']>) => {
    const next = { ...endurance, ...patch }
    if (!next.worsenText) delete next.worsenText
    set('endurance', next)
  })
  const nextStage = Math.max(0, ...d.stages.map(s => s.stage)) + 1

  return <div className="stat-block-4e kit-statblock" style={{ fontSize: 12, lineHeight: 1.5 }}>
    <div className="sb-header">
      <Text value={d.name} placeholder="Disease name" className="sb-name" style={{ color: 'inherit' }} onChange={set && (v => set('name', v))} />
      <RecordHeaderActions />
      {(edit || d.level > 0) && <span>Level <Num value={d.level} min={0} label="Level" style={{ color: 'inherit', fontWeight: 600 }} onChange={set && (v => set('level', v ?? 0))} /> Disease</span>}
      <Annotation anchor={{ kind: 'stat', key: 'disease-header' }} />
    </div>
    {!edit && d.level === 0 && <div className="sb-subheader"><span>Disease</span></div>}

    {(edit || d.flavor) && <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 11 }}>
      <Prose value={d.flavor} placeholder="Flavor text" onChange={set && (v => set('flavor', v))} />
      <Annotation anchor={{ kind: 'stat', key: 'disease-text' }} />
    </div>}

    {(edit || d.attack) && <div className="sb-section">
      {d.attack ? <div style={{ display: 'flex' }}><div style={{ flex: 1, minWidth: 0 }}>
        <KitPowers powers={[attackPower(d.attack)]} level={d.level} onChange={set && (powers => set('attack', powers[0]?.attacks[0]))} />
      </div><Remove label="Remove the infection attack" onClick={set && (() => set('attack', undefined))} /></div>
        : <div className="sb-row"><Add onClick={set && (() => set('attack', { label: 'primary', range: { kind: 'melee', reach: 1 }, target: 'one creature', bonus: { kind: 'level', plus: 2 }, vs: 'fortitude' }))}>infection attack</Add></div>}
      <Annotation anchor={{ kind: 'stat', key: 'disease-attack' }} />
    </div>}

    <div className="sb-section">
      {d.stages.map((s, i) => <div key={i} className="sb-row" style={{ alignItems: 'baseline', flexWrap: 'nowrap' }}>
        <Move index={i} length={d.stages.length} move={stages.move} />
        <span style={{ flex: 1 }}>
          <b className="sb-label">Stage {edit ? <Num value={s.stage} min={0} label="Stage" onChange={stage => stages.set!(i, { ...s, stage: stage ?? 0 })} /> : s.stage}</b>
          {(STAGE_LABELS[s.stage] || s.final) && !edit && <span style={{ color: 'var(--text-secondary)' }}> ({s.final ? 'Final State' : STAGE_LABELS[s.stage]})</span>}
          {edit && <label style={{ fontSize: 10, margin: '0 4px', color: 'var(--text-secondary)' }}><input type="checkbox" checked={!!s.final}
            onChange={e => { const next = { ...s, final: true as const }; if (!e.target.checked) delete (next as { final?: true }).final; stages.set!(i, next) }} /> final</label>}
          : <LineText line={s.line} placeholder={s.stage === 0 ? 'The target is cured.' : 'Effect at this stage'} onChange={stages.set && (line => stages.set!(i, { ...s, line }))} />
        </span>
        <Remove label={`Remove stage ${s.stage}`} onClick={stages.remove && (() => stages.remove!(i))} />
        <Annotation anchor={{ kind: 'entry', entry: { entryType: 'stage', label: `Stage ${s.stage}`, _draftNode: node(s) } }} />
      </div>)}
      <div className="sb-row"><Add onClick={stages.add && (() => stages.add!({ stage: nextStage, line: { text: '', clauses: [] } }))}>stage</Add></div>
    </div>

    <div className="sb-section">
      <div className="sb-row" style={{ alignItems: 'baseline' }}>
        <span style={{ flex: 1 }}><b className="sb-label">Check</b>{' '}
          {/* The books print the Endurance timing as boilerplate; a non-Endurance check carries its own text. */}
          {d.check ? <Prose value={d.check.text} placeholder="The check and when it is made" onChange={set && (text => set('check', { ...d.check!, text }))} />
            : `At the end of each extended rest, the target makes an Endurance check if it is at ${stageRange(d)}.`}
        </span>
        {edit && <Choice value={d.check ? 'other' : 'endurance'} label="Check kind" options={[{ value: 'endurance', label: 'Endurance' }, { value: 'other', label: 'other check' }]}
          onChange={v => set!('check', v === 'other' ? { skill: '', text: `At the end of each extended rest, the target makes a check if it is at ${stageRange(d)}.` } : undefined)} />}
      </div>
      {edit && d.check && <div className="sb-row" style={{ paddingLeft: 16 }}>Skill <Text value={d.check.skill} placeholder="Arcana or Insight" label="Check skill" onChange={skill => set!('check', { ...d.check!, skill })} /></div>}
      <table className="sb-check-table">
        <thead><tr><th>Result</th><th>Effect</th></tr></thead>
        <tbody className="striped-rows">
          <tr><td>{edit ? <><Text value={dcText(endurance.improveDc)} label="Improve DC" onChange={v => setEndurance!({ improveDc: parseDc(v) })} /> or higher</> : `${dcText(endurance.improveDc)} or higher`}</td><td>The stage of the disease decreases by one.</td></tr>
          <tr><td>{edit ? <><Text value={dcText(endurance.maintainDc)} label="Maintain DC" onChange={v => setEndurance!({ maintainDc: parseDc(v) })} /> to below improve</> : maintainBand(endurance)}</td><td>No change.</td></tr>
          <tr><td>Lower than {dcText(endurance.maintainDc)}</td><td>{edit ? <Prose value={endurance.worsenText} placeholder="The stage of the disease increases by one." onChange={v => setEndurance!({ worsenText: v })} /> : endurance.worsenText || 'The stage of the disease increases by one.'}</td></tr>
        </tbody>
      </table>
      <Annotation anchor={{ kind: 'stat', key: 'disease-check' }} />
    </div>

    {d.sources.length > 0 && <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>{d.sources.map(s => `${s.book}${s.page ? `, page ${s.page}` : ''}`).join('; ')}</div>}
  </div>
}

/** "stage 1 or 2": the stages between cured and final, where the check is made. */
function stageRange(d: Disease) {
  const mid = d.stages.filter(s => s.stage > 0 && !s.final).map(s => s.stage)
  if (!mid.length) return 'any stage short of the final one'
  return `stage ${mid.length === 1 ? mid[0] : mid.slice(0, -1).join(', ') + ' or ' + mid.at(-1)}`
}

/** "10–13" for numeric DCs, otherwise the printed lower bound. */
function maintainBand(e: Disease['endurance']) {
  if (typeof e.maintainDc === 'number' && typeof e.improveDc === 'number') return `${e.maintainDc}–${e.improveDc - 1}`
  return `${dcText(e.maintainDc)} or higher, below ${dcText(e.improveDc)}`
}
