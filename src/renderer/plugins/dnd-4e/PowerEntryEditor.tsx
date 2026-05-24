import { useRef, useCallback, useState } from 'react'
import type { CreatureBuilderConfig } from '@common/types'
import { TagInput } from '@renderer/components/shared/TagInput'
import { USAGE_COLORS, normalizeDamage, type DamagePart } from './dnd4e-utils'

export type { DamagePart } from './dnd4e-utils'

/** Like normalizeDamage but keeps empty-expr parts so the editor can show
 *  blank rows for the user to fill in. */
function rawDamageParts(damage: DamagePart[] | string | undefined): DamagePart[] {
  if (!damage) return []
  if (Array.isArray(damage)) return damage
  if (typeof damage === 'string' && damage.trim()) return [{ expr: damage.trim(), type: '', ongoing: false }]
  return []
}

// Unified data structure for creature/item powers
export interface PowerEntry {
  name: string
  entryType: 'action' | 'trait' | 'aura'
  actionType: string        // system-specific action type values
  usage: string             // 'at-will', 'encounter', 'recharge', 'recharge-bloodied'
  rechargeCondition?: string    // e.g. "5-6", "when first bloodied", "if the power misses"
  auraRange?: number
  keywords: string[]
  rangeType: string         // system-specific range type values
  rangeValue: string
  target: string
  attackBonus: number | null
  attackNotes: string          // conditional modifiers like "+16 while bloodied"
  defense: string
  damage: DamagePart[]      // damage parts: each has expr, type, and ongoing flag
  hit: string               // additional effect on hit beyond damage
  miss: string
  effect: string
  trigger: string
  requirement: string       // prerequisite condition (e.g. "while bloodied", "must be submerged")
  sustain: string
}

interface Props {
  entries: PowerEntry[]
  onChange: (entries: PowerEntry[]) => void
  config: CreatureBuilderConfig
  level?: number
  statBlock?: Record<string, unknown>
}

export function emptyPower(config: CreatureBuilderConfig, type: PowerEntry['entryType'] = 'action'): PowerEntry {
  return {
    name: '',
    entryType: type,
    actionType: type === 'action' ? (config.actionTypes?.[0]?.value ?? '1') : '',
    usage: type === 'action' ? (config.usageTypes?.[0]?.value ?? '') : '',
    keywords: [],
    rangeType: config.rangeTypes?.[0]?.value ?? 'melee',
    rangeValue: '1',
    target: 'One creature',
    attackBonus: null,
    attackNotes: '',
    defense: config.targetDefenses?.[0] ?? 'AC',
    damage: [],
    hit: '',
    miss: '',
    effect: '',
    trigger: '',
    requirement: '',
    sustain: '',
    auraRange: type === 'aura' ? 5 : undefined,
  }
}

function lookup(table: { [level: number]: Record<string, number> }, level: number, tier: string): number | undefined {
  return table[level]?.[tier]
}



function getTierColor(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.color ?? '#868e96'
}
function getTierLabel(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.label ?? tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function PowerEntryEditor({ entries, onChange, config, level, statBlock }: Props) {
  const grouped = config.useGroupedActions ?? false
  const update = (idx: number, patch: Partial<PowerEntry>) => onChange(entries.map((e, i) => i === idx ? { ...e, ...patch } : e))
  const remove = (idx: number) => onChange(entries.filter((_, i) => i !== idx))
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= entries.length) return
    const arr = [...entries]
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    onChange(arr)
  }

  // Attack bonus tables from config — used for inline quick-fill buttons on powers
  const atkBonusTables = config.attackBonusTables ?? []

  // Group by entry type for display (only in complex mode)
  const traits = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.entryType === 'trait')
  const auras = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.entryType === 'aura')
  const usageOrder: Record<string, number> = { 'at-will': 0, 'encounter': 1, 'recharge': 2, 'recharge-bloodied': 2 }
  const actions = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.entryType === 'action')
    .sort((a, b) => (usageOrder[a.e.usage] ?? 3) - (usageOrder[b.e.usage] ?? 3))

  if (!grouped) {
    // Non-grouped layout
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {entries.map((entry, i) => (
          <SimpleAttackRow key={i} entry={entry} idx={i} config={config} level={level}
            atkBonusTables={atkBonusTables} onUpdate={update} onRemove={remove} />
        ))}
        <AddButton label="Attack" onClick={() => onChange([...entries, emptyPower(config)])} />
      </div>
    )
  }

  // Grouped layout (traits, auras, actions)
  const sepStyle = { borderBottom: '1px solid var(--sb-separator, var(--color-border))', marginBottom: 2 }
  const newEntryRef = useCallback((el: HTMLDivElement | null) => {
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [entries.length])
  const lastIdx = entries.length - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Add button at top */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
        <AddButton label={config.usageTypes ? 'power' : 'action'} onClick={() => onChange([emptyPower(config, 'action'), ...entries])} />
      </div>

      {actions.map(({ e, i }) => (
        <div key={i}>
          <FullPowerRow entry={e} idx={i} config={config} level={level} statBlock={statBlock}
            atkBonusTables={atkBonusTables}
            onUpdate={update} onRemove={remove} onMove={move} />
        </div>
      ))}
    </div>
  )
}

