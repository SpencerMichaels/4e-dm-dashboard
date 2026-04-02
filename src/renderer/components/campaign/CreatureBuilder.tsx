import { useState, useEffect, useRef } from 'react'
import type { CreatureBuilderConfig, CreatureBuilderStatDef } from '@common/types'

interface Props {
  statBlock: Record<string, unknown>
  hp: number
  maxHp: number
  onUpdate: (statBlock: Record<string, unknown>, hp: number, maxHp: number) => void
  config: CreatureBuilderConfig
}

function lookup(table: { [level: number]: Record<string, number> }, level: number, tier: string): number | undefined {
  return table[level]?.[tier]
}

type TierSelections = Record<string, string>

function tierColor(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.color ?? '#868e96'
}

function tierShort(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.label ?? tier.charAt(0).toUpperCase() + tier.slice(1)
}

// Shared inline styles
const lbl = { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' as const }
const numStyle = { width: 45, textAlign: 'center' as const, fontSize: 'var(--font-size-xs)' }

export function CreatureBuilder({ statBlock, hp, maxHp, onUpdate, config }: Props) {
  const { statDefs, minLevel, maxLevel, useSharedRole, roles } = config
  const level = (statBlock.level as number) ?? 1
  const [tiers, setTiers] = useState<TierSelections>(() => inferTiers(level, statBlock, hp))
  const [sharedRole, setSharedRole] = useState<string>(() => (statBlock.role as string) ?? roles?.[0] ?? '')
  const initialMount = useRef(true)

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false
      if (useSharedRole && sharedRole && !statBlock.role) {
        onUpdate({ ...statBlock, role: sharedRole }, hp, maxHp)
      }
      return
    }
    if (useSharedRole && sharedRole) {
      const newTiers: TierSelections = {}
      for (const def of statDefs) {
        newTiers[def.key] = def.tiers.includes(sharedRole) ? sharedRole : tiers[def.key] ?? def.tiers[Math.floor(def.tiers.length / 2)]
      }
      setTiers(newTiers)
      applyTiers(level, newTiers, sharedRole)
    } else {
      applyTiers(level, tiers)
    }
  }, [level, sharedRole])

  function inferTiers(lvl: number, sb: Record<string, unknown>, currentHp: number): TierSelections {
    const result: TierSelections = {}
    for (const def of statDefs) {
      const currentVal = getStatValue(def, sb, currentHp)
      let bestTier = def.tiers[Math.floor(def.tiers.length / 2)]
      if (currentVal != null) {
        for (const tier of def.tiers) {
          if (lookup(def.table as any, lvl, tier as any) === currentVal) { bestTier = tier; break }
        }
      }
      result[def.key] = bestTier
    }
    return result
  }

  function getStatValue(def: CreatureBuilderStatDef, sb: Record<string, unknown>, currentHp: number): number | undefined {
    if (def.key === 'hp') return currentHp
    if (def.statBlockPath) {
      let obj: any = sb
      for (const p of def.statBlockPath) obj = obj?.[p]
      return typeof obj === 'number' ? obj : undefined
    }
    const val = sb[def.statBlockKey]
    return typeof val === 'number' ? val : undefined
  }

  function applyTiers(lvl: number, tierSelections: TierSelections, role?: string) {
    const newStatBlock = { ...statBlock }
    if (role) newStatBlock.role = role
    let newHp = hp, newMaxHp = maxHp

    for (const def of statDefs) {
      const tier = tierSelections[def.key]
      if (!tier) continue
      const val = lookup(def.table as any, lvl, tier as any)
      if (val == null) continue

      if (def.key === 'hp') {
        let adjustedVal = val
        if (config.abilityScores?.hpAbility) {
          const abilities = (statBlock.abilities as Record<string, number>) ?? {}
          const baseline = config.abilityScores.hpBaseline ?? 14
          adjustedVal = val + (abilities[config.abilityScores.hpAbility] ?? baseline) - baseline
        }
        newHp = adjustedVal; newMaxHp = adjustedVal
      } else if (def.statBlockPath) {
        const [parent, child] = def.statBlockPath
        newStatBlock[parent] = { ...(newStatBlock[parent] as Record<string, unknown> ?? {}), [child]: val }
      } else {
        newStatBlock[def.statBlockKey] = val
      }
    }
    onUpdate(newStatBlock, newHp, newMaxHp)
  }

  function handleDirectValueChange(def: CreatureBuilderStatDef, val: number) {
    const newStatBlock = { ...statBlock }
    if (def.key === 'hp') { onUpdate(newStatBlock, val, val); return }
    if (def.statBlockPath) {
      const [parent, child] = def.statBlockPath
      newStatBlock[parent] = { ...(newStatBlock[parent] as Record<string, unknown> ?? {}), [child]: val }
    } else {
      newStatBlock[def.statBlockKey] = val
    }
    onUpdate(newStatBlock, hp, maxHp)
  }

  const isRoleBased = (def: CreatureBuilderStatDef) => useSharedRole && roles && def.tiers.every(t => roles.includes(t))

  return (
    <div>
      {/* Level + Role — inline */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
        <span style={lbl}>Level</span>
        <input type="number" className="ghost" min={minLevel} max={maxLevel} value={level}
          onChange={(e) => onUpdate({ ...statBlock, level: Number(e.target.value) }, hp, maxHp)}
          style={{ ...numStyle, fontWeight: 600 }} />
        {useSharedRole && roles && (
          <>
            <span style={lbl}>Role</span>
            <div style={{ display: 'flex', gap: 1 }}>
              {roles.map((role) => (
                <button key={role} onClick={() => setSharedRole(role)}
                  style={{
                    padding: '1px 5px', fontSize: '10px', textTransform: 'capitalize',
                    fontWeight: sharedRole === role ? 700 : 400,
                    background: sharedRole === role ? tierColor(role, config) : 'transparent',
                    color: sharedRole === role ? '#fff' : 'var(--color-text-muted)',
                    border: sharedRole === role ? 'none' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  }}>{tierShort(role, config)}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Stats — inline row, not stacked */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
        {statDefs.map((def) => {
          const roleBased = isRoleBased(def)
          const currentValue = getStatValue(def, statBlock, hp)

          if (roleBased) {
            const roleValue = lookup(def.table, level, sharedRole)
            return (
              <label key={def.key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={lbl}>{def.label}</span>
                <input type="number" className="ghost" value={currentValue ?? roleValue ?? ''}
                  onChange={(e) => handleDirectValueChange(def, Number(e.target.value))}
                  style={{ ...numStyle, fontWeight: 600, color: tierColor(sharedRole, config) }} />
                {roleValue != null && currentValue !== roleValue && (
                  <button onClick={() => handleDirectValueChange(def, roleValue)}
                    title={`Reset to ${roleValue}`}
                    style={{ padding: '0 3px', fontSize: '9px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    ={roleValue}
                  </button>
                )}
              </label>
            )
          }

          // Non-role stat with tier buttons
          return (
            <div key={def.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={lbl}>{def.label}</span>
              <input type="number" className="ghost" value={currentValue ?? ''} onChange={(e) => handleDirectValueChange(def, Number(e.target.value))}
                style={numStyle} />
              <div style={{ display: 'flex', gap: 1 }}>
                {def.tiers.map((tier) => {
                  const tierVal = lookup(def.table, level, tier)
                  const isMatch = currentValue != null && tierVal === currentValue
                  return (
                    <button key={tier} onClick={() => { if (tierVal != null) handleDirectValueChange(def, tierVal) }}
                      title={tierVal != null ? `${tier}: ${tierVal}` : tier}
                      style={{
                        padding: '1px 3px', fontSize: '9px',
                        fontWeight: isMatch ? 700 : 400,
                        background: isMatch ? tierColor(tier, config) : 'transparent',
                        color: isMatch ? '#fff' : 'var(--color-text-muted)',
                        border: isMatch ? 'none' : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      }}>{tierShort(tier, config)}</button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
