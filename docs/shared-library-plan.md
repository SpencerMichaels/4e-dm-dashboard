# Shared Library: custom content outside campaigns

Status: implemented 2026-11-14 (phases 1-6; export is later). This is the durable plan for the work below; update the checkboxes and the "Decisions" section as it lands. TODO.md section 11 links here.

## Goal

Custom content can be shared across campaigns. A **Library** of custom creatures, items, traps, diseases, templates, and themes sits beside the published compendium and every campaign. It acts as the DM's own book: it behaves like published content everywhere (campaigns reference it live), except that the DM and an agent can edit it.

At the same time, no custom entry may ever be "homeless": every entry and every working copy belongs to exactly one home, the Library or one campaign, and the UI always says which.

This reverses decision 1 of [campaign-content-and-editors-plan.md](campaign-content-and-editors-plan.md) ("Campaign records, not libraries"). The homebrew libraries removed on 2026-11-13 were a Workshop-only destination. This Library is a first-class home for records, on the compendium pages.

## Decisions (DM, 2026-11-14)

1. **Shared content is wanted.** Content shared across campaigns will come up, so the Library is a real third home, not just a hardening of campaign-only content.
2. **Live reference.** Campaigns use Library entries by reference, like published ones. Editing a Library entry changes it in every campaign that uses it. A campaign that needs its own version takes the entry back (if no other campaign uses it) or duplicates it (2026-11-14; `basedOn: library/<recordType>/<id>`).
3. **Export bundles references; import keeps them in the campaign.** A future "export campaign" feature (sharing a planned adventure with another DM) must leave no dangling references, and importing must not add anything to the importing DM's Library. See Export below.

4. **Deleting a Library entry in use: warn, then allow.** The confirm names the campaigns that use it; afterwards their references show as missing, like a deleted campaign entry.
5. **Share moves, Duplicate copies** (2026-11-14, replacing "Copy only" and the Copy to campaign / Copy to library buttons, which left the DM managing duplicates). A campaign entry's **Shared with every campaign** toggle moves it into the Library under the same id: its art is copied along, this campaign's references follow (`creatureId`/`trapId`/`diseaseId` and `campaign:<id>` become `libraryId` and `library:<id>`), and its working copy moves with its history (`src/main/data/move-entry.ts`, `rehomeRefs` in `campaign-records.ts`, `DraftStore.rehome`, `CMD.ENTRY_SHARE`). Turning it off moves it back into the open campaign, allowed only while no other campaign uses it (otherwise the menu says which do; duplicate it instead). **Duplicate** copies an entry beside itself, at once.
6. **New goes into the open campaign** (2026-11-14, replacing the In this campaign / In the Library menu); with no campaign open it goes to the Library. Share it afterwards if it should be shared.

## Why it was needed

Shadow, an agent-made creature, was created under the old Workshop with no campaign and floated as an entry with no home. Since 2026-11-13 the UI no longer allows that, but three data-level gaps remain:

- `patch_draft` accepts `/destinations`, so an agent can clear or move a working copy's home.
- Deleting a campaign leaves its working copies behind (deleting one entry archives its copy; deleting the campaign does not).
- `DraftStore.create` accepts no destination; only `AuthoringService` refuses it.

## Design

### Storage

- `<userData>/library/{creatures,items,traps,diseases,templates,themes}/<id>.json`: the same `CampaignRecord` envelopes as campaigns (`src/common/campaign-records.ts`), atomic writes, human-readable.
- `<userData>/library/assets/images/`: art for Library entries, so `art.imageId` / `tokenImageId` resolve without a campaign.
- Main owns the Library like a campaign: a `LibraryStore` (or a home-parameterized campaign store) loads it at startup and broadcasts changes to the DM window, whether or not a campaign is open. Campaign data is untouched by Library edits.

### References

A reference names its home explicitly. Existing fields keep their meaning (`creatureId`/`trapId`/`diseaseId` = this campaign, `compendiumId` = published), plus a Library form:

| Where | Today | Library form |
| --- | --- | --- |
| Encounter creature row (`EncounterCreature`) | `creatureId` or `compendiumId` | `libraryId` |
| Encounter trap / location trap (`EncounterTrap`, `TrapRef`) | `trapId` or `compendiumId` | `libraryId` |
| PC disease (`PlayerCharacter.diseases`) | `diseaseId` or `compendiumId` | `libraryId` |
| Encounter templates and themes (`template-catalog.ts`) | `campaign:<id>` or a published ref | `library:<id>` |
| Record `basedOn` | `published/<recordType>/<id>` | `library/<recordType>/<id>` |

Main resolves Library references the same way it resolves published ones when it builds encounter combatants and row previews (`src/main/combat/encounter-combatants.ts`). A reference to a deleted Library entry shows as missing, like a deleted campaign entry. Before deleting a Library entry the DM is told how many campaigns use it (and which).

Combat is unaffected by live edits once started: combatants already snapshot their kit content at `COMBAT_INIT`.

### Compendium pages

In the UI the Library is called **Shared** (2026-11-14): a custom entry is either in a campaign or shared with every campaign. "Library" remains the name in code, on disk (`library/`), and in the agent API.

