// An imported PC sheet (kit CharacterSnapshot) as stat block rows, for the PC page and the combat panel,
// and the file picker that imports .dnd4e / .4ecb files.

import { useCallback, useState } from 'react'
import { DEFENSE_LABELS, SKILLS, type CharacterSnapshot } from '@kit'
import { sign } from '../creature/dnd4e-utils'
import { Modal } from '../shared/Modal'
import '../creature/statblock.css'

export const sheetSubtitle = (s: CharacterSnapshot) =>
  [`Level ${s.level}`, s.race, s.class].filter(Boolean).join(' ') + (s.paragonPath ? `, ${s.paragonPath}` : '') + (s.epicDestiny ? `, ${s.epicDestiny}` : '')

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Defenses as the initiative list shows them: "AC 19 F 16 R 19 W 16". */
export const defenseLine = (s: CharacterSnapshot) =>
  `AC ${s.defenses.ac} F ${s.defenses.fortitude} R ${s.defenses.reflex} W ${s.defenses.will}`

/** The rows a DM needs: hit points for reference, defenses, initiative, passives, resistances, trained skills. */
export function PcSheetRows({ sheet: s, showHp = true }: { sheet: CharacterSnapshot; showHp?: boolean }) {
  const trained = SKILLS.filter(k => s.skills[k]?.trained)
  // .sb-row is a flex row: each row's text sits in one span so it flows (and punctuation stays put).
  const row = (content: React.ReactNode) => <div className="sb-row"><span>{content}</span></div>
  const label = (t: string) => <b className="sb-label">{t}</b>
  const resist = s.resist.length > 0 && <>{label('Resist')} {s.resist.map(r => `${r.value} ${r.type}`).join(', ')}</>
  const saves = s.savingThrowBonus !== 0 && <>{label('Saving Throws')} {sign(s.savingThrowBonus)}</>
  return <>
    {showHp && row(<>{label('HP')} {s.hp.max}; {label('Bloodied')} {s.hp.bloodied}; {label('Surges')} {s.hp.surgesPerDay} ({s.hp.surgeValue} hp)</>)}
    {row((['ac', 'fortitude', 'reflex', 'will'] as const).map((d, i) =>
      <span key={d}>{i > 0 && (i === 1 ? '; ' : ', ')}{label(DEFENSE_LABELS[d])} {s.defenses[d]}</span>))}
    {row(<>{label('Initiative')} {sign(s.initiative)}; {label('Speed')} {s.speed}</>)}
    {row(<>{label('Passive')} Perception {s.passivePerception}, Insight {s.passiveInsight}</>)}
    {(resist || saves) && row(<>{resist}{resist && saves && '; '}{saves}</>)}
    {trained.length > 0 && row(<>{label('Trained')} {trained.map(k => `${cap(k)} ${sign(s.skills[k].total)}`).join(', ')}</>)}
  </>
}

export type ImportOutcome = { created: string[]; updated: string[]; errors: string[] }

/** Opens the file picker and imports what the DM chose; `targetId` imports one file onto that PC. */
export function useCharacterImport() {
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const pick = useCallback((targetId?: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.dnd4e,.4ecb'
    input.multiple = !targetId
    input.onchange = async () => {
      const files = await Promise.all([...input.files ?? []].map(async f => ({ name: f.name, text: await f.text() })))
      if (files.length) setOutcome(await window.api.pc.import(files, targetId))
    }
    input.click()
  }, [])
  return { pick, outcome, clear: () => setOutcome(null) }
}

/**
 * Files an import could not read. Successes need no message (the PCs appear or change in the list); errors do, in
 * a dialog over the page rather than a banner that pushes it down.
 */
export function ImportErrorsDialog({ errors, onClose }: { errors: string[]; onClose: () => void }) {
  return (
    <Modal title="Import failed" onClose={onClose} maxWidth={520} footer={<button className="btn btn-primary" onClick={onClose}>OK</button>}>
      {errors.map(e => <div key={e} style={{ color: 'var(--danger)' }}>{e}</div>)}
    </Modal>
  )
}
