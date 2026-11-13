import type { Item, CreatureBuilderConfig } from '@common/types'
import { PowerEntryEditor, emptyPower } from '../creature/PowerEntryEditor'
import type { PowerEntry } from '../creature/PowerEntryEditor'
import { Annotation } from '../creature/annotations'
import { TagInput } from '@renderer/components/shared/TagInput'
import { useGlossary } from '../compendium/use-glossary'
import '../creature/statblock.css'

// Item power config — reuses creature PowerEntryEditor with item-appropriate values
const ITEM_POWER_CONFIG: CreatureBuilderConfig = {
  minLevel: 1,
  maxLevel: 30,
  statDefs: [],
  actionTypes: [
    { value: 'standard', label: 'Standard Action', icon: 'Std' },
    { value: 'move', label: 'Move Action', icon: 'Mov' },
    { value: 'minor', label: 'Minor Action', icon: 'Min' },
    { value: 'free', label: 'Free Action', icon: 'Free' },
    { value: 'immediate-interrupt', label: 'Immediate Interrupt', icon: 'Int' },
    { value: 'immediate-reaction', label: 'Immediate Reaction', icon: 'Rcn' },
    { value: 'no-action', label: 'No Action', icon: '—' },
  ],
  usageTypes: [
    { value: 'at-will', label: 'At-Will' },
    { value: 'encounter', label: 'Encounter' },
    { value: 'daily', label: 'Daily' },
    { value: 'consumable', label: 'Consumable' },
  ],
  rangeTypes: [
    { value: 'melee', label: 'Melee' },
    { value: 'ranged', label: 'Ranged' },
    { value: 'close-burst', label: 'Close burst' },
    { value: 'close-blast', label: 'Close blast' },
    { value: 'area-burst', label: 'Area burst' },
    { value: 'personal', label: 'Personal' },
  ],
  targetDefenses: ['AC', 'Fortitude', 'Reflex', 'Will'],
  triggeredActionTypes: ['immediate-interrupt', 'immediate-reaction'],
  tierDisplay: {
    'at-will': { color: '#4a7a5a', label: 'At-Will' },
    'encounter': { color: '#7a4a4a', label: 'Encounter' },
    'daily': { color: '#5a5a7a', label: 'Daily' },
    'consumable': { color: '#6a6a72', label: 'Consumable' },
  },
  damageTypes: ['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'],
  creatureTraits: [],
  attackTraits: [],
  speedTypes: [],
  useGroupedActions: true,
}

const CATEGORIES = [
  { value: 'item', label: 'Item' },
  { value: 'weapon', label: 'Weapon' },
  { value: 'armor', label: 'Armor' },
  { value: 'implement', label: 'Implement' },
  { value: 'ritual', label: 'Ritual' },
  { value: 'set', label: 'Item Set' },
]

const RARITIES = ['Common', 'Uncommon', 'Rare']

const WEAPON_GROUPS = [
  'Axe', 'Blowgun', 'Bow', 'Crossbow', 'Flail', 'Garrote', 'Hammer',
  'Heavy blade', 'Light blade', 'Mace', 'Pick', 'Polearm', 'Sling',
  'Spear', 'Staff', 'Unarmed', 'Whip',
]
const IMPLEMENT_GROUPS = [
  'Ki focus', 'Orb', 'Rod', 'Staff', 'Symbol', 'Tome', 'Totem', 'Wand',
]

const CRIT_DICE = ['1d6', '1d8', '1d10', '1d12']
const DAMAGE_TYPES = ['', 'acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder']

// Standard magic item prices by level (DMG p.223)
const PRICE_BY_LEVEL: Record<number, string> = {
  1:'360',2:'520',3:'680',4:'840',5:'1,000',
  6:'1,800',7:'2,600',8:'3,400',9:'4,200',10:'5,000',
  11:'9,000',12:'13,000',13:'17,000',14:'21,000',15:'25,000',
  16:'45,000',17:'65,000',18:'85,000',19:'105,000',20:'125,000',
  21:'225,000',22:'325,000',23:'425,000',24:'525,000',25:'625,000',
  26:'1,125,000',27:'1,625,000',28:'2,125,000',29:'2,625,000',30:'3,125,000',
}

