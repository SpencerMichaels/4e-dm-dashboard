import type { CreatureBuilderConfig } from '@common/types'
import { TagInput } from '../shared/TagInput'

// A single damage roll component — powers can deal multiple damage parts
export interface DamagePart {
  expr: string       // dice expression: "2d8+6", "5", "1d10"
  type: string       // damage type: "fire", "necrotic", "" (untyped)
  ongoing: boolean   // true = ongoing/persistent damage
}

// Unified data structure for creature actions across all systems
export interface ActionEntry {
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
  entries: ActionEntry[]
  onChange: (entries: ActionEntry[]) => void
  config: CreatureBuilderConfig
  level?: number
  statBlock?: Record<string, unknown>
}

function emptyEntry(config: CreatureBuilderConfig, type: ActionEntry['entryType'] = 'action'): ActionEntry {
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


const USAGE_COLORS: Record<string, string> = {
  'at-will': '#2f9e44',
  'encounter': '#c92a2a',
  'recharge': '#868e96',
  'recharge-bloodied': '#868e96',
}

function getTierColor(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.color ?? '#868e96'
}
function getTierLabel(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.label ?? tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function ActionEntryEditor({ entries, onChange, config, level, statBlock }: Props) {
  const grouped = config.useGroupedActions ?? false
  const update = (idx: number, patch: Partial<ActionEntry>) => onChange(entries.map((e, i) => i === idx ? { ...e, ...patch } : e))
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
  const actions = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.entryType === 'action')

  if (!grouped) {
    // Non-grouped layout
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {entries.map((entry, i) => (
          <SimpleAttackRow key={i} entry={entry} idx={i} config={config} level={level}
            atkBonusTables={atkBonusTables} onUpdate={update} onRemove={remove} />
        ))}
        <AddButton label="Attack" onClick={() => onChange([...entries, emptyEntry(config)])} />
      </div>
    )
  }

  // Grouped layout (traits, auras, actions)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {traits.length > 0 && <SectionLabel text="Traits" />}
      {traits.map(({ e, i }) => (
        <TraitRow key={i} entry={e} idx={i} onUpdate={update} onRemove={remove} />
      ))}

      {auras.length > 0 && <SectionLabel text="Auras" />}
      {auras.map(({ e, i }) => (
        <AuraRow key={i} entry={e} idx={i} onUpdate={update} onRemove={remove} />
      ))}

      {actions.length > 0 && <SectionLabel text={config.usageTypes ? 'Powers' : 'Actions'} />}
      {actions.map(({ e, i }) => (
        <FullPowerRow key={i} entry={e} idx={i} config={config} level={level} statBlock={statBlock}
          atkBonusTables={atkBonusTables}
          onUpdate={update} onRemove={remove} onMove={move} />
      ))}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {['trait', 'aura', 'action'].map((type) => (
          <AddButton key={type} label={type} onClick={() => onChange([...entries, emptyEntry(config, type as ActionEntry['entryType'])])} />
        ))}
      </div>
    </div>
  )
}

// --- Non-grouped mode ---

function SimpleAttackRow({ entry: e, idx, config, level, atkBonusTables, onUpdate, onRemove }: {
  entry: ActionEntry; idx: number; config: CreatureBuilderConfig; level?: number
  atkBonusTables: { key: string; label: string; table: { [level: number]: Record<string, number> } }[]
  onUpdate: (i: number, p: Partial<ActionEntry>) => void; onRemove: (i: number) => void
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
                    color: e.attackBonus === val ? '#fff' : 'var(--color-text-muted)',
                    border: e.attackBonus === val ? 'none' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', lineHeight: 1.4,
                  }}>{getTierLabel(tier, config)}</button>
              ))
            })}
          </div>
        )}
      </div>

      {/* Row 3: damage parts */}
      <DamagePartsEditor parts={normalizeDamage(e.damage)} config={config} level={level}
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

function TraitRow({ entry: e, idx, onUpdate, onRemove }: {
  entry: ActionEntry; idx: number
  onUpdate: (i: number, p: Partial<ActionEntry>) => void; onRemove: (i: number) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', padding: '4px var(--space-2)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
      <input value={e.name} onChange={(ev) => onUpdate(idx, { name: ev.target.value })} placeholder="Trait name" style={{ width: 140, fontWeight: 600, fontSize: 'var(--font-size-sm)' }} />
      <textarea value={e.effect} onChange={(ev) => onUpdate(idx, { effect: ev.target.value })} placeholder="Effect description" style={{ flex: 1, fontSize: 'var(--font-size-xs)' }} />
      <button onClick={() => onRemove(idx)} style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', padding: '2px 4px' }}>x</button>
    </div>
  )
}