// --- Non-grouped mode ---

function SimpleAttackRow({ entry: e, idx, config, level, atkBonusTables, onUpdate, onRemove }: {
  entry: PowerEntry; idx: number; config: CreatureBuilderConfig; level?: number
  atkBonusTables: { key: string; label: string; table: { [level: number]: Record<string, number> } }[]
  onUpdate: (i: number, p: Partial<PowerEntry>) => void; onRemove: (i: number) => void
}) {
  return (
    <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-surface)' }}>
      {/* Row 1: type + name */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        <select value={e.rangeType} onChange={(ev) => onUpdate(idx, { rangeType: ev.target.value })} style={{ width: 90 }}>
          <option value="melee">Melee</option>
          <option value="ranged">Ranged</option>
        </select>
        <input value={e.name} onChange={(ev) => onUpdate(idx, { name: ev.target.value })} placeholder="Attack name" style={{ flex: 1 }} />
        <button onClick={() => onRemove(idx)} style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)', padding: '2px 6px' }}>x</button>
      </div>

      {/* Row 2: action type + to-hit */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        {config.actionTypes && (
          <div style={{ display: 'flex', gap: 2 }}>
            {config.actionTypes.map((at) => (
              <button key={at.value} onClick={() => onUpdate(idx, { actionType: at.value })} title={at.label}
                style={{
                  padding: '2px 5px', fontSize: '10px',
                  fontWeight: e.actionType === at.value ? 700 : 400,
                  background: e.actionType === at.value ? 'var(--color-accent)' : 'transparent',
                  color: e.actionType === at.value ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                  border: e.actionType === at.value ? 'none' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}>{at.icon ?? at.value}</button>
            ))}
          </div>
        )}
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Atk</span>
        <input type="number" value={e.attackBonus ?? ''} onChange={(ev) => onUpdate(idx, { attackBonus: ev.target.value === '' ? null : Number(ev.target.value) })}
          style={{ width: 55 }} />
        {e.attackNotes ? (
          <input value={e.attackNotes} onChange={(ev) => onUpdate(idx, { attackNotes: ev.target.value })}
            placeholder="attack notes" style={{ width: 120, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }} />
        ) : e.attackBonus != null ? (
          <button onClick={() => onUpdate(idx, { attackNotes: ' ' })} title="Add attack notes"
            style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 4px', background: 'transparent', cursor: 'pointer' }}>+</button>
        ) : null}
        {level != null && atkBonusTables.length > 0 && (
          <div style={{ display: 'flex', gap: 1 }}>
            {atkBonusTables.flatMap((t) => {
              const row = t.table[level]
              if (!row) return []
              return Object.entries(row).map(([tier, val]) => (
                <button key={`${t.key}-${tier}`} onClick={() => onUpdate(idx, { attackBonus: val })} title={`${tier}: +${val}`}
                  style={{
                    padding: '1px 4px', fontSize: '10px',
                    fontWeight: e.attackBonus === val ? 700 : 400,
                    background: e.attackBonus === val ? (getTierColor(tier, config)) : 'transparent',
                    color: e.attackBonus === val ? 'var(--color-text-on-dark)' : 'var(--color-text-muted)',
                    border: e.attackBonus === val ? 'none' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', lineHeight: 1.4,
                  }}>{getTierLabel(tier, config)}</button>
              ))
            })}
          </div>
        )}
      </div>

      {/* Row 3: damage parts */}
      <DamagePartsEditor parts={rawDamageParts(e.damage)} config={config} level={level}
        onChange={(parts) => onUpdate(idx, { damage: parts })} />

      {/* Row 4: traits */}
      <TagInput values={e.keywords} onChange={(kw) => onUpdate(idx, { keywords: kw })}
        suggestions={config.attackTraits} placeholder="Attack traits..." />

      {/* Preview */}
      <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        {e.rangeType === 'melee' ? 'Melee' : 'Ranged'} ({config.actionTypes?.find(a => a.value === e.actionType)?.icon ?? e.actionType}) {e.name || '...'} +{e.attackBonus ?? '?'}
        {e.keywords.length > 0 ? ` (${e.keywords.join(', ')})` : ''}, Damage {formatDamage(e.damage) || '...'}
      </div>
    </div>
  )
}

// --- Grouped mode ---

export function TraitRow({ entry: e, idx, onUpdate, onRemove }: {
  entry: PowerEntry; idx: number
  onUpdate: (i: number, p: Partial<PowerEntry>) => void; onRemove: (i: number) => void
}) {
  return (
    <div style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <input className="ghost" value={e.name} onChange={(ev) => onUpdate(idx, { name: ev.target.value })}
          placeholder="Trait name" style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }} />
        <span style={{ marginLeft: 'auto' }}>
          <button onClick={() => onRemove(idx)} style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1 }}>×</button>
        </span>
      </div>
      <div style={{ paddingLeft: 12 }}>
        <textarea className="ghost" value={e.effect} onChange={(ev) => onUpdate(idx, { effect: ev.target.value })}
          placeholder="Effect description" style={{ width: '100%' }} />
      </div>
    </div>
  )
}

