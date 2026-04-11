import type { ReactNode } from 'react'
import type { Creature, CreatureBuilderConfig } from '@common/types'
import type { PowerEntry } from './PowerEntryEditor'
import { PowerCardView } from './PowerCardView'
import type { TemplateFieldDiff } from './monster-templates'
import { useImage } from '@renderer/hooks/use-image'
import { CreatureImageEditor } from '@renderer/components/shared/CreatureImageEditor'
import { xpForCreature, sign } from './dnd4e-utils'
import './statblock.css'

// Per-template-slot color palette (used for visual attribution of template-modified values)
const TEMPLATE_COLORS = ['var(--color-accent)', '#f59f00']
const templateColor = (idx: number): string => TEMPLATE_COLORS[idx] ?? '#9c36b5'

// Render a numeric stat with template-attribution highlighting
function StatNumber({ value, field, diffs }: { value: number; field: string; diffs?: TemplateFieldDiff[] }): ReactNode {
  const matches = diffs?.filter(d => d.field === field) ?? []
  if (matches.length === 0) return value
  const sorted = [...matches].sort((a, b) => a.sourceIndex - b.sourceIndex)
  const original = sorted[0].before
  const lineage = sorted.map(d => {
    const delta = d.after - d.before
    return `${delta >= 0 ? '+' : ''}${delta} from ${d.source}`
  }).join('; ')
  const title = `${lineage}; original: ${original}`
  const color = templateColor(sorted[sorted.length - 1].sourceIndex)
  return <span title={title} style={{ color, textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>{value}</span>
}

// Wrap a template-stamped list item (immune/resist/etc.) with per-source color + tooltip
function templateItemStyle(item: any): React.CSSProperties | undefined {
  if (!item || item._templateSource == null) return undefined
  return { color: templateColor(item._templateSourceIndex ?? 0), textDecoration: 'underline dotted', textUnderlineOffset: 2 }
}
function templateItemTitle(item: any, baseTitle?: string): string | undefined {
  if (!item || item._templateSource == null) return baseTitle
  const attribution = `from ${item._templateSource}`
  return baseTitle ? `${baseTitle} — ${attribution}` : attribution
}

export interface TemplateChip {
  name: string
  slot: number      // 0-based slot index, used for color
  preview?: boolean // dashed style for not-yet-committed previews
}

interface Props {
  creature: Creature
  config?: CreatureBuilderConfig
  tooltip?: (term: string) => string
  imageId?: string  // Override image (e.g., from annotation)
  tokenImageId?: string  // Override token image (e.g., from annotation)
  tokenCrop?: { x: number; y: number; size: number }  // Override token crop region
  onImageChange?: (imageId: string) => void  // If provided, show editable drop box
  onTokenChange?: (tokenImageId: string, crop: { x: number; y: number; size: number }) => void  // If provided, show editable token crop box
  onClone?: () => void  // If provided, show clone-to-custom icon in header
  onEdit?: () => void  // If provided, show edit icon in header (for custom creatures)
  templateChips?: TemplateChip[]
  onTemplateChipClick?: (templateName: string) => void
}

export function Dnd4eCreatureViewer({ creature, tooltip: tip, imageId: imageIdOverride, tokenImageId: tokenImageIdOverride, tokenCrop: tokenCropOverride, onImageChange, onTokenChange, onClone, onEdit, templateChips, onTemplateChipClick }: Props) {
  const tooltip = tip ?? (() => '')
  const sb = creature.statBlock
  const effectiveImageId = imageIdOverride ?? creature.imageId
  const effectiveTokenImageId = tokenImageIdOverride ?? creature.tokenImageId
  const effectiveTokenCrop = tokenCropOverride ?? creature.tokenCrop
  const imageUrl = useImage(effectiveImageId)
  const showImageEditor = !!onImageChange
  const level = (sb.level as number) ?? 1
  const role = (sb.role as string) ?? ''
  const modifier = (sb.monsterModifier as string) ?? ''
  const halfLvl = Math.floor(level / 2)
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

  const roleLabel = (modifier ? cap(modifier) + ' ' : '') + (role ? cap(role) : '')
  const origin = (sb.origin as string) ?? ''
  const creatureType = (sb.creatureType as string) ?? ''
  // Subtypes/senses can hold either plain strings (base) or {name, _templateSource, _templateSourceIndex} (template-added)
  const normalizeNamed = (arr: any): { name: string; _templateSource?: string; _templateSourceIndex?: number }[] => {
    if (!Array.isArray(arr)) return []
    return arr.map((x: any) => typeof x === 'string' ? { name: x } : { name: x?.name ?? '', _templateSource: x?._templateSource, _templateSourceIndex: x?._templateSourceIndex })
  }
  const subtypes = normalizeNamed(sb.subtypes)
  const abilities = (sb.abilities as Record<string, number>) ?? {}
  const defs = (sb.defenses as Record<string, number>) ?? {}
  const skills = (sb.skills as Record<string, number>) ?? {}
  const speeds = (sb.speeds as Record<string, number>) ?? {}
  const immunities = Array.isArray(sb.immunities) ? sb.immunities as { type: string; _templateSource?: string; _templateSourceIndex?: number }[] : []
  const resistances = Array.isArray(sb.resistances) ? sb.resistances as { type: string; value?: number; _templateSource?: string; _templateSourceIndex?: number }[] : []
  const weaknesses = Array.isArray(sb.weaknesses) ? sb.weaknesses as { type: string; value?: number; _templateSource?: string; _templateSourceIndex?: number }[] : []
  const actions = Array.isArray(sb.actions) ? sb.actions as PowerEntry[] : []
  const languages = Array.isArray(sb.languages) ? sb.languages as string[] : typeof sb.languages === 'string' ? (sb.languages as string).split(',').map(s => s.trim()).filter(Boolean) : []
  const senses = normalizeNamed(typeof sb.senses === 'string' ? (sb.senses as string).split(',').map(s => s.trim()).filter(Boolean) : sb.senses)
  const equipment = Array.isArray(sb.equipment) ? sb.equipment as string[] : typeof sb.equipment === 'string' ? (sb.equipment as string).split(',').map(s => s.trim()).filter(Boolean) : []
  const diffs = Array.isArray(sb._templateDiffs) ? sb._templateDiffs as TemplateFieldDiff[] : undefined

  // Template-added trait/aura entries render as cards (their entryType determines section, not card-vs-text)
  const isTemplate = (a: any) => !!a._templateSource
  const traitEntries = actions.filter(a => a.entryType === 'trait')
  const auraEntries = actions.filter(a => a.entryType === 'aura')
  const powerEntries = actions.filter(a => a.entryType === 'action')
  const usageOrder: Record<string, number> = { 'at-will': 0, 'encounter': 1, 'recharge': 2 }
  powerEntries.sort((a, b) => (usageOrder[a.usage] ?? 3) - (usageOrder[b.usage] ?? 3))

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {creature.name}
          {templateChips && templateChips.length > 0 && templateChips.map(chip => (
            <button
              key={chip.name}
              onClick={() => onTemplateChipClick?.(chip.name)}
              title={`${chip.name}${chip.preview ? ' (preview)' : ''} — click to view template`}
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0 6px', borderRadius: 'var(--radius-sm)',
                background: templateColor(chip.slot),
                color: '#fff',
                border: chip.preview ? '1px dashed rgba(255,255,255,0.6)' : 'none',
                fontSize: 10, fontWeight: 700,
                cursor: onTemplateChipClick ? 'pointer' : 'default',
                opacity: chip.preview ? 0.85 : 1,
                fontFamily: "'MentorSans', 'Mentor', sans-serif",
                textTransform: 'uppercase', letterSpacing: '0.03em',
              }}
            >{chip.name}</button>
          ))}
          {onClone && (
            <button
              onClick={onClone}
              title="Clone to Custom"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'inherit', padding: 2, fontSize: 13,
                display: 'inline-flex', alignItems: 'center',
              }}
            >📑</button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              title="Edit"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'inherit', padding: 2, fontSize: 13,
                display: 'inline-flex', alignItems: 'center',
              }}
            >📝</button>
          )}
        </span>
        <span>Level {level} {roleLabel}</span>
      </div>
      <div className="sb-subheader" style={{ marginBottom: 2 }}>
        <span>
          <span title={tooltip(sb.size as string ?? 'Medium')}>{sb.size as string ?? 'Medium'}</span>
          {' '}<span title={tooltip(origin)}>{origin}</span>
          {' '}<span title={tooltip(creatureType)}>{creatureType}</span>
          {subtypes.length > 0 && <> ({subtypes.map((s, i) => (
            <span key={s.name + i}>{i > 0 && ', '}<span style={templateItemStyle(s)} title={templateItemTitle(s, tooltip(s.name))}>{s.name}</span></span>
          ))})</>}
        </span>
        <span>XP {xpForCreature(level, modifier)}</span>
      </div>

      {/* Stats + image side by side */}
      <div style={(imageUrl || showImageEditor) ? { display: 'flex', gap: 12 } : undefined}>
      <div style={{ flex: 1, minWidth: 0 }}>

      {/* Group 1: Initiative, Senses, Speed, Saves/AP */}
      <div className="sb-row">
        <span><b className="sb-label">Initiative</b> {sign((sb.initiative as number) ?? 0)}</span>;{' '}
        <span><b className="sb-label">Senses</b> Perception {sign((sb.perception as number) ?? 0)}
          {senses.length > 0 && <>; {senses.map((s, i) => (
            <span key={s.name + i}>{i > 0 && ', '}<span style={templateItemStyle(s)} title={templateItemTitle(s, tooltip(s.name))}>{s.name}</span></span>
          ))}</>}</span>
      </div>
      {((sb.speed as number) > 0 || Object.keys(speeds).length > 0) && (
        <div className="sb-row">
          <span><b className="sb-label">Speed</b>{' '}
            {(sb.speed as number) > 0 && <>{sb.speed as number}</>}
            {Object.entries(speeds).map(([key, val], i) => (
              <span key={key}>{((sb.speed as number) > 0 || i > 0) && ', '}{key.replace(/_/g, ' ')} {val}</span>
            ))}
          </span>
        </div>
      )}
      {(((sb.savingThrowBonus as number) ?? 0) > 0 || ((sb.actionPoints as number) ?? 0) > 0) && (
        <div className="sb-row">
          {((sb.savingThrowBonus as number) ?? 0) > 0 && <span><b className="sb-label">Saving Throws</b> +<StatNumber value={sb.savingThrowBonus as number} field="savingThrowBonus" diffs={diffs} /></span>}
          {((sb.actionPoints as number) ?? 0) > 0 && <span><b className="sb-label">Action Points</b> <StatNumber value={sb.actionPoints as number} field="actionPoints" diffs={diffs} /></span>}
        </div>
      )}

      {/* Group 2: HP, AC, Defenses, Immune/Resist/Vulnerable */}
      <div className="sb-row" style={{ borderTop: '1px solid var(--sb-separator)' }}>
        <span><b className="sb-label">HP</b> <StatNumber value={creature.hp} field="hp" diffs={diffs} />; <b className="sb-label">Bloodied</b> {Math.floor(creature.hp / 2)}</span>
      </div>
      <div className="sb-row">
        <span><b className="sb-label">AC</b> <StatNumber value={(sb.ac as number) ?? 10} field="ac" diffs={diffs} />;</span>
        <span><b className="sb-label">Fortitude</b> <StatNumber value={defs.fortitude ?? 10} field="defenses.fortitude" diffs={diffs} />,</span>
        <span><b className="sb-label">Reflex</b> <StatNumber value={defs.reflex ?? 10} field="defenses.reflex" diffs={diffs} />,</span>
        <span><b className="sb-label">Will</b> <StatNumber value={defs.will ?? 10} field="defenses.will" diffs={diffs} /></span>
      </div>
      {(immunities.length > 0 || resistances.length > 0 || weaknesses.length > 0) && (
        <div className="sb-row">
          {immunities.length > 0 && <span><b className="sb-label">Immune</b> {immunities.map((e, i) => (
            <span key={i}>{i > 0 && ', '}<span style={templateItemStyle(e)} title={templateItemTitle(e, tooltip(e.type))}>{e.type}</span></span>
          ))}</span>}
          {immunities.length > 0 && (resistances.length > 0 || weaknesses.length > 0) && <span>;</span>}
          {resistances.length > 0 && <span><b className="sb-label">Resist</b> {resistances.map((e, i) => (
            <span key={i}>{i > 0 && ', '}<span style={templateItemStyle(e)} title={templateItemTitle(e, tooltip(e.type))}>{e.type} {e.value ?? ''}</span></span>
          ))}</span>}
          {resistances.length > 0 && weaknesses.length > 0 && <span>;</span>}
          {weaknesses.length > 0 && <span><b className="sb-label">Vulnerable</b> {weaknesses.map((e, i) => (
            <span key={i}>{i > 0 && ', '}<span style={templateItemStyle(e)} title={templateItemTitle(e, tooltip(e.type))}>{e.type} {e.value ?? ''}</span></span>
          ))}</span>}
        </div>
      )}

      {/* Footer (Skills, Abilities, Alignment, Languages, Equipment) — sits inside the stats column to fill the space next to the image */}
      <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
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
        {equipment.length > 0 && (
          <div className="sb-row">
            <b className="sb-label">Equipment</b> {equipment.join(', ')}
          </div>
        )}
      </div>

      </div>{/* end stats column */}

      {/* Creature image */}
      {showImageEditor ? (
        <div style={{
          flexShrink: 0, alignSelf: 'stretch',
          width: 200, minHeight: 140, maxHeight: 280,
          display: 'flex', padding: 6,
        }}>
          <CreatureImageEditor imageId={effectiveImageId} tokenImageId={effectiveTokenImageId}
            tokenCrop={effectiveTokenCrop}
            onImageChange={onImageChange!} onTokenChange={onTokenChange} />
        </div>
      ) : imageUrl && (
        <div style={{
          flexShrink: 0, alignSelf: 'stretch',
          width: 180, minHeight: 140, maxHeight: 280,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: 6,
        }}>
          <img src={imageUrl} alt="" style={{
            maxWidth: '100%', maxHeight: '100%',
            width: 'auto', height: 'auto',
            objectFit: 'contain',
            borderRadius: 'var(--radius-md)',
          }} />
        </div>
      )}
      </div>{/* end flex row */}

      {/* Traits — always rendered as cards */}
      {traitEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {traitEntries.map((a, i) => {
            const card = <PowerCardView entry={a} />
            if (isTemplate(a)) {
              const srcIdx = (a as any)._templateSourceIndex as number | undefined
              return <div key={i} style={{ borderLeft: `3px solid ${templateColor(srcIdx ?? 0)}`, marginBottom: 2 }}>{card}</div>
            }
            return <div key={i}>{card}</div>
          })}
        </div>
      )}

      {/* Auras — always rendered as cards */}
      {auraEntries.length > 0 && (
        <div style={{ paddingTop: 2 }}>
          {auraEntries.map((a, i) => {
            const card = <PowerCardView entry={a} />
            if (isTemplate(a)) {
              const srcIdx = (a as any)._templateSourceIndex as number | undefined
              return <div key={i} style={{ borderLeft: `3px solid ${templateColor(srcIdx ?? 0)}`, marginBottom: 2 }}>{card}</div>
            }
            return <div key={i}>{card}</div>
          })}
        </div>
      )}

      {/* Powers */}
      {powerEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {powerEntries.map((a, i) => {
            if (isTemplate(a)) {
              const srcIdx = (a as any)._templateSourceIndex as number | undefined
              return (
                <div key={i} style={{ borderLeft: `3px solid ${templateColor(srcIdx ?? 0)}`, marginBottom: 2 }}>
                  <PowerCardView entry={a} />
                </div>
              )
            }
            return <PowerCardView key={i} entry={a} />
          })}
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

