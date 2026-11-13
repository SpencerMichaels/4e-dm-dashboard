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

## Working Agreements

- Preserve the human-readable, file-based data model and the main-process-as-source-of-truth architecture.
- Prefer focused changes and small, well-known dependencies. Ask before adding a production dependency.
- Do not discard or overwrite unrelated working-tree changes.
- Run package installation, builds, and tests inside the devcontainer, not directly on the host.
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
- **Effects vs Conditions**: Conditions = 4e conditions defined in `src/common/rules/dnd4e.ts`, automated by the combat engine. Effects = DM-created ad-hoc during combat that can apply/remove Conditions.
- **Theming**: CSS custom properties in three layers. (1) `vendor/4e-kit/styles/tokens.css`: the tokens shared with 4ecb (`--background`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--danger`, `--power-*`, `--font-ui`/`--font-display`/`--font-card`, `--radius`), a light set plus a dark set selected by `<html data-theme="dark">` (with no attribute, the OS decides). (2) `src/renderer/styles/theme.css`: app tokens derived from the kit ones (`--hp-*`, `--cond-*`, `--player-*`, `--sb-*`, `--on-fill`, ...) and the legacy `--color-*` aliases. (3) `global.css`: element defaults, EB Garamond (`@fontsource/eb-garamond`), TipTap content. Both windows import `global.css`.
- **Theme preference** (system / light / dark, default system): main owns it in `<userData>/app-settings.json` (`src/main/data/app-settings-store.ts`, atomic write), sets Electron's `nativeTheme.themeSource` to it, and broadcasts `SYNC.APP_SETTINGS` to both windows on change (`CMD.SETTINGS_SET_THEME`). Each window runs `initThemeSync` (`src/renderer/theme.ts`), which resolves the preference with the kit's `resolveTheme` and sets `data-theme`. The Player window follows the DM's choice. Not in localStorage.
- No router — ContentArea switches on Zustand store state.

## Implementation Status

The application is functional across its main workflows:

- Campaign data and entities are stored as human-readable JSON with atomic writes and differential renderer broadcasts.
- Campaign management includes notes, creatures, encounters, locations, items, maps, player characters, images, and compendium browsing/editing.
- The combat tracker includes initiative entry and reordering, current/inspected stat blocks, damage/healing, conditions and effects, delay/ready actions, reaction tracking, turn automation, and combat logging.
- The player window supports combat and story displays while receiving player-safe state.
- The app is D&D 4e only: the 4e rules module and UI components are imported directly (PF2e, Delta Green, user plugins, the system picker, and URL import were removed in 2026-11).
- Renamed from "Tabletop Dashboard" to "4e DM Dashboard" (2026-11-12). On first launch, `src/main/data/migrate-user-data.ts` moves the old `~/.config/tabletop-dashboard` userData dir to the new location.
- Restyled toward 4ecb (2026-11-12, first half of TODO section 4): 4e-kit color tokens in light and dark themes with a stored system/light/dark preference, 2px corners, 4ecb's focus ring and button hover, EB Garamond headings, Arial stat blocks and power cards (the proprietary Mentor/DnDVecna fonts are gone), power-tone card headers, palette-derived condition pills, the Player window on tokens, and styled TipTap notes. Icons, the dialog/button/table components, and the remaining hardcoded colors (listed in `TODO.md`) are still to do.
- Content pipeline (TODO section 5): parser fixes, the kit-schema converter, validators and the agent harness exist, on 4e-kit schema v11 (v3 from pilot 1: use-power, zone, summon, ...; v4 from pilot 2a: redirect-attack, crit-range, power-restriction, status, opportunity-reach, typeChoice, the `until` duration, `skillNotes`, trap `speed`; v5 from pilot 2b: `Attack.altBonus`, `'unknown'` vs/usage, which validators flag for review; v6 from pilot 2c: clause `if`/`unless` as exact printed fragment(s) outside the clause's own quote, `optional: true` for options; v7 from full-run chunk 1: `difficult-terrain`, move fly/move, status `no-provoke`, `who` lists, `Aura.rangeIf`, condition `escapeDc`, and damage quotes that need only the dice, not "damage"; v8 from chunks 1-3: `charge`, `disease` (diseaseId filled on apply), `reroll`, `action-point`, `who` rider/mount, the `this-power` duration, `Monster.savingThrowNotes`; v9 from chunk 5: `Monster.defensesIf` for printed conditional defenses, filled by the parser, and the `sense` clause; v10 from chunk 6: the `choice` clause for either/or outcomes (option clauses quoted inside its span, one level deep), grants-ca to rider/mount/ally, skill and ability check modifier stats, reroll `what` lists, and "falls asleep" as unconscious; v11 from chunks 6-7: the `speed` clause, status `no-concealment`, modifier stat `initiative`, `saveModifier` on condition/ongoing-damage, `Aura.rangeText` for "aura sight"). Pilots ran on branches `pilot-1`, `pilot-2`, `pilot-2b-*` and `pilot-2c` of the content repo; the full run is on `full-run` (chunks 1-7, the first 1300 monsters, done; `pilot/rerun-after-v11.json` lists 121 to re-clean, including the 79 of `rerun-after-v10.json`, and 18 whose only v9 gain `npm run content:patch-defenses-if -- --repo <dir>` adds without an agent). Agent flow: `content:agent:briefs` (`--sample <file> [--tier]`, or `--kind <kind> --chunk <start>:<count>` for a slice of all entries sorted by id, skipping agent/human provenance; `--tag <name>` writes `pilot/briefs-<name>/` with replies in `pilot/responses-<name>/`) writes per kind a `<kind>-rules.md` (steps, rules, examples, schema) and `<kind>-batch<k>.md` briefs of up to `--batch-size` (default 5) entries, closed early at `--max-chars` (default 36000) so each file fits one Read; `--batch-size 1` writes self-contained per-entry briefs. Each agent Reads the rules file and its batch brief, writes each reply with the Write tool (structured clauses give `quote`, never `at`; unparsed ones are just `{text}`), and runs that entry's `--check` command; `content:agent:apply-all` applies all replies later. The brief's quote and `if`/`unless` rules mirror `validate/spans.ts`; change them together. The converter re-parses monsters and traps from `content/raw`. The app still reads `content/parsed/`. Branch `content-v6` must be merged into `roadmap` after the authoring work is committed (see TODO section 5).
- `npm test` (Vitest: combat engine, app settings, color helpers, content parser, converter, validator and agent-harness suites), `npm run build`, and `npm run typecheck:node` pass in the devcontainer as of 2026-11-12.

Current planned implementation work is maintained in `TODO.md`. Historical completed batches are recorded in `CLEANUP.md`, `issues.txt`, `tasks.md`, and `feedback.md`.

## Key Files to Know

| File | Role |
|------|------|
| `electron.vite.config.ts` | Build config — dual renderer entry points |
| `src/common/ipc-channels.ts` | All IPC channel names (CMD.* and SYNC.*) |
| `src/common/types/system-plugin.ts` | Types for the 4e rules module (conditions, HP descriptors, creature builder config, compendium provider) |
| `src/main/combat/combat-engine.ts` | Combat state machine (most complex logic) |
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
