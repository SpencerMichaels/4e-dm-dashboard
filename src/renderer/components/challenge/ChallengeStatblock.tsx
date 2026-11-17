// A kit SkillChallenge as its printed statblock (RC pp. 157-159: level, complexity, skills, success and
// failure). With onChange, the same layout becomes the editor. DCs are tiers of the challenge's level (RC p. 126)
// shown as numbers at `level`: the level it runs at in an encounter, else its own, else the party's (a generic
// challenge "equal to the level of the party").

import type { ChallengeSkill, SkillChallenge } from '@kit'

import { challengeDc, challengeSuccesses, challengeXp, CHALLENGE_FAILURES } from '@common/rules/rewards'
import { partyLevel } from '@common/rules/party'
import { useCampaignStore } from '../../stores/campaign-store'
import { Annotation } from '../creature/annotations'
import { Add, Choice, listOps, Move, Num, Prose, Remove, Text } from '../statblock/fields'
import { RecordHeaderActions } from '../shared/record-header'
import '../creature/statblock.css'

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
type Dc = ChallengeSkill['dc']
const DC_CHOICES = [{ value: '', label: 'no DC' }, { value: 'easy', label: 'easy DC' }, { value: 'moderate', label: 'moderate DC' }, { value: 'hard', label: 'hard DC' }, { value: 'number', label: 'printed DC' }]

export function ChallengeStatblock({ challenge: c, onChange, level: shownAt }: { challenge: SkillChallenge; onChange?: (next: SkillChallenge) => void; level?: number }) {
  const edit = !!onChange
  const party = partyLevel(useCampaignStore(s => s.playerCharacters))
  const level = shownAt ?? c.level ?? party ?? 1
  const set = onChange && (<K extends keyof SkillChallenge>(key: K, value: SkillChallenge[K] | undefined) => {
    const next = { ...c, [key]: value }
    if (value === undefined) delete next[key]
    onChange(next)
  })
  const levelText = c.level == null ? `Party level (${level})` : shownAt != null && shownAt !== c.level ? `Level ${c.level}, run at ${shownAt}` : `Level ${c.level}`

  return <div className="stat-block-4e kit-statblock challenge-statblock" style={{ fontSize: 12, lineHeight: 1.5 }}>
    <div className="sb-header">
      <Text value={c.name} placeholder="Skill challenge name" className="sb-name" style={{ color: 'inherit' }} onChange={set && (v => set('name', v))} />
      <RecordHeaderActions />
      {edit
        ? <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <label title="A generic challenge: its level is the party's, so its DCs and XP follow the party (the DMG's sample challenges)" style={{ fontWeight: 'normal' }}>
              <input type="checkbox" checked={c.level == null} onChange={e => set!('level', e.target.checked ? null : level)} /> party level
            </label>
            {c.level != null && <>Level <Num value={c.level} min={1} max={30} label="Level" style={{ color: 'inherit', fontWeight: 600 }} onChange={v => set!('level', v ?? 1)} /></>}
          </span>
        : <span>{levelText} Skill Challenge</span>}
      <Annotation anchor={{ kind: 'stat', key: 'challenge-header' }} />
    </div>
    <div className="sb-subheader">
      <span>{edit
        ? <Choice value={String(c.complexity)} label="Complexity" options={[1, 2, 3, 4, 5].map(n => ({ value: String(n), label: `Complexity ${n}` }))} onChange={v => set!('complexity', Number(v))} />
        : `Complexity ${c.complexity}`}: {challengeSuccesses(c.complexity)} successes before {CHALLENGE_FAILURES} failures</span>
      <span>XP {challengeXp(level, c.complexity).toLocaleString('en-US')}</span>
    </div>

    {(edit || c.flavor) && <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 11 }}>
      <Prose value={c.flavor} placeholder="Flavor text" onChange={set && (v => set('flavor', v))} />
    </div>}

    <Section label="Setup" value={c.setup} placeholder="The situation and the goal" onChange={set && (v => set('setup', v))} anchor="challenge-setup" />
    <Skills label="Primary Skills" skills={c.primarySkills} level={level} onChange={set && (v => set('primarySkills', v))} />
    <Skills label="Secondary Skills" skills={c.secondarySkills} level={level} onChange={set && (v => set('secondarySkills', v))} />
    <Section label="Success" value={c.success} placeholder={`What the party gains with ${challengeSuccesses(c.complexity)} successes`} onChange={set && (v => set('success', v))} anchor="challenge-success" />
    <Section label="Failure" value={c.failure} placeholder={`What ${CHALLENGE_FAILURES} failures cost (the party still reaches the goal, at a price; RC p. 158)`} onChange={set && (v => set('failure', v))} anchor="challenge-failure" />
    {(edit || c.special) && <Section label="Special" value={c.special ?? ''} placeholder="Advantages, special rules" onChange={set && (v => set('special', v || undefined))} anchor="challenge-special" />}

    {c.sources.length > 0 && <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>{c.sources.map(s => `${s.book}${s.page ? `, page ${s.page}` : ''}`).join('; ')}</div>}
  </div>
}

