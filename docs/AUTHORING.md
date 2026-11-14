# Workshop and agent authoring

Working with an AI agent needs no mode or separate page (2026-11-13; it was a "Workshop" page before). It is off by default: turn on Settings › AI agent › **Let a local AI agent connect** to open the local connection (the socket and `connection.json`) and show comment markers. With it off, nothing listens and the compendium looks as it always did. Every campaign entry is edited through its working copy: a draft in app data that both you and the agent edit. Main writes each version straight into the entry, and folds anything that changed the entry another way (its art, an old migration) into the working copy, field by field, so there is no accept step and nothing to re-sync. The agent finds what you have open with `current_entry` (or any campaign entry with `edit_entry`). The UI never shows drafts as such.

## DM workflow

1. On a compendium page (Creatures, Items, Traps, Diseases, Templates, Themes), select an entry to see its stat block and press **Edit** for the editor, as always. With the agent connection on, both show comment markers on a campaign entry's lines, and comments on the whole entry below it. Ask your agent to work on the entry you have open: its changes appear in the stat block or editor as it makes them, merged with yours (an agent change just appears; if you were editing the same field at that moment, your value wins and the agent's value stays in its history). Every change goes straight into the entry (encounters see it at once; a combat already running keeps its creatures as they were when it started). Every change is saved, as the compendium editor always did; checking the rules metadata (`validate`) is the agent's job, and the dashboard shows no validation notes. To undo, ask the agent: it keeps every version (`versions`) and can restore any of them (`restore_draft`). **+ new** and **Copy to campaign** (a published entry, keeping its source and art) open an unsaved working copy that your first change adds to the campaign. When you ask your agent for something new, it goes straight into the open campaign's list as an ordinary entry (with no campaign open, the agent is refused); an agent's copy of a published entry (`create_draft` with `from`) records its source and art exactly as **Copy to campaign** does. Agent-made and hand-made entries are the same records, shown and edited by the same code, and both are stamped `human` provenance (a copy keeps the published entry's). Working copies from older versions that never reached their campaign are written into it when the campaign opens. When an agent asks the app to show its work (`open_review`), the entry opens on its page. Deleting an entry archives its working copy to `authoring/archive/` in app data. Settings › **AI agent** (once on) explains the workflow and has **Copy connection path**. Compendium pages open without a campaign (published entries only); editing needs one.
2. Edit directly in the editor: for every kind it is the compendium's own editor (for creatures with benchmark hints, power cards, damage dice, the image panel, and the description inside the stat block). Edits go into the working copy as you make them, after a short pause; there is no Apply step. They are recorded as yours (listed under **Your edits**); the agent treats them as your direction and can revise them when you ask. If the agent changes the draft while you are editing, your your edits go on top of its changes without asking, and a field you both changed keeps your value (the agent's value stays in its history). When the agent's own next edit is based on an older version, it is refused with a list of what you changed since, and the agent is told to ask you before overwriting any of it. An edit that could not be saved shows why, with **Try again** and **Undo it**. Leading hit damage ("2d6 + 3 poison damage") appears in the damage editor, and the rest of the hit text stays in the Hit field. Unedited prose keeps its exact wording. A power's **Special** line has its own field (**+ special** adds one). Kit-only mechanics the compendium editor has no control for (secondary attacks, failed saves, clauses) are preserved and shown in the stat block preview. Every other kind also edits with its compendium statblock: items with the item editor (through `item-editor-adapter.ts`), and traps, diseases, templates, and themes with their kit-native statblocks (the same components as their compendium pages, through `kit-editor-adapter.ts`). Raw field editing is only under **History › Raw fields (advanced)**, for data no statblock shows.
3. Comment on a stat line, power, trait, or the notes with the marker at its right edge (it appears on hover). A marker with items shows one icon per kind: **?** open question, **‼** Problem, **!** Risk, **💬** open comment, **i** Note; hover it for counts. The thread opens beside the line; Ctrl+Enter posts, Escape closes. Threads list the newest comment first, each cut to its first sentence (click to expand) with only the latest reply shown. Questions from the agent are marked **?** (needs an answer); severity markers (**‼** Problem, **!** Risk, **i** Note) are the agent's balance-review findings, for you to answer or act on. Comments on the whole entry, and on entries that were since removed, are under **Comments on the whole creature** below the stat block. Reply and resolve threads explicitly. The agent closes questions it asked once you have answered them (its closing reply records your answer) or a redesign has made them moot; it replies to your own threads but leaves resolving them to you.
4. Tell your agent to continue in its terminal; it reads your edits and comments from the working copy.
5. Rules metadata (the structured clauses combat automation reads) is the agent's to keep in step with edited text: clause spans follow edited wording automatically, and the agent is told which edited entries to re-check (`stale`). Balance reviews and their findings appear as comment markers on the lines they concern.
6. History is the agent's, not shown in the dashboard: `versions` lists dated versions, newest first, with who changed which fields, `history` returns one in full, and `restore_draft` makes an earlier one the newest (it goes into the entry like any edit). Ask the agent to revert when you reject a change.

