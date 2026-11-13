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
- [x] Style kit in `4e-kit`, tokens part: `styles/tokens.css` (4ecb's light and dark colors verbatim, power tones plus their contrast colors, fonts, 2px radius, floating shadow) and `src/theme.ts` (`ThemePreference`, `resolveTheme`)
- [ ] Style kit in `4e-kit`, icons part: `Icon`, `ActionTypeIcon`
- [x] Tokens and themes: system / light / dark, default follows the OS. Main stores it in `<userData>/app-settings.json` and broadcasts it; the Player window follows the DM theme. Solarized is retired; the old `--color-*` names are legacy aliases of the kit tokens.
- [x] EB Garamond for display text, `system-ui` for the UI, Arial for cards; remove the Mentor/DnDVecna fonts
- [ ] Lucide icons replacing the emoji and glyphs
- [x] Player window on tokens
- [x] Power card headers, reaction tiles and the power editor use the muted book tones (`--card-*`), and stat block headers the book brown/beige (`--sb-*`), by user preference over 4ecb's navy and brighter power tones; condition pills use palette tones
- [x] TipTap note content (display-face headings, lists, blockquote, code, links, placeholder)
- [ ] Components: dialog, buttons, tables
- [ ] Remaining hardcoded colors (convert to tokens): `Dnd4eEncounterEditor.tsx` (theme/template teal `#0d9488`, difficulty colors from `dnd4e-utils.ts` `DIFFICULTY_TIERS`/`difficultyThresholds`), `QuickConditionMenu.tsx` (selection blues, gray hovers), `InitiativeEntry.tsx`, `InitiativeList.tsx` (rgba highlights), `PCListView.tsx`, `Dnd4eCreatureViewer.tsx` (`TEMPLATE_COLORS`, `THEME_COLOR`), `Dnd4eCombatPanel.tsx`, `Dnd4eGroupedCombatPanel.tsx`, `Dnd4eItemEditor.tsx`, `CombatView.tsx`, `MapEditor.tsx`, `CombatToken.tsx` (ring grays), the compendium browsers' list highlights, small shared widgets (`TokenCropOverlay`, `MultiSelectDropdown`, `FloatingPanel`, `CreatureImageEditor`, `PinnedCardsPanel`, `ConditionPill`), modal/palette backdrops. Data colors that stay hex for now: damage-type pastels (`damage-types.ts`), class-mark defaults (`class-marks.ts`), creature-builder tier/role colors (`dnd4e.ts`), `resolveHpDescriptor` fallbacks (`src/common/utils/hp.ts`), token name colors.
- [ ] Move call sites off the legacy `--color-*` aliases onto the kit tokens, then delete the aliases

### Monster power cards (see the "Monster Power Cards: Proposal" doc)
Decided 2026-11-12: used powers collapse to their header row; keywords stay in the header (Monster Manual style); keyboard bindings for focused cards come later; 4ecb's `CreatureCard` stays separate from this card.
- [ ] Cleanup: card styles moved from inline into `statblock.css`, a typed `_levelAdjust` (done 2026-11-13: one `toPowerCardEntry` in `creature/power-card-entry.ts`, used by the viewer, combat panels, and reaction tiles)
- [ ] Kit helpers: `ACTION_TYPE_ICON`/`RANGE_KIND_ICON` names, `usageChipLabel`, `rechargeLabel`, `abbreviateDefense`, `POWER_LINE_ORDER` and line grouping, `textAtLevel`
- [ ] Card pass 1 (today's parser data): Lucide icons, usage chip in the header (text, not color alone), attack line of its own, line groups in book order with spacing, "Sustain Minor", Special/failed-save/extra lines and the basic-attack marker, pin in the header, focusable cards, traits and auras on the same card
- [ ] Live pinned cards (not snapshots) and reaction tiles rendered by the same card, collapsed
- [ ] Card pass 2 (after the switch to the kit `Monster` type, section 5): damage folded into Hit, structured secondary attacks, level-tier selection, click-to-apply driven by effect clauses including "save ends both" groups

### Color-blind-friendly palette option (both apps)
Decided 2026-11-12: each app keeps its current power colors by default (4ecb: the vivid set that matches the old Character Builder; this app: the book tones) and gains a Settings option for a color-blind-friendly palette, defined once in 4e-kit tokens (e.g. `:root[data-palette="cvd"]`) and selectable per app.
- [ ] Measured 2026-11-12 (OKLab ΔE, Machado 2009 simulation): the worst-case separation between usage colors across normal vision, deuteranopia, protanopia and tritanopia is 0.025 for 4ecb's current set (at-will vs encounter merge under deuteranopia) and 0.067 for this app's book tones. Okabe–Ito does not fix it (0.017–0.020, daily gray vs feature). An optimized candidate reaches 0.164 with readable text on every color: at-will #b0c6a6 (black text), encounter #791a14, daily #6a6e73, utility #6098de (black), feature #4a3079, item #bb871e (black). Refine it with a visual review, then add it to the kit as an alternate palette.
- [ ] Settings toggle in this app and in 4ecb; usage stays readable as text either way (the usage chip in the monster card plan).

## 5. Agent-cleaned content (one-time)
Covers monsters (5,326; 24,950 actions, of which 9,305 have their mechanics in prose only), items (4,095), traps (776), diseases (69), and the glossary (450). Player powers and feats are out of scope; they arrive through character import.
- [x] Private content repo `~/Projects/4e-content`: one JSON file per entry in the kit schema, recording provenance (parser, agent, or human). Built by `npm run content:convert` (`tools/content/convert/`); only exact clauses so far, everything else `clauses: []`
- [x] Fix systematic parser errors deterministically (split words like "Fi re", dropped "plus Xd6 <type>" damage, range text leaking into effects), with Vitest fixtures from `content/raw`
- [ ] Validators (`npm run content:validate`, `tools/content/validate/`):
  - [x] schema validation (shape, closed vocabularies, clause spans)
  - [x] DMG math bands per level and role (attack, damage, HP, defenses, XP); outliers are flagged
  - [ ] round-trip render of structured data back to text, diffed against the source text
- [x] Pilot 1: 100 monsters, 20 items, 20 traps (seed 4), one agent per entry; results on branch `pilot-1` of `4e-content` (`pilot/pilot-1-results.json`). Accuracy was good; ~60k tokens per entry, mostly wasted on writing files with python, fenced JSON, hand-counted clause spans and two container runs per entry
- [x] Schema v3 from the pilot (new clause kinds use-power, recharge-power, lose-healing-surge, concealment, zone, saving-throw, summon; extra/critical damage; multi-stat modifiers; while-in-aura and permanent durations; area `who` values; `usesPerRound`), and the efficient agent flow: `content:agent:briefs` writes all briefs in one run; agents quote clause words instead of counting `at` spans, write plain-JSON replies with the Write tool, and run one `content:agent:apply -- ... --check`; `content:agent:apply-all` applies a directory of replies. Briefs are ~13% smaller (monsters ~5.8k tokens)
- [x] Pilot 2a: the `small` tier of `4e-content/pilot/sample-2.json` (seed 5, no pilot-1 ids: 14 monsters, 3 items, 3 traps), Sonnet, audited by Opus; results on branch `pilot-2` (`pilot/pilot-2a-clean.json`, `pilot/pilot-2a-verify.json`). 20/20 passed the check (1.2 runs each); audit: 7 ok, 12 minor, 1 major (a conditional combat-advantage trait stored without `if`); 16/20 went low confidence only because unparsed clauses forced it
- [x] Schema v4 and brief fixes from pilot 2a: clause kinds redirect-attack, crit-range, power-restriction, status (insubstantial, phasing), opportunity-reach; `typeChoice`; heal `perTarget`; `until` duration; sustain without a line; `skillNotes`; trap `speed`. Unparsed clauses are just `{text}`; the span check accepts inflections ("grabs", "knocked prone"); the brief spells out the quote rules per kind, a mandatory verbatim `if` rule, worked examples, and a confidence rule where unparsed no longer means low. `content:agent:briefs --tag <name>` names the brief and reply dirs. Briefs grew to ~7.8k/6.7k/6.8k tokens (monsters/items/traps; 2a: 6.0k/4.9k/5.0k)
- [x] Pilot 2b head-to-head: the same 20 entries with Sonnet and with Opus (results on branches `pilot-2b-sonnet` and `pilot-2b-opus`; summaries `pilot/pilot-2b-clean-*.json` and `pilot/pilot-2b-verify.json` on `main`). All 40 passed the check; Opus audit 11 ok, 9 minor, 0 major (1.0 check runs), Sonnet 7 ok, 12 minor, 1 major (a guessed defense; 1.1 runs)
- [x] Schema v5 and brief fixes from pilot 2b: `Attack.altBonus` for "(+37 while bloodied)"; `'unknown'` for an unprinted `Attack.vs` / `Power.usage`, flagged (not an error) by the validators; grants-ca `source-allies` includes the source. The brief now says where hit-or-miss text goes (effect), that move/forced-move have no duration, "1/turn" = `usesPerRound`, how to split a zone that also grants concealment, that a line with mechanics never has `clauses: []`, and how `if` handles split, leading, negated ("not: ...") and optional ("can shift") conditions. `content:agent:briefs --batch-size N` writes one brief per N entries of a kind (`<kind>-batch<k>.md`, shared rules and schema once; per-entry replies and checks as before). Single briefs grew to ~9.1k/8.0k/8.1k tokens; in a batch of 5 an entry costs ~3.4k (monsters) / ~3.2k (items) / ~3.5k (traps)
- [ ] Pilot 2c: the same 20 `small` entries (not the 140-entry `full` tier) with the v5 briefs, batched 5 per agent: `pilot/briefs-2c/` (monsters-batch1..3, items-batch1, traps-batch1; `batches.json` lists the ids), replies in `pilot/responses-2c/<kind>/<id>.json`; compare audit verdicts and tokens per entry with 2b. Then decide the full run (model, batch size, and whether a 140-entry pilot is still needed)
- [x] Schema changes found while converting (vs "Any", text-only resistances, extra failed-save lines, item subtypes, trap traits, level-relative disease DCs, ...): 4e-kit schema v2; the converter, validators and agent prompt use it, and `4e-content` is reconverted (parser notes down from ~5,500 to ~1,600)
- [x] Parser gaps closed in v3: booklet page refs ("page(s) 2-77"), item weight / property scaling / special / requirement / alchemical type and formula cost, trap aura ranges and terrain usage, trap "Triggered Actions" with no action type, Elite Dragon lowering the rank (`rankChange`); `4e-content` reconverted (parser notes ~1,600 -> ~560)
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

## 10. Agent-assisted content authoring

Implementation plan: [Agent-assisted content authoring](docs/agent-content-authoring-plan.md). First implementation 2026-11-12; [usage and setup](docs/AUTHORING.md). Coordinate with sections 3/5 (kit schema adoption), 4 (power cards), and 8 (content packs).

- [x] Phase 1: versioned authoring contract, deterministic monster calculations/overrides, validation, and CLI (`dashboard-dmg-v1`; no new MM3 tables)
- [x] Phase 2: local power/trait precedent search across structured mechanics and prose (legacy converter plus homebrew; cleaned-pack provider comes with section 8)
- [x] Phase 3: main-owned JSON drafts, revision/conflict handling, explicit destinations, and retry-safe DM approval/save, including partial-save recovery
- [x] Phase 4: workshop preview, direct field editing, comments/questions, revision comparison/restoration; monster preview reuses the existing viewer, complex optional fields expose JSON controls
- [x] Phase 5: local MCP/CLI bridge plus authoring, precedent-search, and balance-review skills; end-to-end monster-to-campaign workflow verified in isolated Electron
- [x] Phase 6 initial support: writable homebrew libraries, campaign copies, and kit-schema item/trap/disease authoring/review (traps/diseases are library-only until native campaign entity types exist)
- [x] Add item-specific numeric policies (enhancement/price/defaults). Done 2026-11-13: `src/common/rules/items.ts` (value by level PHB p. 223 / RC p. 278, sale price by rarity RC p. 278, enhancement PHB p. 225); `benchmarks` with `kind: "item"`, table price in the item scaffold, and price/enhancement flags in validation (published items match exactly apart from 21 misprints of ~15,000 versions). Consumables have no rule table in these books and are left to precedents
- [x] Reuse native item/trap/disease viewers, with additional kit power/trait fields rendered alongside them
- [x] Edit workshop monsters with the Creatures compendium editor itself (`Dnd4eCreatureDetails`), via a changed-fields-only adapter to kit patches; collapsed field tree for remaining metadata
- [x] Workshop layout: status rail with approval checklist, findings and comments anchored to stat block lines and powers (optional annotation context in the shared viewer/editor), description rendered as markdown notes in the same place in both modes
- [x] De-infodump the rail and threads: blockers-only status line, ⋯ menu, collapsed discussion, first-sentence comments with latest reply only; notes-only reviews no longer need acceptance; sidebar page renamed "Workshop" (🛠️); kind tabs with a sortable drafts table (no recents column), new drafts saved by their first edit, kind-scoped copy-existing search, and a one-time dismissable intro (stored in app-settings `dismissedTips`)
- [x] Campaign records, statblock editors, compendium edit semantics, and Workshop support for all six kinds (creatures, items, traps, diseases, templates, themes); libraries removed. Plan: [docs/campaign-content-and-editors-plan.md](docs/campaign-content-and-editors-plan.md) Done 2026-11-13, including items as kit records on the shared compendium page.
- [x] Adapt the existing item editor (`Dnd4eItemEditor`) for the Workshop (`item-editor-adapter.ts`); traps, diseases, templates, and themes have kit-native statblocks
- [x] Items on the compendium side: kit-native item records (old campaign items convert on open, originals kept as `_legacy-<file>.json`), so published items clone losslessly and Workshop items edit in place, like the other kinds
- [x] Traps and diseases in encounters and combat (done 2026-11-13 except the deferred Player-window item): trap rows in encounters (XP), trap combatants (initiative or triggered), disease chips and per-PC disease tracking. Plan: [docs/encounter-traps-and-diseases-plan.md](docs/encounter-traps-and-diseases-plan.md)
  - [x] Phase 2, combat on kit content (2026-11-13): combatants carry kit monsters, the engine and UI read `facts.ts`, encounter adjustments apply to kit monsters, and main builds combatants
  - [x] Phases 1 and 3, traps (2026-11-13): trap rows with XP in encounters, trap combatants (initiative or triggered strip), Disable/Re-arm, hidden by default
  - [x] Phases 4-5, diseases (2026-11-13): disease chips on power cards (applied like a condition in combat), the encounter disease list, PC disease stages on the PCs page
  - [x] Location traps join encounters linked to the location (hidden, counted in XP, read-only rows)
  - [ ] Revealed triggered traps in the Player window (it lists only the initiative order). Deferred 2026-11-13: the DM has not designed this UI yet
  - [x] Traps noted on locations (2026-11-13): `Location.traps`, statblocks on the location page and the map sidebar
  - [x] Legacy template/theme appliers deleted (2026-11-13); snapshot tests pin the kit results, which matched them
- [x] Replace remaining complex JSON controls with dedicated editors; add named/semantic revision diffs. Done 2026-11-13: the numeric recipe is a form (`RecipeEditor.tsx`) and its preview a list of field changes, protected fields and damage guidance; History shows named before → after changes. JSON remains only under **History › Raw fields (advanced)**, the deliberate escape hatch for data no statblock shows
- [ ] Switch authoring search to the cleaned/versioned content pack when section 8 lands; add synonym expansion if actual queries need it
- [x] Repair legacy authoring catalog conversion dropping attack damage/hit/effect text (Shadow test: monster5053, monster80, monster115916). Done 2026-11-13: the catalog re-parses monsters and traps from `content/raw` like the content repo writer (shared `tools/content/convert/published.ts`).
- [ ] Exercise the user's Shadow draft with a real agent/DM session, including linked minion/transformation and curse clarifications (metadata is retained; arbitrary combat automation is not added here)
- [ ] Optional later: text-selection annotations and shareable HTML export; assess after using the native comments workflow
- [x] Monster math: use the latest published rules. Done 2026-11-13 (label `published-rules-v2`): `benchmarks.ts` cites book and page per table. Damage and accuracy follow the DMG errata that Monster Manual 3 introduced ("4e Updates - Complete", Rules Update 08/2012 p. 46, in `4eBooks/4ECollectedErrataFAQ.zip`): one-target and several-target columns, brutes +25%, limited +25% (up to +50%), level + 5 vs. AC and + 3 vs. other defenses for every role. Elites/solos/minion damage are DMG2 p. 133, DCs RC p. 126. Published MM3 and Monster Vault monsters raise no attack flags and few damage flags. `dashboard-dmg-v1` retired. DCs: the errata's DMG p. 42/p. 61 bands (5/10/15 at levels 1–3) are the July 2008 errata, carried into the 2012 compilation; Essentials (2010) replaced them with the per-level table in the Rules Compendium (p. 126, 8/12/19 at level 1), which is kept (resolved 2026-11-13). The Shadow draft re-check: Shadow Touch (1d8 + 5, avg 9.5) is now below the level 7 one-target expression (2d8 + 6, avg 15) and near the several-targets one (2d6 + 4, avg 11). Original note: Later books supersede earlier ones, like errata, so there are no parallel policies: replace the DMG-1 numbers in `src/common/rules/benchmarks.ts` in place. Read the rules in `4eBooks/` (DMG ch. 10 pp. 184–185, DMG2, the updated monster damage in Monster Manual 3 and Monster Vault, Rules Compendium) instead of deriving them from the corpus, and cite book and page beside each table. Retire or rename the `dashboard-dmg-v1` label (`core.ts` POLICY, the tool descriptions, the skills, `docs/AUTHORING.md`; Phase 1 above said "no new MM3 tables" only because no sourced table existed). Update the band tests. Afterwards, re-check the Shadow draft: its Shadow Touch damage came from the DMG-1 low band.
- [x] Elite/solo monster numbers disagree between the creature builder and authoring (done 2026-11-13: `monsterHp` and `rankAdjustments` in `benchmarks.ts`, used by both. Elite = 2 × standard HP per DMG p. 185, which every published elite in the corpus matches; solo = 4 × standard at every level and no elite/solo defense bonus per DMG2 p. 133): settle them from the books (latest rule wins) and give both one function in `benchmarks.ts`. HP: builder (`Dnd4eCreatureDetails.tsx`) uses elite = 2 × standard + Con and solo = (8 × level + 1 + Con) × 4 (× 5 from level 11); authoring (`core.ts` `benchmarks`, `bands.ts` `HP_RANK`) uses × 2 and × 4. AC and defenses: the builder adds +2 for elite/solo; authoring adds nothing.
- [x] Hide the draft data model from the Workshop UI. Done 2026-11-13: editors apply edits after a short pause (`live-edits.tsx`, merge rules in `src/common/authoring/merge.ts`), a same-field collision asks **Keep mine** / **Use the agent’s**, one **Save to <campaign>** button (pressing it while blocked opens the blocker), status Saved / Changed since last save / Not saved yet, later saves update the same campaign entries (previously each save added a copy), and History lists dated versions with who changed which fields (`versions`, `src/common/authoring/diff.ts`). Original note: Today the DM must know that editor edits are staged, then applied as a revision (**Apply edits** below the editor, per-field **Apply edit** in the field tree), then approved and written to destinations (**Approve and save** in the rail). Pending edits block approval with no explanation (the button is disabled or still reads "Saved"), so the Wrench Shadow special edit (2026-11-12) silently reached neither the draft nor the campaign. Revision and event numbers, **Reapply my edits to revision N**, and the JSON history compare also leak internals. Target: edits go into the draft as you make them (debounced, still recorded as DM overrides; agent changes to other fields merge without asking, since patches are field-level, and only a same-field collision asks the DM to choose), so there is no Apply step and no staged state; one **Save** action writes the current draft to its destinations, and its label says where ("Save to <campaign>"); status reads "Saved" / "Changed since last save" instead of "Revision N · draft"; history is a list of dated versions with who changed what. Keep advisories and blockers in the rail, reachable from the Save button when it is blocked.
- [x] Show when no campaign is open (done 2026-11-13: the sidebar names the open campaign or shows **No campaign open**, campaign-only views are disabled until one is open, Home says so, and Workshop drafts default to the open campaign): with zero campaigns, the sidebar still offers campaign-specific views (notes, encounters), so the DM believed a campaign was open and the workshop listed no destinations (2026-11-12)

## UI
- [ ] Implement actual drag-and-drop reordering for powers, traits, and auras (currently only arrow buttons; the drag handle ⠿ is visual-only)
- [ ] Add smooth reorder/add/remove animations for power/trait/aura lists (FLIP technique or View Transitions API)