export function AuraRow({ entry: e, idx, onUpdate, onRemove }: {
  entry: PowerEntry; idx: number
  onUpdate: (i: number, p: Partial<PowerEntry>) => void; onRemove: (i: number) => void
}) {
  return (
    <div style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <input className="ghost" value={e.name} onChange={(ev) => onUpdate(idx, { name: ev.target.value })}
          placeholder="Aura name" style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }} />
        <span style={{ color: 'var(--color-text-secondary)' }}>aura <input className="ghost" type="number" min={1} value={e.auraRange ?? 1}
          onChange={(ev) => onUpdate(idx, { auraRange: Number(ev.target.value) })} /></span>
        <span style={{ marginLeft: 'auto' }}>
          <button onClick={() => onRemove(idx)} style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1 }}>×</button>
        </span>
      </div>
      <div style={{ paddingLeft: 12 }}>
        <textarea className="ghost" value={e.effect} onChange={(ev) => onUpdate(idx, { effect: ev.target.value })}
          placeholder="Aura effect" style={{ width: '100%' }} />
      </div>
    </div>
  )
}

function FullPowerRow({ entry: e, idx, config, level, statBlock, atkBonusTables, onUpdate, onRemove, onMove }: {
  entry: PowerEntry; idx: number; config: CreatureBuilderConfig; level?: number
  statBlock?: Record<string, unknown>
  atkBonusTables: { key: string; label: string; table: { [level: number]: Record<string, number> } }[]
  onUpdate: (i: number, p: Partial<PowerEntry>) => void
  onRemove: (i: number) => void; onMove: (i: number, dir: -1 | 1) => void
}) {
  const [focusField, setFocusField] = useState<string | null>(null)
  const autoFocusRef = useCallback((el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) { el.focus(); el.select(); setFocusField(null) }
  }, [focusField])
  const addField = (field: string, value: unknown) => { setFocusField(field); onUpdate(idx, { [field]: value }) }

  const hasUsage = config.usageTypes && config.usageTypes.length > 0
  const usageColor = hasUsage ? (USAGE_COLORS[e.usage] ?? '#868e96') : 'var(--color-border)'
  const isTriggered = (config.triggeredActionTypes ?? ['reaction']).includes(e.actionType)

  const xs = { fontSize: 'var(--font-size-xs)' }
  const lbl = { ...xs, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' as const }
  // Inline ghost select style for use inside colored headers (inherits white text)
  const hdrSelect = { color: 'inherit' }

  // Build the header paren text: "(standard; at-will)" or "(immediate interrupt; encounter)"
  const actionLabel = config.actionTypes?.find(a => a.value === e.actionType)?.label?.toLowerCase() ?? e.actionType
  const usageLabel = config.usageTypes?.find(u => u.value === e.usage)?.label ?? e.usage

  const hdrColors = {
    '--color-text-secondary': 'rgba(255,255,255,0.7)', '--color-text-muted': 'rgba(255,255,255,0.5)',
    '--color-bg-hover': 'rgba(255,255,255,0.18)', '--color-border': 'rgba(255,255,255,0.3)',
  } as React.CSSProperties
  const addBtn = { color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 4px', background: 'transparent', cursor: 'pointer' }

  const dragBtnStyle = { color: 'var(--color-text-muted)', padding: '0', lineHeight: 1, fontSize: '10px', display: 'block' }

  return (
    <div style={{ display: 'flex', fontSize: 'var(--font-size-xs)', lineHeight: 1.5, marginBottom: 2 }}>
      {/* Reorder controls — left gutter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 3px 0', gap: 1, opacity: 0.5, minWidth: 14 }}>
        <button onClick={() => onMove(idx, -1)} style={dragBtnStyle} title="Move up">▲</button>
        <span style={{ cursor: 'grab', fontSize: '8px', color: 'var(--color-text-muted)', letterSpacing: 1 }} title="Drag to reorder">⠿</span>
        <button onClick={() => onMove(idx, 1)} style={dragBtnStyle} title="Move down">▼</button>
      </div>

      {/* Card content */}
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* Header line 1: Name (action; usage) ✦ Keywords */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, padding: '2px 8px',
        background: usageColor, color: 'var(--color-text-on-dark)', ...hdrColors }}>
        <input className="ghost" value={e.name} onChange={(ev) => onUpdate(idx, { name: ev.target.value })}
          placeholder="Power name" style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'inherit' }} />
        <span style={{ color: 'rgba(255,255,255,0.8)' }}>(
          <select className="ghost" style={hdrSelect} value={e.actionType} onChange={(ev) => onUpdate(idx, { actionType: ev.target.value })}>
            {config.actionTypes?.map((at) => <option key={at.value} value={at.value}>{at.label.toLowerCase()}</option>)}
          </select>
          {hasUsage && <>; <select className="ghost" style={hdrSelect} value={e.usage} onChange={(ev) => onUpdate(idx, { usage: ev.target.value })}>
            {config.usageTypes!.map((u) => <option key={u.value} value={u.value}>{u.label.toLowerCase()}</option>)}
          </select></>}
          {e.usage === 'recharge' && <>{' '}
            <input className="ghost" value={e.rechargeCondition || ''} onChange={(ev) => onUpdate(idx, { rechargeCondition: ev.target.value })}
              placeholder="5-6" style={{ minWidth: 20 }} />
          </>}
          )</span>
        <span style={{ color: 'rgba(255,255,255,0.7)' }}>
          ✦ <TagInput compact values={Array.isArray(e.keywords) ? e.keywords : []} onChange={(kw) => onUpdate(idx, { keywords: kw })}
            suggestions={config.attackTraits} placeholder="keywords..." />
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <button onClick={() => onRemove(idx)} style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1 }}>×</button>
        </span>
      </div>

      {/* Header line 2: Attack — range, target, bonus vs defense */}
      {(e.attackBonus != null || e.target || e.rangeValue) && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '1px 8px',
          background: usageColor + '88', color: 'var(--color-text-on-dark)', ...hdrColors }}>
          <select className="ghost" style={hdrSelect} value={e.rangeType} onChange={(ev) => onUpdate(idx, { rangeType: ev.target.value })}>
            {(config.rangeTypes ?? []).map((rt) => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
          </select>
          {e.rangeType === 'personal' ? (
            <button onClick={() => onUpdate(idx, { attackBonus: null, attackNotes: '', rangeType: '', rangeValue: '', target: '', defense: 'AC', damage: [] })}
              style={{ color: 'rgba(255,255,255,0.5)', padding: '0 2px', lineHeight: 1 }}>×</button>
          ) : <>
          {(
            <input className="ghost" value={e.rangeValue} onChange={(ev) => onUpdate(idx, { rangeValue: ev.target.value })}
              placeholder="range" style={{ minWidth: 12, color: 'inherit' }} />
          )}
          (<input className="ghost" value={e.target} onChange={(ev) => onUpdate(idx, { target: ev.target.value })}
            placeholder="target" style={{ minWidth: 30, color: 'inherit' }} />);{' '}
          {(() => {
            // Attack benchmark based on defense type and role
            const role = config.useSharedRole ? (statBlock?.role as string) : undefined
            const isAC = e.defense === 'AC'
            const table = atkBonusTables.find(t => isAC ? t.key.toLowerCase().includes('ac') : !t.key.toLowerCase().includes('ac'))
            const atkBenchmark = role && table ? table.table[level ?? 0]?.[role] : undefined
            const allAtk = table?.table[level ?? 0]
            const atkTooltip = allAtk ? Object.entries(allAtk).map(([r, v]) => `${r}: +${v}`).join('\n') : ''
            return <>
              <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>+<input className="ghost" type="number" value={e.attackBonus ?? ''} onChange={(ev) => onUpdate(idx, { attackBonus: ev.target.value === '' ? null : Number(ev.target.value) })}
                placeholder="—" style={{ color: 'inherit' }} /></span>
              {atkBenchmark != null && e.attackBonus != null && e.attackBonus !== atkBenchmark && (
                <span onClick={() => onUpdate(idx, { attackBonus: atkBenchmark })} title={atkTooltip}
                  style={{ color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85em' }}>({atkBenchmark})</span>
              )}
              {' '}vs{' '}
              <select className="ghost" style={hdrSelect} value={e.defense} onChange={(ev) => onUpdate(idx, { defense: ev.target.value })}>
                {(config.targetDefenses ?? ['AC']).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </>
          })()}
          {e.attackNotes ? (
            <input className="ghost" value={e.attackNotes} onChange={(ev) => onUpdate(idx, { attackNotes: ev.target.value })}
              style={{ color: 'rgba(255,255,255,0.6)', minWidth: 30 }} />
          ) : e.attackBonus != null ? (
            <button onClick={() => onUpdate(idx, { attackNotes: ' ' })} style={{ color: 'rgba(255,255,255,0.5)', padding: '0 2px', lineHeight: 1 }}>+</button>
          ) : null}
          <button onClick={() => onUpdate(idx, { attackBonus: null, attackNotes: '', rangeType: '', rangeValue: '', target: '', defense: 'AC', damage: [] })}
            style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.5)', padding: '0 2px', lineHeight: 1 }}>×</button>
        </>}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '2px 8px 4px 12px' }}>
        {/* Trigger + Requirement */}
        {isTriggered && e.trigger && (
          <div><b style={lbl}>Trigger</b> <input className="ghost" value={e.trigger} onChange={(ev) => onUpdate(idx, { trigger: ev.target.value })}
            style={{ fontStyle: 'italic', minWidth: 100 }} /></div>
        )}
        {e.requirement && (
          <div><b style={lbl}>Requirement</b> <input className="ghost" value={e.requirement}
            ref={focusField === 'requirement' ? autoFocusRef : undefined}
            onChange={(ev) => onUpdate(idx, { requirement: ev.target.value })}
            style={{ fontStyle: 'italic', minWidth: 100 }} />
            <button onClick={() => onUpdate(idx, { requirement: '' })} style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1 }}>×</button></div>
        )}

        {/* Damage (not for personal powers) */}
        {e.rangeType !== 'personal' && (rawDamageParts(e.damage).length > 0 || e.attackBonus != null) && (() => {
          // Infer damage tier per DMG p.185:
          // Multi-target → low, brute/lurker single → high, other single → medium
          const rt = (e.rangeType || '').toLowerCase()
          const tgt = (e.target || '').toLowerCase()
          const isMulti = (rt.includes('burst') || rt.includes('blast') || rt.includes('area'))
            ? !(tgt.includes('one creature') || tgt.includes('one target'))
            : (tgt.includes('each') || tgt.includes('enemies') || tgt.includes('creatures'))
          const role = config.useSharedRole ? (statBlock?.role as string) : undefined
          const isHighDmg = role === 'brute' || role === 'lurker'
          const inferredTier = isMulti ? 'low' : isHighDmg ? 'high' : 'medium'
          return (
            <DamagePartsEditor parts={rawDamageParts(e.damage)} config={config} level={level} usage={e.usage}
              inferredTier={inferredTier} onChange={(parts) => onUpdate(idx, { damage: parts })} />
          )
        })()}

        {/* Hit / Miss / Effect — personal powers only show Effect */}
        {(e.rangeType !== 'personal' ? [
          { key: 'hit' as const, label: 'Hit' },
          { key: 'miss' as const, label: 'Miss' },
          { key: 'effect' as const, label: 'Effect' },
        ] : [
          { key: 'effect' as const, label: 'Effect' },
        ]).map(({ key, label }) => (
          e[key] ? (
            <div key={key} style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
              <b style={lbl}>{label}</b>
              <textarea className="ghost" value={e[key]}
                ref={focusField === key ? autoFocusRef : undefined}
                onChange={(ev) => onUpdate(idx, { [key]: ev.target.value })}
                style={{ flex: 1 }} />
              <button onClick={() => onUpdate(idx, { [key]: '' })} style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1 }}>×</button>
            </div>
          ) : null
        ))}

        {/* Add buttons */}
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          {e.attackBonus == null && !e.target && !e.rangeValue && (
            <button onClick={() => onUpdate(idx, { attackBonus: 0, target: 'One creature', rangeType: 'melee', rangeValue: '1', hit: ' ' })} style={addBtn}>+ target</button>
          )}
          {e.rangeType !== 'personal' && e.attackBonus != null && !e.hit && <button onClick={() => addField('hit', ' ')} style={addBtn}>+ hit</button>}
          {e.rangeType !== 'personal' && e.attackBonus != null && !e.miss && <button onClick={() => addField('miss', ' ')} style={addBtn}>+ miss</button>}
          {e.rangeType !== 'personal' && e.attackBonus != null && <button onClick={() => onUpdate(idx, { damage: [...rawDamageParts(e.damage), { expr: '', type: '', ongoing: false }] })} style={addBtn}>+ damage</button>}
          {!e.effect && <button onClick={() => addField('effect', ' ')} style={addBtn}>+ effect</button>}
          {!e.requirement && <button onClick={() => addField('requirement', ' ')} style={addBtn}>+ requirement</button>}
        </div>
      </div>
      </div>
    </div>
  )
}

