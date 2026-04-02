import type { Creature, CreatureBuilderConfig } from '@common/types'
import type { ActionEntry, DamagePart } from '@renderer/components/campaign/ActionEntryEditor'
import './statblock.css'

// XP by level (DMG p.56)
const XP_BY_LEVEL: Record<number, number> = {
  1:100,2:125,3:150,4:175,5:200,6:250,7:300,8:350,9:400,10:500,
  11:600,12:700,13:800,14:1000,15:1200,16:1400,17:1600,18:2000,19:2400,20:2800,
  21:3200,22:4150,23:5100,24:6050,25:7000,26:9000,27:11000,28:13000,29:15000,30:19000,
}
const XP_MULT: Record<string, number> = { elite: 2, solo: 5 }
function xpForCreature(level: number, modifier?: string): number {
  const base = XP_BY_LEVEL[level] ?? XP_BY_LEVEL[30]
  return Math.round(base * (XP_MULT[modifier || ''] ?? 1))
}

const USAGE_COLORS: Record<string, string> = {
  'at-will': '#4a7a5a',
  'encounter': '#7a4a4a',
  'recharge': '#6a6a72',
}

const DND4E_ACTION_TYPES: Record<string, string> = {
  'standard': 'standard action', 'move': 'move action', 'minor': 'minor action',
  'free': 'free action', 'immediate-interrupt': 'immediate interrupt', 'immediate-reaction': 'immediate reaction',
}

interface Props {
  creature: Creature
  config?: CreatureBuilderConfig
}

