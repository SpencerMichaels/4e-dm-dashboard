# Traps and diseases in encounters and combat

Status: done 2026-11-13 except revealed triggered traps in the Player window (deferred). Decided 2026-11-13 (combat on kit content; diseases: reference and tracking; traps hidden per trap, default hidden). Follows
`docs/campaign-content-and-editors-plan.md`, which made traps and diseases campaign records with
compendium pages and left their use in encounters to this plan.

## Where things stand

- **Encounters** (`src/common/types/encounter.ts`) list only creatures: `EncounterCreature` refers to a
  campaign creature (`creatureId`) or a published one (`compendiumId`), with count, minion, level
  adjustment, templates, and theme. The encounter editor (`Dnd4eEncounterEditor.tsx`) sums XP from
  creatures only.
- **Combat** (`src/common/types/combat.ts`, `src/main/combat/combat-engine.ts`) has one combatant shape,
  `CombatantState`, with a legacy `statBlock` record. The engine reads that record for recharges,
  regeneration, saves, and ongoing damage. Traps never enter combat.
- **Traps** are kit `Trap` records (published: converted on demand by `compendium.kitGet`; campaign:
  `campaigns/<id>/traps/`). A trap has level, role, rank, XP, detection checks, optional initiative,
  speed, HP and defenses, a trigger, traits, auras, powers (attacks with recharge and usage), and
  countermeasures. Many traps have no initiative: they act only when triggered.
- **Diseases** are kit `Disease` records: level, an optional delivering attack, endurance DCs
  (improve / maintain, sometimes level-relative text), and numbered stages (0 = cured, one final).
  Disease progress is checked after each extended rest, which the app does not model.
- **PCs** (`PlayerCharacter`) hold identity and display data only: no HP, defenses, or conditions
  outside combat.

## Goals

1. Add traps and hazards to encounters next to creatures, counted in the encounter's XP and
   difficulty like the DMG does.
2. Run them in combat: traps with initiative take turns in the order; triggered traps sit outside the
   order and act when the DM fires them. Their attacks, recharges, HP (when they have it), and
   countermeasures are on hand in the same places as a monster's.
3. Diseases: keep the disease that a creature or trap can inflict one click away during combat, and
   track a PC's disease stage between sessions.
4. Keep data human-readable: encounters refer to traps by id, like creatures, and nothing is copied
   into the encounter file.

## Design

### Encounter data

`Encounter` gains `traps?: EncounterTrap[]`:

```ts
interface EncounterTrap {
  trapId?: string        // campaign trap record
  compendiumId?: string  // published trap
  count: number
  overrideName?: string
  visible?: boolean      // shown in the Player window from the start; a checkbox per row, unchecked (hidden) by default
}
```

A separate list rather than a `kind` on `EncounterCreature`: creatures carry minion, level-adjust,
template, and theme options that do not apply to traps, and old encounter files stay valid
unchanged. XP: each trap adds its `xp` (the kit record already has rank-adjusted XP) to the total
that feeds `encounterLevel` / `encounterDifficulty`.

### Encounter editor

A **Traps and hazards** section below the creature list, with the same add-from-search (published
and Custom traps via the trap catalog the compendium page uses), count, rename, and remove. Each row
shows level, role, rank, and XP, and opens the trap statblock on click like a creature row.

### Combat runs on kit content (decided 2026-11-13)

Traps are not bolted on as a second stat block shape. Instead, combat moves onto the kit format for
every combatant, and traps become one more kit kind it reads. The DM chose this over projecting traps
into the legacy shape: one format, done cleanly now (no game for a few weeks).

- **Combatant content.** `CombatantState` gains `kind: 'creature' | 'trap'` and `content` (kit
  `Monster` or `Trap`), replacing `statBlock`. Creatures are converted to kit `Monster` when combat
  starts, with the content converter (`tools/content/convert/monster.ts`, already importable from
  main as `legacy-items.ts` does for items). Stored creature files do not change. When creatures move
  to kit storage (TODO section 3), the conversion step is deleted. Kit-authored creatures
  (`authoredContent`) are used as they are.
- **Encounter-time adjustments.** Level adjustment, minion, templates, and themes are applied to the
  kit `Monster` (templates/themes via the kit template data and `kit-templates.ts`), not by patching
  the legacy record (`adjustDamageExpr` and friends in the encounter editor move to a shared
  `src/common/rules/adjust-monster.ts` with tests).
- **Accessors.** The engine and combat UI read combatant facts through `src/common/combat/facts.ts`:
  save bonus, defenses (AC/Fort/Ref/Will), initiative bonus, resistances / immunities /
  vulnerabilities, regeneration, revival, powers with usage and recharge, reactions and triggers,
  minion. Each reads kit content for both kinds. Today's direct `statBlock` reads (about 8 in
  `combat-engine.ts`, about 10 in `components/combat/`) go through them.
