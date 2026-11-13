import { dirname, join } from 'path'
import { mkdir } from 'fs/promises'
import type { Actor, ContentKind } from '../../common/authoring/types'
import { benchmarks, scaffold, search, validate } from '../../common/authoring/core'
import { campaignProjection } from '../../common/authoring/legacy'
import { ENTITY_DIRS, entityTypeForKind, isRecordType, newRecord } from '../../common/campaign-records'
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
      // Creatures and items keep their legacy projection; the other kinds are kit content in a record envelope.
      encode: (content, kind, id, at) => isRecordType(kind) ? newRecord(id, content as { id: string }, at) : campaignProjection(content, kind, id, at),
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
      case 'create_draft': return this.drafts.create(a.kind, a.content ?? scaffold(a.kind, a.name, a.level, a.role, a.rank), a.intent, a.destinations, actor)
      case 'list_drafts': return this.drafts.list()
      case 'get_draft': return this.drafts.get(a.id)
      case 'suggest_numbers': return suggestNumbers(await this.drafts.get(a.id), a.recipe)
      case 'history': return this.drafts.history(a.id, a.event)
      case 'versions': return this.drafts.versions(a.id)
      case 'save_status': return this.drafts.saveStatus(a.id)
      case 'patch_draft': return this.drafts.patch(a, actor)
      case 'comment': return this.drafts.comment(a.id, a.text, a.target ?? '/', actor, a.question, a.replyTo, a.resolve)
      case 'review': return this.drafts.review(a.id, a.revision, a.assumptions, a.findings, actor)
      default: throw new Error(`Unknown authoring operation: ${method}`)
    }
  }
}
