// A kit Item as its printed statblock (the item viewer) or, with onChange, the item editor.
// The editor works on its own model; edits are applied to the kit item field by field, so kit-only
// data the editor does not show (description parts, armor, property scaling, clauses) is kept.

import { useState } from 'react'
import type { Item, Power } from '@kit'
import { powerToLegacy } from '@common/authoring/legacy'
import { itemFromEditor, itemToEditor } from '@common/authoring/item-editor-adapter'
import { Dnd4eItemViewer } from '../compendium/Dnd4eItemViewer'
import { Dnd4eItemEditor } from '../campaign/Dnd4eItemEditor'
import { PowerCardView, type PowerCardEntry } from '../creature/PowerCardView'
import { Annotation } from '../creature/annotations'

export function ItemStatblock({ item, onChange }: { item: Item; onChange?: (next: Item) => void }) {
  return onChange ? <ItemEditor item={item} onChange={onChange} /> : <ItemView item={item} />
}

function ItemEditor({ item, onChange }: { item: Item; onChange: (next: Item) => void }) {
  // The editor model stays local: re-deriving it from the kit item on every keystroke would trim
  // what is being typed. Each change is applied to the item as it was when editing started.
  const [base] = useState(item)
  const [baseView] = useState(() => itemToEditor(item))
  const [view, setView] = useState(baseView)
  return <Dnd4eItemEditor item={view} onSave={next => { setView(next); onChange(itemFromEditor(base, baseView, next)) }} />
}

function ItemView({ item: c }: { item: Item }) {
  const source = c.sources.map(s => `${s.book}${s.page ? ', ' + s.page : ''}`).join('; ')
  // In the Workshop, powers carry their draft node IDs (`_draftNode`) so comment markers anchor to the cards.
  const cards = (powers: Power[]) => powers.map((p, i) => <div key={i}>
    <PowerCardView entry={powerToLegacy(p) as PowerCardEntry} />
    <Annotation anchor={{ kind: 'entry', entry: { entryType: 'action', name: p.name, _draftNode: (p as { _draftNode?: string })._draftNode } }} />
  </div>)
  const levels = c.levels.map(l => ({ level: l.level, enhancement: l.enhancement ? `+${l.enhancement}` : undefined, price: l.price !== null ? `${l.price.toLocaleString('en-US')} gp` : l.priceText ?? 'Undecided' }))
  const descriptionParts = c.description.filter(p => p.type !== 'power').map(p => p.type === 'table' ? p : { type: 'text' as const, text: p.type === 'properties' ? p.items.join('; ') : 'text' in p ? p.text : '' })
  return <article>
    <Dnd4eItemViewer item={{ name: c.name, category: c.category, level: c.level, rarity: c.rarity ?? '', price: levels[0]?.price ?? '', flavor: c.flavor, slot: c.slot ?? '', itemType: c.itemType ?? c.subtype ?? '', enhancement: levels[0]?.enhancement ?? '', critical: c.critical?.text ?? '', properties: c.properties.map(p => p.text), propertyScaling: c.propertyLevelSteps, powers: [], groups: c.weapon?.groups ?? [], source, description: '', descriptionParts, levels, damage: c.weapon?.damage, proficiency: c.weapon ? `+${c.weapon.proficiency}` : undefined, range: c.weapon?.range, weight: c.weight ?? c.weapon?.weight, weaponCategory: c.weapon?.category, special: c.special?.text, requirement: c.requirement?.text, itemSet: c.itemSet, alchemicalType: c.alchemical?.type, formulaCost: c.alchemical?.formulaCost, keySkill: c.ritual?.keySkill, castTime: c.ritual?.castTime, duration: c.ritual?.duration, componentCost: c.ritual?.componentCost, ritualCategory: c.ritual?.category } as never} />
    {c.armor && <p><b>Armor:</b> {c.armor.category}; AC +{c.armor.acBonus}; check {c.armor.check ?? 0}; speed {c.armor.speed ?? 0}{c.armor.minEnhancement ? `; minimum enhancement +${c.armor.minEnhancement}` : ''}</p>}
    {c.weapon?.properties.length ? <p><b>Weapon properties:</b> {c.weapon.properties.join(', ')}</p> : null}
    {c.tier && <p><b>Tier:</b> {c.tier}</p>}
    {cards([...c.powers, ...c.description.flatMap(p => p.type === 'power' ? [p.power] : [])])}
  </article>
}
