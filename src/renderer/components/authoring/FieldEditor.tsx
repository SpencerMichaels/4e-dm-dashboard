import { useState, useEffect } from 'react'
import type { EditStatus } from './live-edits'

interface Props {
  path: string; value: unknown; locked?: boolean
  /** Applies the field at the draft's newest revision. */
  save: (path: string, value: unknown) => Promise<void>
  comment: (path: string) => void
  status: (path: string, s: EditStatus) => void
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * One raw field. The edit goes into the draft when the field loses focus (or on Enter;
 * Ctrl+Enter in a text area). If the agent changed the same field meanwhile, the DM chooses.
 */
export function FieldEditor({ path, value, locked, save, comment, status }: Props) {
  const json = typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean'
  const format = (v: unknown) => json ? JSON.stringify(v, null, 2) : String(v ?? '')
  const [text, setText] = useState(format(value))
  // The field's value when this edit started, to tell an agent change to the same field.
  const [base, setBase] = useState<unknown>(value)
  const [changed, setChanged] = useState(false)
  const [collision, setCollision] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!changed) { setText(format(value)); setBase(value) } }, [value, changed])
  useEffect(() => () => status(path, 'clean'), [path])
  const edit = (s: string) => { setText(s); setChanged(true); setError(''); status(path, 'saving') }
  const parse = () => {
    const v = json ? JSON.parse(text) : typeof value === 'number' ? Number(text) : typeof value === 'boolean' ? text === 'true' : text
    if (typeof v === 'number' && (!text.trim() || !Number.isFinite(v))) throw new Error('Enter a number')
    return v
  }
  const submit = async (force = false) => {
    if (!changed || busy) return
    setError(''); setBusy(true)
    try {
      const v = parse()
      if (!force && !same(value, base) && !same(value, v)) { setCollision(true); status(path, 'stuck'); return }
      await save(path, v)
      setChanged(false); setCollision(false); status(path, 'clean')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); status(path, 'stuck') }
    finally { setBusy(false) }
  }
  const revert = () => { setChanged(false); setCollision(false); setError(''); status(path, 'clean') }
  const name = path.split('/').at(-1)!
  return <div className="authoring-field">
    <label><span>{name}{locked ? ' · your edit' : ''}</span>
      {typeof value === 'boolean' ? <select value={text} onChange={e => edit(e.target.value)} onBlur={() => void submit()}><option>true</option><option>false</option></select>
        : json || name === 'text' || text.length > 100 ? <textarea rows={json ? 6 : 3} value={text} onChange={e => edit(e.target.value)} onBlur={() => void submit()} onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); void submit() } }} />
          : <input type={typeof value === 'number' ? 'number' : 'text'} value={text} onChange={e => edit(e.target.value)} onBlur={() => void submit()} onKeyDown={e => { if (e.key === 'Enter') void submit() }} />}
    </label>
    <div className="authoring-actions">
      <button onClick={() => comment(path)} title={`Comment on ${name}`}>Comment</button>
    </div>
    {collision && <p role="alert" className="authoring-collision">The agent also changed this field while you were editing. <button onClick={() => void submit(true)}>Keep mine</button> <button onClick={revert}>Use the agent’s</button></p>}
    {error && <p role="alert" className="authoring-error">Not saved: {error} <button onClick={revert}>Undo my edit</button></p>}
  </div>
}

export function FieldTree(props: Props) {
  const { value, path } = props
  if (Array.isArray(value) && value.some(v => v && typeof v === 'object')) return <fieldset><legend>{path.split('/').at(-1)}</legend>
    {value.map((v, i) => <FieldTree key={i} {...props} value={v} path={`${path}/${i}`} />)}
    <details><summary>Add, remove, or edit entries as JSON</summary><FieldEditor {...props} /></details>
  </fieldset>
  if (value && typeof value === 'object' && !Array.isArray(value)) return <fieldset><legend>{path.split('/').at(-1)}</legend>
    {Object.entries(value).map(([key, v]) => <FieldTree key={key} {...props} value={v} path={`${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`} />)}
    <details><summary>Edit complete object / add optional fields</summary><FieldEditor {...props} /></details>
  </fieldset>
  return <FieldEditor {...props} />
}
