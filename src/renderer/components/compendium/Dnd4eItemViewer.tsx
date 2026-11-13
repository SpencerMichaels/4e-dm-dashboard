import { useState, type ReactNode } from 'react'
import { PowerCardView } from '../creature/PowerCardView'
import { capitalize } from '@common/utils/format'
import '../creature/statblock.css'

interface LevelScaling { level: number; text: string }

interface ParsedItem {
  name: string
  category: string
  level: number
  rarity: string
  price: string
  flavor: string
  slot: string
  itemType: string
  enhancement: string
  critical: string
  properties: string[]
  propertyScaling?: LevelScaling[]
  powers: {
    name: string; usage: string; action: string; keywords?: string[]
    trigger?: string; effect?: string; attack?: string; target?: string
    hit?: string; miss?: string; requirement?: string; sustain?: string
    text: string; levelScaling?: LevelScaling[]
  }[]
  damage?: string
  proficiency?: string
  range?: string
  weight?: string
  groups: string[]
  weaponCategory?: string
  special?: string
  requirement?: string
  itemSet?: string
  alchemicalType?: string
  formulaCost?: string
  componentCost?: string
  keySkill?: string
  castTime?: string
  duration?: string
  ritualCategory?: string
  levels?: { level: number; enhancement?: string; price: string }[]
  source: string
  description: string
  descriptionParts?: (
    | { type: 'text'; text: string }
    | { type: 'table'; headers: string[]; rows: string[][]; links?: Record<string, string> }
  )[]
}

const CAT_LABELS: Record<string, string> = {
  item: 'Item', weapon: 'Weapon', armor: 'Armor', implement: 'Implement', ritual: 'Ritual', set: 'Item Set',
}

/** Interleave truthy React nodes with "; " separators */
function joinSemicolon(items: (ReactNode | false | null | undefined | 0 | '')[]): ReactNode[] {
  const filtered = items.filter(Boolean) as ReactNode[]
  const result: ReactNode[] = []
  for (let i = 0; i < filtered.length; i++) {
    if (i > 0) result.push('; ')
    result.push(filtered[i])
  }
  return result
}

/** Get the best scaling entry for a given level: highest entry.level <= selectedLevel */
function scalingForLevel(scaling: LevelScaling[] | undefined, selectedLevel: number): LevelScaling | undefined {
  if (!scaling || scaling.length === 0) return undefined
  let best: LevelScaling | undefined
  for (const s of scaling) {
    if (s.level <= selectedLevel && (!best || s.level > best.level)) best = s
  }
  return best
}

