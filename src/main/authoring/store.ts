import { mkdir, readFile, readdir, rename, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { SCHEMA_VERSION } from '@kit'
import type { Actor, Content, ContentKind, Destination, Draft, DraftAction, DraftVersion, Patch, Review } from '../../common/authoring/types'
import { POLICY, normalizeContent, validate } from '../../common/authoring/core'
import { applyPatch, NODE_GROUPS } from '../../common/authoring/patch'
import { describeDraftChanges } from '../../common/authoring/diff'

export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
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
interface Journal {
  revision: number
  at: string
  targets: { destination: Destination; entityId: string; previousHash: string; value: unknown }[]
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
    return drafts.filter((d): d is Draft => !!d).map(d => ({ id: d.id, kind: d.kind, name: d.content.name, level: (d.content as { level?: number }).level, revision: d.revision, updatedAt: d.updatedAt, saved: d.receipt?.revision === d.revision, everSaved: !!d.receipt, openQuestions: d.comments.filter(c => c.question && !c.resolved).length }))
  }
  private async persist(d: Draft, by: Actor, action: DraftAction) {
    d.lastChange = { by, action }
    const dir = this.dir(d.id)
    await mkdir(join(dir, 'history'), { recursive: true, mode: 0o700 })
    d.event++; d.updatedAt = new Date().toISOString()
    // Preserve an orphaned snapshot if the previous process died before updating current.json.
    while (await readJson(join(dir, 'history', `${d.event}.json`))) d.event++
    await atomicJson(join(dir, 'history', `${d.event}.json`), d)
    await atomicJson(join(dir, 'current.json'), d)
    this.changed(d)
    return d
  }
  async history(id: string, event: number) {
    if (!Number.isSafeInteger(event) || event < 1) throw new Error('Invalid event')
    return upgrade(await readJson<Draft>(join(this.dir(id), 'history', `${event}.json`)))
  }
  async saveStatus(id: string) {
    const d = await this.get(id)
    const journal = await readJson<Journal>(join(this.dir(id), 'save.json'))
    return { pending: !!journal && d.receipt?.revision !== journal.revision, targets: journal?.targets.map(t => ({ destination: t.destination, entityId: t.entityId })) ?? [] }
  }
  /** Abandon the remaining writes; already saved entities are deliberately retained. */
  abandonSave(id: string) {
    return this.serial(async () => {
      const d = await this.get(id)
      const path = join(this.dir(id), 'save.json')
      const journal = await readJson<Journal>(path)
      if (!journal || d.receipt?.revision === journal.revision) return d
      await atomicJson(join(this.dir(id), `abandoned-save-${randomUUID()}.json`), journal)
      await unlink(path)
      d.comments.push({ id: randomUUID(), target: '/', revision: d.revision, author: 'dm', text: 'Remaining save operations abandoned. Already written entities were retained; inspect destinations before saving again.', at: new Date().toISOString(), question: true, resolved: false, replies: [] })
      return this.persist(d, 'dm', 'save-abandoned')
    })
  }
  create(kind: ContentKind, content: Content, intent = '', destinations: Destination[] = [], actor: Actor = 'agent') {
    return this.serial(async () => {
      const normalized = normalizeContent(content)
      const errors = validate(kind, normalized).errors
      if (errors.length) throw new Error(JSON.stringify(errors))
      this.checkDestinations(destinations)
      const id = randomUUID(), at = new Date().toISOString()
      normalized.id = id; normalized.provenance = { origin: actor === 'dm' ? 'human' : 'agent', at }
      const nodes: Record<string, string[]> = {}
      for (const group of NODE_GROUPS) if (Array.isArray((normalized as any)[group])) nodes[group] = (normalized as any)[group].map(() => randomUUID())
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
  private async editable(id: string) {
    const d = await this.get(id)
    const journal = await readJson<Journal>(join(this.dir(id), 'save.json'))
    if (journal && d.receipt?.revision !== journal.revision) throw new Error('Save is pending. Retry approval to finish it before editing.')
    return d
  }
  patch(patch: Patch, actor: Actor) {
    return this.serial(async () => {
      const draft = applyPatch(await this.editable(patch.id), patch, actor, randomUUID)
      this.checkDestinations(draft.destinations)
      return this.persist(draft, actor, 'edited')
    })
  }
  restore(id: string, revision: number, event: number) {
    return this.serial(async () => {
      const current = await this.editable(id)
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
      return this.persist(current, 'dm', 'restored')
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
  approve(id: string, revision: number, acceptedAdvisories: boolean, expectedEvent?: number) {
    return this.serial(async () => {
      const d = await this.get(id)
      if (d.revision !== revision) throw new Error('Revision changed; review the latest draft')
      if (d.receipt?.revision === revision) return d
      if (expectedEvent !== undefined && d.event !== expectedEvent) throw new Error('Review or feedback changed; inspect the latest draft before approving')
      if (!this.publisher) throw new Error('Publishing is unavailable')
      const result = validate(d.kind, d.content, d.recipe)
      if (result.errors.length || d.stale.length || d.comments.some(c => c.question && !c.resolved)) throw new Error('Resolve validation errors, stale metadata, and blocking questions before approval')
      // Notes (info findings) record observations; only risks, problems, flags, and missing reviews need acknowledgement.
      if (!acceptedAdvisories && (result.flags.length || !d.review || d.review.revision !== revision || d.review.findings.some(f => f.severity !== 'info'))) throw new Error('Acknowledge balance findings or missing/current review')
      this.checkDestinations(d.destinations)
      if (!d.destinations.length) throw new Error('Select a destination')
      const journalPath = join(this.dir(id), 'save.json')
      let journal = await readJson<Journal>(journalPath)
      if (!journal || journal.revision !== revision) {
        journal = { revision, at: new Date().toISOString(), targets: [] }
        for (const destination of d.destinations) {
          await this.publisher.check(destination, d.kind)
          const entityId = destination.entityId ?? randomUUID()
          const previous = await this.publisher.read(destination, entityId, d.kind)
          if (destination.entityId && digest(previous) !== destination.expectedHash) throw new Error('Destination changed; fetch it and review the update')
          if (!destination.entityId && previous) throw new Error('New entity ID already exists')
          const projected = this.publisher.encode.bind(this.publisher)
          const value = { ...(previous as object ?? {}), ...(projected(d.content, d.kind, entityId, journal.at) as object), createdAt: (previous as any)?.createdAt ?? journal.at }
          journal.targets.push({ destination, entityId, previousHash: digest(previous), value })
        }
        await atomicJson(journalPath, journal)
      }
      for (const t of journal.targets) {
        await this.publisher.check(t.destination, d.kind)
        const previous = await this.publisher.read(t.destination, t.entityId, d.kind)
        if (digest(previous) === digest(t.value)) continue
        if (digest(previous) !== t.previousHash) throw new Error('Destination conflict during save; no overwrite performed')
        await this.publisher.write(t.destination, t.entityId, d.kind, t.value, t.previousHash)
      }
      d.receipt = { revision, at: journal.at, targets: journal.targets.map(({ destination, entityId }) => ({ destination, entityId })) }
      // Later saves update the entries written now instead of adding copies.
      d.destinations = journal.targets.map(t => ({ ...t.destination, entityId: t.entityId, expectedHash: digest(t.value) }))
      return this.persist(d, 'dm', 'saved')
    })
  }
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
