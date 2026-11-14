# Content packs: format, install, and loading

TODO section 8.1–8.3, built 2026-11-14. Published 4e content (monsters, items, traps, diseases, templates, themes,
the glossary, and the condition text) leaves the source tree and reaches the app as a **content pack**
that the DM imports. Download and "Check for content update" wait until hosting is decided; this plan
covers the local import only.

## The pack file

A zip (`4e-content-<version>.zip`) built from the private content repo (`~/Projects/4e-content`) by
`npm run content:pack`:

```
manifest.json
monsters/<id>.json     one kit Monster per file, as in the content repo
items/<id>.json        kit Item
traps/<id>.json        kit Trap
diseases/<id>.json     kit Disease
templates/<id>.json    kit MonsterTemplate
themes/<id>.json       kit MonsterTheme
glossary.json          { [lowercase term]: { name, category, definition, source } }
conditions.json        { [condition id]: short description } (the combat tracker's condition tooltips)
```

`manifest.json`:

```json
{
  "format": 1,
  "content": "2026.11.14-e6b99df",
  "schema": 15,
  "files": { "monsters/monster4940.json": "<sha256 hex>", "...": "..." }
}
```

- `format`: the pack layout version. The app refuses a format it does not know.
- `content`: the content version, the build date plus the content repo's short commit hash.
- `schema`: the 4e-kit schema version of the entries. The app refuses a newer schema than its kit's.
- `files`: every file in the pack except `manifest.json`, with its sha256. A file in the zip that the
  manifest does not list, or a listed file that is missing or whose hash differs, fails the import.

Entries are copied byte for byte from the content repo (pretty-printed, one per file, so a pack is
diffable and the installed files stay human-readable). The `pilot/` and `reports/` folders are not
packed.

### Glossary and conditions in the content repo

The content repo stays the single source for the pack:

- `glossary.json` is in the content repo. `npm run content:convert` copies it there from
  `content/parsed/glossary.json` (built from `content/raw` by `tools/content/build-glossary.ts`).
- `conditions.json` was written once into the content repo from the descriptions in
  `src/common/rules/dnd4e.ts`; the source keeps each condition's id, name, `hasValue`, and the
  automation, with the descriptions removed. App-only states that are not book text (Reacted, Dead,
  the class-mark summaries) keep their descriptions in source. Main fills the others in
  (`src/common/rules/condition-text.ts`) for the rules it serves and the combat engine's player view.
- Templates and themes are already in the content repo (agent-cleaned, v15). The built-in data files
  `monster-templates.ts` and `monster-themes.ts` are deleted; their types and helpers
  (`TemplatePower`, `MonsterTemplate`, `parseSkillModifications`, ...) move to
  `creature/template-types.ts`, so 8.4 can purge the old files by path. The converter no longer
  regenerates templates and themes, and the encounter editor builds its published list from the
  kit entries with `kitTemplateToApp` / `kitThemeToApp`, as it already does for campaign ones.

### Zip handling

No new dependency: a small in-house zip reader and writer (`src/main/content/zip.ts`) on `node:zlib`
(`deflateRaw`, `inflateRaw`, `crc32`). It supports what the builder writes: stored or deflated
entries, no zip64, no encryption, no multi-disk. The reader refuses anything else, and refuses entry
names outside `^[a-z]+/[\w-]+\.json$` or the two top-level files (no `..`, no absolute paths).

## Install

The pack is installed under `<userData>/content/`:

```
content/
  manifest.json
  monsters/ items/ traps/ diseases/ templates/ themes/
  glossary.json conditions.json
  index.json           { content, indexVersion, indexes }: built by the app at install, not part of the pack
```

Import (`CMD.CONTENT_IMPORT`, from a file the DM picks):

1. Read the zip, check `manifest.json` (`format`, `schema`), then inflate every file and check its
   sha256 against the manifest, all in memory or in a staging folder; nothing is written into
   `content/` until the whole pack checks out.