export function Dnd4eCreatureViewer({ creature }: Props) {
  const sb = creature.statBlock
  const level = (sb.level as number) ?? 1
  const role = (sb.role as string) ?? ''
  const modifier = (sb.monsterModifier as string) ?? ''
  const halfLvl = Math.floor(level / 2)
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

  const roleLabel = (modifier ? cap(modifier) + ' ' : '') + (role ? cap(role) : '')
  const traits = Array.isArray(sb.traits) ? sb.traits as string[] : []
  const origin = traits[0] ?? ''
  const creatureType = traits[1] ?? ''
  const subtypes = traits.slice(2)
  const abilities = (sb.abilities as Record<string, number>) ?? {}
  const defs = (sb.defenses as Record<string, number>) ?? {}
  const skills = (sb.skills as Record<string, number>) ?? {}
  const speeds = (sb.speeds as Record<string, number>) ?? {}
  const immunities = Array.isArray(sb.immunities) ? sb.immunities as { type: string }[] : []
  const resistances = Array.isArray(sb.resistances) ? sb.resistances as { type: string; value?: number }[] : []
  const weaknesses = Array.isArray(sb.weaknesses) ? sb.weaknesses as { type: string; value?: number }[] : []
  const actions = Array.isArray(sb.actions) ? sb.actions as ActionEntry[] : []
  const languages = Array.isArray(sb.languages) ? sb.languages as string[] : typeof sb.languages === 'string' ? (sb.languages as string).split(',').map(s => s.trim()).filter(Boolean) : []
  const senses = Array.isArray(sb.senses) ? sb.senses as string[] : typeof sb.senses === 'string' ? (sb.senses as string).split(',').map(s => s.trim()).filter(Boolean) : []
  const equipment = Array.isArray(sb.equipment) ? sb.equipment as string[] : typeof sb.equipment === 'string' ? (sb.equipment as string).split(',').map(s => s.trim()).filter(Boolean) : []

  const traitEntries = actions.filter(a => a.entryType === 'trait')
  const auraEntries = actions.filter(a => a.entryType === 'aura')
  const powerEntries = actions.filter(a => a.entryType === 'action')
  const usageOrder: Record<string, number> = { 'at-will': 0, 'encounter': 1, 'recharge': 2 }
  powerEntries.sort((a, b) => (usageOrder[a.usage] ?? 3) - (usageOrder[b.usage] ?? 3))

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name">{creature.name}</span>
        <span>Level {level} {roleLabel}</span>
      </div>
      <div className="sb-subheader">
        <span>{sb.size as string ?? 'Medium'} {origin} {creatureType}{subtypes.length > 0 ? ` (${subtypes.join(', ')})` : ''}</span>
        <span>XP {xpForCreature(level, modifier)}</span>
      </div>

      {/* Group 1: Initiative, Senses, Speed, Saves/AP */}
      <div className="sb-row">
        <span><b className="sb-label">Initiative</b> +{(sb.initiative as number) ?? 0}</span>;{' '}
        <span><b className="sb-label">Senses</b> Perception +{(sb.perception as number) ?? 0}
          {senses.length > 0 && <>; {senses.join(', ')}</>}</span>
      </div>
      {((sb.speed as number) > 0 || Object.keys(speeds).length > 0) && (
        <div className="sb-row">
          <b className="sb-label">Speed</b>{' '}
          {(sb.speed as number) > 0 && <span>{sb.speed as number}</span>}
          {Object.entries(speeds).map(([key, val], i) => (
            <span key={key}>{((sb.speed as number) > 0 || i > 0) && ', '}{key.replace(/_/g, ' ')} {val}</span>
          ))}
        </div>
      )}
      {(((sb.savingThrowBonus as number) ?? 0) > 0 || ((sb.actionPoints as number) ?? 0) > 0) && (
        <div className="sb-row">
          {((sb.savingThrowBonus as number) ?? 0) > 0 && <span><b className="sb-label">Saving Throws</b> +{sb.savingThrowBonus as number}</span>}
          {((sb.actionPoints as number) ?? 0) > 0 && <span><b className="sb-label">Action Points</b> {sb.actionPoints as number}</span>}
        </div>
      )}

      {/* Group 2: HP, AC, Defenses, Immune/Resist/Vulnerable */}
      <div className="sb-row" style={{ borderTop: '1px solid var(--sb-separator)' }}>
        <span><b className="sb-label">HP</b> {creature.hp}; <b className="sb-label">Bloodied</b> {Math.floor(creature.hp / 2)}</span>
      </div>
      <div className="sb-row">
        <span><b className="sb-label">AC</b> {sb.ac as number ?? 10};</span>
        <span><b className="sb-label">Fortitude</b> {defs.fortitude ?? 10},</span>
        <span><b className="sb-label">Reflex</b> {defs.reflex ?? 10},</span>
        <span><b className="sb-label">Will</b> {defs.will ?? 10}</span>
      </div>
      {(immunities.length > 0 || resistances.length > 0 || weaknesses.length > 0) && (
        <div className="sb-row">
          {immunities.length > 0 && <span><b className="sb-label">Immune</b> {immunities.map(e => e.type).join(', ')}</span>}
          {immunities.length > 0 && (resistances.length > 0 || weaknesses.length > 0) && <span>;</span>}
          {resistances.length > 0 && <span><b className="sb-label">Resist</b> {resistances.map(e => `${e.type} ${e.value ?? ''}`).join(', ').trim()}</span>}
          {resistances.length > 0 && weaknesses.length > 0 && <span>;</span>}
          {weaknesses.length > 0 && <span><b className="sb-label">Vulnerable</b> {weaknesses.map(e => `${e.type} ${e.value ?? ''}`).join(', ').trim()}</span>}
        </div>
      )}

      {/* Group 3: Alignment, Languages, Skills, Abilities, Equipment */}
      <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
        {(sb.alignment as string) && (
          <div className="sb-row">
            <b className="sb-label">Alignment</b> {sb.alignment as string}
          </div>
        )}
        {languages.length > 0 && (
          <div className="sb-row">
            <b className="sb-label">Languages</b> {languages.join(', ')}
          </div>
        )}
        {Object.keys(skills).length > 0 && (
          <div className="sb-row">
            <b className="sb-label">Skills</b> {Object.entries(skills).map(([name, mod]) => `${cap(name)} +${mod}`).join(', ')}
          </div>
        )}
        {Object.keys(abilities).length > 0 && (
          <div className="sb-abilities">
            {['str', 'dex', 'wis', 'con', 'int', 'cha'].filter(ab => abilities[ab] != null).map(ab => {
              const score = abilities[ab]
              const mod = Math.floor((score - 10) / 2)
              return <span key={ab}><b className="sb-label">{cap(ab)}</b> {score} ({mod >= 0 ? '+' : ''}{mod})</span>
            })}
          </div>
        )}
        {equipment.length > 0 && (
          <div className="sb-row">
            <b className="sb-label">Equipment</b> {equipment.join(', ')}
          </div>
        )}
      </div>

      {/* Traits */}
      {traitEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {traitEntries.map((a, i) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <b>{a.name}</b>
              {a.effect && <> {a.effect}</>}
            </div>
          ))}
        </div>
      )}

      {/* Auras */}
      {auraEntries.length > 0 && (
        <div style={{ paddingTop: 2 }}>
          {auraEntries.map((a, i) => (
            <div key={i} style={{ padding: '2px 8px' }}>
              <b>{a.name}</b> aura {a.auraRange ?? 1}
              {a.effect && <>; {a.effect}</>}
            </div>
          ))}
        </div>
      )}

      {/* Powers */}
      {powerEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {powerEntries.map((a, i) => <PowerView key={i} entry={a} />)}
        </div>
      )}

      {/* Description */}
      {(sb.description as string) && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {sb.description as string}
        </div>
      )}
      {(sb.source as string) && (
        <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {sb.source as string}
        </div>
      )}
    </div>
  )
}

