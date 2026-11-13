import type { Monster } from '@kit'
import { Annotation } from '../creature/annotations'
import { Markdown } from './Markdown'

/** The description and other rules text the stat block has no row for, in the same place in both modes. */
export function DraftNotes({ monster: m, edit }: { monster: Monster; edit?: { value: string; change: (value: string) => void } }) {
  const extra = [
    m.speed.notes && `Movement: ${m.speed.notes}`,
    m.regeneration?.text && `Regeneration: ${m.regeneration.text}`,
    ...(m.skillNotes ?? []),
    ...m.resist.filter(x => x.text || x.note).map(x => `Resist ${x.type}: ${[x.text, x.note].filter(Boolean).join(' ')}`),
    ...m.vulnerable.filter(x => x.text || x.note).map(x => `Vulnerable ${x.type}: ${[x.text, x.note].filter(Boolean).join(' ')}`),
  ].filter(Boolean) as string[]
  return <section className="authoring-notes">
    <h3>Notes <Annotation anchor={{ kind: 'stat', key: 'description' }} /></h3>
    {edit ? <textarea aria-label="Description" rows={Math.min(24, Math.max(6, edit.value.split('\n').length + 1))} value={edit.value} onChange={e => edit.change(e.target.value)} placeholder="Tactics, lore, and how to run the creature (markdown)" />
      : m.description ? <Markdown text={m.description} /> : <p className="authoring-notice">No description.</p>}
    {extra.length > 0 && <ul className="authoring-notes-extra">{extra.map((t, i) => <li key={i}>{t}</li>)}</ul>}
  </section>
}