// --- Shared sub-components ---

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--sb-header-text, var(--color-text-muted))', background: 'var(--sb-header-bg, transparent)', fontWeight: 700, padding: '2px 8px', marginTop: 'var(--space-1)' }}>
      {text}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: 'var(--space-2)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)',
      background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', textTransform: 'capitalize',
    }}>+ {label}</button>
  )
}

function DiceTierButtons({ table, level, currentDice, onSelect, config }: {
  table: { [level: number]: Record<string, string> }; level: number; currentDice: string; onSelect: (dice: string) => void; config: CreatureBuilderConfig
}) {
  const row = table[level]
  if (!row) return null
  return (
    <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
      {Object.entries(row).map(([tier, dice]) => (
        <button key={tier} onClick={() => onSelect(dice)} title={`${tier}: ${dice}`}
          style={{
            padding: '1px 4px', fontSize: '9px',
            fontWeight: currentDice === dice ? 700 : 400,
            background: currentDice === dice ? (getTierColor(tier, config)) : 'transparent',
            color: currentDice === dice ? 'var(--color-text-on-dark)' : 'var(--color-text-muted)',
            border: currentDice === dice ? 'none' : '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer', textTransform: 'capitalize',
          }}>{getTierLabel(tier, config)}</button>
      ))}
    </div>
  )
}