Each kind's page (`RecordCompendium`) lists published, Library, and campaign entries sorted together (2026-11-14; first planned as labelled sections, then a home badge on every custom row, which was noise). Rows carry no home label: the stat block title bar shows it, and a **source** filter after the kind's own filters narrows the list to Published or Custom, and a second dropdown beside it to a book (a magazine's issues count as one) or, with a campaign open, to Shared or the campaign.

- **New** is one button: a new entry in the open campaign, or in the Library with none open (2026-11-14).
- The entry's controls sit in its stat block's title bar right after the name, before the level (`shared/record-header.tsx`, 2026-11-14): its home (**Campaign**, **Library**, or **New** until the first change adds it), then same-size icons: **pop out** (the entry, preview or editor, moves into an OS window of its own with the same controls), **Edit** (pressed while editing; press again for done), and for a custom entry a **⋯** menu (also on a row's right-click) with **Shared with every campaign**, **Duplicate**, and **Delete**. A published entry has only Edit, which makes a copy in the open campaign (or the Library) on the first change.
- `basedOn` only ever names a published or Library source, never a campaign, so it still resolves after the content leaves the campaign. A duplicate of a campaign entry keeps its original's `basedOn`, if it has one; a shared entry keeps its own.
- Viewing and editing are identical for all homes: the same stat block, editor, working copy, comment markers, art panel, delete, and pop-outs.
- Search and pickers that choose content (encounter creature/trap search, location traps, template/theme pickers, the command palette) include Library entries, labelled.

### Agent (authoring)

- A working copy's single home is a campaign or the Library (`{ type: 'library' }` destination), fixed at creation.
- `current_entry` and `edit_entry` cover Library entries; the page's `focus` names the home.
- `create_draft` defaults to the open campaign, or the Library when none is open; `destination: "library"` when the DM asks. `from` also accepts `library/...` keys.
- The skills say where new content goes and that Library edits affect every campaign using the entry.

### Hardening (applies to both homes)

- `DraftStore.create` requires exactly one destination; `/destinations` is not patchable.
- Deleting a campaign archives its working copies; deleting a Library entry archives its working copy (as entry deletion already does in campaigns).
- A one-time check on startup: working copies whose home no longer exists are archived (kept on disk under `authoring/archive/`).

### Export (future feature; the constraint this plan must keep possible)

An exported campaign is self-contained:

- It bundles every Library entry the campaign references (and those entries' art) in a `library/` folder inside the export. Published entries are not bundled: they are WotC content the other DM already has, and the content repo is never shared.
- On import, bundled entries become entries of the imported campaign itself, never of the importing DM's Library (an import touches nothing outside the campaign it creates; DM, 2026-11-14). Their art goes into the campaign's assets, and references are rewritten to the campaign forms (`libraryId` → `creatureId`/`trapId`/`diseaseId`, `library:<id>` → `campaign:<id>`). A `basedOn` naming the exporter's Library is dropped (it would not resolve); a published `basedOn` is kept. The importing DM can **Copy to library** anything they want to share across their own campaigns.
- **TBD: an entry the importing DM's Library already has.** Under the rule above it becomes a duplicate (a campaign copy beside their Library's, the two independent). Options considered 2026-11-14, undecided:
  - Always copy into the campaign: simple and predictable, but duplicates are possible.
  - Link identical entries: when the Library has the same content (ignoring id and timestamps), reference it live instead of copying; a same-id entry with different content becomes a campaign copy with `basedOn: library/<recordType>/<id>`; the import result says what was linked and what was added.
- Everything references through explicit ids and the forms above, so an exporter can find all references by walking the campaign's records; keep it that way (no references hidden in prose).

## Phases

- [x] 1. Hardening: one fixed home per working copy, campaign deletion archives its copies, startup orphan check. Done 2026-11-14 (`DraftStore.campaignDeleted`, `archiveOrphans`). Tests in `store.test.ts` / `service.test.ts`.
- [x] 2. Library storage in main: `library/` folders, load and broadcast, art storage, CRUD through the same entity handlers with a home parameter. Done 2026-11-14: `src/main/data/library-store.ts`, `ENTITY_SAVE`/`ENTITY_DELETE`/image commands take `home` ("library"), `CMD.LIBRARY_STATE` and `SYNC.LIBRARY_UPDATE` feed `stores/library-store.ts`, `IMAGE_GET` falls back to the Library's assets, authoring destinations `{ type: "library", id: "library" }` and `from` keys `library/<kind>/<id>` and `campaign/<campaignId>/<kind>/<id>` (`customCopy`, which copies art files into the Library).
- [x] 3. Compendium pages: the Library section, home labels, "+ New in ...", Copy to library / Copy to campaign from Library, delete with usage warning. Compendium UI smoke test extended. Done 2026-11-14 in `RecordCompendium`: the list is virtualized with uniform rows, so instead of section headers every custom row carries a **Campaign** or **Library** badge (sorted campaign, Library, published) and the source filter offers the campaign, Library, and Published; the Library entry's preview says "In the Library". Library art goes to the Library through `RecordHomeContext` (`shared/record-home.ts`). The delete warning names no campaigns yet: usage comes with phase 4.
- [x] 4. References: `libraryId` on encounter creature rows, encounter and location traps, PC diseases; `library:<id>` templates/themes; main resolution in encounter combatants and previews; pickers and search include Library entries. Combat UI smoke test with a Library creature in an encounter. Done 2026-11-14: `encounter-combatants.ts` (`EncounterSources.library`, `trapRefKey`), the merged creature index lists Library creatures as source "Library" (and the encounter editor reloads it when creatures change), `trap-refs.tsx`, `disease-refs.tsx` (campaign, then Library, then published by name), `template-catalog.ts`; `CMD.LIBRARY_USAGE` (`libraryUsage`) names the campaigns that use an entry in the delete confirm. A Library creature's art is edited on its compendium page, not from an encounter row.
- [x] 5. Agent: library destination, `current_entry`/`edit_entry`/`from` for Library entries, skills and `docs/AUTHORING.md`. Done 2026-11-14: `agentHome` (service.ts), tool descriptions, the 4e-author-content skill, and `docs/AUTHORING.md`.
- [x] 6. Docs: AGENTS.md architecture and status, TESTING.md checklist. Done 2026-11-14.
