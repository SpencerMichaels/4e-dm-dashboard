// The published (app-shape) template statblock, shown by the encounter editor's template info.
import { PowerCardView } from './PowerCardView'
import { extractLevelScaling } from './dnd4e-utils'
import './statblock.css'
import type { MonsterTemplate } from './monster-templates'


export function TemplateViewer({ template: t }: { template: MonsterTemplate }) {
  const roleLabel = t.role + (t.leader ? ' (Leader)' : '')
  const defEntries = Object.entries(t.defenses).filter(([, v]) => v)

  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>
      {/* Header */}
      <div className="sb-header">
        <span className="sb-name">{t.name}</span>
        <span>Elite {roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1)}</span>
      </div>
      <div className="sb-subheader">
        <span>{t.prerequisite}</span>
        <span>XP Elite</span>
      </div>

      {/* Description */}
      {t.description && (
        <div style={{ padding: '4px 8px', fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11 }}>
          {t.description}
        </div>
      )}

      {/* Stats */}
      <div className="sb-section">
        {t.keyword && (
          <div className="sb-row"><span><b className="sb-label">Keyword</b> {t.keyword}</span></div>
        )}
        {t.senses && t.senses.length > 0 && (
          <div className="sb-row"><span><b className="sb-label">Senses</b> {t.senses.join(', ')}</span></div>
        )}
        {defEntries.length > 0 && (
          <div className="sb-row">
            <span><b className="sb-label">Defenses</b> {defEntries.map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(', ')}</span>
          </div>
        )}
        {(t.immunities && t.immunities.length > 0) && (
          <div className="sb-row"><span><b className="sb-label">Immune</b> {t.immunities.join(', ')}</span></div>
        )}
        {t.resistPerTier && (
          <div className="sb-row">
            <span><b className="sb-label">Resist</b> {t.resistPerTier.heroic}/{t.resistPerTier.paragon}/{t.resistPerTier.epic} {t.resistPerTier.type} (heroic/paragon/epic)</span>
          </div>
        )}
        {t.vulnerable && (
          <div className="sb-row"><span><b className="sb-label">Vulnerable</b> {t.vulnerable.value} {t.vulnerable.type}</span></div>
        )}
        <div className="sb-row">
          <span><b className="sb-label">Hit Points</b> +{t.hpPerLevel} per level + Constitution score</span>
        </div>
        {t.regeneration && (
          <div className="sb-row">
            <span><b className="sb-label">Regeneration</b> {t.regeneration}{t.regenerationNote ? ` (${t.regenerationNote})` : ''}</span>
          </div>
        )}
        <div className="sb-row">
          <span><b className="sb-label">Saving Throws</b> +{t.savingThrows}; <b className="sb-label">Action Points</b> {t.actionPoints}</span>
        </div>
      </div>

      {/* Powers */}
      {t.powers.length > 0 && (
        <div className="sb-section">
          {t.powers.map((pow, i) => {
            const parts = (pow.action ?? '').split(';').map(s => s.trim())
            const usageWords = ['at will', 'at-will', 'encounter', 'daily', 'recharge', 'recharges']
            const usagePart = parts.find(p => usageWords.some(u => p.toLowerCase().startsWith(u))) ?? ''
            const actionPart = parts.filter(p => p !== usagePart).join('; ')
            let usage = usagePart.replace(/^at will$/i, 'at-will')
            let rechargeValue: number | undefined
            let rechargeCondition: string | undefined
            if (/^recharge/i.test(usagePart)) {
              const diceMatch = usagePart.match(/^recharges?\s+([\d])/i)
              if (diceMatch) { usage = 'recharge'; rechargeValue = parseInt(diceMatch[1]) }
              else {
                const condMatch = usagePart.match(/^recharges?\s+(.+)$/i)
                usage = 'recharge'
                if (condMatch) rechargeCondition = condMatch[1]
              }
            }
            if (!usage && actionPart) usage = 'at-will'
            const p = pow as any
            const allScaling: { level: number; text: string }[] = []
            const ext = (s: string | undefined): string | undefined => {
              if (!s) return undefined
              const { cleaned, scaling } = extractLevelScaling(s)
              allScaling.push(...scaling)
              return cleaned || undefined
            }
            return (
              <PowerCardView key={i} entry={{
                name: pow.name,
                usage,
                action: actionPart || undefined,
                rechargeValue,
                rechargeCondition,
                keywords: pow.keywords ? pow.keywords.split(',').map(k => k.trim()) : undefined,
                rangeType: p.rangeType || undefined,
                rangeValue: p.rangeValue || undefined,
                target: p.target || undefined,
                attackBonus: p.attackBonus ? 0 : undefined,
                attackNotes: p.attackBonus || undefined,
                defense: p.defense || undefined,
                damage: ext(p.damage),
                hit: ext(p.hit),
                miss: ext(p.miss),
                effect: ext(pow.description),
                trigger: p.trigger || undefined,
                requirement: p.requirement || undefined,
                critical: p.critical || undefined,
                levelScaling: allScaling.length > 0 ? allScaling : undefined,
              }} />
            )
          })}
        </div>
      )}

      {/* Source */}
      {t.source && (
        <div style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {t.source}
        </div>
      )}
    </div>
  )
}