function AuraRow({ entry: e, idx, onUpdate, onRemove }: {
  entry: ActionEntry; idx: number
  onUpdate: (i: number, p: Partial<ActionEntry>) => void; onRemove: (i: number) => void
}) {
  return (
    <div style={{ padding: '4px var(--space-2)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
        <input value={e.name} onChange={(ev) => onUpdate(idx, { name: ev.target.value })} placeholder="Aura name" style={{ flex: 1, fontWeight: 600, fontSize: 'var(--font-size-sm)' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          <input type="number" min={1} value={e.auraRange ?? 1} onChange={(ev) => onUpdate(idx, { auraRange: Number(ev.target.value) })} style={{ width: 35 }} />sq
        </label>
        <button onClick={() => onRemove(idx)} style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', padding: '2px 4px' }}>x</button>
      </div>
      <textarea value={e.effect} onChange={(ev) => onUpdate(idx, { effect: ev.target.value })} placeholder="Aura effect" style={{ width: '100%', fontSize: 'var(--font-size-xs)' }} />
    </div>
  )
}

function FullPowerRow({ entry: e, idx, config, level, statBlock, atkBonusTables, onUpdate, onRemove, onMove }: {
  entry: ActionEntry; idx: number; config: CreatureBuilderConfig; level?: number
  statBlock?: Record<string, unknown>
  atkBonusTables: { key: string; label: string; table: { [level: number]: Record<string, number> } }[]
  onUpdate: (i: number, p: Partial<ActionEntry>) => void
  onRemove: (i: number) => void; onMove: (i: number, dir: -1 | 1) => void
}) {
  const hasUsage = config.usageTypes && config.usageTypes.length > 0
  const usageColor = hasUsage ? (USAGE_COLORS[e.usage] ?? '#868e96') : 'var(--color-border)'
  const isTriggered = (config.triggeredActionTypes ?? ['reaction']).includes(e.actionType)

  return (
    <div style={{ padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-surface)', borderLeft: hasUsage ? `3px solid ${usageColor}` : undefined }}>
      {/* Name + action type + usage */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        <input value={e.name} onChange={(ev) => onUpdate(idx, { name: ev.target.value })} placeholder={hasUsage ? 'Power name' : 'Ability name'} style={{ flex: 1, fontWeight: 600, fontSize: 'var(--font-size-sm)' }} />
        {config.actionTypes && (
          <select value={e.actionType} onChange={(ev) => onUpdate(idx, { actionType: ev.target.value })} style={{ fontSize: 'var(--font-size-xs)' }}>
            {config.actionTypes.map((at) => <option key={at.value} value={at.value}>{at.label}</option>)}
          </select>
        )}
        {hasUsage && (
          <>
            <select value={e.usage} onChange={(ev) => onUpdate(idx, { usage: ev.target.value })} style={{ width: 100, fontSize: 'var(--font-size-xs)' }}>
              {config.usageTypes!.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            {e.usage === 'recharge' && (
              <input value={e.rechargeCondition || ''} onChange={(ev) => onUpdate(idx, { rechargeCondition: ev.target.value })}
                placeholder="5-6, when first bloodied, etc."
                style={{ width: 160, fontSize: 'var(--font-size-xs)' }} />
            )}
          </>
        )}
        <button onClick={() => onMove(idx, -1)} style={{ padding: '1px 4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>^</button>
        <button onClick={() => onRemove(idx)} style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', padding: '2px 4px' }}>x</button>
      </div>

      {/* Traits/Keywords */}
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <TagInput values={Array.isArray(e.keywords) ? e.keywords : []} onChange={(kw) => onUpdate(idx, { keywords: kw })}
          suggestions={config.attackTraits} placeholder={hasUsage ? 'Keywords...' : 'Traits...'} />
      </div>

      {/* Trigger (for reactions and triggered actions) */}
      {isTriggered && (
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <input value={e.trigger} onChange={(ev) => onUpdate(idx, { trigger: ev.target.value })} placeholder="Trigger..." style={{ width: '100%', fontSize: 'var(--font-size-xs)', fontStyle: 'italic' }} />
        </div>
      )}

      {/* Requirement — show if present, with add button */}
      {e.requirement ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 32 }}>Req</span>
          <input value={e.requirement} onChange={(ev) => onUpdate(idx, { requirement: ev.target.value })} placeholder="Requirement..." style={{ flex: 1, fontSize: 'var(--font-size-xs)', fontStyle: 'italic' }} />
          <button onClick={() => onUpdate(idx, { requirement: '' })} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', padding: '2px' }}>x</button>
        </div>
      ) : null}

      {/* Frequency (optional, for systems without usage types) */}
      {!hasUsage && (
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <input value={e.sustain} onChange={(ev) => onUpdate(idx, { sustain: ev.target.value })} placeholder="Frequency (optional, e.g. 'once per day', 'can't use again for 1d4 rounds')" style={{ width: '100%', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }} />
        </div>
      )}

      {/* Range + Target + Attack — show if this is an attack */}
      {(e.attackBonus != null || e.target || e.rangeValue) && (<>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        <select value={e.rangeType} onChange={(ev) => onUpdate(idx, { rangeType: ev.target.value })} style={{ width: 100, fontSize: 'var(--font-size-xs)' }}>
          {(config.rangeTypes ?? []).map((rt) => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
        </select>
        {e.rangeType !== 'personal' && (
          <input value={e.rangeValue} onChange={(ev) => onUpdate(idx, { rangeValue: ev.target.value })}
            placeholder={
              e.rangeType === 'melee' ? 'reach' :
              e.rangeType === 'ranged' ? 'range' :
              e.rangeType === 'area-burst' ? 'size within range' :
              'size'
            }
            style={{ width: e.rangeType === 'area-burst' ? 100 : 50, fontSize: 'var(--font-size-xs)' }} />
        )}
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Target</span>
        <input value={e.target} onChange={(ev) => onUpdate(idx, { target: ev.target.value })} placeholder={
          e.rangeType.includes('burst') ? 'Each creature in burst' :
          e.rangeType.includes('blast') ? 'Each creature in blast' :
          'One creature'
        } style={{ flex: 1, fontSize: 'var(--font-size-xs)' }} />
      </div>

      {/* Attack + defense */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Attack</span>
        <input type="number" value={e.attackBonus ?? ''} onChange={(ev) => onUpdate(idx, { attackBonus: ev.target.value === '' ? null : Number(ev.target.value) })}
          placeholder="—" style={{ width: 55, fontSize: 'var(--font-size-xs)' }} />
        {/* Attack bonus quick-fill buttons — context-dependent on selected defense */}
        {level != null && atkBonusTables.length > 0 && (() => {
          const role = config.useSharedRole ? (statBlock?.role as string) : undefined
          // For role-based systems: pick the table matching the defense (AC vs other)
          const isAC = e.defense === 'AC'
          const relevantTables = atkBonusTables.length > 1
            ? atkBonusTables.filter(t => isAC ? t.key.toLowerCase().includes('ac') : !t.key.toLowerCase().includes('ac'))
            : atkBonusTables

          return (
            <div style={{ display: 'flex', gap: 1 }}>
              {relevantTables.flatMap((t) => {
                const row = t.table[level]
                if (!row) return []
                if (role && row[role] != null) {
                  const val = row[role]
                  return [(
                    <button key={t.key} onClick={() => onUpdate(idx, { attackBonus: val })} title={`+${val}`}
                      style={{
                        padding: '1px 5px', fontSize: '10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                        border: e.attackBonus === val ? 'none' : '1px solid var(--color-border)',
                        background: e.attackBonus === val ? 'var(--color-accent)' : 'transparent',
                        color: e.attackBonus === val ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                      }}>+{val}</button>
                  )]
                }
                return Object.entries(row).map(([tier, val]) => (
                  <button key={`${t.key}-${tier}`} onClick={() => onUpdate(idx, { attackBonus: val })} title={`${tier}: +${val}`}
                    style={{
                      padding: '1px 4px', fontSize: '10px',
                      fontWeight: e.attackBonus === val ? 700 : 400,
                      background: e.attackBonus === val ? (getTierColor(tier, config)) : 'transparent',
                      color: e.attackBonus === val ? '#fff' : 'var(--color-text-muted)',
                      border: e.attackBonus === val ? 'none' : '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer', lineHeight: 1.4,
                    }}>{getTierLabel(tier, config)}</button>
                ))
              })}
            </div>
          )
        })()}
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>vs</span>
        <select value={e.defense} onChange={(ev) => onUpdate(idx, { defense: ev.target.value })} style={{ width: 85, fontSize: 'var(--font-size-xs)' }}>
          {(config.targetDefenses ?? ['AC']).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      </>)}

      {/* Damage — only show if has damage parts or attack bonus */}
      {(normalizeDamage(e.damage).length > 0 || e.attackBonus != null) && (
        <DamagePartsEditor parts={normalizeDamage(e.damage)} config={config} level={level}
          onChange={(parts) => onUpdate(idx, { damage: parts })} />
      )}
      {/* Hit / Miss / Effect — only show fields that have content, plus add buttons for empty ones */}
      {[
        { key: 'hit' as const, label: 'Hit', placeholder: 'Additional effect on hit' },
        { key: 'miss' as const, label: 'Miss', placeholder: 'Half damage, etc.' },
        { key: 'effect' as const, label: 'Effect', placeholder: 'Regardless of hit/miss' },
      ].map(({ key, label, placeholder }) => (
        e[key] ? (
          <div key={key} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', marginBottom: 2 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 32, paddingTop: 4 }}>{label}</span>
            <textarea value={e[key]} onChange={(ev) => onUpdate(idx, { [key]: ev.target.value })} placeholder={placeholder} style={{ flex: 1, fontSize: 'var(--font-size-xs)' }} />
            <button onClick={() => onUpdate(idx, { [key]: '' })} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', padding: '2px' }}>x</button>
          </div>
        ) : null
      ))}
      {/* Add buttons for empty optional fields */}
      {(!e.hit || !e.miss || !e.effect || (normalizeDamage(e.damage).length === 0 && e.attackBonus == null)) && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 2 }}>
          {e.attackBonus == null && !e.target && !e.rangeValue && (
            <button onClick={() => onUpdate(idx, { attackBonus: 0, target: 'One creature', rangeType: 'melee', rangeValue: '1' })} style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', background: 'transparent', cursor: 'pointer' }}>+ attack</button>
          )}
          {!e.hit && <button onClick={() => onUpdate(idx, { hit: ' ' })} style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', background: 'transparent', cursor: 'pointer' }}>+ hit</button>}
          {!e.miss && <button onClick={() => onUpdate(idx, { miss: ' ' })} style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', background: 'transparent', cursor: 'pointer' }}>+ miss</button>}
          {!e.effect && <button onClick={() => onUpdate(idx, { effect: ' ' })} style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', background: 'transparent', cursor: 'pointer' }}>+ effect</button>}
          {!e.requirement && <button onClick={() => onUpdate(idx, { requirement: ' ' })} style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', background: 'transparent', cursor: 'pointer' }}>+ req</button>}
        </div>
      )}
    </div>
  )
}

// --- Shared sub-components ---

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 'var(--space-2)' }}>
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
            color: currentDice === dice ? '#fff' : 'var(--color-text-muted)',
            border: currentDice === dice ? 'none' : '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer', textTransform: 'capitalize',
          }}>{getTierLabel(tier, config)}</button>
      ))}
    </div>
  )
}

// --- Damage parts helpers ---

/** Normalize legacy string damage to DamagePart[]. Handles old data with string damage field. */
function normalizeDamage(damage: DamagePart[] | string | undefined): DamagePart[] {
  if (!damage) return []
  if (Array.isArray(damage)) return damage
  // Legacy string: "2d8+6" — convert to single part
  if (typeof damage === 'string' && damage.trim()) return [{ expr: damage.trim(), type: '', ongoing: false }]
  return []
}

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
function DamagePartsEditor({ parts, config, level, onChange }: {
  parts: DamagePart[]; config: CreatureBuilderConfig; level?: number
  onChange: (parts: DamagePart[]) => void
}) {
  const updatePart = (i: number, patch: Partial<DamagePart>) => onChange(parts.map((p, j) => j === i ? { ...p, ...patch } : p))
  const removePart = (i: number) => onChange(parts.filter((_, j) => j !== i))
  const addPart = () => onChange([...parts, { expr: '', type: '', ongoing: false }])

  const xs = { fontSize: 'var(--font-size-xs)' }
  const ongoingLabel = config.damageTypes.includes('persistent') ? 'persistent' : 'ongoing'

  return (
    <div style={{ marginBottom: 2 }}>
      {parts.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
          {i === 0 && <span style={{ ...xs, color: 'var(--color-text-muted)', minWidth: 32 }}>Dmg</span>}
          {i > 0 && <span style={{ ...xs, color: 'var(--color-text-muted)', minWidth: 32 }}>plus</span>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 2, ...xs, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={p.ongoing} onChange={(ev) => updatePart(i, { ongoing: ev.target.checked })}
              style={{ width: 13, height: 13 }} />
            {ongoingLabel}
          </label>
          <input value={p.expr} onChange={(ev) => updatePart(i, { expr: ev.target.value })} placeholder="2d8+6"
            style={{ width: 80, ...xs }} />
          {i === 0 && level != null && config.strikeDamageDice?.[level] && (
            <DiceTierButtons table={config.strikeDamageDice} level={level} currentDice={p.expr} config={config}
              onSelect={(dice) => updatePart(0, { expr: dice })} />
          )}
          <select value={p.type} onChange={(ev) => updatePart(i, { type: ev.target.value })} style={{ width: 100, ...xs }}>
            <option value="">untyped</option>
            {config.damageTypes.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
          </select>
          <button onClick={() => removePart(i)} style={{ ...xs, color: 'var(--color-text-muted)', padding: '1px 4px' }}>x</button>
        </div>
      ))}
      <button onClick={addPart} style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 6px', background: 'transparent', cursor: 'pointer' }}>+ damage</button>
    </div>
  )
}

