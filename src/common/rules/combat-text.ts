// Combat hints read from printed text. Shared by the content parser (which stores them on legacy
// stat blocks) and combat, which derives them from kit content.

export type TriggerEvent = 'bloodied' | 'reduced-to-0' | 'takes-damage'
export type TriggerSubject = 'self' | 'ally' | 'any-creature'
export interface TriggerHints { triggerEvents?: TriggerEvent[]; triggerSubject?: TriggerSubject; selfTurnOnly?: true }

/** What a power's trigger reacts to: HP events (for automatic prompts) and whether it only fires on its own turn. */
export function triggerHints(text: string): TriggerHints {
  const trigger = text.toLowerCase().replace(/\.$/, '').trim()
  const hints: TriggerHints = {}
  if (!trigger) return hints
  const events: TriggerEvent[] = []
  if (/\bbloodied\b/.test(trigger)) events.push('bloodied')
  if (/\breduced to 0\b|\bdrops to 0\b|\bhit points or fewer\b/.test(trigger)) events.push('reduced-to-0')
  if (/\btakes damage\b/.test(trigger)) events.push('takes-damage')
  if (events.length > 0) {
    hints.triggerEvents = events
    hints.triggerSubject = /\ban ally\b|\ballied\b|\badjacent ally\b/.test(trigger) ? 'ally'
      : /\ba creature\b|\ban enemy\b|\ban undead\b|\ba [\w]+ creature\b/.test(trigger) ? 'any-creature' : 'self'
  }
  // Triggers on the creature's own attacks or movement are not off-turn reactions.
  if (/\b(hits with|misses with|makes an attack|attacks with|scores a critical|makes a melee|makes a ranged)\b/.test(trigger)
    && !/\benemy\b|\ban ally\b|\ba creature\b/.test(trigger)) hints.selfTurnOnly = true
  if (/\b(shifts|moves|charges|teleports)\b/.test(trigger)
    && !/\benemy\b|\ban ally\b|\ba creature\b|\bmarked\b/.test(trigger)) hints.selfTurnOnly = true
  return hints
}

export interface Revival { hp: number; abilityName: string }

/** A revival ability (Troll Healing, Rise Again): "when reduced to 0 hit points ... rises with N hit points". */
export function findRevival(entries: { name: string; text: string }[]): Revival | undefined {
  for (const { name, text } of entries) {
    if (!/reduc(?:ed|es)\b.{0,30}\bto 0|drops?\b.{0,30}\bto 0/i.test(text)) continue
    const hp = text.match(/(?:regains?|with|returns.*?with|has)\s+(\d+)\s+hit points?/i)
    if (hp && /(?:rises|regains|returns|revives|next turn)/i.test(text)) return { hp: parseInt(hp[1]), abilityName: name }
  }
  return undefined
}
