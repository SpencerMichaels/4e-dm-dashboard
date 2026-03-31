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

type TierSelections = Record<string, string>  // statDef.key -> tier name

// Default fallback colors/labels — overridden by config.tierDisplay
const DEFAULT_TIER_COLOR = '#868e96'

function tierColor(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.color ?? DEFAULT_TIER_COLOR
}

function tierShort(tier: string, config: CreatureBuilderConfig): string {
  return config.tierDisplay?.[tier]?.label ?? tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function CreatureBuilder({ statBlock, hp, maxHp, onUpdate, config }: Props) {
  const { statDefs, minLevel, maxLevel, useSharedRole, roles } = config
  const level = (statBlock.level as number) ?? 1
  const [tiers, setTiers] = useState<TierSelections>(() => inferTiers(level, statBlock, hp))
  const [sharedRole, setSharedRole] = useState<string>(() => (statBlock.role as string) ?? roles?.[0] ?? '')
  const initialMount = useRef(true)

  // When level or shared role changes, recompute — but NOT on initial mount
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false
      // Persist default role if not already set
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
      // Find the tier that matches the current value
      let bestTier = def.tiers[Math.floor(def.tiers.length / 2)] // default to middle
      if (currentVal != null) {
        for (const tier of def.tiers) {
          const benchVal = lookup(def.table as any, lvl, tier as any)
          if (benchVal === currentVal) {
            bestTier = tier
            break
          }
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
      for (const p of def.statBlockPath) {
        obj = obj?.[p]
      }
      return typeof obj === 'number' ? obj : undefined
    }
    const val = sb[def.statBlockKey]
    return typeof val === 'number' ? val : undefined
  }

  function applyTiers(lvl: number, tierSelections: TierSelections, role?: string) {
    const newStatBlock = { ...statBlock }
    if (role) newStatBlock.role = role
    let newHp = hp
    let newMaxHp = maxHp

    for (const def of statDefs) {
      const tier = tierSelections[def.key]
      if (!tier) continue
      const val = lookup(def.table as any, lvl, tier as any)
      if (val == null) continue

      if (def.key === 'hp') {
        // Adjust HP for actual ability score if configured
        let adjustedVal = val
        if (config.abilityScores?.hpAbility) {
          const abilities = (statBlock.abilities as Record<string, number>) ?? {}
          const baseline = config.abilityScores.hpBaseline ?? 14
          const actualScore = abilities[config.abilityScores.hpAbility] ?? baseline
          adjustedVal = val + (actualScore - baseline)
        }
        newHp = adjustedVal
        newMaxHp = adjustedVal
      } else if (def.statBlockPath) {
        // Nested: e.g. saves.fort
        const [parent, child] = def.statBlockPath
        const existing = (newStatBlock[parent] as Record<string, unknown>) ?? {}
        newStatBlock[parent] = { ...existing, [child]: val }
      } else {
        newStatBlock[def.statBlockKey] = val
      }
    }

    onUpdate(newStatBlock, newHp, newMaxHp)
  }

  function handleTierChange(defKey: string, tier: string) {
    const newTiers = { ...tiers, [defKey]: tier }
    setTiers(newTiers)
    applyTiers(level, newTiers)
  }

  function handleDirectValueChange(def: CreatureBuilderStatDef, val: number) {
    const newStatBlock = { ...statBlock }
    if (def.key === 'hp') {
      onUpdate(newStatBlock, val, val)
      return
    }
    if (def.statBlockPath) {
      const [parent, child] = def.statBlockPath
      const existing = (newStatBlock[parent] as Record<string, unknown>) ?? {}
      newStatBlock[parent] = { ...existing, [child]: val }
    } else {
      newStatBlock[def.statBlockKey] = val
    }
    onUpdate(newStatBlock, hp, maxHp)
  }

  function handleLevelChange(newLevel: number) {
    const newStatBlock = { ...statBlock, level: newLevel }
    // First update the level in the statBlock
    onUpdate(newStatBlock, hp, maxHp)
    // Then re-apply tiers at new level (effect will fire on next render)
  }

  return (
    <div>
      {/* Level selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-4)',
        padding: 'var(--space-3)',
        background: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
      }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>Creature Level</span>
        <input
          type="number"
          min={minLevel}
          max={maxLevel}
          value={level}
          onChange={(e) => handleLevelChange(Number(e.target.value))}
          style={{ width: 70, textAlign: 'center', fontWeight: 600, fontSize: 'var(--font-size-lg)' }}
        />
      </div>

      {/* Shared role picker */}
      {useSharedRole && roles && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
          padding: 'var(--space-3)',
          background: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginRight: 'var(--space-2)' }}>Role</span>
          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
            {roles.map((role) => (
              <button
                key={role}
                onClick={() => setSharedRole(role)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: sharedRole === role ? 700 : 400,
                  background: sharedRole === role ? tierColor(role, config) : 'transparent',
                  color: sharedRole === role ? '#fff' : 'var(--color-text-muted)',
                  border: sharedRole === role ? 'none' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {tierShort(role, config)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stat rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {statDefs.map((def) => {
          // In shared role mode, role-based stats just show the value
          const isRoleBased = useSharedRole && roles && def.tiers.every(t => roles.includes(t))
          if (isRoleBased) {
            const roleValue = lookup(def.table, level, sharedRole)
            const actualValue = getStatValue(def, statBlock, hp)
            return (
              <div key={def.key} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '6px var(--space-3)',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ flex: 1, fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{def.label}</span>
                {roleValue != null && actualValue !== roleValue && (
                  <button onClick={() => handleDirectValueChange(def, roleValue)}
                    style={{ padding: '1px 5px', fontSize: '10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text-muted)' }}
                  >={roleValue}</button>
                )}
                <input type="number" value={actualValue ?? roleValue ?? ''} onChange={(e) => handleDirectValueChange(def, Number(e.target.value))}
                  style={{ width: 50, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: tierColor(sharedRole, config), border: 'none', background: 'transparent' }} />
              </div>
            )
          }
          // Non-role stats (e.g. DC with easy/moderate/hard) get per-stat tier buttons
          return (
            <StatRow
              key={def.key}
              def={def}
              level={level}
              config={config}
              currentValue={getStatValue(def, statBlock, hp) ?? null}
              selectedTier={tiers[def.key] || def.tiers[Math.floor(def.tiers.length / 2)]}
              onTierChange={(tier) => handleTierChange(def.key, tier)}
              onValueChange={(val) => handleDirectValueChange(def, val)}
            />
          )
        })}
      </div>
    </div>
  )
}

function StatRow({
  def,
  level,
  config,
  currentValue,
  selectedTier,
  onTierChange,
  onValueChange,
}: {
  def: CreatureBuilderStatDef
  level: number
  config: CreatureBuilderConfig
  currentValue: number | null
  selectedTier: string
  onTierChange: (tier: string) => void
  onValueChange: (val: number) => void
}) {
  // Find the closest tier to the current value (exact match or nearest)
  let matchedTier: string | undefined
  if (currentValue != null) {
    // First try exact match
    matchedTier = def.tiers.find((tier) => lookup(def.table, level, tier) === currentValue)
    // If no exact match, find closest
    if (!matchedTier) {
      let closestDist = Infinity
      for (const tier of def.tiers) {
        const tierVal = lookup(def.table, level, tier)
        if (tierVal != null) {
          const dist = Math.abs(tierVal - currentValue)
          if (dist < closestDist) {
            closestDist = dist
            matchedTier = tier
          }
        }
      }
    }
  }
  const isExactMatch = matchedTier != null && lookup(def.table, level, matchedTier) === currentValue

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: '6px var(--space-3)',
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
    }}>
      {/* Label */}
      <span style={{
        minWidth: 100,
        fontWeight: 500,
        fontSize: 'var(--font-size-sm)',
      }}>
        {def.label}
      </span>

      {/* Tier buttons */}
      <div style={{ display: 'flex', gap: 2, flex: 1 }}>
        {def.tiers.map((tier) => {
          const tierVal = lookup(def.table, level, tier)
          const isClosest = tier === matchedTier
          const isExact = isClosest && isExactMatch
          return (
            <button
              key={tier}
              onClick={() => {
                onTierChange(tier)
                if (tierVal != null) onValueChange(tierVal)
              }}
              title={tierVal != null ? String(tierVal) : '—'}
              style={{
                flex: 1,
                padding: '3px 4px',
                fontSize: 'var(--font-size-xs)',
                fontWeight: isClosest ? 700 : 400,
                background: isExact ? tierColor(tier, config) : isClosest ? tierColor(tier, config) + '40' : 'transparent',
                color: isExact ? '#fff' : isClosest ? tierColor(tier, config) : 'var(--color-text-muted)',
                border: isExact ? 'none' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
            >
              {tierShort(tier, config)}
            </button>
          )
        })}
      </div>

      {/* Editable value */}
      <input
        type="number"
        value={currentValue ?? ''}
        onChange={(e) => onValueChange(Number(e.target.value))}
        style={{
          width: 60,
          textAlign: 'right',
          fontWeight: 700,
          fontSize: 'var(--font-size-base)',
          fontFamily: 'monospace',
          color: matchedTier ? (isExactMatch ? tierColor(matchedTier, config) : tierColor(matchedTier, config) + 'aa') : 'var(--color-text-primary)',
          border: 'none',
          background: 'transparent',
        }}
      />
    </div>
  )
}