// --- Damage parts helpers ---

/** Format DamagePart[] for preview text */
function formatDamage(damage: DamagePart[] | string | undefined): string {
  const parts = normalizeDamage(damage)
  if (parts.length === 0) return ''
  return parts.map(p => {
    let s = p.ongoing ? `ongoing ${p.expr}` : p.expr
    if (p.type) s += ` ${p.type}`
    return s
  }).join(' plus ')
}

/** Inline editor for DamagePart[] — each part is a row with expr, type dropdown, ongoing toggle */
function DamagePartsEditor({ parts, config, level, usage, inferredTier, onChange }: {
  parts: DamagePart[]; config: CreatureBuilderConfig; level?: number; usage?: string; inferredTier?: string
  onChange: (parts: DamagePart[]) => void
}) {
  const updatePart = (i: number, patch: Partial<DamagePart>) => onChange(parts.map((p, j) => j === i ? { ...p, ...patch } : p))
  const removePart = (i: number) => onChange(parts.filter((_, j) => j !== i))
  const addPart = () => onChange([...parts, { expr: '', type: '', ongoing: false }])

  const xs = { fontSize: 'var(--font-size-xs)' }
  const ongoingLabel = config.damageTypes.includes('persistent') ? 'persistent' : 'ongoing'

  // Pick the right damage table based on usage (at-will → normal, encounter/recharge → limited)
  const isLimited = usage === 'encounter' || usage === 'recharge'
  const dmgTable = isLimited ? (config.limitedDamageDice ?? config.strikeDamageDice) : config.strikeDamageDice
  const dmgRow = level != null && dmgTable ? dmgTable[level] : undefined
  // Suggested damage from inferred tier
  const tier = inferredTier ?? 'medium'
  const suggestedDmg = dmgRow?.[tier] ?? dmgRow?.medium
  const dmgTooltip = dmgRow
    ? (isLimited ? 'Limited' : 'Normal') + ' damage (DMG p.185):\n' +
      Object.entries(dmgRow).map(([t, v]) => `${t === tier ? '→ ' : '  '}${t}: ${v}`).join('\n')
    : ''

  // damage type select uses ghost class from global CSS

  // Combined value for the type selector: "ongoing" if ongoing+untyped, "ongoing:fire" if ongoing+typed, or just the type
  const typeSelectValue = (p: DamagePart) => p.ongoing ? (p.type ? `ongoing:${p.type}` : 'ongoing') : p.type
  const handleTypeChange = (i: number, val: string) => {
    if (val === 'ongoing') updatePart(i, { ongoing: true, type: '' })
    else if (val.startsWith('ongoing:')) updatePart(i, { ongoing: true, type: val.substring(8) })
    else updatePart(i, { ongoing: false, type: val })
  }

  return (
    <div style={{ marginBottom: 2 }}>
      {parts.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {i === 0
            ? <b style={{ ...xs, color: 'var(--color-text-secondary)' }}>Damage</b>
            : <span style={{ ...xs, color: 'var(--color-text-secondary)', paddingLeft: 24 }}>plus</span>
          }
          {p.ongoing && <span style={{ ...xs, color: 'var(--color-text-secondary)' }}>{ongoingLabel}</span>}
          <input className="ghost" value={p.expr} onChange={(ev) => updatePart(i, { expr: ev.target.value })} placeholder="2d8+6" />
          <select className="ghost" value={p.ongoing ? 'ongoing' : p.type} onChange={(ev) => {
            if (ev.target.value === 'ongoing') updatePart(i, { ongoing: true })
            else updatePart(i, { ongoing: false, type: ev.target.value })
          }}>
            <option value="">untyped</option>
            {config.damageTypes.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
            <option value="ongoing">{ongoingLabel}</option>
          </select>
          {p.ongoing && (
            <select className="ghost" value={p.type} onChange={(ev) => updatePart(i, { type: ev.target.value })}>
              <option value="">untyped</option>
              {config.damageTypes.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
            </select>
          )}
          {i === 0 && level != null && dmgRow && suggestedDmg && p.expr !== suggestedDmg && (
            <span onClick={() => updatePart(0, { expr: suggestedDmg })} title={dmgTooltip}
              style={{ color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.85em' }}>
              ({suggestedDmg})
            </span>
          )}
          <button onClick={() => removePart(i)} style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1 }}>×</button>
        </div>
      ))}
    </div>
  )
}