export function Dnd4eItemViewer({ item, tooltip: tip, onSelectItem }: { item: ParsedItem; tooltip?: (term: string) => string; onSelectItem?: (id: string) => void }) {
  const tooltip = tip ?? (() => '')

  const hasLevels = item.levels && item.levels.length > 1
  const [selectedLevelIdx, setSelectedLevelIdx] = useState(0)
  const selectedTier = hasLevels ? item.levels![selectedLevelIdx] : undefined
  const selectedLevel = selectedTier?.level ?? item.level

  const levelLabel = hasLevels
    ? `Level ${selectedLevel}${item.rarity ? ' ' + item.rarity : ''}`
    : item.level > 0 ? `Level ${item.level}${item.rarity ? ' ' + item.rarity : ''}` : (item.rarity || '')
  const displayEnhancement = selectedTier?.enhancement ?? item.enhancement
  const displayPrice = selectedTier?.price ?? item.price

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name">{item.name}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          {hasLevels ? (
            <>Level <select className="ghost" value={selectedLevelIdx}
              onChange={e => setSelectedLevelIdx(Number(e.target.value))}
              style={{ color: 'inherit', textAlign: 'center' }}>
              {item.levels!.map((l, i) => (
                <option key={i} value={i}>{l.level}</option>
              ))}
            </select>{item.rarity && ` ${item.rarity}`}</>
          ) : (
            levelLabel ? levelLabel : null
          )}
        </span>
      </div>
      <div className="sb-subheader">
        <span>{item.slot || CAT_LABELS[item.category] || item.category}{item.itemType && `: ${item.itemType}`}</span>
        {displayPrice && <span>{displayPrice}</span>}
      </div>

      {/* Flavor / description */}
      {item.flavor && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
          {item.flavor}
        </div>
      )}

      {/* Weapon/implement stats */}
      {(item.damage || item.proficiency || item.weight || item.group) && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {(item.damage || item.proficiency || item.range || item.weight) && (
            <div className="sb-row">
              <span>{joinSemicolon([
                item.damage && <span key="dmg"><b className="sb-label">Damage</b> {item.damage}</span>,
                item.proficiency && <span key="prof"><b className="sb-label">Proficient</b> {item.proficiency}</span>,
                item.range && <span key="rng"><b className="sb-label">Range</b> {item.range}</span>,
                item.weight && <span key="wt"><b className="sb-label">Weight</b> {item.weight}</span>,
              ])}</span>
            </div>
          )}
          {item.groups?.length > 0 && (
            <div className="sb-row">
              <b className="sb-label">Group</b> {item.groups.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Ritual stats */}
      {item.category === 'ritual' && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div className="sb-row">
            <span>{joinSemicolon([
              item.componentCost && <span key="cost"><b className="sb-label">Component Cost</b> {item.componentCost}</span>,
              item.keySkill && <span key="skill"><b className="sb-label">Key Skill</b> {item.keySkill}</span>,
            ])}</span>
          </div>
          <div className="sb-row">
            <span>{joinSemicolon([
              item.castTime && <span key="time"><b className="sb-label">Time</b> {item.castTime}</span>,
              item.duration && <span key="dur"><b className="sb-label">Duration</b> {item.duration}</span>,
            ])}</span>
          </div>
        </div>
      )}

      {/* Alchemical item stats */}
      {item.alchemicalType && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div className="sb-row">
            <span>{joinSemicolon([
              <span key="type"><b className="sb-label">Alchemical Item</b> {item.alchemicalType}</span>,
              item.formulaCost && <span key="cost"><b className="sb-label">Formula Cost</b> {item.formulaCost}</span>,
            ])}</span>
          </div>
          {(item.keySkill || item.castTime) && (
            <div className="sb-row">
              <span>{joinSemicolon([
                item.keySkill && <span key="skill"><b className="sb-label">Key Skill</b> {item.keySkill}</span>,
                item.castTime && <span key="time"><b className="sb-label">Time</b> {item.castTime}</span>,
              ])}</span>
            </div>
          )}
        </div>
      )}

      {/* Enhancement + Critical */}
      {(displayEnhancement || item.critical) && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {displayEnhancement && <div className="sb-row"><span><b className="sb-label">Enhancement</b> {
            selectedTier?.enhancement
              ? `${selectedTier.enhancement} ${item.enhancement}`
              : item.enhancement
          }</span></div>}
          {item.critical && <div className="sb-row"><span><b className="sb-label">Critical</b> {item.critical}</span></div>}
        </div>
      )}


      {/* Properties */}
      {item.properties.length > 0 && (() => {
        const isShort = (p: string) => p.length < 40 && !p.includes('\n')
        const shortProps = item.properties.filter(isShort)
        const longProps = item.properties.filter(p => !isShort(p))
        return (
          <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
            {shortProps.length > 0 && (
              <div className="sb-row">
                <b className="sb-label">{longProps.length === 0 && shortProps.length === 1 ? 'Property' : 'Properties'}</b>{' '}
                <span>{shortProps.map((prop, i) => (
                  <span key={i}>{i > 0 && '; '}<span title={tooltip(prop)}>{prop}</span></span>
                ))}</span>
              </div>
            )}
            {longProps.map((prop, i) => (
              <div key={i} className="sb-row" style={{ alignItems: 'flex-start' }}>
                <span>
                  {i === 0 && shortProps.length === 0 && <><b className="sb-label">{longProps.length === 1 ? 'Property' : 'Properties'}</b>{' '}</>}
                  {prop.split('\n').filter(l => l.trim()).map((line, j) => (
                    <span key={j}>{j > 0 && <br />}{line}</span>
                  ))}
                </span>
              </div>
            ))}
            {item.propertyScaling && (() => {
              const s = scalingForLevel(item.propertyScaling, selectedLevel)
              return s ? <div className="sb-row" style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Level {s.level}: {s.text}</div> : null
            })()}
          </div>
        )
      })()}

      {/* Special / Requirement / Item Set */}
      {item.special && <div className="sb-row"><span><b className="sb-label">Special</b> {item.special}</span></div>}
      {item.requirement && <div className="sb-row"><span><b className="sb-label">Requirement</b> {item.requirement}</span></div>}
      {item.itemSet && item.category !== 'set' && <div className="sb-row" style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>{item.itemSet}</div>}

      {/* Structured description (rituals, item sets, concordance — before powers) */}
      {item.descriptionParts && item.descriptionParts.length > 0 && (
        <div style={{ padding: '4px 8px', fontSize: 11, borderTop: '1px solid var(--sb-separator)' }}>
          {item.descriptionParts.map((part, i) => {
            if (part.type === 'table') {
              return <DescriptionTable key={i} headers={part.headers} rows={part.rows}
                links={part.links} onNavigate={onSelectItem} />
            }
            if (part.type === 'heading') {
              const isTier = /\(\d+[-–]\d+\)|\(\d+\s+or\s/i.test(part.text)
              return isTier ? (
                <div key={i} style={{
                  padding: '2px 8px', marginTop: 4,
                  background: 'var(--sb-subheader-bg)', color: 'var(--sb-header-text)',
                  fontWeight: 700, fontSize: 12,
                }}>{part.text}</div>
              ) : (
                <div key={i} style={{ fontWeight: 700, marginTop: '0.6em', marginBottom: '0.2em', fontSize: 12 }}>{part.text}</div>
              )
            }
            if (part.type === 'properties') {
              return (
                <div key={i} className="sb-row" style={{ fontSize: 12 }}>
                  <b className="sb-label">{part.items.length === 1 ? 'Property' : 'Properties'}</b>{' '}
                  <span>{part.items.map((p, j) => (
                    <span key={j}>{j > 0 && '; '}<span title={tooltip(p)}>{p}</span></span>
                  ))}</span>
                </div>
              )
            }
            if (part.type === 'power') {
              return <PowerCardView key={i} entry={part.power} selectedLevel={selectedLevel} />
            }
            // type === 'text'
            const isSetLore = item.category === 'set' && i === 0
            return (
              <div key={i} style={isSetLore ? { fontStyle: 'italic', color: 'var(--color-text-secondary)' } : undefined}>
                {part.text.split('\n').filter(l => l.trim()).map((line, j, arr) => (
                  <p key={j} style={{ margin: 0, marginBottom: '0.4em', textIndent: arr.length > 1 ? '1em' : 0 }}>{line}</p>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {/* Plain text description fallback */}
      {!item.descriptionParts && item.description && item.description !== item.flavor && (item.category === 'ritual' || item.category === 'set') && (
        <div style={{ padding: '4px 8px', fontSize: 11, borderTop: '1px solid var(--sb-separator)' }}>
          {item.description.split('\n').filter(l => l.trim()).map((line, i) => (
            <p key={i} style={{ margin: 0, marginBottom: '0.4em', textIndent: i > 0 ? '1em' : 0 }}>{line}</p>
          ))}
        </div>
      )}

      {/* Powers */}
      {item.powers.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {item.powers.map((pow, i) => (
            <PowerCardView key={i} entry={pow} selectedLevel={selectedLevel} />
          ))}
        </div>
      )}

      {/* Source */}
      {item.source && (
        <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {item.source}
        </div>
      )}
    </div>
  )
}

function DescriptionTable({ headers, rows, links, onNavigate }: {
  headers: string[]; rows: string[][]
  links?: Record<string, string>; onNavigate?: (id: string) => void
}) {
  return (
    <table style={{ borderCollapse: 'collapse', margin: '6px 0' }}>
      {headers.length > 0 && (
        <thead>
          <tr style={{ borderBottom: '2px solid var(--sb-separator)' }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ borderBottom: '1px solid var(--sb-separator)' }}>
            {row.map((cell, ci) => {
              const linkId = links?.[`${ri},${ci}`]
              return (
                <td key={ci} style={{ padding: '1px 6px' }}>
                  {linkId && onNavigate ? (
                    <a onClick={() => onNavigate(linkId)} style={{
                      color: 'var(--color-accent, #5c7cfa)', cursor: 'pointer',
                      textDecoration: 'none', borderBottom: '1px dotted currentColor',
                    }}>{cell}</a>
                  ) : cell}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