- **Panels.** Creature combatants render the creature viewer from the kit `Monster` (through the
  existing `monsterToCreature` view projection until the viewer takes kit data); trap combatants
  render `TrapStatblock`. Pinned power cards come from kit powers.
- **Saved combats.** None: combat state lives in memory only, so nothing stored needs converting.
- **Fidelity checks.** Before switching, a test converts every campaign-creature shape the editor can
  produce and every published monster, and compares the engine facts (saves, defenses, resistances,
  regeneration, recharges, reactions) read the old way and the new way. Differences are fixed in the
  converter or listed as accepted.

Traps in turn order:

- **Traps with initiative** roll it (or take the printed value) and get turns like monsters: start of
  turn recharge, end of turn saves for conditions they somehow carry.
- **Triggered traps** (no initiative) are listed in a **Triggered** strip above the order, not in it.
  "Trigger" puts the trap's triggered power card in the current-turn area and logs it; it does not
  change whose turn it is. A trap whose text says it rolls initiative when triggered ("Initiative +6
  once triggered") joins the order at that point.
- Traps without HP (`hpText` or none) show "no HP" and are disabled by countermeasures: a **Disable**
  action marks them `dead` with a "disabled" label in the log.
- Player window: each trap starts hidden when its encounter row says so (the default) and appears when the DM reveals it, like
  hidden creatures. The player view never shows a trap's stat block.

### Diseases (decided: both phases)

- **Phase 1: reference.** When a creature or trap power says it exposes the
  target to a disease and that disease is found (published or Custom, by name), its power card gets a
  disease chip that opens `DiseaseStatblock` in a popout. The encounter editor lists diseases its
  creatures and traps can inflict. No new state.
- **Phase 2: per-PC tracking.** `PlayerCharacter` gains `diseases?: { diseaseId: string; stage:
  number; contractedAt: string }[]`. A **Diseases** panel on the PCs page shows each tracked disease
  with its current stage line and the improve / maintain DCs, plus a **Roll after extended rest**
  action that asks for the Endurance result and moves the stage (improve: -1, maintain: same,
  worsen: +1; stage 0 removes it, the final stage stays). In combat, a hit with a disease attack
  offers **Expose** on the target PC, which adds the disease at stage 1 (the DM can change it).
  Because there is no extended-rest model, the roll is DM-triggered.

### Workshop and agents

No change: traps and diseases are already authored and saved as campaign records. The authoring
skills can mention that saved traps can be added to encounters.

## Phase 2 in detail: combat on kit content

Inventory (2026-11-13) of today's legacy use, and the steps that replace it.

**Facts combat needs**, today read from the legacy `statBlock`: save bonus; resistances, immunities,
weaknesses; regeneration `{value, inhibitDamageTypes}` and revival `{hp, abilityName}` (pre-parsed by
`tools/content/html-parser.ts` at build time); actions with usage, recharge, encounter uses, action
type, trigger, and the parser's `triggerEvents` / `triggerSubject` / `selfTurnOnly` hints
(reactions); minion; initiative; AC and defenses; level, role, rank, action points; plus everything
the panels print. `usedPowers` is keyed by index into `statBlock.actions`. Combat state is in memory
only (no saved combats to convert).

**Gaps found**: the kit `Monster` has no revival or trigger hints; `convertMonster` builds hit, miss,
and effect only from the parser's `printed` data, which `content/parsed/` and campaign creatures lack;
templates write `regeneration` as a number and `vulnerabilities` instead of `weaknesses` (both missed
by the engine today); `_levelAdjust` never reaches power cards.

Steps:

1. **Monster sources.** Published monsters: `convertPublishedMonster` from `content/raw` (with
   `printed`), as the Workshop catalog does, behind a main-side cache. Kit-authored campaign
   creatures: `authoredContent`. Other campaign creatures (editor-made or cloned): a
   `legacyCreatureToMonster` built on the Workshop's creature adapter (`entryToPower` for each
   entry, the stat rows field by field), so editor fields map the same way they do when editing a
   draft. A fidelity test runs it over every parsed monster and compares facts with the published
   conversion.
2. **Derived facts.** `src/common/combat/facts.ts` reads kit content (Monster or Trap): save bonus,
   defenses, initiative, damage modifiers, regeneration, minion, powers in a fixed order (traits,
   auras, powers) with usage and recharge. Revival and reaction trigger hints are derived from kit
   text by the parser's rules, moved to `src/common/rules/` and shared with the parser (no kit schema
   change). Tests port the engine's fixtures.
