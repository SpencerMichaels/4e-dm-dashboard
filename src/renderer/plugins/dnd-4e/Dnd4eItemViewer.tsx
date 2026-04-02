import './statblock.css'

interface ParsedItem {
  name: string
  category: string
  level: number
  rarity: string
  price: string
  flavor: string
  slot: string
  enhancement: string
  properties: string[]
  powers: { name: string; usage: string; action: string; text: string }[]
  damage?: string
  proficiency?: string
  range?: string
  weight?: string
  group?: string
  componentCost?: string
  keySkill?: string
  castTime?: string
  duration?: string
  ritualCategory?: string
  levels?: { level: number; enhancement?: string; price: string }[]
  source: string
  description: string
}

const USAGE_COLORS: Record<string, string> = {
  'At-Will': '#4a7a5a', 'at-will': '#4a7a5a',
  'Encounter': '#7a4a4a', 'encounter': '#7a4a4a',
  'Daily': '#5a5a7a', 'daily': '#5a5a7a',
}

const CAT_LABELS: Record<string, string> = {
  item: 'Item', weapon: 'Weapon', armor: 'Armor', implement: 'Implement', ritual: 'Ritual',
}

export function Dnd4eItemViewer({ item }: { item: ParsedItem }) {
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
  const levelStr = item.level > 0 ? `Level ${item.level}${item.rarity ? ' ' + item.rarity : ''}` : (item.rarity || '')

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name">{item.name}</span>
        {levelStr && <span>{levelStr}</span>}
      </div>
      <div className="sb-subheader">
        <span>{item.slot || CAT_LABELS[item.category] || item.category}</span>
        {item.price && <span>{item.price}</span>}
      </div>

      {/* Flavor */}
      {item.flavor && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
          {item.flavor}
        </div>
      )}

      {/* Weapon stats */}
      {(item.damage || item.proficiency || item.weight) && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div className="sb-row">
            {item.damage && <span><b className="sb-label">Damage</b> {item.damage}</span>}
            {item.proficiency && <span><b className="sb-label">Proficient</b> {item.proficiency}</span>}
            {item.range && <span><b className="sb-label">Range</b> {item.range}</span>}
            {item.weight && <span><b className="sb-label">Weight</b> {item.weight}</span>}
          </div>
          {item.group && (
            <div className="sb-row">
              <b className="sb-label">Group</b> {item.group}
            </div>
          )}
        </div>
      )}

      {/* Ritual stats */}
      {item.category === 'ritual' && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div className="sb-row">
            {item.componentCost && <span><b className="sb-label">Component Cost</b> {item.componentCost}</span>}
            {item.keySkill && <span><b className="sb-label">Key Skill</b> {item.keySkill}</span>}
          </div>
          <div className="sb-row">
            {item.castTime && <span><b className="sb-label">Time</b> {item.castTime}</span>}
            {item.duration && <span><b className="sb-label">Duration</b> {item.duration}</span>}
          </div>
        </div>
      )}

      {/* Enhancement */}
      {item.enhancement && (
        <div className="sb-row" style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <b className="sb-label">Enhancement</b> {item.enhancement}
        </div>
      )}

      {/* Level/pricing table */}
      {item.levels && item.levels.length > 1 && (
        <div style={{ padding: '2px 8px', fontSize: 11 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {item.levels.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--sb-separator, rgba(128,128,128,0.1))' }}>
                  <td style={{ padding: '1px 4px' }}>Lvl {l.level}</td>
                  {l.enhancement && <td style={{ padding: '1px 4px', color: 'var(--color-text-secondary)' }}>{l.enhancement}</td>}
                  <td style={{ padding: '1px 4px', textAlign: 'right' }}>{l.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Properties */}
      {item.properties.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {item.properties.map((prop, i) => (
            <div key={i} className="sb-row">
              {i === 0 && <b className="sb-label">Property</b>}
              <span>{prop}</span>
            </div>
          ))}
        </div>
      )}

      {/* Powers */}
      {item.powers.length > 0 && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          {item.powers.map((pow, i) => {
            const color = USAGE_COLORS[pow.usage] ?? '#6a6a72'
            return (
              <div key={i} style={{ marginBottom: 1 }}>
                <div style={{ padding: '2px 8px', background: color, color: '#fff', fontSize: 'var(--font-size-xs)' }}>
                  <b>{pow.name || 'Power'}</b>
                  {pow.usage && <span style={{ color: 'rgba(255,255,255,0.8)' }}> ✦ {pow.usage}</span>}
                  {pow.action && <span style={{ color: 'rgba(255,255,255,0.7)' }}> ({pow.action})</span>}
                </div>
                <div style={{ padding: '1px 8px 2px 16px', fontSize: 'var(--font-size-xs)' }}>
                  {pow.text}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Description */}
      {item.description && item.category !== 'ritual' && (
        <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {item.description}
        </div>
      )}
      {item.description && item.category === 'ritual' && (
        <div style={{ padding: '4px 8px', fontSize: 11, borderTop: '1px solid var(--sb-separator)' }}>
          {item.description.split('\n').map((line, i) => (
            <p key={i} style={{ margin: '2px 0' }}>{line}</p>
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
