# 4e DM Dashboard — Agent Context

This is the canonical repository guidance for coding agents. Keep it current as the project evolves.

## What This Is

Electron app for a DM running physical tabletop RPGs. Two windows (DM + Player), D&D 4e only, campaign data stored as JSON on disk. Built with React + TypeScript + Zustand + TipTap + CSS Modules, using electron-vite as the build tool.

## User Profile

- Heavy Vim/keyboard user — wants hotkeys for everything
- Runs PF2e, D&D 4e, and Delta Green
- Strong low-level programmer, new to web/frontend — explain web-specific decisions but don't over-explain general programming
- Wants maximum automation for deterministic game mechanics (auto-decrement conditions, prompt saves, track durations)
- Strongly values human-readable, non-proprietary data (JSON files on disk, not databases)
- Prefers minimal well-known libraries; implement small utilities in-house
- Security-conscious: run npm install/builds inside the devcontainer, never directly on host
- Electron GUI launches from inside the container — Wayland socket, GPU, and env vars are passed through by `dev.sh` / `devcontainer.json`. Launch with `./launch.sh` from a host terminal, or `! npx electron-vite dev -- --ozone-platform=wayland` from inside the container
- App data (campaigns, drafts, homebrew, settings) is in the named volume `tabletop-userdata`, mounted at `/home/node/.config/4e-dm-dashboard`, so it survives the `--rm` container. Removing that volume deletes it

## Working Agreements

- Preserve the human-readable, file-based data model and the main-process-as-source-of-truth architecture.
- Prefer focused changes and small, well-known dependencies. Ask before adding a production dependency.
- Do not discard or overwrite unrelated working-tree changes.
- Run package installation, builds, and tests inside the devcontainer, not directly on the host.
- UI tests and screenshot scripts must not show windows on the DM's desktop: set `FOUR_E_HIDDEN_WINDOWS=1` (windows are created hidden, unthrottled, and rendered offscreen; screenshots come from the `paint` event; `npm run test:authoring:ui` and `test:compendium:ui` do this) and stub `window.confirm`, which would otherwise open a native dialog and block the run.
- When changing behavior, update the relevant project documentation and add or update tests when practical.
- Keep the implementation-status section below current when completing a documented task.
- Shared 4e code (vocabulary, content schema, character snapshot, later the style kit) lives in the `4e-kit` repo, included as the git submodule `vendor/4e-kit` and imported as `@kit`. Clone with `--recurse-submodules`. Change shared code in the kit repo first, commit there, then bump the submodule here; 4ecb consumes the same repo.

## Architecture

