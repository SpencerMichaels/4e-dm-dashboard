import { mkdir, readFile, readdir, rename, writeFile, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { SCHEMA_VERSION } from '@kit'
import type { Actor, Content, ContentKind, Destination, Draft, DraftAction, DraftVersion, Patch, Review, SyncState } from '../../common/authoring/types'
import { POLICY, normalizeContent, validate } from '../../common/authoring/core'
import { applyPatch, NODE_GROUPS } from '../../common/authoring/patch'
import { describeDraftChanges } from '../../common/authoring/diff'

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex')
/** The kit content of a campaign record (or the value itself, for publishers that store content bare). */
const contentOf = (value: unknown): Record<string, unknown> => ((value as { content?: unknown })?.content ?? value ?? {}) as Record<string, unknown>
/** Node ids follow their arrays: kept by position, new ones for added entries (after an outside change). */
function alignNodes(d: Draft) {
  for (const group of NODE_GROUPS) {
    const items = (d.content as any)[group]
    if (!Array.isArray(items)) { delete d.nodes[group]; continue }
    const ids = d.nodes[group] ?? []
    d.nodes[group] = items.map((_: unknown, i: number) => ids[i] ?? randomUUID())
  }
}
export function safeId(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid identifier')
  return id
}
export async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (e: any) { if (e.code === 'ENOENT') return null; throw e }
}
export async function atomicJson(path: string, value: unknown) {
  const tmp = `${path}.${randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, path)
}
/**
 * Oldest kit schema a draft can be read under without rewriting it. Every bump since
 * (v5: Attack.altBonus, 'unknown' vs/usage) only added optional fields or values,
 * so older content is already valid; raise this when a bump changes existing shapes.
 */
const COMPATIBLE_SINCE = 4
function upgrade(d: Draft | null): Draft | null {
  if (d?.version === 1 && d.schemaVersion >= COMPATIBLE_SINCE && d.schemaVersion < SCHEMA_VERSION) d.schemaVersion = SCHEMA_VERSION
  return d
}
export interface Publisher {
  check(dest: Destination, kind: ContentKind): Promise<void>
  read(dest: Destination, entityId: string, kind: ContentKind): Promise<unknown>
  encode(content: Content, kind: ContentKind, id: string, at: string): unknown
  write(dest: Destination, entityId: string, kind: ContentKind, value: unknown, expectedHash: string): Promise<void>
}

/** All authoring writes serialize, including cross-draft destination updates. */
export class DraftStore {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(readonly root: string, private publisher?: Publisher, private changed: (draft: Draft) => void = () => {}) {}
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn)
    this.tail = next.catch(() => {})
    return next
  }
  private dir(id: string) { return join(this.root, safeId(id)) }
  async get(id: string): Promise<Draft> {
    const draft = upgrade(await readJson<Draft>(join(this.dir(id), 'current.json')))
    if (!draft) throw new Error('Draft not found')
    if (draft.version !== 1 || draft.schemaVersion !== SCHEMA_VERSION) throw new Error('This draft needs a schema migration before editing')
    return draft
  }
  async list() {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const dirs = await readdir(this.root, { withFileTypes: true })
    const drafts = await Promise.all(dirs.filter(d => d.isDirectory()).map(d => readJson<Draft>(join(this.root, d.name, 'current.json'))))
    return drafts.filter((d): d is Draft => !!d).map(d => ({ id: d.id, kind: d.kind, name: d.content.name, level: (d.content as { level?: number }).level, revision: d.revision, updatedAt: d.updatedAt, openQuestions: d.comments.filter(c => c.question && !c.resolved).length, destinations: d.destinations.map(x => ({ id: x.id, ...(x.entityId ? { entityId: x.entityId } : {}) })) }))
  }
  /** Saves a new version (history snapshot and current.json) without syncing. */
  private async record(d: Draft, by: Actor, action: DraftAction) {
    d.lastChange = { by, action }
    const dir = this.dir(d.id)
    await mkdir(join(dir, 'history'), { recursive: true, mode: 0o700 })
    d.event++; d.updatedAt = new Date().toISOString()
    // Preserve an orphaned snapshot if the previous process died before updating current.json.
    while (await readJson(join(dir, 'history', `${d.event}.json`))) d.event++
    await atomicJson(join(dir, 'history', `${d.event}.json`), d)
    await atomicJson(join(dir, 'current.json'), d)
  }
  private async persist(d: Draft, by: Actor, action: DraftAction) {
    await this.record(d, by, action)
    const dir = this.dir(d.id)
    // Every change goes straight into the draft's campaign entries (live editing with AI). The draft change
    // stands even if the entry cannot be written; the panel shows why.
    try { await this.sync(d) } catch (e) { await atomicJson(join(dir, 'sync.json'), { ...(await this.syncState(d.id)), error: `Could not save to the entry: ${e instanceof Error ? e.message : String(e)}` }) }
    this.changed(d)
    return d
  }
  async history(id: string, event: number) {
    if (!Number.isSafeInteger(event) || event < 1) throw new Error('Invalid event')
    return upgrade(await readJson<Draft>(join(this.dir(id), 'history', `${event}.json`)))
  }
  async syncState(id: string): Promise<SyncState> {
    return await readJson<SyncState>(join(this.dir(id), 'sync.json')) ?? { hashes: {} }
  }
  /**
   * Keeps the draft (the entry's working copy) and its campaign entries one: writes each valid version
   * into the entries (creating an entry the first time, with the `entry` fields given at creation), and
   * folds a change made to an entry elsewhere into the draft first. That merge is per top-level field:
   * a field the draft changed since the last write keeps the draft's value; any other takes the entry's.
   * Runs inside `serial`. Returns whether the draft itself changed (an outside change was folded in).
   */
  private async sync(d: Draft): Promise<boolean> {
    if (!this.publisher || !d.destinations.length) return false
    const path = join(this.dir(d.id), 'sync.json')
    const state = await this.syncState(d.id)
    state.written ??= {}
    let folded = false
    // Outside changes first, so what gets written includes them.
    for (const destination of d.destinations) {
      if (!destination.entityId) continue
      const key = `${destination.type}/${destination.id}/${destination.entityId}`
      const previous = await this.publisher.read(destination, destination.entityId, d.kind)
      const base = state.written[key]
      if (!previous) {
        if (base) { await atomicJson(path, { ...state, error: 'The entry was deleted.' }); return false }
        continue
      }
      const theirs = contentOf(previous)
      if (!base || digest(theirs) === state.hashes[key]) continue
      const ours = d.content as unknown as Record<string, unknown>
      const merged: Record<string, unknown> = { ...ours }
      for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
        if (k === 'id' || k === 'provenance') continue
        if (digest(ours[k]) === digest((base as Record<string, unknown>)[k])) {
          if (theirs[k] === undefined) delete merged[k]; else merged[k] = theirs[k]
        }
      }
      if (digest(merged) !== digest(ours)) {
        d.content = merged as unknown as Content
        alignNodes(d)
        d.revision++
        folded = true
      }
    }
    if (folded) await this.record(d, 'dm', 'edited')
    // Every version is written, as the compendium editor always did; the editor lists validation problems.
    const at = new Date().toISOString()
    let bound = false
    for (const destination of d.destinations) {
      await this.publisher.check(destination, d.kind)
      if (!destination.entityId) { destination.entityId = randomUUID(); bound = true }
      const key = `${destination.type}/${destination.id}/${destination.entityId}`
      const previous = await this.publisher.read(destination, destination.entityId, d.kind)
      // The record's campaign-side fields (artwork, the published entry it came from) are kept; a new
      // entry starts with the ones given when the draft was created.
      const kept = Object.fromEntries(['art', 'basedOn'].flatMap(k => (previous as any)?.[k] !== undefined ? [[k, (previous as any)[k]]] : []))
      const value = { ...(this.publisher.encode(d.content, d.kind, destination.entityId, at) as object), ...(previous ? {} : state.entry), ...kept, createdAt: (previous as any)?.createdAt ?? at }
      if (digest(contentOf(previous)) !== digest(contentOf(value))) await this.publisher.write(destination, destination.entityId, d.kind, value, digest(previous))
      state.hashes[key] = digest(contentOf(value))
      state.written[key] = structuredClone(d.content)
      if (bound) destination.expectedHash = digest(value)
    }
    await atomicJson(path, { hashes: state.hashes, written: state.written, at })
    // A new entry's id is part of the draft from now on (no new version: nothing in it changed).
    if (bound) await atomicJson(join(this.dir(d.id), 'current.json'), d)
    return folded
  }
  /** Folds a change made to an entry outside its draft (art set from the preview, an old migration) into the drafts bound to it. */
  entryChanged(campaignId: string, entityId: string) {
    return this.serial(async () => {
      for (const row of await this.list()) {
        if (!row.destinations.some(x => x.id === campaignId && x.entityId === entityId)) continue
        const d = await this.get(row.id)
        try { if (await this.sync(d)) this.changed(d) } catch { /* the next change retries; the panel shows the error then */ }
      }
    })
  }
  /** An entry was deleted: its drafts are archived (nothing would bring the entry back). */
  async entryDeleted(campaignId: string, entityId: string) {
    for (const row of await this.list()) if (row.destinations.some(x => x.id === campaignId && x.entityId === entityId)) await this.archive(row.id)
  }
  /** Ends a draft: its folder moves to `archive/` beside the drafts folder (kept on disk, out of every list). */
  archive(id: string) {
    return this.serial(async () => {
      await this.get(id)
      const archive = join(dirname(this.root), 'archive')
      await mkdir(archive, { recursive: true, mode: 0o700 })
      await rename(this.dir(id), join(archive, `${safeId(id)}-${Date.now()}`))
      return { archived: id }
    })
  }
  /** `entry`: campaign-side fields for a new entry (the published entry it copies, its art), set by its first write. */
  create(kind: ContentKind, content: Content, intent = '', destinations: Destination[] = [], actor: Actor = 'agent', entry?: { basedOn?: string; art?: unknown }) {
    return this.serial(async () => {
      const normalized = normalizeContent(content)
      const errors = validate(kind, normalized).errors
      if (errors.length) throw new Error(JSON.stringify(errors))
      this.checkDestinations(destinations)
      const id = randomUUID(), at = new Date().toISOString()
      // A copy keeps the provenance of what it copies.
      normalized.id = id; normalized.provenance ??= { origin: actor === 'dm' ? 'human' : 'agent', at }
      const nodes: Record<string, string[]> = {}
      for (const group of NODE_GROUPS) if (Array.isArray((normalized as any)[group])) nodes[group] = (normalized as any)[group].map(() => randomUUID())
      if (entry && Object.keys(entry).length) {
        await mkdir(this.dir(id), { recursive: true, mode: 0o700 })
        await atomicJson(join(this.dir(id), 'sync.json'), { hashes: {}, entry })
      }
      return this.persist({ version: 1, schemaVersion: SCHEMA_VERSION, id, kind, revision: 1, event: 0, createdAt: at, updatedAt: at, content: normalized, intent, decisions: '', policy: POLICY, nodes, overrides: [], stale: [], destinations, comments: [] }, actor, 'created')
    })
  }
  private checkDestinations(destinations: Destination[]) {
    if (!Array.isArray(destinations) || destinations.length > 2) throw new Error('Select at most two destinations')
    for (const d of destinations) {
      if (!d || d.type !== 'campaign') throw new Error('Invalid destination: content saves to a campaign')
      safeId(d.id)
      if (d.entityId) { safeId(d.entityId); if (!/^[a-f0-9]{64}$/.test(d.expectedHash ?? '')) throw new Error('Updates need an expectedHash from destination content') }
    }
    if (new Set(destinations.map(d => `${d.type}/${d.id}`)).size !== destinations.length) throw new Error('Duplicate destination')
  }
  patch(patch: Patch, actor: Actor) {
    return this.serial(async () => {
      const current = await this.get(patch.id)
      // An agent working from an older version is told what the DM changed since, so it asks before overwriting it.
      if (actor === 'agent' && patch.revision !== current.revision) throw new Error(await this.conflict(current, patch.revision))
      const draft = applyPatch(current, patch, actor, randomUUID)
      this.checkDestinations(draft.destinations)
      return this.persist(draft, actor, 'edited')
    })
  }
  /** A stale agent patch: the current revision, and the fields the DM changed since the agent's. */
  private async conflict(current: Draft, revision: number) {
    const since = (await this.versions(current.id)).filter(v => v.revision > revision && v.by === 'dm')
    const fields = [...new Set(since.flatMap(v => v.changes.map(c => c.label)))]
    return `Revision conflict: the draft is at revision ${current.revision}, you sent ${revision}. ` + (fields.length
      ? `Since then the DM changed: ${fields.join(', ')}. Fetch it with get_draft; if your change touches any of those, ask the DM which version to keep before patching.`
      : 'Fetch it with get_draft and apply your change to the current version.')
  }
  restore(id: string, revision: number, event: number, actor: Actor = 'dm') {
    return this.serial(async () => {
      const current = await this.get(id)
      if (current.revision !== revision) throw new Error('Revision conflict; reload before restoring')
      const snapshot = await this.history(id, event)
      if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION) throw new Error('Snapshot is unavailable or needs migration')
      current.content = snapshot.content
      current.nodes = snapshot.nodes
      current.intent = snapshot.intent
      current.decisions = snapshot.decisions
      current.recipe = snapshot.recipe
      current.overrides = snapshot.overrides
      current.stale = snapshot.stale
      current.revision++
      return this.persist(current, actor, 'restored')
    })
  }
  comment(id: string, text: string, target: string, actor: Actor, question = false, replyTo?: string, resolve = false) {
    return this.serial(async () => {
      const d = await this.get(id)
      if (typeof text !== 'string' || text.length > 20000 || (!text.trim() && !resolve)) throw new Error('Comment text required (max 20,000 characters)')
      if (typeof target !== 'string' || target.length > 1000) throw new Error('Invalid comment target')
      const at = new Date().toISOString()
      if (replyTo) {
        const c = d.comments.find(c => c.id === replyTo)
        if (!c) throw new Error('Comment not found')
        if (text.trim()) c.replies.push({ author: actor, text, at })
        // Agents may close questions they asked, but only with a reply recording the answer or why it no longer applies.
        if (resolve && actor !== 'dm' && c.author === 'dm') throw new Error('Only the DM resolves feedback')
        if (resolve && actor !== 'dm' && !text.trim()) throw new Error('Resolving needs a reply stating the answer or why the question no longer applies')
        if (resolve) c.resolved = true
      } else d.comments.push({ id: randomUUID(), target, text, author: actor, revision: d.revision, at, question, resolved: false, replies: [] })
      return this.persist(d, actor, 'commented')
    })
  }
  review(id: string, revision: number, assumptions: string, findings: Review['findings'], actor: Actor) {
    return this.serial(async () => {
      const d = await this.get(id)
      if (d.revision !== revision) throw new Error('Review revision is stale')
      if (typeof assumptions !== 'string' || !Array.isArray(findings) || findings.length > 100 || findings.some(f => !f || !['info', 'concern', 'high'].includes(f.severity) || [f.target, f.message, f.suggestion].some(v => typeof v !== 'string'))) throw new Error('Invalid review')
      d.review = { revision, assumptions, findings, author: actor, at: new Date().toISOString() }
      return this.persist(d, actor, 'reviewed')
    })
  }
  /** Called only by authenticated DM IPC, never exposed by the agent bridge. */
  /**
   * Content versions and saves, newest first: each event that changed the revision or
   * saved it, with who did it and what changed since the version before.
   */
  async versions(id: string): Promise<DraftVersion[]> {
    const dir = join(this.dir(id), 'history')
    const events = (await readdir(dir).catch(() => [] as string[])).map(f => f.match(/^(\d+)\.json$/)?.[1]).filter((e): e is string => !!e).map(Number).sort((a, b) => a - b)
    const versions: DraftVersion[] = []
    let previous: Draft | null = null
    for (const event of events) {
      const snap = await this.history(id, event)
      if (!snap) continue
      const saved = !!snap.receipt && snap.receipt.revision === snap.revision && snap.receipt.at !== previous?.receipt?.at
      if (previous && snap.revision === previous.revision && !saved) continue
      const action: DraftAction = snap.lastChange?.action ?? (saved ? 'saved' : previous ? 'edited' : 'created')
      versions.push({
        event, revision: snap.revision, at: snap.updatedAt, by: snap.lastChange?.by, action,
        changes: previous && snap.revision !== previous.revision ? describeDraftChanges(previous, snap) : [],
        savedTo: saved ? snap.receipt!.targets.map(t => t.destination) : undefined,
      })
      previous = snap
    }
    return versions.reverse()
  }
}