3. **Encounter adjustments on kit.** `src/common/rules/adjust-monster.ts`: templates (kit
   `MonsterTemplate`), themes, level adjustment, minion, each recording what it changed
   (`Adjustment { path, before, after, source }`) for the viewer's attribution. Replaces
   `applyMonsterTemplate` / `applyMonsterTheme` / `applyLevelAdjustment` on legacy blocks (and fixes
   the regeneration and weaknesses bugs by construction). The encounter editor previews use it.
4. **Combatants.** `CombatantState.statBlock` becomes `kind` + `content` (+ `adjustments`).
   `usedPowers` is keyed by the fact order of step 2. Combat start moves to main
   (`CMD.COMBAT_START_ENCOUNTER`): main resolves each row (campaign creature, override, published),
   converts, adjusts, and adds the combatants. The engine reads only `facts.ts`.
5. **Combat UI.** Panels, reactions, initiative entry, the damage dialog, and the popout read
   `facts.ts` and render kit content (creature viewer through `monsterToCreature` until it takes kit
   data, with attribution from `adjustments`; power cards from kit powers). `toPowerCardEntry`'s three
   copies collapse into one (TODO section 4 cleanup).
6. **Remove** the legacy combat paths, `applyEncounterOverrides`, and the template/theme legacy
   appliers once nothing uses them.

**Status 2026-11-13: done.**

- Steps 1-2: `src/main/combat/monster-source.ts` (`creatureToMonster`, `publishedMonster`),
  `src/common/combat/facts.ts`, and `src/common/rules/combat-text.ts` (trigger hints and revival,
  now also used by the parser). `monster-source.test.ts` converts all 5,326 parsed monsters both ways
  and compares facts with the legacy stat blocks: identical. The one accepted difference is that
  "20/variable" now parses as a variable resistance, which no damage type matches either way.
  Recharges printed as text ("5 or if it takes lightning damage") roll from their leading number.
- Step 3: `src/common/rules/adjust-monster.ts` (`adjustMonster`, `templateAllowed`).
  `adjust-parity.test.ts` checks it against the legacy appliers for all 45 templates (3 levels) and
  22 themes, plus prerequisites over a grid of creatures. Two legacy bugs are fixed rather than
  copied: templates with role "any" wrote the literal role "any", and templates always made the
  creature elite. Now rank follows the template (`rankChange`): a template on an elite makes a solo
  (DMG p.175), and Elite Dragon lowers a solo. Template regeneration and vulnerabilities now reach
  the engine.
- Step 4: `CombatantState` has `kind`, `content`, `attribution`; `statBlock` is gone.
  `COMBAT_INIT` with an encounter adds its combatants in main (`src/main/combat/encounter-combatants.ts`);
  `COMBAT_PREVIEW_ROW` serves the encounter editor's previews and template eligibility. The engine
  reads only `facts.ts`; its tests use kit fixtures (revival is read from the Troll Healing text).
- Step 5: the combat panels, reaction tiles, and popout render `combatStatBlock(c)`
  (`components/combat/combat-view.ts`: the kit monster through `kit-view.ts`, which also carries
  attribution into the viewer). Initiative bonus, defenses, and damage-dialog resistances read
  `facts.ts`. Level-adjust attribution on power cards now shows (it was dropped before). The four
  power-card builders are one, `creature/power-card-entry.ts`.
- Step 6: the legacy appliers (`applyMonsterTemplate`, `applyMonsterTheme`, `meetsPrerequisite`)
  are deleted. Before deleting them, the parity test confirmed the kit results matched; snapshot
  tests (`encounter-adjustments.test.ts`) now pin those results. The legacy template data stays as
  the source the converter reads until the content pack replaces it (TODO section 8).
- `npm run test:combat:ui` (hidden windows) previews a templated, level-adjusted row, starts combat
  with a campaign creature, the published Troll, and two grouped minions, checks the combat panel,
  and checks a recharge prompt.

## Traps: status 2026-11-13 (phases 1 and 3 done)

- **Encounters.** `Encounter.traps` (`EncounterTrap`: `trapId` or `compendiumId`, count, rename, `visible`).
  The encounter editor has a Traps and hazards section (`campaign/EncounterTraps.tsx`): search
  published and Custom traps to add, rows with level, kind, role, and XP, count, rename, a
  "visible" checkbox, and remove. Selecting a row previews its `TrapStatblock`. Trap XP counts in
  the encounter total and difficulty. Start Combat works with traps only.
- **Combat.** Main adds traps as `kind: 'trap'` combatants with their kit `Trap`, hidden unless the
  row is visible. HP-less traps have 0 HP, and `facts.hasHitPoints` / `facts.isDefeated` keep the
  engine and UI from treating them as dead: they take turns (with initiative), ignore damage, and
  are stopped with Disable (marked dead; Re-arm undoes it). Traps with HP fall at 0 like monsters.
  - Traps with initiative roll it in initiative entry like monsters.
  - Traps without initiative are listed on the initiative entry screen, stay out of the order, and
    sit in the Triggered traps strip above the initiative list (`combat/TriggeredTraps.tsx`). Its
    controls: inspect, reveal/hide, Trigger (shows the stat block and logs "triggered"), and
    Disable/Re-arm (logged).
  - The combat panel shows a trap through `trapStatBlock` (`combat/combat-view.ts`). Trigger,
    Detect, and Countermeasures follow its powers, power use and recharges work as for monsters,
    and rows the trap lacks (initiative, senses, defenses) are left out.