- **Main process**: single source of truth. Owns campaign data, combat state machine, 4e rules and compendium.
- **DM renderer**: sends commands via `ipcRenderer.invoke()`, receives state via broadcasts.
- **Player renderer**: receive-only — gets stripped state (no exact HP, no stat blocks).
- **Zustand stores** in each renderer populated entirely from main process broadcasts.
- **State flow**: `DM Renderer → invoke(command) → Main Process → mutate → broadcast to both renderers`
- **4e rules module**: `src/common/rules/` (conditions, HP descriptors, creature-builder benchmarks, settings, class marks, known values) is shared by main and renderer. The compendium lives in `src/main/compendium/`, and 4e UI components live in ordinary feature folders under `src/renderer/components/` (`combat/`, `creature/`, `compendium/`, `campaign/`). There is no plugin registry, user plugin loading, or turn-hook API. The combat engine builds saves, recharges, ongoing damage, and regeneration items itself. The app was multi-system (PF2e, Delta Green) before 2026-11.
- **Combat runs on kit content** (2026-11-13): each combatant carries a kit `Monster` (later `Trap`) in `content`, plus `attribution` for encounter adjustments. The engine and combat UI read it only through `src/common/combat/facts.ts`. Campaign creatures are kit records; published ones are re-parsed from `content/raw` (`src/main/compendium/published-monsters.ts`, served as `compendium.kitGet('monster')`). A clone never stands in for its published original. Encounter templates, themes, level adjustment, and minions apply to the kit monster (`src/common/rules/adjust-monster.ts`). Main builds an encounter's combatants on `COMBAT_INIT` and serves the encounter editor's row previews (`src/main/combat/encounter-combatants.ts`). Combat panels render the kit monster through `components/combat/combat-view.ts` / `components/creature/kit-view.ts`. Encounters also hold traps (`Encounter.traps`, `campaign/EncounterTraps.tsx`); traps enter combat as `kind: "trap"` combatants, hidden unless their row is visible. Traps without initiative stay out of the order, in the Triggered traps strip (`combat/TriggeredTraps.tsx`). HP-less traps are stopped with Disable, never by damage (`facts.hasHitPoints`, `facts.isDefeated`). Locations note traps too (`Location.traps`, references only), shown as collapsible statblocks on the location page and in the map's location sidebar (`campaign/LocationTraps.tsx`; shared trap references and search in `trap/trap-refs.tsx`). Encounters linked to a location also get its traps (hidden, counted in XP). Diseases: power cards show chips for the diseases their text names (`disease/disease-refs.tsx`, rules in `src/common/rules/diseases.ts`); in combat the disease name in a power's text applies like a condition (click it, then the PCs to expose); PCs carry `diseases` (exposed or a stage) with a Diseases panel on the PCs page (`campaign/PcDiseases.tsx`); the encounter editor lists its diseases.
- **Effects vs Conditions**: Conditions = 4e conditions defined in `src/common/rules/dnd4e.ts`, automated by the combat engine. Effects = DM-created ad-hoc during combat that can apply/remove Conditions.
- **Theming**: CSS custom properties in three layers. (1) `vendor/4e-kit/styles/tokens.css`: the tokens shared with 4ecb (`--background`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--danger`, `--power-*`, `--font-ui`/`--font-display`/`--font-card`, `--radius`), a light set plus a dark set selected by `<html data-theme="dark">` (with no attribute, the OS decides). (2) `src/renderer/styles/theme.css`: app tokens derived from the kit ones (`--hp-*`, `--cond-*`, `--player-*`, `--sb-*`, `--on-fill`, ...) and the legacy `--color-*` aliases. (3) `global.css`: element defaults, EB Garamond (`@fontsource/eb-garamond`), TipTap content. Both windows import `global.css`.
- **Theme preference** (system / light / dark, default system): main owns it in `<userData>/app-settings.json` (`src/main/data/app-settings-store.ts`, atomic write), sets Electron's `nativeTheme.themeSource` to it, and broadcasts `SYNC.APP_SETTINGS` to both windows on change (`CMD.SETTINGS_SET_THEME`). Each window runs `initThemeSync` (`src/renderer/theme.ts`), which resolves the preference with the kit's `resolveTheme` and sets `data-theme`. The Player window follows the DM's choice. Not in localStorage.
- No router — ContentArea switches on Zustand store state.

## Implementation Status

The application is functional across its main workflows:

- Campaign data and entities are stored as human-readable JSON with atomic writes and differential renderer broadcasts. Creatures, items, traps, diseases, templates, and themes are kit-native campaign records: a `CampaignRecord` envelope (`id`, timestamps, optional `basedOn`, kit `content`, optional `art` with image, token, and token crop) in `campaigns/<id>/{creatures,items,traps,diseases,templates,themes}/`. Legacy creature and item files convert when a campaign opens (`src/main/data/legacy-creatures.ts`, `legacy-items.ts`; originals kept as `_legacy-<file>.json`). Their compendium pages (`compendium/RecordCompendium.tsx`, kinds in `record-kinds.tsx`), including Creatures (`MONSTER_KIND`: `creature/MonsterStatblock.tsx`, the creature viewer and the benchmark editor through `monsterToEditor`/`monsterFromEditor`, with art and pop-outs), list published and Custom entries with the Creatures page's edit semantics (clone on first edit, autosave, delete), and published entries render through `compendium.kitGet` (converted to the kit). Campaign templates and themes apply in encounters via `creature/template-catalog.ts` (custom refs `campaign:<id>`).
- Campaign management includes notes, creatures, encounters, locations, items, maps, player characters, images, and compendium browsing/editing. Campaign items, traps, diseases, templates, and themes are kit records (`CampaignRecord` envelopes, `src/common/campaign-records.ts`) edited on their compendium pages (`RecordCompendium`). Legacy campaign items convert when a campaign opens (`src/main/data/legacy-items.ts`; originals kept as `_legacy-<file>.json`).
- The combat tracker includes initiative entry and reordering, current/inspected stat blocks, damage/healing, conditions and effects, delay/ready actions, reaction tracking, turn automation, and combat logging.
- The player window supports combat and story displays while receiving player-safe state.
- The app is D&D 4e only: the 4e rules module and UI components are imported directly (PF2e, Delta Green, user plugins, the system picker, and URL import were removed in 2026-11).
- Renamed from "Tabletop Dashboard" to "4e DM Dashboard" (2026-11-12). On first launch, `src/main/data/migrate-user-data.ts` moves the old `~/.config/tabletop-dashboard` userData dir to the new location.
- Restyled toward 4ecb (2026-11-12, first half of TODO section 4): 4e-kit color tokens in light and dark themes with a stored system/light/dark preference, 2px corners, 4ecb's focus ring and button hover, EB Garamond headings, Arial stat blocks and power cards (the proprietary Mentor/DnDVecna fonts are gone), power-tone card headers, palette-derived condition pills, the Player window on tokens, and styled TipTap notes. Icons, the dialog/button/table components, and the remaining hardcoded colors (listed in `TODO.md`) are still to do.
- Content pipeline (TODO section 5): parser fixes, the kit-schema converter, validators and the agent harness exist, on 4e-kit schema v12 (v3 from pilot 1: use-power, zone, summon, ...; v4 from pilot 2a: redirect-attack, crit-range, power-restriction, status, opportunity-reach, typeChoice, the `until` duration, `skillNotes`, trap `speed`; v5 from pilot 2b: `Attack.altBonus`, `'unknown'` vs/usage, which validators flag for review; v6 from pilot 2c: clause `if`/`unless` as exact printed fragment(s) outside the clause's own quote, `optional: true` for options; v7 from full-run chunk 1: `difficult-terrain`, move fly/move, status `no-provoke`, `who` lists, `Aura.rangeIf`, condition `escapeDc`, and damage quotes that need only the dice, not "damage"; v8 from chunks 1-3: `charge`, `disease` (diseaseId filled on apply), `reroll`, `action-point`, `who` rider/mount, the `this-power` duration, `Monster.savingThrowNotes`; v9 from chunk 5: `Monster.defensesIf` for printed conditional defenses, filled by the parser, and the `sense` clause; v10 from chunk 6: the `choice` clause for either/or outcomes (option clauses quoted inside its span, one level deep), grants-ca to rider/mount/ally, skill and ability check modifier stats, reroll `what` lists, and "falls asleep" as unconscious; v11 from chunks 6-7: the `speed` clause, status `no-concealment`, modifier stat `initiative`, `saveModifier` on condition/ongoing-damage, `Aura.rangeText` for "aura sight"; v12 from chunks 8-10: damage `duration`/`by`/`per`, dice heal and temp-hp amounts, healing and action restrictions, `forced-movement`/`recharge` modifiers, the `automatic`, `lose-resistance`, `immunity`, `end-effect` and `extra-action` clauses, `Attack.name`, `Monster.hpIf`, regeneration `suppressedText`). Pilots ran on branches `pilot-1`, `pilot-2`, `pilot-2b-*` and `pilot-2c` of the content repo; the full run is on `full-run` (chunks 1-10, the first 2200 monsters, done; `pilot/rerun-after-v12.json` lists 429 to re-clean, including the 121 of `rerun-after-v11.json`; `content:patch-defenses-if` has run). Agent flow: `content:agent:briefs` (`--sample <file> [--tier]`, or `--kind <kind> --chunk <start>:<count>` for a slice of all entries sorted by id, skipping agent/human provenance; `--tag <name>` writes `pilot/briefs-<name>/` with replies in `pilot/responses-<name>/`) writes per kind a `<kind>-rules.md` (steps, rules, examples, schema) and `<kind>-batch<k>.md` briefs of up to `--batch-size` (default 5) entries, closed early at `--max-chars` (default 36000) so each file fits one Read; `--batch-size 1` writes self-contained per-entry briefs. Each agent Reads the rules file and its batch brief, writes each reply with the Write tool (structured clauses give `quote`, never `at`; unparsed ones are just `{text}`), and runs that entry's `--check` command; `content:agent:apply-all` applies all replies later. The brief's quote and `if`/`unless` rules mirror `src/common/authoring/spans.ts`; change them together. The converter re-parses monsters and traps from `content/raw`. The app still reads `content/parsed/`. Branch `content-v6` must be merged into `roadmap` after the authoring work is committed (see TODO section 5).
- `npm test` (Vitest: combat engine, combat facts and monster conversion over the whole corpus, encounter adjustment snapshots for every template and theme, app settings, color helpers, content parser, converter, validator, agent-harness, authoring adapter, campaign record, and template round-trip suites), `npm run build`, `npm run typecheck:node`, `npm run test:authoring:ui`, `npm run test:compendium:ui`, and `npm run test:combat:ui` pass in the devcontainer as of 2026-11-13.

Agent-assisted custom content authoring has an initial implementation (2026-11-12): the Workshop sidebar page (formerly "Content workshop"), main-owned JSON drafts/history, direct DM edits that agents can iterate on, semantic comment anchors, metadata reconciliation, destination-aware approval/save to campaigns with recovery, and CLI/local MCP tools (homebrew libraries were removed 2026-11-13). Workshop monsters are edited with the Creatures compendium editor itself (`Dnd4eCreatureDetails`); `src/common/authoring/creature-editor-adapter.ts` maps its edits to field-level draft patches, preserving kit-only mechanics. Items use the item compendium editor through `item-editor-adapter.ts`; traps, diseases, templates, and themes use kit-native statblocks (`trap/`, `disease/`, `template/`, `theme/` under `src/renderer/components`) that are both viewer and editor, shared with their compendium pages, through `kit-editor-adapter.ts`. Raw field editing is only under History. Comments and review findings anchor to stat block lines and powers through an optional `AnnotationContext` (`src/renderer/components/creature/annotations.tsx`) that the shared viewer and editor render only when a provider exists. Monster preview uses the existing viewer; campaign imports preserve kit content in `authoredContent` alongside a legacy projection. All six kinds can be authored and saved to a campaign. The three skills live in `skills/`. Shared authoring validators/quote helpers are in `src/common/authoring/` with compatibility exports under `tools/content/`. See `docs/AUTHORING.md` for usage and limits, `docs/agent-content-authoring-plan.md` for the design, `docs/campaign-content-and-editors-plan.md` for the campaign records and statblock editors for all six kinds (done; items are kit records too), and TODO section 10 for remaining refinements. No embedded LLM or new arbitrary power automation is included.

Workshop editing without a draft model (2026-11-13): editors apply edits after a short pause through `src/renderer/components/authoring/live-edits.tsx` (merge rules in `src/common/authoring/merge.ts`: agent changes to other fields merge; a same-field change asks **Keep mine** / **Use the agent’s**). One **Save to <campaign>** button; later saves update the entries the first save wrote (destinations keep `entityId`/`expectedHash`). The draft keeps its last `receipt` after edits, records `lastChange` per event, and `versions` lists dated versions with readable field changes (`src/common/authoring/diff.ts`). New Workshop drafts default to the open campaign, and the sidebar shows which campaign is open (or none). Monster math is `published-rules-v2` (`src/common/rules/benchmarks.ts`, cited by book and page; builder and authoring share `monsterHp`/`rankAdjustments`), item math is in `src/common/rules/items.ts`, and the authoring catalog converts monsters and traps from `content/raw` through `tools/content/convert/published.ts`.

Authoring CLI connection discovery was verified against the running devcontainer in the Shadow usability test: the default `~/.config/4e-dm-dashboard/authoring/connection.json` works without a flag. Setup examples now use automatic discovery; custom locations still use `--connection` or `FOUR_E_AUTHORING_CONNECTION`.

Current planned implementation work is maintained in `TODO.md`. Historical completed batches are recorded in `CLEANUP.md`, `issues.txt`, `tasks.md`, and `feedback.md`.

## Key Files to Know

| File | Role |
|------|------|
| `electron.vite.config.ts` | Build config — dual renderer entry points |
| `src/common/ipc-channels.ts` | All IPC channel names (CMD.* and SYNC.*) |
| `src/common/types/system-plugin.ts` | Types for the 4e rules module (conditions, HP descriptors, creature builder config, compendium provider) |
| `src/main/combat/combat-engine.ts` | Combat state machine (most complex logic) |
| `src/common/combat/facts.ts` | Everything combat reads from a combatant's kit content (saves, defenses, damage modifiers, regeneration, revival, powers and recharges in `usedPowers` order) |
| `src/common/rules/adjust-monster.ts` | Encounter templates, themes, level adjustment, minion on a kit monster, with attribution |
| `src/main/data/campaign-store.ts` | Campaign data CRUD + file I/O |
| `src/main/windows.ts` | BrowserWindow creation + broadcast helpers |
| `src/renderer/stores/ui-store.ts` | ViewMode type drives all navigation |
| `src/renderer/components/layout/AppShell.tsx` | Top-level DM layout |
| `vendor/4e-kit/src/` | Shared 4e vocabulary, content schema (`schema.ts`), character snapshot, theme preference (`theme.ts`) (submodule, alias `@kit`) |
| `vendor/4e-kit/styles/tokens.css` | Shared design tokens (4ecb colors for both themes, fonts, shape) |
| `src/renderer/styles/theme.css` | App tokens derived from the kit tokens, plus the legacy `--color-*` aliases |
| `src/renderer/theme.ts` | `initThemeSync`: applies the stored theme preference to a window (DM and Player) |
| `src/common/rules/dnd4e.ts` | 4e rules module (conditions, HP descriptors, builder benchmarks, settings) |
| `src/main/compendium/compendium.ts` | Loads the parsed compendium JSON from `content/parsed/` |
| `tools/content/` | Parsers and build scripts that turn `content/raw/` into `content/parsed/` (`npm run content:build`) |
| `tools/content/convert/` | Parsed content -> kit schema, written to the private content repo (`npm run content:convert`) |
| `tools/content/validate/` | Shape, clause-span and DMG math-band validators (`npm run content:validate`) |
| `tools/content/agent/` | Agent cleaning harness: tiered sampler, brief template (`prompt.md`), rules-file and batch brief writer with `--chunk` slices, quote-to-span resolution, apply / `--check` / apply-all, `patch-defenses-if.ts` |
| `~/Projects/4e-content` | Private content repo (WotC-derived, never publish): one kit-schema JSON file per entry, with provenance |

## Known Issues / Next Steps

- `TODO.md` is the authoritative implementation backlog.
- `TESTING.md` is a retained manual regression checklist; it is not an implementation backlog.
- The production build is green, but `npm run typecheck:web` still exposes older TypeScript project-boundary, alias, and component-typing issues that electron-vite does not require for bundling.

## Design Spec

Full spec is in `SPEC.md` at the project root.
