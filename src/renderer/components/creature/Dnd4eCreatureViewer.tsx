import { toPowerCardEntry } from './power-card-entry'
import { type ReactNode, useState, useCallback } from 'react'
import type { Creature, CreatureBuilderConfig } from '@common/types'
import type { PowerEntry } from './PowerEntryEditor'
import { PowerCardView, type PowerCardEntry } from './PowerCardView'
import type { FieldDiff as TemplateFieldDiff } from '@common/rules/adjust-monster'
import { useImage } from '@renderer/hooks/use-image'
import { CreatureImageEditor } from '@renderer/components/shared/CreatureImageEditor'
import { useCampaignStore } from '@renderer/stores/campaign-store'
import { copyPower } from './power-clipboard'
import { Annotation, type StatAnchor } from './annotations'
import { xpForCreature, sign } from './dnd4e-utils'
import { capitalize } from '@common/utils/format'
import { normalizeStringArray } from '@common/utils/arrays'
import './statblock.css'


// Per-template-slot color palette (used for visual attribution of template-modified values)
const TEMPLATE_COLORS = ['var(--color-accent)', '#f59f00']
const THEME_COLOR = '#0d9488'
const templateColor = (idx: number): string => TEMPLATE_COLORS[idx] ?? '#9c36b5'

// Render a numeric stat with template/theme-attribution highlighting
function StatNumber({ value, field, diffs, prefix }: { value: number; field: string; diffs?: TemplateFieldDiff[]; prefix?: string }): ReactNode {
  const display = prefix ? `${value >= 0 ? '+' : ''}${value}` : String(value)
  const matches = diffs?.filter(d => d.field === field) ?? []
  if (matches.length === 0) return display
  const sorted = [...matches].sort((a, b) => a.sourceIndex - b.sourceIndex)
  const original = sorted[0].before
  const lineage = sorted.map(d => {
    const delta = d.after - d.before
    return `${delta >= 0 ? '+' : ''}${delta} from ${d.source}`
  }).join('; ')
  const title = `${lineage}; original: ${prefix ? (original >= 0 ? '+' : '') + original : original}`
  // Theme diffs use sourceIndex -1; level adjustments use -2
  const LEVEL_ADJ_COLOR = '#c47a1a'
  const lastSource = sorted[sorted.length - 1]
  const color = lastSource.sourceIndex === -2 ? LEVEL_ADJ_COLOR : lastSource.sourceIndex === -1 ? THEME_COLOR : templateColor(lastSource.sourceIndex)
  return <span title={title} style={{ color, textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>{display}</span>
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
  /** Compendium ID for annotation lookup (image/token overrides). If the
   *  creature has a compendiumId field, it's used automatically. Only needed
   *  for synthetic creatures that lack it (e.g. encounter preview). */
  compendiumId?: string
  onImageChange?: (imageId: string) => void  // If provided, show editable drop box
  onTokenChange?: (tokenImageId: string, crop: { x: number; y: number; size: number }) => void  // If provided, show editable token crop box
  onClone?: () => void  // If provided, show clone-to-custom icon in header
  onEdit?: () => void  // If provided, show edit icon in header (for custom creatures)
  onPopout?: () => void // If provided, show popout button in header
  templateChips?: TemplateChip[]
  onTemplateChipClick?: (templateName: string) => void
}

export function Dnd4eCreatureViewer({ creature, tooltip: tip, compendiumId: compendiumIdProp, onImageChange, onTokenChange, onClone, onEdit, onPopout, templateChips, onTemplateChipClick }: Props) {
  const tooltip = tip ?? (() => '')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const handleCopyPower = useCallback((power: PowerEntry, idx: number) => {
    copyPower(power)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 800)
  }, [])
  const sb = creature.statBlock
  // Merge annotation overrides for compendium creatures (image, token, crop)
  const annotationKey = compendiumIdProp ?? creature.compendiumId
  const annotations = useCampaignStore(s => s.annotations)
  const ann = annotationKey ? annotations[annotationKey] : undefined
  const effectiveImageId = creature.imageId ?? ann?.imageId
  const effectiveTokenImageId = creature.tokenImageId ?? ann?.tokenImageId
  const effectiveTokenCrop = creature.tokenCrop ?? ann?.tokenCrop
  const imageUrl = useImage(effectiveImageId)
  const showImageEditor = !!onImageChange
  const level = (sb.level as number) ?? 1
  const role = (sb.role as string) ?? ''
  const modifier = (sb.monsterModifier as string) ?? ''
  const halfLvl = Math.floor(level / 2)
  const roleLabel = (modifier ? capitalize(modifier) + ' ' : '') + (role ? capitalize(role) : '')
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
  const languages = normalizeStringArray(sb.languages)
  const senses = normalizeNamed(typeof sb.senses === 'string' ? (sb.senses as string).split(',').map(s => s.trim()).filter(Boolean) : sb.senses)
  const equipment = normalizeStringArray(sb.equipment)
  const diffs = Array.isArray(sb._templateDiffs) ? sb._templateDiffs as TemplateFieldDiff[] : undefined

  // Template-added or theme-added entries render with colored borders for attribution
  const isTemplate = (a: any) => !!a._templateSource
  const isTheme = (a: any) => !!a._themeSource
  const sourceColor = (a: any): string | null =>
    a._themeSource ? THEME_COLOR
    : a._templateSource != null ? templateColor(a._templateSourceIndex ?? 0)
    : null
  const traitEntries = actions.filter(a => a.entryType === 'trait')
  const auraEntries = actions.filter(a => a.entryType === 'aura')
  const powerEntries = actions.filter(a => a.entryType === 'action')
  const usageOrder: Record<string, number> = { 'at-will': 0, 'encounter': 1, 'recharge': 2, 'recharge-bloodied': 2, 'daily': 3 }
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
                color: 'var(--color-text-on-dark)',
                border: chip.preview ? '1px dashed rgba(255,255,255,0.6)' : 'none',
                fontSize: 10, fontWeight: 700,
                cursor: onTemplateChipClick ? 'pointer' : 'default',
                opacity: chip.preview ? 0.85 : 1,
                fontFamily: 'var(--font-card)',
                textTransform: 'uppercase', letterSpacing: '0.03em',
              }}
            >{chip.name}</button>
          ))}
          {(sb._monsterTheme as string) && (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0 6px', borderRadius: 'var(--radius-sm)',
              background: THEME_COLOR, color: 'var(--color-text-on-dark)',
              fontSize: 10, fontWeight: 700,
              fontFamily: 'var(--font-card)',
              textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>
              {sb._monsterTheme as string}
            </span>
          )}
          {onPopout && (
            <button
              onClick={onPopout}
              title="Pop out stat block"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'inherit', padding: 2, fontSize: 13,
                display: 'inline-flex', alignItems: 'center',
              }}
            >⧉</button>
          )}
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
        <Annotation anchor={stat('header')} />
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
        <Annotation anchor={stat('senses')} />
        <span><b className="sb-label">Initiative</b> {sign((sb.initiative as number) ?? 0)}</span>;{' '}
        <span><b className="sb-label">Senses</b> Perception {sign((sb.perception as number) ?? 0)}
          {senses.length > 0 && <>; {senses.map((s, i) => (
            <span key={s.name + i}>{i > 0 && ', '}<span style={templateItemStyle(s)} title={templateItemTitle(s, tooltip(s.name))}>{s.name}</span></span>
          ))}</>}</span>
      </div>
      {((sb.speed as number) > 0 || Object.keys(speeds).length > 0) && (
        <div className="sb-row">
          <Annotation anchor={stat('speed')} />
          <span><b className="sb-label">Speed</b>{' '}
            {(sb.speed as number) > 0 && <>{sb.speed as number}</>}
            {Object.entries(speeds).map(([key, val], i) => (
              <span key={key}>{((sb.speed as number) > 0 || i > 0) ? ', ' : ''}{key.replace(/_/g, ' ')} {val}</span>
            ))}
          </span>
        </div>
      )}
      {(((sb.savingThrowBonus as number) ?? 0) > 0 || ((sb.actionPoints as number) ?? 0) > 0) && (
        <div className="sb-row">
          <Annotation anchor={stat('saves')} />
          {((sb.savingThrowBonus as number) ?? 0) > 0 && <span><b className="sb-label">Saving Throws</b> +<StatNumber value={sb.savingThrowBonus as number} field="savingThrowBonus" diffs={diffs} /></span>}
          {((sb.actionPoints as number) ?? 0) > 0 && <span><b className="sb-label">Action Points</b> <StatNumber value={sb.actionPoints as number} field="actionPoints" diffs={diffs} /></span>}
        </div>
      )}

      {/* Group 2: HP, AC, Defenses, Immune/Resist/Vulnerable */}
      <div className="sb-row">
        <Annotation anchor={stat('hp')} />
        <span><b className="sb-label">HP</b> <StatNumber value={creature.hp} field="hp" diffs={diffs} />; <b className="sb-label">Bloodied</b> {Math.floor(creature.hp / 2)}</span>
      </div>
      <div className="sb-row">
        <Annotation anchor={stat('defenses')} />
        <span><b className="sb-label">AC</b> <StatNumber value={(sb.ac as number) ?? 10} field="ac" diffs={diffs} />;</span>
        <span><b className="sb-label">Fortitude</b> <StatNumber value={defs.fortitude ?? 10} field="defenses.fortitude" diffs={diffs} />,</span>
        <span><b className="sb-label">Reflex</b> <StatNumber value={defs.reflex ?? 10} field="defenses.reflex" diffs={diffs} />,</span>
        <span><b className="sb-label">Will</b> <StatNumber value={defs.will ?? 10} field="defenses.will" diffs={diffs} /></span>
      </div>
      {(immunities.length > 0 || resistances.length > 0 || weaknesses.length > 0) && (
        <div className="sb-row">
          <Annotation anchor={stat('resistances')} />
          {immunities.length > 0 && <span><b className="sb-label">Immune</b> {immunities.map((e, i) => (
            <span key={i}>{i > 0 && ', '}<span style={templateItemStyle(e)} title={templateItemTitle(e, tooltip(e.type))}>{e.type}</span></span>
          ))}</span>}
          {immunities.length > 0 && (resistances.length > 0 || weaknesses.length > 0) && <span>;</span>}
          {resistances.length > 0 && <span><b className="sb-label">Resist</b> {resistances.map((e, i) => (
            <span key={i}>{i > 0 && ', '}<span style={templateItemStyle(e)} title={templateItemTitle(e, tooltip(e.type))}>{e.type}{e.value != null && e.value !== '' ? ` ${e.value}` : ''}</span></span>
          ))}</span>}
          {resistances.length > 0 && weaknesses.length > 0 && <span>;</span>}
          {weaknesses.length > 0 && <span><b className="sb-label">Vulnerable</b> {weaknesses.map((e, i) => (
            <span key={i}>{i > 0 && ', '}<span style={templateItemStyle(e)} title={templateItemTitle(e, tooltip(e.type))}>{e.type}{e.value != null && e.value !== '' ? ` ${e.value}` : ''}</span></span>
          ))}</span>}
        </div>
      )}

      {/* Footer (Skills, Abilities, Alignment, Languages, Equipment) — sits inside the stats column to fill the space next to the image */}
      <div>
        {Object.keys(skills).length > 0 && (
          <div className="sb-row">
            <Annotation anchor={stat('skills')} />
            <b className="sb-label">Skills</b> {Object.entries(skills).map(([name, mod], i) => (
              <span key={name}>
                {i > 0 && ', '}
                {capitalize(name)} <StatNumber value={mod as number} field={`skills.${name}`} diffs={diffs} prefix="+" />
              </span>
            ))}
          </div>
        )}
        {Object.keys(abilities).length > 0 && (
          <div className="sb-abilities">
            <Annotation anchor={stat('abilities')} />
            {['str', 'dex', 'wis', 'con', 'int', 'cha'].filter(ab => abilities[ab] != null).map(ab => {
              const score = abilities[ab]
              const mod = Math.floor((score - 10) / 2)
              return <span key={ab}><b className="sb-label">{capitalize(ab)}</b> {score} ({mod >= 0 ? '+' : ''}{mod})</span>
            })}
          </div>
        )}
        {(sb.alignment as string) && (
          <div className="sb-row">
            <Annotation anchor={stat('alignment')} />
            <b className="sb-label">Alignment</b> {sb.alignment as string}
          </div>
        )}
        {languages.length > 0 && (
          <div className="sb-row">
            <Annotation anchor={stat('languages')} />
            <b className="sb-label">Languages</b> {languages.join(', ')}
          </div>
        )}
        {equipment.length > 0 && (
          <div className="sb-row">
            <Annotation anchor={stat('equipment')} />
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
            const gi = i
            const sc = sourceColor(a)
            return (
              <div key={i} style={{ ...(sc ? { borderLeft: `3px solid ${sc}` } : {}), marginBottom: 2, position: 'relative', cursor: 'context-menu' }}
                onContextMenu={e => { e.preventDefault(); handleCopyPower(a, gi) }}>
                <PowerCardView entry={toPowerCardEntry(a)} />
                <Annotation anchor={{ kind: 'entry', entry: a }} />
                {copiedIdx === gi && <CopiedFlash />}
              </div>
            )
          })}
        </div>
      )}

      {/* Auras — always rendered as cards */}
      {auraEntries.length > 0 && (
        <div style={{ paddingTop: 2 }}>
          {auraEntries.map((a, i) => {
            const gi = traitEntries.length + i
            const auraEntry = { ...a, rangeType: 'aura', rangeValue: String((a as any).auraRange ?? 1) }
            const sc = sourceColor(a)
            return (
              <div key={i} style={{ ...(sc ? { borderLeft: `3px solid ${sc}` } : {}), marginBottom: 2, position: 'relative', cursor: 'context-menu' }}
                onContextMenu={e => { e.preventDefault(); handleCopyPower(a, gi) }}>
                <PowerCardView entry={toPowerCardEntry(auraEntry)} />
                <Annotation anchor={{ kind: 'entry', entry: a }} />
                {copiedIdx === gi && <CopiedFlash />}
              </div>
            )
          })}
        </div>
      )}

      {/* Powers */}
      {powerEntries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)', paddingTop: 2 }}>
          {powerEntries.map((a, i) => {
            const gi = traitEntries.length + auraEntries.length + i
            const sc = sourceColor(a)
            return (
              <div key={i} style={{ ...(sc ? { borderLeft: `3px solid ${sc}` } : {}), marginBottom: 2, position: 'relative', cursor: 'context-menu' }}
                onContextMenu={e => { e.preventDefault(); handleCopyPower(a, gi) }}>
                <PowerCardView entry={toPowerCardEntry(a)} />
                <Annotation anchor={{ kind: 'entry', entry: a }} />
                {copiedIdx === gi && <CopiedFlash />}
              </div>
            )
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

const stat = (key: StatAnchor) => ({ kind: 'stat' as const, key })

/** Brief green flash overlay showing "Copied" on right-click */
function CopiedFlash() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(40,167,69,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      fontSize: 11, fontWeight: 700, color: 'var(--color-hp-full)',
      borderRadius: 2,
    }}>
      Copied
    </div>
  )
}