const ITEM_TYPES_BY_CATEGORY: Record<string, string[]> = {
  weapon: [
    'Any', 'Any melee', 'Any ranged', 'Any one-handed melee', 'Any thrown',
    'Axe', 'Bow', 'Crossbow', 'Dagger', 'Flail', 'Hammer', 'Heavy blade',
    'Light blade', 'Longsword', 'Mace', 'Pick', 'Polearm', 'Scimitar', 'Spear',
    'Greatsword', 'Scourge', 'Whip', 'Morningstar', 'Sling',
    'Arrow or bolt', 'Bow or crossbow', 'Dragonshard augment',
  ],
  armor: [
    'Any', 'Cloth', 'Leather', 'Hide', 'Chain', 'Scale', 'Plate',
    'Cloth or leather', 'Leather or hide', 'Hide or chain', 'Chain or scale',
    'Scale or plate', 'Cloth, leather or hide', 'Chain, scale or plate',
    'Light shield', 'Heavy shield', 'Any shield',
  ],
  implement: ['Holy symbol', 'Ki focus', 'Orb', 'Rod', 'Staff', 'Tome', 'Totem', 'Wand'],
}

const SLOTS_BY_CATEGORY: Record<string, string[]> = {
  item: [
    'Head', 'Neck', 'Arms', 'Hands', 'Waist', 'Feet', 'Ring', 'Body', 'Familiar', 'Head and Neck',
    'Wondrous Item', 'Consumable', 'Ammunition', 'Mount', 'Companion', 'Artifact',
    'Alchemical Item', 'Gear', 'Musical Instrument', 'Building', 'Transportation', 'Lodging', 'Food', 'Drink', 'Service', 'Component',
    'Grandmaster Training', 'Legendary Boon', 'Divine Boon', 'Fey Magic Gift', 'Glory Boon',
    'Primal Blessing', "Sorcerer-King's Boon", 'Psionic Talent', 'Elemental Gift',
    'Lost Rune', 'Secret of the Way', "Wanderer's Secret", 'Echo of Power', 'Battle Scars',
    'Veiled Alliance Mystery', 'Templar Brand',
  ],
  weapon: ['Weapon', 'Ammunition', 'Artifact'],
  armor: ['Armor', 'Arms', 'Artifact'],
  implement: ['Implement', 'Artifact'],
  ritual: [
    'Exploration', 'Warding', 'Divination', 'Creation', 'Travel',
    'Deception', 'Binding', 'Restoration', 'Scrying', 'Martial Practice',
    'Volatile', 'Oil', 'Poison', 'Curative', 'Other', 'Teleportation',
  ],
  set: ['Item Set'],
}

interface Props {
  item: Item
  onSave: (updated: Item) => void
}

