import type { Creature, CreatureBuilderConfig } from '@common/types'
import type { PowerEntry } from './PowerEntryEditor'
import { PowerCardView } from './PowerCardView'
import { useImage } from '@renderer/hooks/use-image'
import { xpForCreature, sign } from './dnd4e-utils'
import './statblock.css'

interface Props {
  creature: Creature
  config?: CreatureBuilderConfig
  tooltip?: (term: string) => string
  imageId?: string  // Override image (e.g., from annotation)
}

export function Dnd4eCreatureViewer({ creature, tooltip: tip, imageId: imageIdOverride }: Props) {
  const tooltip = tip ?? (() => '')
  const sb = creature.statBlock
  const effectiveImageId = imageIdOverride ?? creature.imageId
  const imageUrl = useImage(effectiveImageId)
  const level = (sb.level as number) ?? 1
  const role = (sb.role as string) ?? ''
  const modifier = (sb.monsterModifier as string) ?? ''
  const halfLvl = Math.floor(level / 2)
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

  const roleLabel = (modifier ? cap(modifier) + ' ' : '') + (role ? cap(role) : '')
  const origin = (sb.origin as string) ?? ''
  const creatureType = (sb.creatureType as string) ?? ''
  const subtypes = Array.isArray(sb.subtypes) ? sb.subtypes as string[] : []
  const abilities = (sb.abilities as Record<string, number>) ?? {}
  const defs = (sb.defenses as Record<string, number>) ?? {}
  const skills = (sb.skills as Record<string, number>) ?? {}
  const speeds = (sb.speeds as Record<string, number>) ?? {}
  const immunities = Array.isArray(sb.immunities) ? sb.immunities as { type: string }[] : []
  const resistances = Array.isArray(sb.resistances) ? sb.resistances as { type: string; value?: number }[] : []
  const weaknesses = Array.isArray(sb.weaknesses) ? sb.weaknesses as { type: string; value?: number }[] : []
  const actions = Array.isArray(sb.actions) ? sb.actions as PowerEntry[] : []
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
      <div className="sb-subheader" style={{ marginBottom: 2 }}>
        <span>
          <span title={tooltip(sb.size as string ?? 'Medium')}>{sb.size as string ?? 'Medium'}</span>
          {' '}<span title={tooltip(origin)}>{origin}</span>
          {' '}<span title={tooltip(creatureType)}>{creatureType}</span>
          {subtypes.length > 0 && <> ({subtypes.map((s, i) => <span key={s}>{i > 0 && ', '}<span title={tooltip(s)}>{s}</span></span>)})</>}
        </span>
        <span>XP {xpForCreature(level, modifier)}</span>
      </div>

      {/* Stats + image side by side */}
      <div style={imageUrl ? { display: 'flex', gap: 12 } : undefined}>
      <div style={{ flex: 1, minWidth: 0 }}>

      {/* Group 1: Initiative, Senses, Speed, Saves/AP */}
      <div className="sb-row">
        <span><b className="sb-label">Initiative</b> {sign((sb.initiative as number) ?? 0)}</span>;{' '}
        <span><b className="sb-label">Senses</b> Perception {sign((sb.perception as number) ?? 0)}
          {senses.length > 0 && <>; {senses.map((s, i) => <span key={s}>{i > 0 && ', '}<span title={tooltip(s)}>{s}</span></span>)}</>}</span>
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
          {immunities.length > 0 && <span><b className="sb-label">Immune</b> {immunities.map((e, i) => <span key={i}>{i > 0 && ', '}<span title={tooltip(e.type)}>{e.type}</span></span>)}</span>}
          {immunities.length > 0 && (resistances.length > 0 || weaknesses.length > 0) && <span>;</span>}
          {resistances.length > 0 && <span><b className="sb-label">Resist</b> {resistances.map((e, i) => <span key={i}>{i > 0 && ', '}<span title={tooltip(e.type)}>{e.type}</span> {e.value ?? ''}</span>)}</span>}
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
            <b className="sb-label">Skills</b> {Object.entries(skills).map(([name, mod]) => `${cap(name)} ${sign(mod)}`).join(', ')}
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

      </div>{/* end stats column */}

      {/* Creature image */}
      {imageUrl && (
        <div style={{ flexShrink: 0, maxWidth: 180, alignSelf: 'flex-start' }}>
          <img src={imageUrl} style={{ width: '100%', display: 'block', borderRadius: 'var(--radius-md)' }} alt="" />
        </div>
      )}
      </div>{/* end flex row */}

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
          {powerEntries.map((a, i) => <PowerCardView key={i} entry={a} />)}
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

