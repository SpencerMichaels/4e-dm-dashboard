#!/usr/bin/env npx tsx
// Pre-parses raw 4e glossary HTML data into a structured lookup table.
// Run: npx tsx tools/content/build-glossary.ts

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const CONTENT_DIR = join(__dirname, '..', '..', 'content')

const RAW_PATH = join(CONTENT_DIR, 'raw', 'glossary.json')
const OUT_DIR = join(CONTENT_DIR, 'parsed')
const OUT_PATH = join(OUT_DIR, 'glossary.json')

// Known category membership — lowercase name → category
const CATEGORIES: Record<string, string[]> = {
  sense: ['all-around vision', 'blindsight', 'darkvision', 'low-light vision', 'tremorsense', 'truesight'],
  origin: ['aberrant', 'elemental', 'fey', 'immortal', 'natural', 'shadow'],
  type: ['animate', 'beast', 'humanoid', 'magical beast'],
  role: ['artillery', 'brute', 'controller', 'lurker', 'skirmisher', 'soldier'],
  modifier: ['elite', 'leader', 'minion', 'solo'],
  size: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'],
  condition: ['blinded', 'dazed', 'deafened', 'dominated', 'dying', 'grabbed', 'helpless',
    'immobilized', 'insubstantial', 'invisible', 'marked', 'petrified', 'prone',
    'restrained', 'slowed', 'stunned', 'surprised', 'unconscious', 'weakened'],
  damage_type: ['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'],
  subtype: ['angel', 'construct', 'demon', 'devil', 'dragon', 'dwarf', 'eladrin', 'elf',
    'giant', 'goblin', 'homunculus', 'human', 'living construct', 'ooze', 'orc',
    'plant', 'primordial', 'reptile', 'shapechanger', 'spider', 'swarm', 'undead', 'vampire'],
  keyword: ['arcane', 'divine', 'martial', 'primal', 'psionic', 'shadow'],
  weapon_property: ['accurate', 'brutal', 'deadly', 'defensive', 'distant', 'durable',
    'energized', 'forceful', 'heavy thrown', 'high crit', 'light thrown', 'load free',
    'load minor', 'off-hand', 'reach', 'small', 'stout', 'versatile',
    'empowered crit', 'barbed', 'shielding', 'undeniable', 'unerring', 'unstoppable'],
  weapon_group: ['axe', 'bow', 'crossbow', 'flail', 'hammer', 'heavy blade', 'light blade',
    'mace', 'pick', 'polearm', 'sling', 'spear', 'staff', 'unarmed'],
}

// Build reverse lookup: lowercase name → category
const nameToCat = new Map<string, string>()
for (const [cat, names] of Object.entries(CATEGORIES)) {
  for (const n of names) nameToCat.set(n, cat)
}

interface GlossaryEntry {
  name: string
  category: string
  definition: string
  source: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const raw: Record<string, string> = JSON.parse(readFileSync(RAW_PATH, 'utf-8'))
  const glossary: Record<string, GlossaryEntry> = {}
  const seen = new Map<string, string>() // lowercase name → first id (dedup)
  const catCounts: Record<string, number> = {}

  for (const [id, html] of Object.entries(raw)) {
    const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? ''
    if (!name) continue

    const lower = name.toLowerCase()

    // Skip duplicates (keep first occurrence)
    if (seen.has(lower)) continue
    seen.set(lower, id)

    // Extract definition (flavor text or full body)
    const flavorMatch = html.match(/<p class=['"]?flavor['"]?>([\s\S]*?)<\/p>/)
    let definition = ''
    if (flavorMatch) {
      definition = stripHtml(flavorMatch[1])
    } else {
      // Fall back to all text after <h1>
      const afterH1 = html.replace(/^[\s\S]*?<\/h1>/, '')
      definition = stripHtml(afterH1)
        .replace(/Published in[\s\S]*$/im, '')
        .trim()
    }

    const source = html.match(/Published in\s+([^<]+)/i)?.[1]?.replace(/\.\s*$/, '').trim() ?? ''

    const category = nameToCat.get(lower) ?? 'other'
    catCounts[category] = (catCounts[category] ?? 0) + 1

    glossary[lower] = { name, category, definition, source }
  }

  console.log(`Parsed ${Object.keys(glossary).length} unique glossary entries`)
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${cat}: ${count}`)
  }

  const json = JSON.stringify(glossary)
  writeFileSync(OUT_PATH, json)
  console.log(`\nWrote ${OUT_PATH} (${(json.length / 1024).toFixed(0)} KB)`)
}

main()