Entries appear on their compendium pages labelled **Campaign** or **Library**. New content goes into the campaign open in the dashboard; the agent puts it into the Library (custom entries shared by every campaign, in `<userData>/library/`) when the DM asks for shared content (`create_draft` with `destination: "library"`) or no campaign is open. Campaigns use Library entries live, like published ones, so an edit to one shows in every campaign that uses it; for a one-campaign change, copy it into the campaign (`from: "library/<kind>/<id>"`, the DM's **Copy to campaign**). `current_entry` and `edit_entry` give a Library entry's `campaignId` as `"library"`. Writes keep the entry's imagery and metadata.

A working copy belongs to exactly one campaign or Library entry, fixed when it is created: it cannot be moved (`/destinations` is not patchable); copy the entry instead. Deleting the entry or its campaign archives the working copy, and at startup the app archives any whose campaign or entry is gone (under `authoring/archive/`). Before each write, a change made to the entry another way is folded in: per top-level field, a field the working copy changed since the last write keeps its value, and any other takes the entry's.

## Agent connection

The app starts a local authenticated socket bridge. The CLI automatically uses `~/.config/4e-dm-dashboard/authoring/connection.json`, so normal use requires no copied path. **Copy connection path**, in Settings › Editing with AI, copies the connection-file path for custom setups. The file contains a credential; supply its path to the CLI, not its contents to a model/chat. No network listener is opened.

Run commands from the repository in the Nix shell (`nix develop -c ...`), as the user running the app:

```sh
npm run --silent authoring -- list_drafts
npm run --silent authoring -- create_draft request.json
npm run --silent authoring -- get_draft request.json
```

Arguments are a JSON object read from a file or `-` for stdin. For a custom user-data location, use `--connection /path/to/connection.json` or `FOUR_E_AUTHORING_CONNECTION` (the flag takes precedence). If automatic discovery fails, check that the dashboard and CLI run as the same user, then use the path from **Copy connection path** in Settings. `scaffold`, `benchmarks`, `validate`, and `search-local` work without the running app. `search-local` accepts a `contentRoot` path (the directory holding `raw/` and `parsed/`; the older `parsedRoot` still works); its default is `content` under the working directory. Monsters and traps are re-parsed from `raw/` with their printed hit, miss, and effect text, as in the content repo.

For an MCP client, configure a stdio server using the official SDK adapter. **Use `--silent` with npm so npm banners do not corrupt the protocol.** Example command/arguments (the client starts it in the Nix shell; `nix develop` must run in the repository, not with `path:.`):

```json
{
  "command": "nix",
  "args": ["develop", "--quiet", "-c", "npm", "run", "--silent", "authoring", "--", "--mcp"],
  "cwd": "/path/to/tabletop-dashboard"
}
```

The socket and connection file stay in the user's own config directory. The server uses the SDK's stdio protocol and advertises only authoring tools; approval and arbitrary file/code operations are absent. It is local tooling, not a remotely hosted MCP service. Adapter source: `tools/authoring/cli.ts`; tool schemas: `tools/authoring/tools.ts`.

The three repository-owned skills are in `skills/4e-author-content`, `skills/4e-find-precedents`, and `skills/4e-review-balance`. Copy or symlink these into your agent's skill directory, or invoke them by their repository paths. They are ordinary Markdown and refer to this repository for tool/schema details. Installation is intentionally not automatic.

## Example tool arguments

Create a baseline draft:

```json
{"kind":"monster","name":"Thorn witch","level":8,"role":"controller","rank":"standard","intent":"Accurate attacks, low direct damage, fast but brittle."}
```

Fetch its current state with `{"id":"DRAFT_ID"}`. Stable IDs for powers/traits are in `nodes`. Patch individual fields, rather than submitting an old full snapshot:

```json
{
  "id":"DRAFT_ID",
  "revision":1,
  "changes":[
    {"path":"/content/hp","value":48},
    {"path":"/decisions","value":"Low HP offsets mobility; the DM wants the curse preserved."}
  ]
}
```

For named nodes use paths such as `/content/powers/@POWER_ID/attacks/0/hit/text`. Append with `/append/powers` (or insert at a position with `/append/powers/INDEX`), remove with `/remove/powers/@POWER_ID`, and reorder with `/order/powers` plus the full ID array. Applied DM edits are listed in `overrides`. Agents may revise them; doing so removes that path (and anything under it) from `overrides`, and deriving clauses under DM prose keeps the DM marker on the prose. DM edits still in the editor are never overwritten: they merge onto an agent revision field by field, and the DM chooses when both changed the same field.

`suggest_numbers` accepts `id` plus an optional `recipe`: `hpMultiplier`, `defenseOffsets`, `initiativeOffset`, `speed`, and `powers` keyed by stable node ID with `accuracy`, `damageBand` (`low`/`medium`/`high`), and `limited`. It returns proposed changes, the DM-edited fields it left unchanged (`protectedFields`), and damage guidance without applying them. Save the recipe in `/recipe`; apply coherent text and clause changes separately. These offsets are design choices, not official balance equivalences.

Power clauses may use `quote` rather than `at`; code resolves spans. An unparsed clause can be `{"text":"exact words from the owning line"}`. The existing validator checks shape and span plausibility; the agent and DM still review semantic fidelity.

## Storage and limits

- `<userData>/authoring/drafts/<id>/current.json`: current envelope; `history/` contains immutable event snapshots, and `sync.json` records the last write into each entry (its content hash and the content, the merge base for outside changes), a new entry's campaign-side fields, or why the latest version was not written. Working copies of deleted entries move to `<userData>/authoring/archive/`. Review/comment events do not change the content revision.
- Saved entries of every kind: `campaigns/<id>/{creatures,items,traps,diseases,templates,themes}/<entry id>.json`, or `library/...` for the Library, an envelope (`id`, `createdAt`, `updatedAt`, optional `basedOn`, optional `art`) around the kit `content`. Library art is in `library/assets/images/`.
- Monster math is labeled `published-rules-v2` (drafts made earlier say `dashboard-dmg-v1`): the latest published rule for each number, cited by book and page in `src/common/rules/benchmarks.ts`. Role statistics are DMG p. 184; damage and accuracy follow the DMG errata that Monster Manual 3 introduced (Rules Update 08/2012 p. 46: one-target and several-target damage, brutes +25%, limited +25% to +50%, level + 5 vs. AC and + 3 vs. other defenses); elites are twice standard HP and solos four times, with no defense bonus for either (DMG2 p. 133); minion damage is DMG2 p. 133; DCs are Rules Compendium p. 126. The creature builder uses the same functions. Calculation supports levels 1–30. Items have their own tables (`src/common/rules/items.ts`): value by level (PHB p. 223, the same in RC p. 278), sale price by rarity (RC p. 278), and enhancement bonus by level (PHB p. 225). `benchmarks` with `kind: "item"` returns them with the five-level version ladder, the item scaffold takes the table price, and validation flags a price or enhancement bonus that differs (published items match exactly, apart from a few misprints). Consumables, rituals, and alchemical items have no rule table and are not checked; use precedents. Item effects and complex balance choices still need precedents and judgment.
- Compendium search combines text and available structured clauses. The current parsed-content adapter does not imply the cleaned content pack is installed. Results label their source; metadata coverage may be incomplete.
- No automatic runtime implementation of linked summons, transformation, permanent curses, or arbitrary power effects is added. The rules remain visible for DM adjudication.
- Every kind edits with the statblock its compendium page uses. Creatures and items go through adapters (`creature-editor-adapter.ts`, `item-editor-adapter.ts`) that turn the legacy editors' edits into field-level patches; the other kinds edit kit content directly (`kit-editor-adapter.ts`). Revision comparison still shows JSON; semantic diffs are a follow-up.
- Templates and themes made in the Workshop or on their compendium pages can be applied in the encounter editor alongside the published ones (`creature/template-catalog.ts`).
- Traps and diseases are not yet used in encounters or combat (a separate plan).

Protocol references: [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [tool interface](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). The adapter delegates protocol handling to the official SDK.

## Development checks

Run `npm test`, `npm run typecheck:node`, and `npm run build` in the Nix shell (`nix develop -c ...`). `npm run test:authoring:ui` then launches an isolated Electron smoke test with temporary user data and hidden windows and captures `out/authoring-smoke.png` and `out/authoring-edit-smoke.png`. It drives the native creature editor by its printed labels and does not modify real campaigns. Skill metadata was checked with the skill-creator validator. Existing renderer-wide TypeScript errors are tracked in AGENTS.md; the new authoring modules must not add errors.
