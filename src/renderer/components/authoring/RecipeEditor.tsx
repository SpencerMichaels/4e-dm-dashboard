// The numeric recipe as a form (it was a JSON text box), and the calculated changes it
// proposes as a readable list (it was raw JSON). The recipe records deliberate adjustments
// to the calculated monster numbers; nothing applies until the DM applies the proposal.

import { useEffect, useState } from 'react'
import type { Monster } from '@kit'
import type { Change, Draft, NumberRecipe } from '@common/authoring/types'
import { readPath } from '@common/authoring/patch'
import { targetLabel } from '@common/authoring/anchors'
import { showValue } from '@common/authoring/diff'
import type { EditStatus } from './live-edits'

type PowerChoice = NonNullable<NumberRecipe['powers']>[string]
export interface NumberProposal {
  revision: number
  changes: Change[]
  protectedFields: string[]
  damageGuidance: { target: string; dice?: string; note: string }[]
  assumptions: string
}

const DEFENSES = [['ac', 'AC'], ['fortitude', 'Fort'], ['reflex', 'Ref'], ['will', 'Will']] as const

/** A number input that commits on blur or Enter; empty means "not set". */
function NumberField({ label, value, step = 1, placeholder, commit, title }: { label: string; value: number | undefined; step?: number; placeholder?: string; commit: (v: number | undefined) => void; title?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => { setText(value === undefined ? '' : String(value)) }, [value])
  const done = () => { const v = text.trim() === '' ? undefined : Number(text); if (v === undefined || Number.isFinite(v)) { if (v !== value) commit(v) } else setText(value === undefined ? '' : String(value)) }
  return <label className="recipe-field" title={title}><span>{label}</span>
    <input type="number" step={step} placeholder={placeholder} value={text} onChange={e => setText(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') done() }} /></label>
}

export function RecipeEditor({ draft: d, save, status }: { draft: Draft; save: (recipe: NumberRecipe) => Promise<void>; status: (path: string, s: EditStatus) => void }) {
  const recipe: NumberRecipe = d.recipe ?? {}
  const m = d.content as Monster
  const [error, setError] = useState('')
  const update = (next: NumberRecipe) => {
    status('/recipe', 'saving'); setError('')
    void save(next).then(() => status('/recipe', 'clean'), e => { setError(e instanceof Error ? e.message : String(e)); status('/recipe', 'stuck') })
  }
  const setPower = (node: string, choice: PowerChoice) => {
    const powers = { ...recipe.powers, [node]: choice }
    if (!Object.values(choice).some(v => v !== undefined && v !== false && v !== 0)) delete powers[node]
    update({ ...recipe, powers })
  }
  const attackPowers = m.powers.map((p, i) => ({ p, node: d.nodes.powers[i] })).filter(({ p }) => p.attacks.length > 0)
  return <div className="recipe-editor">
    {error && <p role="alert" className="authoring-error">Not saved: {error} <button onClick={() => { setError(''); status('/recipe', 'clean') }}>Dismiss</button></p>}
    <div className="recipe-row">
      <NumberField label="HP ×" step={0.05} placeholder="1" value={recipe.hpMultiplier} commit={v => update({ ...recipe, hpMultiplier: v })} title="Multiplier on calculated HP; insubstantial creatures commonly use about 0.7" />
      <NumberField label="Initiative ±" value={recipe.initiativeOffset} placeholder="0" commit={v => update({ ...recipe, initiativeOffset: v })} />
      <NumberField label="Speed" value={recipe.speed} placeholder="unchanged" commit={v => update({ ...recipe, speed: v })} />
    </div>
    <div className="recipe-row">
      {DEFENSES.map(([key, label]) => <NumberField key={key} label={`${label} ±`} placeholder="0" value={recipe.defenseOffsets?.[key]}
        commit={v => update({ ...recipe, defenseOffsets: { ...recipe.defenseOffsets, [key]: v } })} />)}
    </div>
    {attackPowers.length > 0 && <table className="recipe-powers data-table">
      <thead><tr><th>Power</th><th>Accuracy ±</th><th>Damage band</th><th title="Encounter or recharge: use the limited damage table">Limited</th></tr></thead>
      <tbody>{attackPowers.map(({ p, node }) => {
        const c: PowerChoice = recipe.powers?.[node] ?? {}
        return <tr key={node}><td>{p.name}</td>
          <td><NumberField label="" placeholder="0" value={c.accuracy} commit={v => setPower(node, { ...c, accuracy: v })} /></td>
          <td><select value={c.damageBand ?? ''} onChange={e => setPower(node, { ...c, damageBand: (e.target.value || undefined) as PowerChoice['damageBand'] })}>
            <option value="">keep</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></td>
          <td><input type="checkbox" checked={!!c.limited} onChange={e => setPower(node, { ...c, limited: e.target.checked || undefined })} /></td></tr>
      })}</tbody>
    </table>}
  </div>
}

/** What applying the recipe would change, field by field, and the damage it suggests. */
export function ProposalView({ draft: d, proposal }: { draft: Draft; proposal: NumberProposal }) {
  const read = (path: string) => { try { return readPath(d, path) } catch { return undefined } }
  const label = (path: string) => targetLabel(d, path)
  // Attack bonuses are { kind: 'fixed', value }: show them as "+12".
  const value = (v: unknown) => v && typeof v === 'object' && 'value' in (v as object) ? `+${(v as { value: number }).value}` : showValue(v)
  const changes = proposal.changes.filter(c => JSON.stringify(read(c.path)) !== JSON.stringify(c.value))
  return <div className="recipe-proposal">
    {changes.length ? <ul>{changes.map(c => <li key={c.path}><b>{label(c.path)}</b>: <del>{value(read(c.path))}</del> → <ins>{value(c.value)}</ins></li>)}</ul>
      : <p className="authoring-notice">The numbers already match the recipe.</p>}
    {proposal.protectedFields.length > 0 && <p className="authoring-notice">Kept as you edited them: {proposal.protectedFields.map(label).join(', ')}. Reset one under <b>Your edits</b> to let the recipe set it.</p>}
    {proposal.damageGuidance.length > 0 && <><p>Damage to write into the hit lines (not applied automatically):</p>
      <ul>{proposal.damageGuidance.map(g => <li key={g.target}><b>{label(g.target)}</b>: {g.dice ?? '—'} <span className="authoring-notice">{g.note}</span></li>)}</ul></>}
  </div>
}