export function Dnd4eItemEditor({ item, onSave }: Props) {
  const ex = (item.extra ?? {}) as Record<string, unknown>

  const str = (key: string): string => (ex[key] as string) ?? ''
  const num = (key: string): number => (ex[key] as number) ?? 0
  const arr = (key: string): string[] => Array.isArray(ex[key]) ? ex[key] as string[] : []
  const powers = (): PowerEntry[] => Array.isArray(ex.powers) ? ex.powers as PowerEntry[] : []

  const { namesForCategory } = useGlossary()
  const propertySuggestions = namesForCategory('weapon_property')

  interface SetBenefit { count: string; text: string }
  const setItemIds = (): string[] => Array.isArray(ex.setItemIds) ? ex.setItemIds as string[] : []
  const setBenefits = (): SetBenefit[] => Array.isArray(ex.setBenefits) ? ex.setBenefits as SetBenefit[] : []

  // Critical: die + type → "+1d6 fire damage per plus", plus optional extra text
  const critDie = str('critDie')
  const critType = str('critType')
  const critExtra = str('critExtra')

  const category = str('category') || 'item'
  const isWeapon = category === 'weapon'
  const isImplement = category === 'implement'
  const isArmor = category === 'armor'
  const isRitual = category === 'ritual'
  const isSet = category === 'set'
  const hasAlchemical = !!str('alchemicalType')
  const hasEnhancement = isWeapon || isImplement || isArmor || category === 'item'
  const hasCritical = isWeapon || isImplement
  const hasWeaponStats = isWeapon
  const hasGroups = isWeapon || isImplement

  /** Save a change to item.extra */
  const u = (key: string, val: unknown) => {
    onSave({ ...item, extra: { ...ex, [key]: val } })
  }

  /** Save name (goes into item.name AND extra.name) */
  const setName = (name: string) => {
    onSave({ ...item, name, extra: { ...ex, name } })
  }


  /** Update a property string */
  const updateProperty = (idx: number, val: string) => {
    const p = [...arr('properties')]
    p[idx] = val
    u('properties', p)
  }

  const removeProperty = (idx: number) => {
    const p = [...arr('properties')]
    p.splice(idx, 1)
    u('properties', p)
  }

  const addProperty = () => {
    u('properties', [...arr('properties'), ''])
  }


  return (
    <div className="stat-block-4e" style={{ fontSize: 12, lineHeight: 1.5 }}>

      {/* ── HEADER: Name + Level + Rarity ── */}
      <div className="sb-header">
        <input className="ghost sb-name" value={item.name}
          onChange={e => setName(e.target.value)}
          placeholder="Flaming Sword" style={{ color: 'inherit', flex: 1 }} />
        <span style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 2 }}>
          Level
          <input className="ghost" type="number" value={num('level') || ''}
            onChange={e => u('level', e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={e => { if (e.target.value === '') u('level', 0) }}
            style={{ color: 'inherit', fontWeight: 600 }} />
          <select className="ghost" value={str('rarity') || 'Common'}
            onChange={e => u('rarity', e.target.value)}
            style={{ color: 'inherit', background: 'transparent', fontSize: 'inherit' }}>
            {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </span>
        <Annotation anchor={{ kind: 'stat', key: 'item-header' }} />
      </div>

      {/* ── SUBHEADER: Category + Slot + ItemType + Price ── */}
      <div className="sb-subheader">
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <select className="ghost" value={category}
            onChange={e => u('category', e.target.value)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select className="ghost" value={str('slot')}
            onChange={e => u('slot', e.target.value)}
            style={{ color: 'inherit', fontStyle: 'inherit', background: 'transparent' }}>
            <option value="">—</option>
            {(SLOTS_BY_CATEGORY[category] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {str('itemType') || isWeapon || isArmor || isImplement ? (
            <>
              :{' '}
              <input className="ghost" value={str('itemType')}
                onChange={e => u('itemType', e.target.value)}
                list={`itemtype-${category}`}
                placeholder="Any melee" style={{ color: 'inherit', fontStyle: 'inherit' }} />
              {ITEM_TYPES_BY_CATEGORY[category] && (
                <datalist id={`itemtype-${category}`}>
                  {ITEM_TYPES_BY_CATEGORY[category].map(t => <option key={t} value={t} />)}
                </datalist>
              )}
            </>
          ) : null}
        </span>
        <input className="ghost" value={str('price')}
          onChange={e => u('price', e.target.value)}
          placeholder={PRICE_BY_LEVEL[num('level')] ?? '680'} style={{ color: 'inherit', fontStyle: 'inherit', textAlign: 'right', fieldSizing: 'content' as any, minWidth: '3ch', marginLeft: 'auto' }} /><span style={{ marginLeft: '0.25em' }}>gp</span>
        <Annotation anchor={{ kind: 'stat', key: 'item-type' }} />
      </div>

      {/* ── Flavor ── */}
      <div style={{ padding: '4px 8px' }}>
        <textarea className="ghost" value={str('flavor')}
          onChange={e => u('flavor', e.target.value)}
          placeholder="This blade crackles with elemental fire."
          style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: 11, width: '100%', resize: 'none', fieldSizing: 'content' as any }} />
        <Annotation anchor={{ kind: 'stat', key: 'item-text' }} />
      </div>

      {/* ── Set items + benefits ── */}
      {isSet && (
        <div className="sb-section">
          <div className="sb-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
            <b className="sb-label">Set Items</b>
            {setItemIds().map((itemId, i) => {
              // Look up the item from campaign items passed via props
              const found = (item as any)._campaignItems?.find((ci: any) => ci.id === itemId)
              const label = found ? `${found.name} (L${found.extra?.level ?? '?'})` : itemId
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                  <span style={{ flex: 1 }}>{label}</span>
                  <button onClick={() => { const s = [...setItemIds()]; s.splice(i, 1); u('setItemIds', s) }}
                    style={{ color: 'var(--color-text-muted)', padding: '0 3px', lineHeight: 1, cursor: 'pointer' }}>×</button>
                </div>
              )
            })}
            <datalist id="dl-setitems">
              {((item as any)._campaignItems ?? [])
                .filter((ci: any) => !setItemIds().includes(ci.id) && ci.id !== item.id)
                .map((ci: any) => <option key={ci.id} value={ci.name} />)}
            </datalist>
            <input className="ghost" list="dl-setitems" placeholder="+ Add item..."
              style={{ fontSize: 'var(--font-size-xs)' }}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                const input = e.target as HTMLInputElement
                const name = input.value.trim()
                if (!name) return
                const match = ((item as any)._campaignItems ?? []).find((ci: any) => ci.name === name)
                if (match && !setItemIds().includes(match.id)) {
                  u('setItemIds', [...setItemIds(), match.id])
                  input.value = ''
                }
              }} />
          </div>

          <div className="sb-row sb-section" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
            <b className="sb-label">Set Benefits</b>
            {setBenefits().map((sb, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                <select className="ghost" value={sb.count}
                  onChange={e => { const s = [...setBenefits()]; s[i] = { ...s[i], count: e.target.value }; u('setBenefits', s) }}
                  style={{ width: 28, textAlign: 'center' }}>
                  {['2', '3', '4', '5', '6'].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <input className="ghost" value={sb.text}
                  onChange={e => { const s = [...setBenefits()]; s[i] = { ...s[i], text: e.target.value }; u('setBenefits', s) }}
                  placeholder="You gain a +2 bonus to Perception checks." style={{ flex: 1 }} />
                <button onClick={() => { const s = [...setBenefits()]; s.splice(i, 1); u('setBenefits', s) }}
                  style={{ color: 'var(--color-text-muted)', padding: '0 3px', lineHeight: 1, cursor: 'pointer' }}>×</button>
              </div>
            ))}
            <button onClick={() => u('setBenefits', [...setBenefits(), { count: '', text: '' }])}
              style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              + Benefit
            </button>
          </div>
        </div>
      )}

      {/* ── Weapon stats (when category is weapon) ── */}
      {hasWeaponStats && (
        <div className="sb-section">
          <Annotation anchor={{ kind: 'stat', key: 'item-stats' }} />
          <datalist id="dl-damage">{['1d4', '1d6', '1d8', '1d10', '1d12', '2d4', '2d6'].map(d => <option key={d} value={d} />)}</datalist>
          <datalist id="dl-range">{['5/10', '6/12', '10/20', '15/30', '20/40', '25/50'].map(r => <option key={r} value={r} />)}</datalist>
          <div className="sb-row">
            <span>
              <b className="sb-label">Damage</b>{' '}
              <input className="ghost" value={str('damage')}
                onChange={e => u('damage', e.target.value)} list="dl-damage" placeholder="1d8" />
              ; <b className="sb-label">Proficient</b>{' '}
              <select className="ghost" value={str('proficiency')} onChange={e => u('proficiency', e.target.value)}>
                <option value="">—</option>
                {['+2', '+3'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              ; <b className="sb-label">Range</b>{' '}
              <input className="ghost" value={str('range')}
                onChange={e => u('range', e.target.value)} list="dl-range" placeholder="5/10" />
              ; <b className="sb-label">Weight</b>{' '}
              <input className="ghost" value={str('weight')}
                onChange={e => u('weight', e.target.value)} placeholder="4 lb." />
            </span>
          </div>
        </div>
      )}

      {/* ── Groups (weapon + implement) ── */}
      {hasGroups && (
        <div className={hasWeaponStats ? 'sb-row' : 'sb-row sb-section'}>
          <b className="sb-label">Group</b>{' '}
          <span>{arr('groups').map((g, i) => (
            <span key={g}>{i > 0 && ', '}{g}
              <button onClick={() => u('groups', arr('groups').filter((_, j) => j !== i))}
                style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1, cursor: 'pointer', fontSize: '0.8em' }}>×</button>
            </span>
          ))}</span>
          <select className="ghost" value=""
            onChange={e => { if (e.target.value) u('groups', [...arr('groups'), e.target.value]); }}
            style={{ fontSize: 'var(--font-size-xs)' }}>
            <option value="">+ group</option>
            {(isWeapon ? WEAPON_GROUPS : IMPLEMENT_GROUPS)
              .filter(g => !arr('groups').includes(g))
              .map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      )}

      {/* ── Ritual stats ── */}
      {isRitual && (
        <div className="sb-section">
          <Annotation anchor={{ kind: 'stat', key: 'item-stats' }} />
          <datalist id="dl-keyskill">
            {['Arcana', 'Nature', 'Religion', 'Heal', 'Diplomacy', 'Dungeoneering', 'Thievery',
              'Arcana (no check)', 'Nature (no check)', 'Religion (no check)',
              'Arcana or Religion', 'Arcana or Nature', 'Arcana or Thievery',
              'Arcana, Nature, or Religion'].map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="dl-casttime">
            {['1 minute', '5 minutes', '10 minutes', '15 minutes', '30 minutes', '1 hour', '4 hours', '8 hours'].map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="dl-duration">
            {['Instantaneous', 'Special', 'Permanent', '1 round', '5 minutes', '10 minutes', '1 hour', '8 hours', '24 hours',
              'Until discharged', 'Until end of encounter', 'Sustained'].map(s => <option key={s} value={s} />)}
          </datalist>
          <div className="sb-row">
            <span>
              <b className="sb-label">Component Cost</b>{' '}
              <input className="ghost" value={str('componentCost')}
                onChange={e => u('componentCost', e.target.value)} placeholder="50 gp" />
              ; <b className="sb-label">Key Skill</b>{' '}
              <input className="ghost" value={str('keySkill')}
                onChange={e => u('keySkill', e.target.value)} list="dl-keyskill" placeholder="Arcana" />
            </span>
          </div>
          <div className="sb-row">
            <span>
              <b className="sb-label">Time</b>{' '}
              <input className="ghost" value={str('castTime')}
                onChange={e => u('castTime', e.target.value)} list="dl-casttime" placeholder="1 hour" />
              ; <b className="sb-label">Duration</b>{' '}
              <input className="ghost" value={str('duration')}
                onChange={e => u('duration', e.target.value)} list="dl-duration" placeholder="Special" />
            </span>
          </div>
        </div>
      )}

      {/* ── Alchemical stats ── */}
      {hasAlchemical && (
        <div className="sb-section">
          <Annotation anchor={{ kind: 'stat', key: 'item-stats' }} />
          <div className="sb-row">
            <span>
              <b className="sb-label">Alchemical Item</b>{' '}
              <select className="ghost" value={str('alchemicalType')}
                onChange={e => u('alchemicalType', e.target.value)}>
                {['Volatile', 'Oil', 'Poison', 'Curative', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              ; <b className="sb-label">Formula Cost</b>{' '}
              <input className="ghost" value={str('formulaCost')}
                onChange={e => u('formulaCost', e.target.value)} placeholder="70" />{' '}gp
            </span>
          </div>
        </div>
      )}
      {/* Show add-alchemical button when not already alchemical and not ritual */}
      {!hasAlchemical && category === 'item' && (
        <div className="sb-row sb-section">
          <button onClick={() => u('alchemicalType', 'Volatile')}
            style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            + Alchemical
          </button>
        </div>
      )}

      {/* ── Enhancement + Critical ── */}
      {(hasEnhancement || hasCritical) && (
        <div className="sb-section">
          <Annotation anchor={{ kind: 'stat', key: 'item-critical' }} />
          {hasEnhancement && (
            <div className="sb-row">
              <b className="sb-label">Enhancement</b>{' '}
              {num('level') > 0 && <span>+{Math.ceil(num('level') / 5)}</span>}
              {' '}
              <select className="ghost" value={str('enhancement')} onChange={e => u('enhancement', e.target.value)}>
                <option value="">—</option>
                <option value="attack rolls and damage rolls">attack rolls and damage rolls</option>
                <option value="AC">AC</option>
                <option value="Fortitude, Reflex, and Will">Fortitude, Reflex, and Will</option>
              </select>
            </div>
          )}
          {hasCritical && (
            <div className="sb-row">
              <b className="sb-label">Critical</b>{' '}
              <span>
                +
                <select className="ghost" value={critDie} onChange={e => u('critDie', e.target.value)}>
                  <option value="">—</option>
                  {CRIT_DICE.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {critDie && <>{' '}
                  <select className="ghost" value={critType} onChange={e => u('critType', e.target.value)}>
                    <option value="">damage</option>
                    {DAMAGE_TYPES.filter(Boolean).map(t => <option key={t} value={t}>{t} damage</option>)}
                  </select>{' '}per plus
                </>}
              </span>
              <input className="ghost" value={critExtra}
                onChange={e => u('critExtra', e.target.value)}
                placeholder="and the target is knocked prone" style={{ flex: 1 }} />
            </div>
          )}
        </div>
      )}

      {/* ── Properties ── */}
      <div className="sb-section">
        <datalist id="property-suggestions">
          {propertySuggestions.map(s => <option key={s} value={s} />)}
        </datalist>
        <div className="sb-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
          <b className="sb-label">Properties</b>
          <Annotation anchor={{ kind: 'stat', key: 'item-properties' }} />
          {arr('properties').map((prop, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
              <input className="ghost" value={prop}
                onChange={e => updateProperty(i, e.target.value)}
                list="property-suggestions"
                placeholder="High Crit" style={{ flex: 1 }} />
              <button onClick={() => removeProperty(i)}
                style={{ color: 'var(--color-text-muted)', padding: '0 3px', lineHeight: 1, cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <button onClick={addProperty}
            style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            + Property
          </button>
        </div>
      </div>

      {/* ── Special / Requirement (hidden when empty) ── */}
      {(str('special') || str('requirement')) && (
        <div className="sb-section">
          <Annotation anchor={{ kind: 'stat', key: 'item-special' }} />
          {str('special') !== '' && (
            <div className="sb-row" style={{ alignItems: 'flex-start' }}>
              <b className="sb-label">Special</b>{' '}
              <textarea className="ghost" value={str('special')}
                onChange={e => u('special', e.target.value)}
                placeholder="Cannot be used with Belt of Fiends."
                style={{ flex: 1, resize: 'none', fieldSizing: 'content' as any }} />
              <button onClick={() => u('special', '')}
                style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1, cursor: 'pointer' }}>×</button>
            </div>
          )}
          {str('requirement') !== '' && (
            <div className="sb-row" style={{ alignItems: 'flex-start' }}>
              <b className="sb-label">Requirement</b>{' '}
              <textarea className="ghost" value={str('requirement')}
                onChange={e => u('requirement', e.target.value)}
                placeholder="Must have the living construct racial trait."
                style={{ flex: 1, resize: 'none', fieldSizing: 'content' as any }} />
              <button onClick={() => u('requirement', '')}
                style={{ color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1, cursor: 'pointer' }}>×</button>
            </div>
          )}
        </div>
      )}
      <div className="sb-row" style={{ display: 'flex', gap: 4 }}>
        {!str('special') && <button onClick={() => u('special', ' ')}
          style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 4px', background: 'transparent' }}>+ special</button>}
        {!str('requirement') && <button onClick={() => u('requirement', ' ')}
          style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0 4px', background: 'transparent' }}>+ requirement</button>}
      </div>

      {/* ── Powers ── */}
      <PowerEntryEditor
        entries={powers()}
        onChange={(entries) => u('powers', entries)}
        config={ITEM_POWER_CONFIG}
        level={num('level') || 1}
      />

      {/* ── Source ── */}
      <div style={{ padding: '2px 8px', fontSize: 10 }}>
        <input className="ghost" value={str('source')}
          onChange={e => u('source', e.target.value)}
          placeholder="Player's Handbook, page(s) 235"
          style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', width: '100%' }} />
      </div>
    </div>
  )
}
