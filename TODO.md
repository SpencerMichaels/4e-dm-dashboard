# TODO

Roadmap decided 2026-11-12. The reasoning is in the "Feasibility Study: 4e-Only Scope and an Electron-to-GPUI Port" and "Style Unification Proposal" docs. Work the sections in order; sections 4 and 5 can run in parallel.

## 1. Rename to "4e DM Dashboard"
- [x] Rename the package name, productName, app ID, window titles, the `.desktop` file, `launch.sh`/`install.sh`, and docs
- [x] One-time first-launch migration: move `~/.config/tabletop-dashboard/` into the new userData dir if the new one is empty
- [ ] Rename the repo folder (manual; do it outside an agent session)

## 2. Narrow to 4e only
- [x] Add Vitest; write combat-engine tests first (saves, ongoing damage, regeneration, EONT/SONT, recharge, death saves)
- [x] Delete PF2e, Delta Green, the user plugin loader, the PF2e import path, the system picker, `SchemaForm`, and `CreatureBuilder`
- [x] Replace the plugin registry and `getPluginUI` with direct imports; drop `systemId` from the compendium IPC
- [x] Remove turn hooks and the `plugin?` threading from the combat engine
- [x] Move the 4e plugin folders into normal feature folders (rules in `src/common/rules/`, compendium in `src/main/compendium/`, parsers and build scripts in `tools/content/`, data in `content/`, UI in `src/renderer/components/{combat,creature,compendium,campaign}/`)

## 3. Shared `4e-kit` repo (GPL-3.0) and the 4e schema
- [x] Repo skeleton at `~/Projects/4e-kit`. Changed from the plan: no build step. Both apps include it as a git submodule (`vendor/4e-kit`) and import its TypeScript source through an `@kit` alias; the submodule commit is the pin. It type-checks under 4ecb's strict flags.
- [x] 4e vocabulary: action/range/usage types, damage types, conditions, roles, XP table (this app now takes damage types and the XP table from the kit)
- [x] Schema: typed `StatBlock`, `Power`, `Item`, `Trap`, `Disease`, and structured effect clauses (damage, ongoing damage, condition plus duration, forced movement, mark, aftereffect, unstructured text fallback). Each clause keeps its source text. Start from 4ecb's power-text IR (`packages/content-domain/src/power-text.ts`). Needs user review before section 5.
- [ ] Adopt the kit's `Monster` type in this app (replaces the `statBlock as any` casts). Deferred to section 5: it changes the stored shape, so campaign creature files get converted once, together with the switch to the cleaned content pack.
- [x] Character snapshot type for import

## 4. Restyle (see the style unification proposal)
- [ ] Style kit in `4e-kit`: 4ecb tokens and themes, `Icon`, `ActionTypeIcon`
- [ ] Tokens and themes (follow the OS; the Player window follows the DM theme)
- [ ] EB Garamond for display text, `system-ui` for the UI, Arial for cards; remove the Mentor/DnDVecna fonts
- [ ] Lucide icons replacing the emoji and glyphs
- [ ] Player window on tokens
- [ ] Components: dialog, buttons, tables, power tones, TipTap content

## 5. Agent-cleaned content (one-time)
Covers monsters (5,326; 24,950 actions, of which 9,305 have their mechanics in prose only), items (4,095), traps (776), diseases (69), and the glossary (450). Player powers and feats are out of scope; they arrive through character import.
- [ ] Private content repo: one JSON file per entry, recording provenance (parser, agent, or human)
- [ ] Fix systematic parser errors deterministically (split words like "Fi re", dropped "plus Xd6 <type>" damage, range text leaking into effects)
- [ ] Validators:
  - schema validation
  - DMG math bands per level and role (attack, damage, HP, defenses, XP)
  - round-trip render of structured data back to text, diffed against the source text
- [ ] Pilot: 100 random monsters; measure cost, accuracy, and schema gaps; revise the schema
- [ ] Full agent pass; a second agent verifies flagged entries; user reviews the flagged queue plus a random sample with a measured error rate
- [ ] Drive combat automation from the effect clauses; delete the regex `condition-detection.ts`

