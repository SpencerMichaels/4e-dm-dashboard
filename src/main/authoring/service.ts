import { dirname, join } from 'path'
import { mkdir } from 'fs/promises'
import type { Actor, Content, ContentKind } from '../../common/authoring/types'
import { benchmarks, scaffold, search, validate } from '../../common/authoring/core'
import { ENTITY_DIRS, entityTypeForKind, newRecord } from '../../common/campaign-records'
import { DraftStore, readJson, safeId, atomicJson, digest } from './store'
import { Catalog } from './catalog'
import { withWriteLock } from '../data/write-lock'
import { suggestNumbers } from '../../common/authoring/numbers'
import { itemBenchmarks } from '../../common/rules/items'

export class AuthoringService {
  readonly drafts: DraftStore
  readonly catalog: Catalog
  constructor(readonly userData: string, contentRoot: string, changed: ConstructorParameters<typeof DraftStore>[2] = () => {}, private published: (campaignId: string, kind: ContentKind) => void = () => {}) {
    this.catalog = new Catalog(contentRoot)
    this.drafts = new DraftStore(join(userData, 'authoring', 'drafts'), {
      check: async d => {
        if (d.type !== 'campaign') throw new Error('Content saves to a campaign')
        if (!await readJson(join(userData, 'campaigns', safeId(d.id), 'campaign.json'))) throw new Error('Destination no longer exists')
      },
      read: async (d, id, kind) => readJson(this.destinationPath(d.type, d.id, kind, id)),
      // Every kind is kit content in a record envelope.
      encode: (content, kind, id, at) => newRecord(id, content as { id: string }, at),
      write: async (d, id, kind, value, expectedHash) => {
        const path = this.destinationPath(d.type, d.id, kind, id)
        const manifest = join(userData, 'campaigns', safeId(d.id), 'campaign.json')
        await withWriteLock(manifest, async () => {
          if (!await readJson(manifest)) throw new Error('Destination no longer exists')
          await withWriteLock(path, async () => {
            if (digest(await readJson(path)) !== expectedHash) throw new Error('Destination changed during save; no overwrite performed')
            await mkdir(dirname(path), { recursive: true })
            await atomicJson(path, value)
          })
        })
        this.published(d.id, kind)
      },
    }, changed)
  }
  private destinationPath(type: string, id: string, kind: ContentKind, entityId: string) {
    if (type !== 'campaign') throw new Error('Content saves to a campaign')
    return join(this.userData, 'campaigns', safeId(id), ENTITY_DIRS[entityTypeForKind(kind)], safeId(entityId) + '.json')
  }
  async destinations() {
    const { readdir } = await import('fs/promises')
    const root = join(this.userData, 'campaigns')
    await mkdir(root, { recursive: true })
    const dirs = await readdir(root, { withFileTypes: true })
    const campaigns = await Promise.all(dirs.filter(d => d.isDirectory()).map(d => readJson<{ id: string; name: string }>(join(root, d.name, 'campaign.json'))))
    return campaigns.filter((c): c is { id: string; name: string } => !!c).map(c => ({ type: 'campaign', id: c.id, name: c.name }))
  }
  /** What the DM has open (set by the dashboard): the kind, and a campaign entry or a published id; `editing` when in the editor. */
  focus: { kind: ContentKind; campaignId?: string; entityId?: string; publishedId?: string; editing?: boolean } | null = null
  /** The entry's working copy: the draft bound to it, or a new one made from it. */
  async workingCopy(campaignId: string, kind: ContentKind, entityId: string, actor: Actor) {
    const existing = (await this.drafts.list()).find(d => d.destinations.some(x => x.id === campaignId && x.entityId === entityId))
    if (existing) {
      // A draft from before live writing (no merge base) may be older than the entry: start over from the entry.
      if ((await this.drafts.syncState(existing.id)).written?.[`campaign/${campaignId}/${entityId}`]) return this.drafts.get(existing.id)
      await this.drafts.archive(existing.id)
    }
    const destination = { type: 'campaign' as const, id: campaignId, entityId }
    const value = await readJson<{ content?: Content }>(this.destinationPath('campaign', campaignId, kind, entityId))
    if (!value?.content) throw new Error('No such campaign entry')
    return this.drafts.create(kind, value.content, `Revise ${value.content.name}, preserving its existing mechanics unless changed explicitly.`, [{ ...destination, expectedHash: digest(value) }], actor)
  }
  /** Explicit allowlist shared by IPC and local agents. Approval is intentionally absent. */
  async call(method: string, a: any = {}, actor: Actor = 'agent'): Promise<unknown> {
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Expected arguments object')
    switch (method) {
      case 'destinations': return this.destinations()
      case 'benchmarks': return a.kind === 'item' ? itemBenchmarks(a.level) : benchmarks(a.level, a.role, a.rank, a.abilities)
      case 'scaffold': return scaffold(a.kind ?? 'monster', a.name, a.level, a.role, a.rank)
      case 'validate': return validate(a.kind, a.content, a.recipe)
      case 'search': return search(await this.catalog.entries(), a)
      case 'fetch': {
        const e = (await this.catalog.entries()).find(e => e.key === a.key)
        if (!e) throw new Error('Content not found')
        return e
      }
      case 'destination_entity': {
        const value = await readJson(this.destinationPath(a.destination.type, a.destination.id, a.kind, a.entityId))
        return { value, hash: digest(value) }
      }
      // The working copy of a campaign entry (a draft both the DM and the agent edit), made from the entry if it has none.
      case 'working_copy': case 'edit_entry': return this.workingCopy(a.campaignId, a.kind, a.entityId, actor)
      // What the DM has open in the dashboard: a campaign entry (with its working copy) or a published one.
      case 'current_entry': {
        const f = this.focus
        if (!f) return { open: null }
        if (!f.campaignId || !f.entityId) return { open: f }
        const d = await this.workingCopy(f.campaignId, f.kind, f.entityId, actor)
        return { open: { ...f, draftId: d.id } }
      }
      case 'create_draft': return this.drafts.create(a.kind, a.content ?? scaffold(a.kind, a.name, a.level, a.role, a.rank), a.intent, a.destinations, actor, a.entry)
      case 'list_drafts': return this.drafts.list()
      case 'get_draft': return this.drafts.get(a.id)
      case 'suggest_numbers': return suggestNumbers(await this.drafts.get(a.id), a.recipe)
      case 'history': return this.drafts.history(a.id, a.event)
      case 'versions': return this.drafts.versions(a.id)
      case 'sync_status': return this.drafts.syncState(a.id)
      // Undo: an earlier version becomes the newest one (and goes into the entry).
      case 'restore_draft': return this.drafts.restore(a.id, a.revision, a.event, actor)
      case 'patch_draft': return this.drafts.patch(a, actor)
      case 'comment': return this.drafts.comment(a.id, a.text, a.target ?? '/', actor, a.question, a.replyTo, a.resolve)
      case 'review': return this.drafts.review(a.id, a.revision, a.assumptions, a.findings, actor)
      default: throw new Error(`Unknown authoring operation: ${method}`)
    }
  }
}
