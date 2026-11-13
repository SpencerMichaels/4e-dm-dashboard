// A kit MonsterTemplate as its printed statblock. With onChange, the same layout becomes the editor.

import { ROLES, SENSE_KINDS, type Defense, type MonsterTemplate } from '@kit'
import { Annotation } from '../creature/annotations'
import { KitPowers, KitTraits } from '../statblock/KitPowers'
import { Add, Choice, listOps, Num, Prose, Remove, Tags, Text } from '../statblock/fields'
import '../creature/statblock.css'

const DEFENSES: Defense[] = ['ac', 'fortitude', 'reflex', 'will']
const DEFENSE_LABEL: Record<Defense, string> = { ac: 'AC', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' }
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
const senseText = (s: MonsterTemplate['senses'][number]) => `${s.kind.replace(/-/g, ' ')}${s.range !== undefined ? ' ' + s.range : ''}`
const parseSense = (s: string) => { const m = s.trim().toLowerCase().match(/^(.*?)\s*(\d+)?$/)!; return { kind: m[1].replace(/ /g, '-') as MonsterTemplate['senses'][number]['kind'], ...(m[2] ? { range: Number(m[2]) } : {}) } }

export function TemplateStatblock({ template: t, onChange }: { template: MonsterTemplate; onChange?: (next: MonsterTemplate) => void }) {
  const edit = !!onChange
  const set = onChange && (<K extends keyof MonsterTemplate>(key: K, value: MonsterTemplate[K] | undefined) => {
    const next = { ...t, [key]: value }
    if (value === undefined) delete next[key]
    onChange(next)
  })
  const resist = listOps(t.resist, set && (v => set('resist', v)))
  const vulnerable = listOps(t.vulnerable, set && (v => set('vulnerable', v)))
  const defenses = DEFENSES.filter(d => edit || t.defenses[d])
  const rank = t.rankChange === 'down' ? 'Elite (from solo)' : 'Elite'

  return <div className="stat-block-4e kit-statblock" style={{ fontSize: 12, lineHeight: 1.5 }}>
    <div className="sb-header">
      <Text value={t.name} placeholder="Template name" className="sb-name" style={{ color: 'inherit', flex: 1 }} onChange={set && (v => set('name', v))} />
      <span>{rank} <Choice value={t.role} options={['any', ...ROLES]} label="Role" style={{ textTransform: 'capitalize' }} onChange={set && (v => set('role', v as MonsterTemplate['role']))} />
        {edit ? <label style={{ fontSize: 10, marginLeft: 4 }}><input type="checkbox" checked={!!t.leader} onChange={e => set!('leader', e.target.checked ? true : undefined)} /> leader</label> : t.leader && ' (Leader)'}</span>
      <Annotation anchor={{ kind: 'stat', key: 'template-header' }} />
    </div>
    <div className="sb-subheader">
      <span style={{ flex: 1 }}>Prerequisite: <Text value={t.prerequisite.text} placeholder="Humanoid, level 11" label="Prerequisite" style={{ color: 'inherit', minWidth: '12ch' }}
        onChange={set && (text => set('prerequisite', { ...t.prerequisite, text }))} /></span>
      <span>XP Elite</span>
    </div>

    {(edit || t.description) && <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
      <Prose value={t.description} placeholder="What the template represents" onChange={set && (v => set('description', v))} />
      <Annotation anchor={{ kind: 'stat', key: 'template-text' }} />
    </div>}

    <div className="sb-section">
      {(edit || t.keyword) && <div className="sb-row"><b className="sb-label">Keyword</b> <Text value={t.keyword} placeholder="undead" label="Keyword" onChange={set && (v => set('keyword', v || undefined))} /></div>}
      {(edit || t.senses.length > 0) && <div className="sb-row"><b className="sb-label">Senses</b> <Tags values={t.senses.map(senseText)} placeholder="+ sense" suggestions={SENSE_KINDS.map(k => k.replace(/-/g, ' '))}
        onChange={set && (v => set('senses', v.map(parseSense)))} /></div>}
      {defenses.length > 0 && <div className="sb-row"><b className="sb-label">Defenses</b> {defenses.map((d, i) => <span key={d}>
        {edit ? <>+<Num value={t.defenses[d]} placeholder="0" label={DEFENSE_LABEL[d]} onChange={v => { const next = { ...t.defenses, [d]: v }; if (!v) delete next[d]; set!('defenses', next) }} /></> : `+${t.defenses[d]}`} {DEFENSE_LABEL[d]}{i < defenses.length - 1 ? ',' : ''}</span>)}</div>}
      {(edit || t.immune.length > 0) && <div className="sb-row"><b className="sb-label">Immune</b> <Tags values={t.immune.map(i => i.type)} placeholder="+ immunity" onChange={set && (v => set('immune', v.map(type => ({ type }))))} /></div>}
      {(edit || t.resist.length > 0) && <div className="sb-row"><b className="sb-label">Resist</b>
        {t.resist.map((r, i) => <span key={i}>{edit ? <><Num value={r.byTier.heroic} label="Heroic" onChange={v => resist.set!(i, { ...r, byTier: { ...r.byTier, heroic: v ?? 0 } })} />/<Num value={r.byTier.paragon} label="Paragon" onChange={v => resist.set!(i, { ...r, byTier: { ...r.byTier, paragon: v ?? 0 } })} />/<Num value={r.byTier.epic} label="Epic" onChange={v => resist.set!(i, { ...r, byTier: { ...r.byTier, epic: v ?? 0 } })} /> <Text value={r.type} label="Resist type" onChange={type => resist.set!(i, { ...r, type })} /><Remove label="Remove resistance" onClick={() => resist.remove!(i)} /></>
          : `${r.byTier.heroic}/${r.byTier.paragon}/${r.byTier.epic} ${r.type} (heroic/paragon/epic)`}</span>)}
        <Add onClick={resist.add && (() => resist.add!({ type: 'necrotic', byTier: { heroic: 5, paragon: 10, epic: 15 } }))}>resistance</Add></div>}
      {(edit || t.vulnerable.length > 0) && <div className="sb-row"><b className="sb-label">Vulnerable</b>
        {t.vulnerable.map((v, i) => <span key={i}>{edit ? <><Num value={v.value} label="Vulnerable amount" onChange={value => vulnerable.set!(i, { ...v, value })} /> <Text value={v.type} label="Vulnerable type" onChange={type => vulnerable.set!(i, { ...v, type })} /><Remove label="Remove vulnerability" onClick={() => vulnerable.remove!(i)} /></>
          : `${v.value ?? ''} ${v.type}`.trim()}</span>)}
        <Add onClick={vulnerable.add && (() => vulnerable.add!({ type: 'radiant', value: 5 }))}>vulnerability</Add></div>}
      <div className="sb-row"><b className="sb-label">Hit Points</b> +{edit ? <Num value={t.hpPerLevel} label="HP per level" onChange={v => set!('hpPerLevel', v ?? 0)} /> : t.hpPerLevel} per level + Constitution score
        {(edit || t.hpNote) && <>{' '}<Text value={t.hpNote} placeholder="note" label="HP note" onChange={set && (v => set('hpNote', v || undefined))} /></>}</div>
      {(edit || t.regeneration) && <div className="sb-row"><b className="sb-label">Regeneration</b> <Num value={t.regeneration?.value} placeholder="—" label="Regeneration"
        onChange={set && (value => set('regeneration', value ? { ...t.regeneration, value } : undefined))} />
        {(edit ? t.regeneration : t.regeneration?.note) && <>{' '}<Text value={t.regeneration?.note} placeholder="note" label="Regeneration note" onChange={set && (note => set('regeneration', { ...t.regeneration!, note: note || undefined }))} /></>}</div>}
      <div className="sb-row"><b className="sb-label">Saving Throws</b> +{edit ? <Num value={t.savingThrows} label="Saving throws" onChange={v => set!('savingThrows', v ?? 0)} /> : t.savingThrows};{' '}
        <b className="sb-label">Action Points</b> {edit ? <Num value={t.actionPoints} label="Action points" onChange={v => set!('actionPoints', v ?? 0)} /> : t.actionPoints}</div>
      <Annotation anchor={{ kind: 'stat', key: 'template-stats' }} />
    </div>

    {(edit || t.traits.length > 0 || t.auras.length > 0) && <div className="sb-section">
      <KitTraits traits={t.traits} auras={t.auras} onTraits={set && (v => set('traits', v))} onAuras={set && (v => set('auras', v))} />
    </div>}
    {(edit || t.powers.length > 0) && <div className="sb-section">
      <KitPowers powers={t.powers} role={t.role === 'any' ? undefined : t.role} onChange={set && (v => set('powers', v))} />
    </div>}

    {t.sources.some(s => s.book) && <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{t.sources.map(s => s.book).filter(Boolean).join('; ')}</div>}
  </div>
}