function PowerView({ entry: e }: { entry: ActionEntry }) {
  const usageColor = USAGE_COLORS[e.usage] ?? '#6a6a72'
  const actionLabel = DND4E_ACTION_TYPES[e.actionType] ?? e.actionType
  const hasAttack = e.attackBonus != null
  const damage = normalizeDamage(e.damage)

  return (
    <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: 1 }}>
      {/* Header */}
      <div style={{ padding: '2px 8px', background: usageColor, color: '#fff' }}>
        <b>{e.name}</b>
        <span style={{ color: 'rgba(255,255,255,0.8)' }}> ({actionLabel}
          {e.usage && <>; {e.usage}</>}
          {e.rechargeCondition && <> {e.rechargeCondition}</>}
          )</span>
        {e.keywords?.length > 0 && (
          <span style={{ color: 'rgba(255,255,255,0.7)' }}> ✦ {e.keywords.join(', ')}</span>
        )}
      </div>
      {/* Attack subheader */}
      {hasAttack && (
        <div style={{ padding: '1px 8px', background: usageColor + '88', color: '#fff' }}>
          {e.rangeType && <>{e.rangeType.replace('-', ' ')}</>}
          {e.rangeValue && <> {e.rangeValue}</>}
          {e.target && <> ({e.target})</>}
          ; +{e.attackBonus} vs {e.defense}
          {e.attackNotes && <> {e.attackNotes}</>}
        </div>
      )}
      {/* Body */}
      <div style={{ padding: '1px 8px 2px 16px' }}>
        {e.trigger && <div><b style={{ color: 'var(--color-text-secondary)' }}>Trigger</b> {e.trigger}</div>}
        {e.requirement && <div><b style={{ color: 'var(--color-text-secondary)' }}>Requirement</b> {e.requirement}</div>}
        {damage.length > 0 && (
          <div>
            <b style={{ color: 'var(--color-text-secondary)' }}>Damage</b>{' '}
            {damage.map((p, i) => (
              <span key={i}>{i > 0 && ' plus '}{p.ongoing && 'ongoing '}{p.expr}{p.type && ` ${p.type}`}</span>
            ))}
          </div>
        )}
        {e.hit && <div><b style={{ color: 'var(--color-text-secondary)' }}>Hit</b> {e.hit}</div>}
        {e.miss && <div><b style={{ color: 'var(--color-text-secondary)' }}>Miss</b> {e.miss}</div>}
        {e.effect && <div><b style={{ color: 'var(--color-text-secondary)' }}>Effect</b> {e.effect}</div>}
      </div>
    </div>
  )
}

function normalizeDamage(damage: DamagePart[] | string | undefined): DamagePart[] {
  if (!damage) return []
  if (Array.isArray(damage)) return damage.filter(p => p.expr)
  if (typeof damage === 'string' && damage.trim()) return [{ expr: damage.trim(), type: '', ongoing: false }]
  return []
}
