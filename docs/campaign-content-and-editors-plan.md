# Campaign content records, statblock editors, and Workshop kinds

Status: planned 2026-11-12. This is the durable plan for the work below; update the checkboxes and the "Decisions" section as it lands. TODO.md section 10 links here.

## Goal

The DM can make and change any 4e content kind the same way: in its compendium page, or with an agent in the Workshop. Both use the same editable statblock UI.

DM decisions (2026-11-12):

1. **Campaign records, not libraries.** Custom content for every kind lives in the campaign, layered over the published compendium like custom creatures are now. The homebrew-library concept goes away. (Superseded 2026-11-14 by a shared Library alongside campaign records: [shared-library-plan.md](shared-library-plan.md).)
2. **All six kinds.** Creatures, items, traps, diseases, templates, and themes. "Creatures" is the user-facing name; `monster` stays the internal kit kind.
3. **Editable statblocks everywhere.** Every kind gets an editor that looks like its printed statblock (ghost inputs in place, like the creature editor). No generic field trees in normal use.
4. **Compendium edit semantics for every kind**, matching the Creatures page: published entries are read-only and clone into a custom copy on edit; custom entries edit in place and autosave; new entries are saved by their first edit.
5. **Shared code.** The compendium page and the Workshop use the same editor component per kind.

## Current state (verified 2026-11-12)

| Kind | Published data | Campaign records | Compendium page | Editor |
| --- | --- | --- | --- | --- |
| Creature | `content/parsed/monsters.json` | `campaigns/<id>/creatures/*.json`: legacy `Creature`, plus `authoredContent` from the Workshop | `Dnd4eCreatureList`: merged index (published plus campaign creatures as source "Custom"), edit or clone, debounced autosave, delete from the context menu, `e` hotkey | `Dnd4eCreatureDetails` (legacy statblock) |
| Item | `items.json` | `campaigns/<id>/items/*.json`: legacy `Item` (`extra` bag) | `Dnd4eItemBrowser` lists published items; campaign items open on a separate `ItemEditor` page | `Dnd4eItemEditor` (legacy, ghost-input statblock) |
| Trap | `traps.json` | none | `Dnd4eTrapBrowser`, read-only | none (`Dnd4eTrapViewer` only) |
| Disease | `diseases.json` | none | `Dnd4eDiseaseBrowser`, read-only | none (`Dnd4eDiseaseViewer`) |
| Template | hard-coded `MONSTER_TEMPLATES` (`creature/monster-templates.ts`, DMG text) | none | `Dnd4eTemplateBrowser`, read-only | none |
| Theme | hard-coded `MONSTER_THEMES` (`creature/monster-themes.ts`, DMG2) | none | `Dnd4eThemeBrowser`, read-only | none |

Other facts the plan depends on:

- **Kit schema.** The 4e-kit schema has `Monster`, `Item`, `Trap`, `Disease`, `MonsterTemplate`, `MonsterTheme`. `src/common/authoring/shape.ts` validates all six, including `templateShape` and `themeShape`.
- **Converters.** `tools/content/convert/` turns parsed or app data into the kit for all six kinds, including `template.ts` for the app's template and theme types. There is no kit-to-app converter for templates or themes.
- **Template and theme application.** The encounter editor applies templates and themes with `applyMonsterTemplate` and `applyMonsterTheme`, which take the app (legacy) types and look them up by name in the hard-coded arrays.
- **Compendium overlays.** `CompendiumAnnotation` stores per-campaign images and token crops for published entries. Creature clones copy them.
- **Workshop.** It authors monster, item, trap, and disease drafts. It saves to campaigns (monster and item only, as the legacy projection with `authoredContent`) or to homebrew libraries (`<userData>/homebrew/<lib>/...`, kit JSON). Only Workshop search reads libraries. Monsters edit through `Dnd4eCreatureDetails` via `creature-editor-adapter.ts`. Other kinds fall back to `DraftMetadataFields` (the field tree), which this plan removes.
- **Campaign storage.** Entities are one JSON file each (`saveEntity`/`deleteEntity` by `EntityType`), loaded on campaign open and broadcast differentially.
- **TODO section 3 deferral.** Adopting the kit `Monster` type for campaign creatures is deferred to section 5 (one-time conversion together with the cleaned content pack). This plan does not do that migration.

## Design

### 1. Data model: kit-native campaign records for new kinds

