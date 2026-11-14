/**
 * D&D 4e class mark registry.
 *
 * "Class marks" are mark-like abilities each class gets that designate a single
 * target for special treatment (Hunter's Quarry, Warlock's Curse, etc.). They
 * are mechanically distinct from the generic Marked condition (no -2 attack
 * penalty; instead, things like extra damage on a strike or roll-twice).
 *
 * This is the single source of truth for the set of class marks the app
 * supports — the plugin's condition list, the renderer styling map, and the
 * PC mark-type dropdown all derive from this array.
 */

export interface ClassMark {
  /** Short id used in the PC's `markType` field. */
  id: string
  /** Full condition id used by the engine. Set ONLY for striker designations
   *  (Quarry/Curse/Oath) which have their own dedicated conditions. Defender
   *  marks leave this undefined — they apply the real `marked` condition. */
  conditionId?: string
  /** Long name shown in dropdowns and tooltips. */
  name: string
  /** Short verb form used as the condition pill label, e.g. "Quarried". */
  shortName: string
  /** Display icon: a Lucide icon name (kebab case), drawn with <Glyph>. */
  icon: string
  /** Default pill background color, used when the source PC has no chip color set. */
  color: string
  /** Tooltip description. */
  description: string
  /** True for defender features (Combat Challenge, Divine Challenge, Aegis,
   *  Nature's Wrath, Mind Spike). They apply the rules-defined `marked`
   *  condition with a customName override, so the engine's existing
   *  replace-by-id semantics enforce "one mark per target". False for striker
   *  designations which use their own dedicated condition id. */
  appliesMarkedCondition: boolean
  /** Default duration when applied. Defender marks default to 'eont' (standard
   *  Marked behavior); striker designations and Aegis last 'encounter'. */
  defaultDuration: 'eont' | 'encounter'
}

export const CLASS_MARKS: ClassMark[] = [
  // ─── Defender marks — apply the real `marked` condition ───
  {
    id: 'combat-challenge',
    name: 'Combat Challenge',
    shortName: 'Challenged',
    icon: 'swords',
    color: '#a08060',
    description: "Fighter: marked enemy provokes an opportunity attack if it shifts away or attacks others.",
    appliesMarkedCondition: true,
    defaultDuration: 'eont',
  },
  {
    id: 'divine-challenge',
    name: 'Divine Challenge',
    shortName: 'Challenged',
    icon: 'sun',
    color: '#c4a563',
    description: 'Paladin: marked enemy takes radiant damage if it ignores the paladin. Lasts until the paladin marks another target or fails to engage.',
    appliesMarkedCondition: true,
    defaultDuration: 'encounter',
  },
  {
    id: 'aegis-of-assault',
    name: 'Aegis (Swordmage)',
    shortName: 'Aegis',
    icon: 'shield',
    color: '#7095b3',
    description: "Swordmage: marked enemy is teleported / takes damage when attacking allies. Lasts the encounter.",
    appliesMarkedCondition: true,
    defaultDuration: 'encounter',
  },
  {
    id: 'natures-wrath',
    name: "Nature's Wrath",
    shortName: 'Marked',
    icon: 'leaf',
    color: '#6e9663',
    description: "Warden: marks adjacent enemies who provoked the warden.",
    appliesMarkedCondition: true,
    defaultDuration: 'eont',
  },
  {
    id: 'battlemind-demand',
    name: "Battlemind's Demand",
    shortName: 'Demanded',
    icon: 'brain-cog',
    color: '#9b76a8',
    description: "Battlemind: marks an enemy until the battlemind marks another target or the encounter ends. The Battlemind's Mind Spike feature lets them retaliate when the marked enemy attacks an ally.",
    appliesMarkedCondition: true,
    defaultDuration: 'encounter',
  },

  // ─── Striker designations — separate dedicated conditions ───
  {
    id: 'hunter-quarry',
    conditionId: 'mark-hunter-quarry',
    name: "Hunter's Quarry",
    shortName: 'Quarried',
    icon: 'crosshair',
    color: '#7da37a',
    description: 'Ranger: deals extra damage to a designated quarry once per round. Lasts the encounter.',
    appliesMarkedCondition: false,
    defaultDuration: 'encounter',
  },
  {
    id: 'warlock-curse',
    conditionId: 'mark-warlock-curse',
    name: "Warlock's Curse",
    shortName: 'Cursed',
    icon: 'eye',
    color: '#7d6d9f',
    description: 'Warlock: deals extra damage to a cursed enemy once per round. Lasts the encounter.',
    appliesMarkedCondition: false,
    defaultDuration: 'encounter',
  },
  {
    id: 'oath-of-enmity',
    name: 'Oath of Enmity',
    conditionId: 'mark-oath-of-enmity',
    shortName: 'Oathbound',
    icon: 'scale',
    color: '#b4a576',
    description: 'Avenger: rolls twice for melee attack rolls against the sworn enemy. Lasts the encounter.',
    appliesMarkedCondition: false,
    defaultDuration: 'encounter',
  },
  {
    id: 'assassins-shroud',
    conditionId: 'mark-assassins-shroud',
    name: "Assassin's Shroud",
    shortName: 'Shrouded',
    icon: 'moon',
    color: '#5a5566',
    description: "Assassin: invisible shrouds settle on the target (stacks up to 4); when invoked, an attack deals +1d6 per shroud. Lasts the encounter.",
    appliesMarkedCondition: false,
    defaultDuration: 'encounter',
  },
]

export const CLASS_MARK_BY_ID: Record<string, ClassMark> = Object.fromEntries(
  CLASS_MARKS.map(m => [m.id, m])
)
/** Lookup by condition id — only includes striker marks since defender marks
 *  share the underlying `marked` conditionId and are looked up by sourceId. */
export const CLASS_MARK_BY_CONDITION_ID: Record<string, ClassMark> = Object.fromEntries(
  CLASS_MARKS.filter(m => m.conditionId).map(m => [m.conditionId!, m])
)
