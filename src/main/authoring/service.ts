import { dirname, join } from 'path'
import { copyFile, mkdir } from 'fs/promises'
import type { Actor, Content, ContentKind } from '../../common/authoring/types'
import { benchmarks, scaffold, search, validate } from '../../common/authoring/core'
import { ENTITY_DIRS, entityTypeForKind, isLibrary, LIBRARY, newRecord, recordTypeFor } from '../../common/campaign-records'
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
      // The Library always exists; a campaign must still be on disk.
      check: async d => {
        if (d.type === 'library') return
        if (d.type !== 'campaign') throw new Error('Content saves to a campaign or the Library')
        if (!await readJson(join(userData, 'campaigns', safeId(d.id), 'campaign.json'))) throw new Error('Destination no longer exists')
      },
      read: async (d, id, kind) => readJson(this.destinationPath(d.type, d.id, kind, id)),
      // Every kind is kit content in a record envelope.
      encode: (content, kind, id, at) => newRecord(id, content as { id: string }, at),
      write: async (d, id, kind, value, expectedHash) => {
        const path = this.destinationPath(d.type, d.id, kind, id)
        const save = () => withWriteLock(path, async () => {
          if (digest(await readJson(path)) !== expectedHash) throw new Error('Destination changed during save; no overwrite performed')
          await mkdir(dirname(path), { recursive: true })
          await atomicJson(path, value)
        })
        if (d.type === 'library') await save()
        else {
          const manifest = join(userData, 'campaigns', safeId(d.id), 'campaign.json')
          await withWriteLock(manifest, async () => {
            if (!await readJson(manifest)) throw new Error('Destination no longer exists')
            await save()
          })
        }
        this.published(d.id, kind)
      },
    }, changed)
  }
  private destinationPath(type: string, id: string, kind: ContentKind, entityId: string) {
    const dir = ENTITY_DIRS[entityTypeForKind(kind)]
    if (type === 'library') return join(this.userData, 'library', dir, safeId(entityId) + '.json')
    if (type !== 'campaign') throw new Error('Content saves to a campaign or the Library')
    return join(this.userData, 'campaigns', safeId(id), dir, safeId(entityId) + '.json')
  }
  async destinations() {
    const { readdir } = await import('fs/promises')
    const root = join(this.userData, 'campaigns')
    await mkdir(root, { recursive: true })
    const dirs = await readdir(root, { withFileTypes: true })
    const campaigns = await Promise.all(dirs.filter(d => d.isDirectory()).map(d => readJson<{ id: string; name: string }>(join(root, d.name, 'campaign.json'))))
    return [...campaigns.filter((c): c is { id: string; name: string } => !!c).map(c => ({ type: 'campaign', id: c.id, name: c.name })), { type: 'library', id: LIBRARY, name: 'Library' }]
  }
  /** What the DM has open (set by the dashboard): the kind, and a campaign entry or a published id; `editing` when in the editor. */
  focus: { kind: ContentKind; campaignId?: string; entityId?: string; publishedId?: string; editing?: boolean } | null = null
  /** A published entry (`published/<kind>/<id>`, as search returns it) as a campaign copy: its content, and the copy's source and art. */
  async publishedCopy(key: string, campaignId: string, content?: Content) {
    const m = /^published\/(\w+)\/(.+)$/.exec(key)
    if (!m) throw new Error(`Not a published entry key: ${key}`)
    const [, kind, id] = m
    // The catalog (the whole converted corpus) only when the copy's content is not given.
    const e = content ? undefined : (await this.catalog.entries()).find(x => x.key === key)
    if (!content && !e) throw new Error(`No published entry ${key}`)
    // Published art is a campaign's annotation; the Library has none, so a Library copy starts without art.
    const annotations = isLibrary(campaignId) ? {} : await readJson<Record<string, Record<string, unknown>>>(join(this.userData, 'campaigns', safeId(campaignId), 'annotations.json')) ?? {}
    const art = Object.fromEntries(Object.entries(annotations[id] ?? {}).filter(([k]) => ['imageId', 'tokenImageId', 'tokenCrop'].includes(k)))
    return { kind: kind as ContentKind, content: content ?? e!.content, entry: { basedOn: `published/${recordTypeFor(kind)}/${id}`, ...(Object.keys(art).length ? { art } : {}) } }
  }
  /**
   * A custom entry as a copy into another home (Copy to campaign from the Library, Copy to library from a
   * campaign): `library/<kind>/<id>` or `campaign/<campaignId>/<kind>/<id>`. A Library source is recorded as
   * `basedOn`; a campaign entry passes on its own `basedOn` (a campaign is never a source). Art comes along;
   * copied into the Library, its image files are copied into the Library's assets, so they show in every campaign.
   */
  async customCopy(key: string, home: string) {
    const m = /^library\/(\w+)\/([^/]+)$/.exec(key) ?? /^campaign\/([^/]+)\/(\w+)\/([^/]+)$/.exec(key)
    if (!m) throw new Error(`Not an entry key: ${key}`)
    const fromLibrary = key.startsWith('library/')
    const [campaignId, kind, id] = fromLibrary ? [LIBRARY, m[1], m[2]] : [m[1], m[2], m[3]]
    const record = await readJson<{ content?: Content; basedOn?: string; art?: Record<string, unknown> }>(this.destinationPath(fromLibrary ? 'library' : 'campaign', campaignId, kind as ContentKind, id))
    if (!record?.content) throw new Error(`No entry ${key}`)
    const basedOn = fromLibrary ? `library/${recordTypeFor(kind)}/${id}` : record.basedOn
    const art = record.art && Object.keys(record.art).length ? record.art : undefined
    if (art && !fromLibrary && isLibrary(home)) {
      const images = join(this.userData, 'library', 'assets', 'images')
      await mkdir(images, { recursive: true })
      for (const image of [art.imageId, art.tokenImageId].filter((x): x is string => typeof x === 'string'))
        await copyFile(join(this.userData, 'campaigns', safeId(campaignId), 'assets', 'images', imageFile(image)), join(images, imageFile(image))).catch(() => {})
    }
    return { kind: kind as ContentKind, content: record.content, entry: { ...(basedOn ? { basedOn } : {}), ...(art ? { art } : {}) } }
  }
  /** The entry's working copy: the draft bound to it, or a new one made from it. `campaignId` is LIBRARY for a Library entry. */
  async workingCopy(campaignId: string, kind: ContentKind, entityId: string, actor: Actor) {
    const type = isLibrary(campaignId) ? 'library' as const : 'campaign' as const
    const existing = (await this.drafts.list()).find(d => d.destinations.some(x => x.id === campaignId && x.entityId === entityId))
    if (existing) {
      // A draft from before live writing (no merge base) may be older than the entry: start over from the entry.
      if ((await this.drafts.syncState(existing.id)).written?.[`${type}/${campaignId}/${entityId}`]) return this.drafts.get(existing.id)
      await this.drafts.archive(existing.id)
    }
    const destination = { type, id: campaignId, entityId }
    const value = await readJson<{ content?: Content }>(this.destinationPath(destination.type, campaignId, kind, entityId))
    if (!value?.content) throw new Error(isLibrary(campaignId) ? 'No such Library entry' : 'No such campaign entry')
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
      case 'create_draft': {
        // New content always goes into a campaign (the dashboard's open one, for an agent), as + new does.
        if (!a.destinations?.length) throw new Error('New content needs a home: the campaign open in the dashboard, or the Library.')
        // A copy (`from`: a published entry's search key, or a Library or campaign entry's key) gets what Copy to
        // campaign gives it: its source, its art.
        const from = !a.from ? undefined : String(a.from).startsWith('published/') ? await this.publishedCopy(a.from, a.destinations[0].id, a.content) : await this.customCopy(a.from, a.destinations[0].id)
        return this.drafts.create(a.kind ?? from?.kind, a.content ?? from?.content ?? scaffold(a.kind, a.name, a.level, a.role, a.rank), a.intent, a.destinations, actor, from?.entry)
      }
      case 'list_drafts': return this.drafts.list()
      case 'get_draft': return this.drafts.get(a.id)
      case 'suggest_numbers': return suggestNumbers(await this.drafts.get(a.id), a.recipe)
      case 'history': return this.drafts.history(a.id, a.event)
      case 'versions': return this.drafts.versions(a.id)
      case 'sync_status': return this.drafts.syncState(a.id)
      // Undo: an earlier version becomes the newest one (and goes into the entry).
      case 'restore_draft': return this.drafts.restore(a.id, a.revision, a.event, actor)
      case 'patch_draft': return this.drafts.patch(a, actor)
      case 'comment': return this.drafts.comment(a.id, a.text, a.target ?? '', actor, a.question, a.replyTo, a.resolve)
      case 'review': return this.drafts.review(a.id, a.revision, a.assumptions, a.findings, actor)
      default: throw new Error(`Unknown authoring operation: ${method}`)
    }
  }
}

/** An image id is a file name in an assets folder ("x7Kp2q.png"): no paths. */
function imageFile(id: string) {
  if (!/^[\w-]+\.\w+$/.test(id)) throw new Error('Invalid image id')
  return id
}

/**
 * Where an agent's new content goes (create_draft without destinations): the campaign open in the dashboard,
 * or the Library when it asks for it (`destination: "library"`) or no campaign is open. Edits are written
 * into it as they land.
 */
export function agentHome(method: string, args: any, campaignId: string | null) {
  if (method !== 'create_draft' || !args || typeof args !== 'object' || Array.isArray(args) || args.destinations?.length) return args
  const { destination, ...rest } = args
  const home = destination === LIBRARY || !campaignId ? { type: 'library', id: LIBRARY } : { type: 'campaign', id: campaignId }
  return { ...rest, destinations: [home] }
}