New `EntityType`s: `trap`, `disease`, `template`, `theme`. Stored at `campaigns/<id>/{traps,diseases,templates,themes}/<id>.json` as a small envelope around kit content:

```json
{
  "id": "…",
  "createdAt": "…",
  "updatedAt": "…",
  "basedOn": "published/trap/<compendium id>",
  "content": { "...kit Trap..." }
}
```

- **Kit-native.** These kinds have no legacy campaign shape to stay compatible with, so they skip the legacy projection that creatures and items carry. The data stays human-readable and lossless.
- **Envelope.** Campaign bookkeeping (ids, timestamps, provenance of a clone) stays separate from the content, so the content validates against the kit unchanged. `basedOn` is optional.
- **Validation.** Saving validates with the authoring shape validators. A record that fails is still saved, because the DM may be mid-edit, but it shows a warning in its editor.
- **Plumbing.** Main `campaign-store` gets directories, load, and save for the four kinds; IPC entity handlers are generic already. The renderer campaign store gets the four arrays. Links and map pins accept the new types.
- **Creatures and items** keep their legacy records for now (section 3 deferral). The Workshop keeps adapting to them.

### 2. Kit-native statblock components (one per kind, view and edit)

For each of trap, disease, template, and theme: a `XStatblock({ value, onChange? })` component in `src/renderer/components/<kind>/`.

- **One component, two modes.** It renders the printed statblock layout. With `onChange` the text becomes ghost inputs (the same CSS and idioms as `Dnd4eCreatureDetails`): click a line to edit it, tag inputs for keywords, `+ trait`/`+ power` affordances. Without it, it is the viewer. One component for both keeps them from drifting apart, which the separate creature viewer/editor pair already shows.
- **Replacing the viewers.** Each component replaces its `Dnd4eXViewer`; published entries render by converting parsed data to the kit with the existing converters.
- **Shared building blocks**, extracted rather than copied:
  - `GhostText`, `GhostNumber`, and `GhostSelect` primitives
  - a `LineEditor` that edits `Line.text` and keeps clauses (clauses are re-anchored by `patch.ts` / `reanchorClauses`)
  - a kit `Power` editor that wraps the existing `PowerEntryEditor` through the power adapter (`powerToLegacy` / `editPower`, already in `creature-editor-adapter.ts`; move them to a shared module)
  - severity and annotation hooks (`Annotation` anchors) so Workshop comment markers work in every editor
- **Items.** The existing `Dnd4eItemEditor` stays the item editor. It gets `Annotation` anchors and an adapter for the Workshop (as for creatures).

Each editor must reach everything a printed statblock shows. Kit-only structure (clauses, structured prerequisites, scaling steps) stays reachable through an "Advanced" disclosure, not the main view.

### 3. One compendium page behavior for every kind

Extract the creature page's behavior from `Dnd4eCreatureList` into a reusable `CompendiumPage` (hook plus layout). Each kind supplies an adapter:

| Adapter function | Purpose |
| --- | --- |
| `index()` | published index entries |
| `get(id)` | full published entry, converted to the kit for new kinds |
| `filters` | kind-specific filter UI (role/level for traps, level for diseases, kind/role for templates, …) |
| `Statblock` | the view/edit component |
| `blank()` | new entry |
| `fromPublished()` | clone conversion |

Shared behavior: merged list of published and Custom entries, preview pane, `e`/double-click to edit (custom) or clone (published), New (saved on first edit), debounced autosave (500 ms) with flush on navigate, delete from the context menu, popout, and "Edit in Workshop" for custom entries. Creature and item pages move onto it too. Creatures keep their extras (templates/themes chips, images) as adapter hooks.

### 4. Templates and themes in use

- **Published data source.** It is the hard-coded arrays, converted to the kit at load with `tools/content/convert/template.ts`. When TODO 8.1 moves template/theme text into the content pack, only the source changes.
- **Custom ones in encounters.** The encounter editor's template and theme pickers list published plus campaign templates and themes. Applying uses the existing `applyMonsterTemplate`/`applyMonsterTheme` through a new kit-to-app adapter (`kitTemplateToApp`, `kitThemeToApp`, tested by round trip against the existing converter on all 16 DMG templates and every theme). Porting the apply logic to the kit types is a later cleanup, not part of this plan.
- **Name collisions.** Encounters reference templates by name today. Custom templates get an id reference (`campaign:<id>`) so a custom "Undead" cannot shadow the published one silently. Existing name references keep working.

