# Campaign creatures as kit records

Status: done 2026-11-13. Decided (art field on the record; creatures on the shared compendium page; no clone substitution in encounters). TODO section 3 ("adopt the kit's
Monster type"); follows `docs/encounter-traps-and-diseases-plan.md`, which moved combat onto kit
content and left stored creatures in the legacy shape.

## Where things stand

- **Storage.** `campaigns/<id>/creatures/<id>.json` holds the legacy `Creature`: top-level `name`,
  `hp`, `maxHp`, `imageId`, `tokenImageId`, `tokenCrop`, `compendiumId?`, a `statBlock` record, and
  `authoredContent?` (kit Monster) for creatures saved from the Workshop. Every other kind is a kit
  `CampaignRecord`.
- **Creatures page** (`Dnd4eCreatureList.tsx`). Merged index (published + `buildCreatureIndex`
  Custom rows); clone on edit copies `compendium.get(id)` (legacy shape) and keeps `compendiumId`;
  edits go through `Dnd4eCreatureDetails` straight into `statBlock`; debounced autosave; published
  entries get images through compendium annotations, Custom ones on the creature.
- **Bug.** A Workshop-saved creature edited on the Creatures page changes only `statBlock`; its
  stale `authoredContent` still wins in combat (`creatureToMonster`) and on the full-page view.
- **Combat** converts every campaign creature at combat start (`creatureToMonster`); published
  monsters are re-parsed from `content/raw`.
- **Workshop** edits a kit Monster with `Dnd4eCreatureDetails` through `creature-editor-adapter.ts`
  and saves `monsterToCreature(content)` over the previous file (keeping images).
- **Other readers of `statBlock`:** `buildCreatureIndex` (level, role, modifier, size, type, origin,
  alignment, xp), the encounter editor (`resolveInfo`, auto-minion, previews), CommandPalette and
  HomeView (names, counts), `CreatureEditor` (full page), the viewer.

## Goal

One format: campaign creatures are `CampaignRecord<Monster>` like every other kind. The creature
editor edits kit content (as the Workshop already does), combat reads it directly, and the legacy
`Creature` shape remains only as the viewer/editor's internal model until those take kit data.

## Design

### Record (decided: art on the record)

`creatures/<id>.json` becomes `{ id, createdAt, updatedAt, basedOn?, content: Monster, art? }`, where
`art = { imageId?, tokenImageId?, tokenCrop? }` (campaign presentation, not monster data). `basedOn`
is `published/creature/<id>` for clones (replacing `compendiumId`).

### Migration

On campaign open (like items): each legacy creature file converts with `creatureToMonster` (moved
from `main/combat/monster-source.ts` to `main/data/legacy-creatures.ts`), images move to `art`,
`compendiumId` to `basedOn`; the original is kept as `_legacy-<file>.json`. A creature with
`authoredContent` keeps it, unless its `statBlock` was edited after the Workshop save (the bug
above), in which case the edited `statBlock` wins (compare against `monsterToCreature(authoredContent)`).
Running again changes nothing.

### Published monsters as kit content

`compendium.kitGet('monster', id)` serves published monsters converted from `content/raw` (the
`publishedMonster` cache), so cloning, previews, and the Workshop's Copy existing all start from the
same lossless kit Monster. `compendium.get` (legacy shape) goes away.

### Creatures page (decided: Option B, the shared page)

- **Option A: keep the current page, kit-backed.** `Dnd4eCreatureList` keeps its
  layout, image panel, pop-outs, published-entry images (annotations), and benchmarks; underneath it
  reads and writes records, and edits go through the creature adapter (kit Monster ⇄ editor model,
  field-level), the way items use `itemFromEditor`. Smallest UI change, nothing the DM uses moves.
- **Option B (chosen): move onto `RecordCompendium`** with a `MONSTER_KIND`, adding the creature extras
  (image panel, annotations, pop-outs) to the shared page. One page for every kind, but it means
  rebuilding features the creature page has that the others don't.

### Clones and encounters (decided: Option A, no substitution)

Today a campaign clone of a published monster silently stands in for it in encounters
(`encounter-combatants` picks the clone by `compendiumId`), while the Creatures list shows both.
- **Option A (recommended): no substitution.** An encounter row means what it says: `compendiumId`
  is the published monster, `creatureId` the campaign one. Clones are separate entries (as the list
  already shows). Explicit, no surprises; to use your edited version, add it.
- **Option B: keep substitution**, now keyed by `basedOn`, and show it in the Creatures list (the
  published row marked "replaced by <clone>").

### Everything else

- `buildCreatureIndex` reads `content` (level, role, rank, size, type, origin, alignment, xp).
- Encounter editor: campaign rows read the kit monster (`resolveInfo`, auto-minion from rank).
- Workshop saves `newRecord` like the other kinds (keeping `art` from the previous file); Edit in
  Workshop works on records; `campaignProjection` and `authoredContent` go away.
- Combat: `creatureToMonster` reduces to reading `content`.
- `CreatureEditor` (full page) edits the record with the same editor (no more read-only branch).
- Viewer and editor keep their legacy-shaped props for now (through `monsterToCreature` /
  the adapter); moving them to kit props is TODO section 4's card pass 2.

## Phases

1. Record type, migration (with the authoredContent/statBlock reconciliation), `kitGet('monster')`,
   tests over every parsed monster as a legacy campaign creature.
2. Creatures page, full-page editor, encounter editor, index, command palette on records.
3. Workshop save/Edit in Workshop on records; remove `campaignProjection`, `authoredContent`,
   `compendium.get`, and combat's conversion.
4. Docs, TESTING checklist, UI smokes (Creatures page clone/edit/new, migration of a legacy creature,
   Workshop round trip, combat).

## Status 2026-11-13: done

- Records: `CreatureRecord` (`CampaignRecord<Monster>` with `art`); `creature` is a record type;
  `checkRecord` validates `art`. Clones record `basedOn: published/creature/<id>`.
- Migration (`src/main/data/legacy-creatures.ts`, on campaign open, originals kept as
  `_legacy-<file>.json`): stat blocks convert with the content converter plus the editor fields for
  power text; Workshop creatures keep their kit content, and stat-block edits made after a Workshop
  save are applied onto it through the creature adapter (`monsterFromEditor`), so the edits win and
  kit-only mechanics survive.
- Published monsters: `compendium.kitGet('monster')` (`published-monsters.ts`, from `content/raw`);
  the legacy `compendium.get`/`resolve` channels are gone.
- Creatures page: `RecordCompendium` with `MONSTER_KIND` (filters: role, rank, type, size, origin);
  `MonsterStatblock` views through the creature viewer (art, pop-out) and edits with the benchmark
  editor through `monsterToEditor`/`monsterFromEditor`. The shared page gained optional per-kind art
  (record `art`; compendium annotations for published entries, copied into a clone) and pop-outs.
  `Dnd4eCreatureList`, `CreatureEditor`, and `AuthoredEntity` are removed; the creature view route
  opens the shared page on that creature.
- Encounters and combat read records; no clone substitution. Workshop saves write records (keeping
  `art` and `basedOn` on update); `campaignProjection` and `authoredContent` on new data are gone.
- Tests: `legacy-creatures.test.ts` (Workshop creature as is, later edits applied, file migration),
  creature adapter (`monsterFromEditor` keeps kit-only mechanics, appends/removes), the fidelity test
  over every published monster, `test:combat:ui` (a legacy creature file converted on open and used
  in combat), `test:compendium:ui` (published preview, pop-out, art carried into a lossless copy, new
  creature, Edit in Workshop).
- Still legacy-shaped inside: the creature viewer and editor take the `Creature` model (through
  `monsterToCreature`/the adapter); moving them to kit props is card pass 2 (TODO section 4).