2. Write the files into `<userData>/content.new/`, build `index.json` there.
3. Swap: rename `content/` to `content.old/`, `content.new/` to `content/`, delete `content.old/`.
   Leftover `content.new/` or `content.old/` from an interrupted import are cleaned at startup
   (`content.old/` is restored when `content/` is missing).
4. Drop the in-memory caches and broadcast `SYNC.CONTENT_STATE` (installed version, or none), so the
   DM window reloads its indexes.

`index.json` is a cache the app derives from the entries; if its `content` or `indexVersion` does not
match (the index row shapes changed in an update), the app rebuilds it when the indexes are first
asked for, and saves it only into its own install folder.

## Loading

`src/main/compendium/compendium.ts` reads `<userData>/content/` (or `$FOUR_E_CONTENT_DIR`, which
tests point at a fixture pack's install folder):

- Indexes: `index.json`, the same row types as before (`CompendiumEntry`, `ItemIndexEntry`,
  `TrapIndexEntry`, `DiseaseIndexEntry`), now built from kit entries (`src/common/compendium-index.ts`, which also builds the custom creatures' rows).
- Entries: `getKitEntry(kind, id)` reads `<kind>s/<id>.json` as-is, cached. The converter path
  (`published-monsters.ts`, the legacy `getItem`/`getTrap`/`getDisease`, `resolveCreature`) and the
  `repoTrap` bridge go away, as do the renderer-unused `itemGet`/`trapGet`/`diseaseGet` IPC calls.
- With no pack installed, or a file missing, every index is empty, `getKitEntry` returns null, and
  the glossary and condition text are empty. Campaign and Library content keeps working; an encounter
  row whose published creature is missing shows as missing, as a deleted custom creature does today.
- The authoring catalog (`src/main/authoring/catalog.ts`) lists the installed entries instead of
  converting `content/raw`.

## UI

- **Settings › Content** (a new section in the existing Settings dialog): the installed content
  version (or "No content installed") and an **Import content pack…** button. Errors (bad zip,
  hash mismatch, newer schema) show in the app's error dialog; a successful import needs no message,
  since the version line changes.
- **No pack installed** (decided 2026-11-14: no launch dialog): compendium pages and the pickers
  that list published entries show a short line, "No content pack installed", with the same
  **Import content pack…** button, in place of their empty list.
- Condition tooltips keep today's one-line descriptions, now from the pack's `conditions.json`
  (decided 2026-11-14), not the glossary's full definitions.

## Tests and fixtures

- The UI suites run on the private content repo with the invented fixtures in
  `tools/ui-smoke/fixtures/content-repo` laid over it (`content:pack --overlay ... --install <dir>`,
  through `tools/ui-smoke/test-content.cjs`), pointing `FOUR_E_CONTENT_DIR` at the install: they
  assert on many published entries, so an invented fixture pack would mean rewriting them. That is
  still to do before they can run without the content repo (CI, a public checkout).
- Vitest suites that ran over the published templates and themes run over the content repo instead
  (`tools/content/repo.ts`: `$CONTENT_REPO` or `~/Projects/4e-content`) and skip when it is absent;
  the encounter-adjustment snapshot holds hashes of power and trait text, not the text. The
  published-monster re-parse comparison is retired with the re-parse.
- Unit tests (`src/main/content/pack.test.ts`): zip round trip and refusals, manifest/hash
  verification, index building, the install swap and its recovery, and empty-compendium loading.

## Cleaning the tree (8.3)

- `git rm -r --cached content/` and gitignore it; the files stay on disk for the content pipeline.
  Checking out an older commit and back, or merging this into a branch that still tracks them,
  deletes them from that working tree: back them up first.
- `default.nix` stops copying `content/parsed`; `npm run build` and `nix build` bundle no content.
- 8.4 (history rewrite) is separate and needs explicit go-ahead.
