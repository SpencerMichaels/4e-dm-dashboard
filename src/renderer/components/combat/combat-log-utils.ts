import type { CombatEvent } from '@common/types'

/** Render a combat event as a human-readable text string */
export function renderEvent(e: CombatEvent): string {
  const d = e.data as any
  switch (e.type) {
    case 'damage':
      return `${e.targetName} took ${d.amount} damage`
    case 'heal':
      return `${e.targetName} healed ${d.amount} HP`
    case 'condition-applied':
      return `${e.targetName}: +${d.conditionName}${d.value != null ? ' ' + d.value : ''}${e.sourceName ? ' by ' + e.sourceName : ''}${d.duration ? ' (' + d.duration + ')' : ''}`
    case 'condition-removed':
      return `${e.targetName}: −${d.conditionName}`
    case 'save-success':
      return `${e.targetName} saved vs ${d.conditionName}${d.roll != null ? ` (rolled ${d.roll}${d.bonus ? ' + ' + d.bonus : ''} vs DC ${d.dc})` : ''}`
    case 'save-fail':
      return `${e.targetName} failed save vs ${d.conditionName}${d.roll != null ? ` (rolled ${d.roll}${d.bonus ? ' + ' + d.bonus : ''} vs DC ${d.dc})` : ''}`
    case 'recharge-success':
      return `${e.targetName}: ${d.powerName} recharged!${d.roll != null ? ` (rolled ${d.roll} vs ${d.threshold}+)` : ''}`
    case 'recharge-fail':
      return `${e.targetName}: ${d.powerName} failed to recharge${d.roll != null ? ` (rolled ${d.roll} vs ${d.threshold}+)` : ''}`
    case 'bloodied':
      return `${e.targetName} is Bloodied!`
    case 'death':
      return `${e.targetName} is defeated!`
    case 'turn-start':
      return `— ${e.targetName}'s turn —`
    case 'turn-end':
      return `— End of ${e.targetName}'s turn —`
    case 'attack-hit':
      return `${e.sourceName ?? '?'} hit ${e.targetName}${d.defense ? ' (vs ' + d.defense + ')' : ''}`
    case 'attack-miss':
      return `${e.sourceName ?? '?'} missed ${e.targetName}${d.defense ? ' (vs ' + d.defense + ')' : ''}`
    case 'trap-triggered':
      return `${e.targetName} is triggered!`
    case 'trap-disabled':
      return `${e.targetName} is ${d.how ?? 'disabled'}${d.by ? ` (${d.by})` : ''}`
    case 'trap-delayed':
      return `${e.targetName} is delayed${d.by ? ` (${d.by})` : ''}`
    case 'countermeasure-check':
      return `${e.targetName}: ${d.by ?? 'check'} ${d.outcome === 'success' ? 'succeeded' : 'failed'}${d.count ? ` (${d.count})` : ''}`
    default:
      return `${e.targetName}: ${e.type}`
  }
}

/** Classify event for visual styling */
export function eventColor(type: CombatEvent['type']): string {
  switch (type) {
    case 'damage': case 'death': return 'var(--damage)'
    case 'heal': return 'var(--heal)'
    case 'condition-applied': return 'var(--warning)'
    case 'condition-removed': case 'save-success': case 'recharge-success': return 'var(--success)'
    case 'save-fail': case 'recharge-fail': return 'var(--notify)'
    case 'bloodied': return 'var(--damage)'
    case 'attack-hit': return 'var(--success)'
    case 'attack-miss': return 'var(--notify)'
    case 'trap-triggered': return 'var(--warning)'
    case 'trap-disabled': return 'var(--success)'
    case 'trap-delayed': return 'var(--notify)'
    case 'countermeasure-check': return ''
    case 'turn-start': case 'turn-end': return ''
    default: return ''
  }
}
