// A kit Trap as its printed statblock. With onChange, the same layout becomes the editor.

import { monsterXp, type DamageModifier, type Defense, type Line, type Trap } from '@kit'
import { Annotation } from '../creature/annotations'
import { KitPowers, KitTraits } from '../statblock/KitPowers'
import { Add, Choice, LineText, listOps, Move, Num, Prose, Remove, Tags, Text } from '../statblock/fields'
import '../creature/statblock.css'

const KINDS = ['trap', 'hazard', 'terrain', 'object', 'area', 'special'] as const
const ROLES = ['blaster', 'lurker', 'obstacle', 'warder']
const RANKS = ['standard', 'elite', 'solo'] as const
const DEFENSES: Defense[] = ['ac', 'fortitude', 'reflex', 'will']
const DEFENSE_LABEL: Record<Defense, string> = { ac: 'AC', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' }
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
const sourceText = (t: Trap) => t.sources.map(s => `${s.book}${s.page ? `, page ${s.page}` : ''}`).join('; ')
const node = (v: object) => (v as { _draftNode?: string })._draftNode
const blankLine = (): Line => ({ text: '', clauses: [] })

export function TrapStatblock({ trap: t, onChange }: { trap: Trap; onChange?: (next: Trap) => void }) {
  const edit = !!onChange
  const set = onChange && (<K extends keyof Trap>(key: K, value: Trap[K] | undefined) => {
    const next = { ...t, [key]: value }
    if (value === undefined) delete next[key]
    onChange(next)
  })
  // XP follows level and rank while it still matches the formula; a custom XP stays.
  const setRanked = onChange && ((level: number, rank: Trap['rank']) => onChange({ ...t, level, rank, xp: t.xp === monsterXp(t.level, t.rank) ? monsterXp(level, rank) : t.xp }))
  const detect = listOps(t.detect, set && (v => set('detect', v)))
  const counters = listOps(t.countermeasures, set && (v => set('countermeasures', v)))
  const resist = listOps(t.resist, set && (v => set('resist', v)))
  const defenses = t.defenses ?? {}
  const hasStats = edit || t.initiative !== undefined || t.hp !== undefined || t.hpText || DEFENSES.some(d => defenses[d] !== undefined) || t.speed
  const roleLabel = [t.rank !== 'standard' ? cap(t.rank) : '', cap(t.role)].filter(Boolean).join(' ')

  return <div className="stat-block-4e kit-statblock" style={{ fontSize: 12, lineHeight: 1.5 }}>
    <div className="sb-header">
      <Text value={t.name} placeholder="Trap name" className="sb-name" style={{ color: 'inherit', flex: 1 }} onChange={set && (v => set('name', v))} />
      {edit ? <span style={{ whiteSpace: 'nowrap' }}>Level <Num value={t.level} min={1} max={40} label="Level" style={{ color: 'inherit', fontWeight: 600 }} onChange={v => setRanked!(v ?? 1, t.rank)} />{' '}
        <Choice value={t.rank} options={RANKS} label="Rank" style={{ textTransform: 'capitalize' }} onChange={v => setRanked!(t.level, v as Trap['rank'])} />{' '}
        <Choice value={t.role} options={ROLES} label="Role" style={{ textTransform: 'capitalize' }} onChange={v => set!('role', v)} /></span>
        : t.level > 0 && <span>Level {t.level} {roleLabel}</span>}
      <Annotation anchor={{ kind: 'stat', key: 'trap-header' }} />
    </div>
    <div className="sb-subheader">
      <span style={{ textTransform: 'capitalize' }}>
        <Choice value={t.kind} options={KINDS} label="Kind" onChange={set && (v => set('kind', v as Trap['kind']))} />
        {(t.kind === 'terrain' || t.usage) && <>{' '}<Choice value={t.usage ?? ''} options={[{ value: '', label: 'usage' }, { value: 'at-will', label: 'at-will' }, { value: 'single-use', label: 'single-use' }]} label="Usage"
          onChange={set && (v => set('usage', (v || undefined) as Trap['usage']))} /></>}
      </span>
      <span>XP {edit ? <Num value={t.xp} min={0} label="XP" style={{ color: 'inherit' }} onChange={v => set!('xp', v ?? 0)} /> : t.xp.toLocaleString()}</span>
    </div>

    <div className="sb-anchored">
      {(edit || t.flavor) && <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 11 }}>
        <Prose value={t.flavor} placeholder="Flavor text" onChange={set && (v => set('flavor', v))} />
      </div>}
      {(edit || t.description) && <div className="sb-row sb-section"><Prose value={t.description} placeholder="Description" onChange={set && (v => set('description', v))} /></div>}
      <Annotation anchor={{ kind: 'stat', key: 'trap-text' }} />
    </div>

    {(edit || t.detect.length > 0) && <div className="sb-section sb-anchored">
      {!edit && groupBySkill(t.detect).map(([skill, checks]) => <div key={skill}>
        <div className="sb-row"><b className="sb-label">{skill}</b></div>
        {checks.map((d, i) => <div key={i} className="sb-row" style={{ paddingLeft: 8, alignItems: 'baseline', flexWrap: 'nowrap' }}><span>✦</span><span>{[d.dc !== null ? `DC ${d.dc}` : '', d.text].filter(Boolean).join(': ')}</span></div>)}
      </div>)}
      {edit && t.detect.map((d, i) => <div key={i} className="sb-row" style={{ alignItems: 'baseline', flexWrap: 'nowrap' }}>
        <Move index={i} length={t.detect.length} move={detect.move} />
        <span style={{ flex: 1 }}>
          <b className="sb-label"><Text value={d.skill} placeholder="Skill" label="Skill" onChange={detect.set && (skill => detect.set!(i, { ...d, skill }))} /></b>{' '}
          {edit ? <>DC <Num value={d.dc ?? undefined} placeholder="none" label="DC" onChange={dc => detect.set!(i, { ...d, dc: dc ?? null })} />: </> : d.dc !== null ? `DC ${d.dc}: ` : ''}
          <Prose value={d.text} placeholder="What the check reveals" onChange={detect.set && (text => detect.set!(i, { ...d, text }))} />
        </span>
        <Remove label="Remove check" onClick={detect.remove && (() => detect.remove!(i))} />
      </div>)}
      <div className="sb-row"><Add onClick={detect.add && (() => detect.add!({ skill: 'Perception', dc: null, text: '' }))}>check</Add></div>
      <Annotation anchor={{ kind: 'stat', key: 'trap-detect' }} />
    </div>}

    {hasStats && <div className="sb-section sb-anchored">
      {(edit || t.initiative !== undefined) && <div className="sb-row"><b className="sb-label">Initiative</b> {edit ? <Num value={t.initiative} placeholder="—" label="Initiative" onChange={v => set!('initiative', v)} /> : t.initiative !== undefined && (t.initiative >= 0 ? signed(t.initiative) : t.initiative)}</div>}
      {t.speed && <div className="sb-row"><b className="sb-label">Speed</b> {[t.speed.walk ? String(t.speed.walk) : '', ...Object.entries(t.speed).filter(([k]) => k !== 'walk' && k !== 'notes').map(([k, v]) => `${k} ${v}`), t.speed.notes ?? ''].filter(Boolean).join(', ')}</div>}
      {(edit || t.hp !== undefined || t.hpText) && <div className="sb-row"><b className="sb-label">HP</b> <Num value={t.hp} placeholder="—" label="HP" onChange={set && (v => set('hp', v))} />
        {(edit || t.hpText) && <>{' '}<Text value={t.hpText} placeholder="or text" label="HP text" onChange={set && (v => set('hpText', v || undefined))} /></>}</div>}
      {(edit || DEFENSES.some(d => defenses[d] !== undefined)) && <div className="sb-row">
        {DEFENSES.filter(d => edit || defenses[d] !== undefined).map((d, i, shown) => <span key={d}><b className="sb-label">{DEFENSE_LABEL[d]}</b> <Num value={defenses[d]} placeholder="—" label={DEFENSE_LABEL[d]}
          onChange={set && (v => { const next = { ...defenses, [d]: v }; if (v === undefined) delete next[d]; set('defenses', Object.keys(next).length ? next : undefined) })} />{i < shown.length - 1 ? (i === 0 ? ';' : ',') : ''}</span>)}
      </div>}
      <Annotation anchor={{ kind: 'stat', key: 'trap-stats' }} />
    </div>}

    {(edit || t.immune.length > 0 || t.resist.length > 0) && <div className="sb-section sb-anchored">
      {(edit || t.immune.length > 0) && <div className="sb-row"><b className="sb-label">Immune</b> <Tags values={t.immune.map(x => x.type)} placeholder="+ immunity" onChange={set && (v => set('immune', v.map(type => ({ type }))))} /></div>}
      {(edit || t.resist.length > 0) && <div className="sb-row"><b className="sb-label">Resist</b>
        {t.resist.map((r: DamageModifier, i) => <span key={i}>{edit ? <><Num value={r.value} placeholder="#" label="Resist amount" onChange={value => { const next = { ...r, value }; if (value === undefined) delete next.value; resist.set!(i, next) }} /> <Text value={r.type} placeholder="type" label="Resist type" onChange={type => resist.set!(i, { ...r, type })} /><Remove label="Remove resistance" onClick={() => resist.remove!(i)} /></>
          : `${r.value ?? ''} ${r.type}${r.text ? ' ' + r.text : ''}${r.note ? ' ' + r.note : ''}`.trim()}{!edit && i < t.resist.length - 1 ? ', ' : ' '}</span>)}
        <Add onClick={resist.add && (() => resist.add!({ type: 'fire', value: 5 }))}>resistance</Add></div>}
      <Annotation anchor={{ kind: 'stat', key: 'trap-damage' }} />
    </div>}

    {(edit || t.trigger) && <div className="sb-row sb-section sb-anchored" style={{ alignItems: 'baseline', flexWrap: 'nowrap' }}>
      <b className="sb-label">Trigger</b> <LineText line={t.trigger} placeholder="When the trap acts" onChange={set && (line => set('trigger', line.text.trim() || line.clauses.length ? line : undefined))} />
      <Annotation anchor={{ kind: 'stat', key: 'trap-trigger' }} />
    </div>}

    {(edit || t.traits.length > 0 || t.auras.length > 0) && <div className="sb-section">
      <KitTraits traits={t.traits} auras={t.auras} onTraits={set && (v => set('traits', v))} onAuras={set && (v => set('auras', v))} />
    </div>}

    {(edit || t.powers.length > 0) && <div className="sb-section" style={{ paddingTop: 2 }}>
      <KitPowers powers={t.powers} level={t.level} role={t.role} onChange={set && (v => set('powers', v))} />
    </div>}

    {(edit || t.countermeasures.length > 0) && <div className="sb-section">
      <div className="sb-row" style={{ fontWeight: 700 }}>Countermeasures</div>
      {t.countermeasures.map((c, i) => <div key={i} className="sb-row sb-anchored" style={{ paddingLeft: 16, alignItems: 'baseline', flexWrap: 'nowrap' }}>
        <Move index={i} length={t.countermeasures.length} move={counters.move} />
        <span>✦</span> <LineText line={c} placeholder="How characters can stop or avoid it" onChange={counters.set && (line => counters.set!(i, line))} />
        <Remove label="Remove countermeasure" onClick={counters.remove && (() => counters.remove!(i))} />
        <Annotation anchor={{ kind: 'entry', entry: { entryType: 'countermeasure', label: `Countermeasure ${i + 1}`, _draftNode: node(c) } }} />
      </div>)}
      <div className="sb-row" style={{ paddingLeft: 16 }}><Add onClick={counters.add && (() => counters.add!(blankLine()))}>countermeasure</Add></div>
    </div>}

    {t.sources.length > 0 && <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>{sourceText(t)}</div>}
  </div>
}

/** Detection checks grouped by skill in printed order: "Perception" then a ✦ line per DC. */
function groupBySkill(checks: Trap['detect']): [string, Trap['detect']][] {
  const groups: [string, Trap['detect']][] = []
  for (const c of checks) {
    const last = groups.at(-1)
    if (last && last[0] === c.skill) last[1].push(c)
    else groups.push([c.skill, [c]])
  }
  return groups
}
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n))
