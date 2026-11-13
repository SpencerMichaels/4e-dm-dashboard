import '../creature/statblock.css'

interface ParsedDisease {
  name: string
  level: number
  flavor: string
  stages: { stage: number; text: string }[]
  check: string
  checkTable?: { result: string; effect: string }[]
  source: string
}

const STAGE_LABELS: Record<number, string> = {
  0: 'Cured',
  3: 'Final State',
}

export function Dnd4eDiseaseViewer({ disease }: { disease: ParsedDisease }) {
  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      <div className="sb-header">
        <span className="sb-name">{disease.name}</span>
        {disease.level > 0 && <span>Level {disease.level} Disease</span>}
      </div>
      {disease.level === 0 && (
        <div className="sb-subheader"><span>Disease</span></div>
      )}

      {/* Flavor */}
      {disease.flavor && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
          {disease.flavor}
        </div>
      )}

      {/* Stages */}
      <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
        {disease.stages.map((s, i) => {
          const label = STAGE_LABELS[s.stage]
          return (
            <div key={i} className="sb-row" style={{ alignItems: 'flex-start' }}>
              <span>
                <b className="sb-label">Stage {s.stage}</b>
                {label && <span style={{ color: 'var(--color-text-secondary)' }}> ({label})</span>}
                : {s.text}
              </span>
            </div>
          )
        })}
      </div>

      {/* Check */}
      {disease.check && (
        <div style={{ borderTop: '1px solid var(--sb-separator)' }}>
          <div className="sb-row">
            <span><b className="sb-label">Check</b> {disease.check}</span>
          </div>
          {disease.checkTable && (
            <div style={{ padding: '2px 8px' }}>
              <table style={{ borderCollapse: 'collapse', margin: '2px 0' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--sb-separator)' }}>
                    <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 700 }}>Result</th>
                    <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 700 }}>Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {disease.checkTable.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--sb-separator)' }}>
                      <td style={{ padding: '1px 6px', whiteSpace: 'nowrap' }}>{row.result}</td>
                      <td style={{ padding: '1px 6px' }}>{row.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}



      {disease.source && (
        <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {disease.source}
        </div>
      )}
    </div>
  )
}
