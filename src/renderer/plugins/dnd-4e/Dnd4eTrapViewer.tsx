import { PowerCardView } from './PowerCardView'
import './statblock.css'

interface TrapAction {
  name: string
  usage: string
  action?: string
  trigger?: string
  attack?: string
  hit?: string
  miss?: string
  effect?: string
  sustain?: string
  requirement?: string
}

interface ParsedTrap {
  name: string
  trapType: string
  level: number
  role: string
  modifier: string
  xp: number
  flavor: string
  description: string
  perception: string
  additionalSkills: { skill: string; text: string }[]
  initiative: string
  trigger: string
  attack: string
  countermeasures: string[]
  hp?: string
  ac?: string
  defenses?: string
  resist?: string
  immune?: string
  actions?: TrapAction[]
  source: string
}


const BOLD_LABELS = /^(Effect|Usage|Check|Success|Failure|Requirement|Target|Attack|Hit|Miss|Aftereffect|Special|Standard Action|Move Action|Minor Action|Free Action|Immediate Reaction|Immediate Interrupt|Opportunity Action):?\s/

/** Render a single line, bolding known labels */
function BoldLine({ line }: { line: string }) {
  const m = line.match(BOLD_LABELS)
  if (!m) return <>{line}</>
  return <><b className="sb-label">{m[0].replace(/:?\s$/, '')}</b>{line.substring(m[0].length - 1)}</>
}

/** Render text that may contain newlines as separate lines */
function MultiLine({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length <= 1) return <BoldLine line={text} />
  return <>{lines.map((line, i) => <div key={i}><BoldLine line={line} /></div>)}</>
}

export function Dnd4eTrapViewer({ trap }: { trap: ParsedTrap }) {
  const roleLabel = [trap.modifier, trap.role].filter(Boolean).join(' ')
  const hasInitiative = trap.initiative && trap.initiative !== '-' && trap.initiative !== '---'

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name">{trap.name}</span>
        {trap.level > 0 ? <span>Level {trap.level} {roleLabel}</span> : <span>{trap.trapType}</span>}
      </div>
      {trap.level > 0 && (
        <div className="sb-subheader">
          <span>{trap.trapType}</span>
          {trap.xp > 0 && <span>XP {trap.xp.toLocaleString()}</span>}
        </div>
      )}

      {/* Flavor */}
      {trap.flavor && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
          {trap.flavor}
        </div>
      )}

      {/* Description */}
      {trap.description && (
        <div className="sb-row" style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <span><MultiLine text={trap.description} /></span>
        </div>
      )}

      {/* Detection + Skills */}
      {(trap.perception || trap.additionalSkills.length > 0) && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {trap.perception && (
            <div className="sb-row"><span><b className="sb-label">Perception</b> <MultiLine text={trap.perception} /></span></div>
          )}
          {trap.additionalSkills.map((s, i) => (
            <div key={i} className="sb-row"><span><b className="sb-label">{s.skill}</b> <MultiLine text={s.text} /></span></div>
          ))}
        </div>
      )}

      {/* Stats */}
      {(trap.hp || trap.ac || trap.defenses || trap.resist || trap.immune || hasInitiative) && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {hasInitiative && (
            <div className="sb-row"><span><b className="sb-label">Initiative</b> {trap.initiative}</span></div>
          )}
          {trap.hp && <div className="sb-row"><span><b className="sb-label">HP</b> {trap.hp}</span></div>}
          {(trap.ac || trap.defenses) && (
            <div className="sb-row">
              <span>
                {trap.ac && <><b className="sb-label">AC</b> {trap.ac}</>}
                {trap.ac && trap.defenses && '; '}
                {trap.defenses}
              </span>
            </div>
          )}
          {trap.resist && <div className="sb-row"><span><b className="sb-label">Resist</b> {trap.resist}</span></div>}
          {trap.immune && <div className="sb-row"><span><b className="sb-label">Immune</b> {trap.immune}</span></div>}
        </div>
      )}

      {/* Trigger (old format) */}
      {trap.trigger && !trap.actions?.length && (
        <div className="sb-row" style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <span><b className="sb-label">Trigger</b> <MultiLine text={trap.trigger} /></span>
        </div>
      )}

      {/* Attack (old format) */}
      {trap.attack && !trap.actions?.length && (
        <div className="sb-row" style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <span><b className="sb-label">Attack</b> <MultiLine text={trap.attack} /></span>
        </div>
      )}

      {/* Actions */}
      {trap.actions && trap.actions.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {trap.actions.map((a, i) => (
            <PowerCardView key={i} entry={a} />
          ))}
        </div>
      )}

      {/* Countermeasures */}
      {trap.countermeasures.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div className="sb-row" style={{ fontWeight: 700 }}>Countermeasures</div>
          {trap.countermeasures.map((cm, i) => (
            <div key={i} className="sb-row" style={{ paddingLeft: 16 }}>
              <span>✦ {cm}</span>
            </div>
          ))}
        </div>
      )}

      {trap.source && (
        <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {trap.source}
        </div>
      )}
    </div>
  )
}