function Section({ label, value, placeholder, onChange, anchor }: { label: string; value: string; placeholder: string; onChange?: (v: string) => void; anchor: `challenge-${string}` }) {
  if (!onChange && !value) return null
  return <div className="sb-section">
    <div className="sb-row" style={{ alignItems: 'baseline' }}>
      <span style={{ flex: 1 }}><b className="sb-label">{label}</b> <Prose value={value} placeholder={placeholder} onChange={onChange} /></span>
      <Annotation anchor={{ kind: 'stat', key: anchor }} />
    </div>
  </div>
}

/** A skill list: "Athletics (DC 16, moderate): text. Maximum 2 successes." */
function Skills({ label, skills, level, onChange }: { label: string; skills: ChallengeSkill[]; level: number; onChange?: (v: ChallengeSkill[]) => void }) {
  const edit = !!onChange
  const ops = listOps(skills, onChange)
  if (!edit && !skills.length) return null
  return <div className="sb-section challenge-skills">
    <div className="sb-row"><b className="sb-label">{label}</b></div>
    {skills.map((k, i) => {
      const dc = challengeDc(k.dc, level)
      const setK = ops.set && ((patch: Partial<ChallengeSkill>) => {
        const next = { ...k, ...patch }
        for (const key of Object.keys(patch) as (keyof ChallengeSkill)[]) if (next[key] === undefined) delete next[key]
        ops.set!(i, next)
      })
      return <div key={i} className="sb-row challenge-skill" style={{ alignItems: 'baseline', flexWrap: 'nowrap', paddingLeft: 8 }}>
        <Move index={i} length={skills.length} move={ops.move} />
        <span style={{ flex: 1 }}>
          {edit ? <>
            <Text value={k.skill} placeholder="Skill" label="Skill" onChange={v => setK!({ skill: v })} />
            {' '}<Choice value={typeof k.dc === 'number' ? 'number' : k.dc ?? ''} label="DC" options={DC_CHOICES}
              onChange={v => setK!({ dc: v === 'number' ? (dc ?? 10) : (v || undefined) as Dc })} />
            {typeof k.dc === 'number' && <> DC <Num value={k.dc} min={0} label="DC" onChange={v => setK!({ dc: v ?? 0 })} /></>}
            {typeof k.dc === 'string' && <span style={{ color: 'var(--muted)' }}> (DC {dc} at level {level})</span>}
            {' '}max <Num value={k.maxSuccesses} min={1} label="Maximum successes" placeholder="–" onChange={v => setK!({ maxSuccesses: v ?? undefined })} /> successes
            <div><Prose value={k.text} placeholder="What a check does" onChange={v => setK!({ text: v })} /></div>
          </> : <>
            <b>{cap(k.skill)}</b>{dc != null && <> (DC {dc}{typeof k.dc === 'string' ? `, ${k.dc}` : ''})</>}{k.text ? <>: {k.text}</> : null}
            {k.maxSuccesses != null && <> Maximum {k.maxSuccesses} success{k.maxSuccesses === 1 ? '' : 'es'}.</>}
          </>}
        </span>
        <Remove label={`Remove ${k.skill || 'skill'}`} onClick={ops.remove && (() => ops.remove!(i))} />
      </div>
    })}
    {edit && <div className="sb-row" style={{ paddingLeft: 8 }}><Add onClick={() => ops.add!({ skill: '', dc: 'moderate', text: '' })}>skill</Add></div>}
  </div>
}
