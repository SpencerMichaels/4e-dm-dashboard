// A kit MonsterTheme as its printed statblock: description, origin and skill changes, then the
// attack and utility power menus. With onChange, the same layout becomes the editor.

import { ORIGINS, SKILLS, type MonsterTheme, type ThemePower } from '@kit'
import { Annotation } from '../creature/annotations'
import { KitPowers } from '../statblock/KitPowers'
import { Choice, Num, Prose, Tags, Text } from '../statblock/fields'
import { RecordHeaderActions } from '../shared/record-header'
import '../creature/statblock.css'

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
const CATEGORIES = [{ key: 'attack', label: 'Attack Powers' }, { key: 'utility', label: 'Utility Powers' }] as const

export function ThemeStatblock({ theme: t, onChange }: { theme: MonsterTheme; onChange?: (next: MonsterTheme) => void }) {
  const edit = !!onChange
  const set = onChange && (<K extends keyof MonsterTheme>(key: K, value: MonsterTheme[K] | undefined) => {
    const next = { ...t, [key]: value }
    if (value === undefined) delete next[key]
    onChange(next)
  })
  const skills = t.skills
  const setSkills = set && ((patch: Partial<NonNullable<MonsterTheme['skills']>>) => {
    const next = { always: [], bonus: 2, ...skills, ...patch }
    set('skills', next.always.length || next.choices?.length ? next : undefined)
  })
  // The menus are edited per category; the theme keeps attack powers before utility powers, as printed.
  const byCategory = (c: ThemePower['category']) => t.powers.filter(p => p.category === c)
  const setCategory = set && ((c: ThemePower['category'], powers: ThemePower[]) =>
    set('powers', CATEGORIES.flatMap(k => k.key === c ? powers.map(p => ({ ...p, category: c })) : byCategory(k.key))))

  return <div className="stat-block-4e kit-statblock" style={{ fontSize: 12, lineHeight: 1.5 }}>
    <div className="sb-header">
      <Text value={t.name} placeholder="Theme name" className="sb-name" style={{ color: 'inherit' }} onChange={set && (v => set('name', v))} />
      <RecordHeaderActions />
      <span>Theme</span>
      <Annotation anchor={{ kind: 'stat', key: 'theme-header' }} />
    </div>
    <div className="sb-subheader">
      <span>{t.sources.map(s => s.book).filter(Boolean).join('; ')}</span>
      <span>{t.powers.length} powers</span>
    </div>

    {(edit || t.description) && <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 11 }}>
      <Prose value={t.description} placeholder="Who has this theme" onChange={set && (v => set('description', v))} />
      <Annotation anchor={{ kind: 'stat', key: 'theme-text' }} />
    </div>}

    {(edit || t.originChange || skills) && <div className="sb-section">
      {(edit || t.originChange) && <div className="sb-row"><b className="sb-label">Origin</b> {edit ? <Choice value={t.originChange ?? ''} label="Origin change" options={[{ value: '', label: 'unchanged' }, ...ORIGINS.map(o => ({ value: o, label: o }))]}
        onChange={v => set!('originChange', (v || undefined) as MonsterTheme['originChange'])} /> : `origin becomes ${t.originChange}`}</div>}
      {(edit || skills) && <div className="sb-row"><b className="sb-label">Skills</b>
        {edit ? <>+<Num value={skills?.bonus ?? 2} label="Skill bonus" onChange={bonus => setSkills!({ bonus: bonus ?? 0 })} /> to <Tags values={skills?.always ?? []} placeholder="+ skill" suggestions={[...SKILLS]} onChange={always => setSkills!({ always })} /></>
          : <>+{skills!.bonus} bonus to {[skills!.always.map(cap).join(', '), ...(skills!.choices ?? []).map(g => g.map(cap).join(' or '))].filter(Boolean).join('; ')} checks</>}
      </div>}
      <Annotation anchor={{ kind: 'stat', key: 'theme-mods' }} />
    </div>}

    {CATEGORIES.map(({ key, label }) => {
      const powers = byCategory(key)
      if (!edit && !powers.length) return null
      return <div key={key} className="sb-section">
        <div style={{ padding: '4px 8px', marginTop: 8, fontWeight: 700, fontSize: 14 }}>{label}</div>
        {edit ? <>
          <KitPowers powers={powers} blank={{ category: key }} onChange={next => setCategory!(key, next as ThemePower[])} />
          {powers.map((p, i) => <div key={i} className="sb-row" style={{ alignItems: 'baseline', flexWrap: 'nowrap' }}>
            <b className="sb-label" style={{ minWidth: '10ch' }}>{p.name || 'New power'}</b>
            <Prose value={p.flavor} placeholder="Flavor" onChange={flavor => setCategory!(key, powers.map((x, j) => j === i ? { ...x, flavor: flavor || undefined } : x))} />
            <Text value={p.recommendedText ?? p.recommendedFor?.join(', ')} placeholder="recommended for" label="Recommended for"
              onChange={text => setCategory!(key, powers.map((x, j) => j === i ? { ...x, recommendedText: text || undefined, recommendedFor: undefined } : x))} />
          </div>)}
        </> : powers.map((p, i) => <div key={i} style={{ marginTop: 12 }}>
          <KitPowers powers={[p]} />
          {p.flavor && <div style={{ padding: '2px 8px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{p.flavor}</div>}
          {!p.flavor && (p.recommendedText || p.recommendedFor?.length) && <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
            Recommended for: {p.recommendedText ?? p.recommendedFor!.join(', ')}</div>}
        </div>)}
      </div>
    })}
  </div>
}