### 5. Workshop

- **Kinds.** Tabs are Creatures, Items, Traps, Diseases, Templates, Themes. `ContentKind` gains `template` and `theme`, with scaffolds, validators (already present), previews (the statblock components), Copy existing (catalog entries for templates and themes from the converted published data plus campaign records), and agent tools/skills.
- **Editors.** Every kind edits with its statblock component. For kit-native kinds, the Workshop wraps the component with a generic "staged edits to field-level patches" adapter: a structural diff of kit content, with stable `@node` ids for node groups via a hidden `_draftNode`, as in the creature adapter. Creatures and items keep their adapters. `DraftMetadataFields` stays only for debugging under History, then goes.
- **Destinations.** A campaign only, for all six kinds. Saving a new-kind draft writes the kit envelope. "Edit in Workshop" on any custom record makes an update draft with the existing hash check.
- **Libraries removed.** No library destination, no library UI, no library search source.
  - Existing library folders are left on disk untouched and no longer read.
  - The `create_library` tool goes away; `destinations` lists campaigns.
- **Skills and docs.** Update the authoring skill (kinds, campaign-only destinations), `docs/AUTHORING.md`, and the Workshop intro.

## Phases

Each phase ends with `npm test`, `npm run typecheck:node`, `npm run build`, and `npm run test:authoring:ui` passing in the devcontainer, plus screenshots of the changed pages.

1. **Campaign records**
   - [x] Add the four `EntityType`s, storage, load/broadcast, and the renderer store. (2026-11-13: `src/common/campaign-records.ts`, `CampaignRecord` in `src/common/types/campaign-record.ts`; the main store checks the envelope and keeps `content.id` equal to the record id.)
   - [x] Unit tests: save/load/delete and the envelope round trip (`src/main/data/campaign-records.test.ts`); the smoke test saves and lists a trap record through the entity IPC.
2. **Shared editor primitives**
   - [x] Ghost inputs, `LineEditor`, the kit `Power` editor over `PowerEntryEditor` (move the power adapter out of the creature adapter), and a generic kit diff-to-patches adapter. (2026-11-13: `src/renderer/components/statblock/fields.tsx` (`Text`, `Num`, `Choice`, `Prose`, `LineText`, `Tags`, `Add`/`Remove`/`Move`, `listOps`), `statblock/KitPowers.tsx` (`KitPowers`, `KitTraits`), `creature/power-config.ts`, `common/authoring/power-adapter.ts`, `common/authoring/kit-editor-adapter.ts`; patches gained `/unset/<path>` to delete an optional field.)
   - [x] Tests for the diff adapter: no-op, leaf patches, node add/remove/reorder/duplicate, line clause preservation (`kit-editor-adapter.test.ts`; every case checks that applying the patch reproduces the edit exactly).
3. **Trap and disease statblocks**
   - [x] View/edit components replacing `Dnd4eTrapViewer`/`Dnd4eDiseaseViewer`. (2026-11-13: `trap/TrapStatblock.tsx`, `disease/DiseaseStatblock.tsx`; published entries reach them as kit content via `compendium.kitGet` (`src/main/compendium/kit.ts`, the existing converters). The old viewers are deleted.)
   - [x] Published entries render identically: compare screenshots before and after on a sample. (Six traps and diseases compared. The new trap view also shows the trigger and the attack line, which the old viewer dropped. The disease check table is rebuilt from the structured DCs, because the converter keeps DCs, not the boilerplate check prose.)
4. **CompendiumPage**
   - [x] Extract it from the creature list, then move creatures, items, traps, and diseases onto it with full edit semantics. (2026-11-13: `compendium/RecordCompendium.tsx` with kind adapters in `compendium/record-kinds.tsx` serves traps and diseases, and templates and themes in phase 5. Creatures keep their existing page, which already has these semantics; moving it is left for later to avoid regressions. Items followed the same day, after the DM chose kit-native item records: `items/` holds `CampaignRecord<Item>` envelopes, the Items page is `RecordCompendium` with `ITEM_KIND` (the item editor through `itemFromEditor`), and `src/main/data/legacy-items.ts` converts old campaign items when a campaign opens, keeping each original as `_legacy-<file>.json`.)
   - [x] Smoke: clone a published trap, edit it, see it as Custom, delete it. (`npm run test:compendium:ui`, `tools/ui-smoke/compendium-smoke.cjs`: lossless clone on first edit, focus kept, in-place autosave, Custom listing, context-menu delete, new trap and disease.)
