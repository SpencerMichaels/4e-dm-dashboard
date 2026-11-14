// Add the parser's companion and NPC fields (schema v14: classRole for a PC
// class role printed with no XP, "Level 4 Defender"; healingSurges and
// surgeValue from "Healing Surges 11; Surge Value 12") to agent-cleaned
// monsters, which the converter never overwrites.
//
// Run: npm run content:patch-companions -- --repo <content repo> [--check]
//
// Only monsters with provenance origin 'agent' and none of the three fields
// are touched, and only when the parser finds one of them. With a class role,
// `role` becomes null and a `leader` flag the agent kept for "Leader" goes;
// an `hpText` holding only the surge words (where agents put them before v14)
// goes too. Nothing else changes (provenance included). --check lists what
// would change and writes nothing.

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseMonsterHtml } from '../html-parser'
import { toJson } from '../convert/index'
import { contentRepo } from './prompt'

const RAW = join(__dirname, '..', '..', '..', 'content', 'raw', 'monsters.json')

/** The patched entry and a list of its changes, or {} when the patch does not apply. */
export function patchCompanion(entry: Record<string, any>, html: string): { entry?: Record<string, any>; changes?: string[] } {
  if (entry?.provenance?.origin !== 'agent') return {}
  if (['classRole', 'healingSurges', 'surgeValue'].some(k => entry[k] !== undefined)) return {}
  const sb: any = parseMonsterHtml(html, [], {}).statBlock
  const add: Record<string, unknown> = {}
  if (sb.classRole) add.classRole = sb.classRole
  if (sb.healingSurges !== undefined) add.healingSurges = sb.healingSurges
  if (sb.surgeValue !== undefined) add.surgeValue = sb.surgeValue
  if (Object.keys(add).length === 0) return {}
  const changes = Object.entries(add).map(([k, v]) => `${k} ${v}`)
  const dropHpText = typeof entry.hpText === 'string' && entry.hp > 0 && /^\s*Healing Surges\b[^;]*(;\s*Surge Value\s+\d+)?\s*$/i.test(entry.hpText)
  if (dropHpText) changes.push(`hpText "${entry.hpText}" removed`)
  if (add.classRole && entry.role !== null) changes.push(`role ${entry.role} -> null`)
  if (add.classRole === 'leader' && entry.leader) changes.push('leader removed')
  // Surges go after the last HP field present.
  const hpKey = ['hpIf', 'hpText', 'hp'].find(k => entry[k] !== undefined && !(k === 'hpText' && dropHpText))
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'hpText' && dropHpText) continue
    if (k === 'leader' && add.classRole === 'leader') continue
    out[k] = k === 'role' && add.classRole ? null : v
    if (k === 'role' && add.classRole) out.classRole = add.classRole
    if (k === hpKey) {
      if (add.healingSurges !== undefined) out.healingSurges = add.healingSurges
      if (add.surgeValue !== undefined) out.surgeValue = add.surgeValue
    }
  }
  return { entry: out, changes }
}

function main() {
  const args = process.argv.slice(2)
  const repo = contentRepo(args)
  const check = args.includes('--check')
  const raw = JSON.parse(readFileSync(RAW, 'utf-8')) as Record<string, string>
  const dir = join(repo, 'monsters')
  let patched = 0
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const id = file.replace(/\.json$/, '')
    if (!raw[id]) continue
    const path = join(dir, file)
    const { entry, changes } = patchCompanion(JSON.parse(readFileSync(path, 'utf-8')), raw[id])
    if (!entry || !changes) continue
    console.log(`${check ? 'WOULD PATCH' : 'PATCHED'} ${id}: ${changes.join('; ')}`)
    patched++
    if (!check) writeFileSync(path, toJson(entry))
  }
  console.log(`\n${patched} ${check ? 'to patch' : 'patched'}`)
}

if (require.main === module) main()