- **Not done.** A revealed triggered trap does not appear in the Player window, which lists only
  the initiative order. Traps whose initiative is printed as text ("see below", "acts on its
  crew's initiative") convert without an initiative, so they are treated as triggered.
- **Locations** (added at the DM's request): `Location.traps` holds trap references, shown as collapsible statblocks on the location page and in the map sidebar, with the same trap search as encounters. Locations don't feed combat. To fight a location's trap, add it to the encounter.
- Tests: engine (an HP-less trap with initiative takes turns and ignores damage, a trap with HP
  falls at 0, a disabled trap stops acting), encounter combatants (hidden/visible, counts, groups),
  and `test:combat:ui` (trap rows and XP, the trap preview, a hidden trap with initiative, and a
  triggered trap's Trigger and Disable).

## Diseases and location traps: status 2026-11-13 (phases 4 and 5 done; plan complete except the deferred item)

- **Disease chips** (`disease/disease-refs.tsx`, rules in `src/common/rules/diseases.ts`). Every power
  card names the diseases its text exposes the target to. A name counts only in text about
  exposure, contracting, disease, or infection, matched as whole words, longest name first ("Dire
  Rat Filth Fever" over "Filth Fever"); Custom diseases win over published ones with the same name.
  115 of the 125 published monster powers that mention exposure name a known disease. A chip opens
  the disease's statblock. In combat the disease name in the power's text is highlighted and
  applies like a condition (DM request): click it, then the PC (shift-click for several), and the
  disease is tracked on that PC as exposed and logged. Non-PC targets are ignored.
- **Encounter diseases.** The encounter editor lists every disease its creatures (as adjusted) and
  traps can inflict, with their sources, matching line by line.
- **PC tracking.** `PlayerCharacter.diseases` (`PcDisease`: a disease reference, `stage` as
  `"exposed"` or a number, and `since`). Only the current state is kept, not a history. The PCs
  page has a Diseases panel (`campaign/PcDiseases.tsx`), and cards show a 🦠 count.
  - Exposed: resolve it after the encounter as the power says (a saving throw, or the disease's
    attack): Contracted (stage 1) or Fought off.
  - Infected: the stage's text, the improve and maintain DCs, and an Endurance result field that
    picks Improve, Stay, or Worsen (Enter applies it). DCs printed as text leave the choice to the
    DM. Stage 0 cures and removes the disease; the final stage is permanent, with no more checks.
  - The add box puts a disease on a PC at stage 1.
- **Location traps in encounters.** An encounter linked to a location (`locationId`) also gets
  that location's traps (`encounterTrapRows`): they join its combat hidden, count in its XP, and
  show as read-only "from <location>" rows; a trap the encounter lists itself appears once.
- **Deferred.** Revealed triggered traps in the Player window; the DM hasn't designed that UI.
- Tests: `diseases.test.ts` (mentions, Endurance outcomes, stages), encounter combatants (location
  traps join once, hidden), and `test:combat:ui` (encounter diseases, the chip exposing a PC in
  combat, Contracted, and a failed check moving to stage 2 on the PCs page; location traps in the
  encounter).

## Phases

1. (Done 2026-11-13.) Encounter data, editor section, XP and difficulty with traps. Tests: XP sums, old encounter files
   load unchanged.
2. (Done 2026-11-13, see the status above.) Combat on kit content: converter at combat start, `facts.ts` accessors in the engine and combat UI, kit-based encounter adjustments, and the fidelity test (steps in "Phase 2 in detail"). All existing engine tests pass unchanged in meaning.
3. (Done 2026-11-13.) Trap combatants: start combat with traps, initiative and triggered strip, `TrapStatblock` in the
   current-turn and inspect panels, disable action, hidden start. Engine tests for a trap with
   initiative (turn and recharge) and a triggered trap (never takes a turn). UI smoke in hidden
   windows.
4. (Done 2026-11-13.) Disease chips on power cards and the encounter's disease list.
5. (Done 2026-11-13.) PC disease tracking and the extended-rest roll.

Each phase updates `AGENTS.md`, `TESTING.md`, and `TODO.md` when it lands.

## Out of scope

- Skill challenges and terrain effects on the map.
- Automating trap triggers from token movement.
- Moving stored campaign creatures to kit records (TODO section 3); combat converts them on the fly until then.