## 6. Popouts as OS windows
- [ ] One window for pinned power cards and one for stat blocks (`window.open` + `setWindowOpenHandler` + React portals)
- [ ] Combat log window; then the encounter editor and creature list panels

## 7. Character import
- [ ] `.dnd4e` (Character Builder saves): first check that real files carry computed stats
- [ ] `.4ecb`: 4ecb embeds an evaluated snapshot in its export; import it here

## 8. Content packs and history cleanup
Must be done before the repo gets a public remote. Steps 8.1–8.3 are ordinary commits. Step 8.4 rewrites history; get explicit confirmation before running it.

**Inventory: what was committed at any point**

| What | Paths | Commits |
| --- | --- | --- |
| Scraped compendium (raw and parsed, about 55 MB) | `content/raw/`, `content/parsed/`, and before 2026-11-12 `plugins/dnd-4e/data/raw/`, `plugins/dnd-4e/data/parsed/` | 21 |
| Rulebook PDFs (PHB, DMG) | `docs/*.pdf` | initial commit only |
| Proprietary fonts (Mentor, DnDVecna) | `src/renderer/fonts/` | several |
| Book text transcribed into source | `monster-templates.ts` (DMG), `monster-themes.ts` (DMG2), condition descriptions in `src/common/rules/dnd4e.ts` (formerly `plugins/dnd-4e/index.ts`); `monster-templates.ts` and `monster-themes.ts` were in `src/renderer/plugins/dnd-4e/` before 2026-11-12 | several |

**8.1 Content pack format**
- [ ] Built from the section 5 content repo: a zip of the JSON plus `manifest.json` (format version, content version, per-file sha256)
- [ ] Move the template, theme, glossary, and condition text into the pack. Keep the types and logic in source under new file names, so the old data files can be purged from history by path.
- [ ] Hosting: the user's own server; the app's download URL points there

**8.2 App-side loading**
- [ ] `compendium.ts` reads from `<userData>/content/` instead of `app.getAppPath()/content/parsed`
- [ ] First run with no pack: prompt to download, or to import a pack file (offline path). Verify the sha256 values before installing.
- [ ] The app must run with an empty compendium; no crashes on missing data
- [ ] "Check for content update" in Settings

**8.3 Clean the tree**
- [ ] `git rm -r --cached` the data dirs and gitignore them; the fonts are already removed in section 4
- [ ] Confirm that `npm run build` produces an app with no bundled content

**8.4 Rewrite history (destructive, needs explicit go-ahead)**
- [ ] Back up: `git clone --mirror` to a dated folder outside the repo, plus a tarball of `.git`
- [ ] Install `git-filter-repo` in the devcontainer
- [ ] Run `git filter-repo --invert-paths` with `--path` for each inventory path. Use `--path-glob 'docs/*.pdf'` for the PDFs, and give the old template/theme data files by name.
- [ ] Verify:
  - `git log --all -- <each path>` is empty
  - `git rev-list --objects --all` shows no blob over 500 KB except `resources/icon.png`
  - `git count-objects -vH` shows the size drop
  - `npm run build` passes on HEAD
- [ ] Commit hashes change: update hash references in `CLEANUP.md`, `tasks.md`, etc. if any matter

## 9. Packaging and publishing
- [x] Publish `4e-kit` (github.com/SpencerMichaels/4e-kit, public) and point both apps' submodule URLs at it
- [ ] Rebase or rework `codex/cross-platform-packaging` (electron-builder, CI workflow, Nix flake, `BUILDING.md`) onto the renamed, 4e-only, pack-loading app
- [ ] Add the public remote and push

## UI
- [ ] Implement actual drag-and-drop reordering for powers, traits, and auras (currently only arrow buttons; the drag handle ⠿ is visual-only)
- [ ] Add smooth reorder/add/remove animations for power/trait/aura lists (FLIP technique or View Transitions API)