5. **Templates and themes**
   - [x] Kit statblocks, compendium pages with edit semantics, kit-to-app adapters, and custom templates/themes in the encounter editor. (2026-11-13: `template/TemplateStatblock.tsx`, `theme/ThemeStatblock.tsx`; published entries come from the built-in data through the existing converters (`src/main/compendium/kit.ts`, `compendium.kitIndex`/`kitGet`). `creature/kit-templates.ts` converts kit content back to the app types. `creature/template-catalog.ts` merges published and campaign entries, and encounters refer to custom ones as `campaign:<id>`. App themes gained an optional pre-parsed `skills`. The converter now keeps the range of a power with no attack roll. The old template and theme browsers are deleted; `TemplateViewer` moved to `creature/TemplateViewer.tsx` for the encounter editor's info window.)
   - [x] Round-trip tests on all published templates and themes. (`tools/content/convert/kit-templates.test.ts`: for every published template and theme, the prerequisite agrees over a grid of creatures, applying changes the creature the same way (stats, senses, resistances, power names, bonuses, ranges, defenses), and kit -> app -> kit keeps each power's action, usage, recharge, and range. Exact action type and usage on application differ in 14 entries where the old reader misparses the hand-written strings ("usable while hidden" taken as the usage); the kit reading is the correct one.)
6. **Workshop**
   - [x] Six tabs and statblock editors for every kind (item adapter, generic adapter for kit-native kinds). (2026-11-13: `authoring/KitDraftEditor.tsx` holds one staged-edit wrapper used by `KitDraftEditor` (kit-native statblocks) and `ItemDraftEditor` (`Dnd4eItemEditor` through `common/authoring/item-editor-adapter.ts`, which rebuilds the item on a node-tagged copy and diffs it with the kit adapter). New drafts of every kind open unsaved and are created by their first edit. Comment markers work for every kind (items since the kit item records: `item-*` stat anchors and power node IDs through the item adapter).)
   - [x] Campaign destinations for all kinds; remove libraries; agent tools and skills. (Kit-native kinds save as record envelopes, and updates keep `createdAt` and `basedOn`. Custom records have "Edit in Workshop" on their compendium pages. The `create_library` tool, library destinations, and library search are gone, and `destinations` lists campaigns. Agent tool kinds include template and theme, published templates and themes are in `search`/`fetch`, and the three skills are updated. Tested in `src/main/authoring/service.test.ts`.)
   - [x] Smoke covers one new-kind draft end to end. (`test:authoring:ui`: every kind previews and edits with its statblock, and a trap draft is edited in its statblock, applied, approved, and found as a campaign record.)
7. **Cleanup**
   - [x] Remove `DraftMetadataFields` from normal UI and remove the library code paths. (The field tree survives only as History › Raw fields (advanced), for data no statblock shows, such as clauses.)
   - [x] Update AGENTS.md, TESTING.md, TODO.md, and `docs/AUTHORING.md`.

Phases 1–4 deliver the compendium editing on their own; 5 and 6 build on them.

## Decisions (confirmed 2026-11-12)

- **Record format: envelope.** New-kind records are `{ id, createdAt, updatedAt, basedOn?, content }` with `content` a plain kit object.
- **Libraries: leave on disk.** Stop reading library folders and never delete them; no import step. (The DM had no library entries.)
- **Template references: ids for custom.** Encounters reference custom templates and themes as `campaign:<id>`; published ones keep their names.
- **Scope: separate plan for encounter and combat support.** Traps in encounters and combat, and diseases as tracked afflictions, are out of scope here.

## Risks

- **Size of the extraction.** `Dnd4eCreatureList` is about 450 lines of interleaved state; moving creatures onto `CompendiumPage` can regress keyboard behavior. Mitigation: extract with creatures first and verify hotkeys, autosave, and clone before moving other kinds.
- **Viewer parity.** Replacing viewers with kit statblocks can drop fields the legacy viewers showed. Mitigation: per-kind screenshot comparison on a sample of published entries.
- **Template application.** It depends on a lossless kit-to-app adapter. Mitigation: round-trip tests against the existing converter.
