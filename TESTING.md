# Testing handoff — four small fixes

## Workshop (content authoring) regression (2026-11-12)

Run in the devcontainer: `npm test`, `npm run typecheck:node`, `npm run build`, then `npm run test:authoring:ui` and `npm run test:compendium:ui` (compendium editing for traps, diseases, templates, and themes: clone on first edit, autosave, Custom listing, delete, new entries). The UI smoke test uses temporary appData/userData and hidden, unthrottled Electron windows (`FOUR_E_HIDDEN_WINDOWS=1`, nothing appears on the desktop), verifies all four native previews, editing through the native compendium creature editor (HP, damage, hit prose; applied without an Apply step), merging with a concurrent agent change and the same-field Keep mine prompt, the version history list, a comment anchored to a power, DM-edit tracking, review, and campaign save, and writes `out/authoring-smoke.png` plus `out/authoring-edit-smoke.png`. It does not use real campaigns. `typecheck:web` retains pre-existing project-boundary/alias/component errors; check for new authoring-module errors separately.

## Power cards (2026-11-13)

In combat and the Creatures page: each power, trait, and aura is one card with an action icon, dim keywords, a Basic marker on basic attacks, a usage chip, and a pin in the header; attacks have their own line (range · target · bold bonus vs short defense). Click a limited power to use it: the card collapses, its name is struck through, and the chip says USED (or 1/2 Enc, Rch 5+ · USED); click again to show it, right-click to restore. Tab focuses cards; Enter uses. Click-to-apply conditions and diseases still work. Reaction tiles are the same card, header only. Pin a limited power, then use it: the pinned card shows it used and can restore it; at the start of its turn a recharge power's chip shows a dice icon until the roll is resolved. Check light and dark themes.

## Creature records (2026-11-13)

Run `npm run test:compendium:ui` and `npm run test:combat:ui` (hidden windows). Manual checks:

- Open an existing campaign: each creature converts once (`creatures/_legacy-<file>.json` holds the original). Check its stats, powers, images, and token on the Creatures page, then fight it.
- A creature saved from the Workshop and later edited on the old Creatures page keeps those edits after conversion.
- Creatures page: filters (role, rank, type, size, origin), published preview with image and token panel (published art is stored as an annotation), pop-out, Copy to campaign (the copy carries the art and is saved by its first edit), the benchmark editor, delete, + new, and Edit in Workshop.
- An encounter that lists a published monster uses the published one even if you have a clone of it.
- Command palette: "New Creature" and creature names open the Creatures page on that creature.

## Combat on kit content (2026-11-13)

Run `npm run test:combat:ui` after `npm run build` (hidden windows). Manual checks in a real campaign:

- Open an existing encounter: rows show the same levels, XP, and template/theme chips as before. Select a templated row: the preview shows the template chip, orange attributed numbers, and the template's traits and powers. Hover templates in template mode: the preview adds the hovered one. Pick a theme: the preview follows the picker before Apply.
- A template on an elite creature now makes it solo (DMG p.175). Before, it stayed elite.
- Start combat: every creature appears, with grouped initiative for multi-count rows. Check a regenerating creature (Troll: regeneration 5, stopped by fire or acid, and Troll Healing revives it at 15), a recharge power (prompt at the start of its turn), a reaction tile (a goblin's Goblin Tactics), click-to-apply conditions in power text, the defenses shown in attack mode, the damage dialog's resistances, and the popout stat block.
- A level-adjusted creature's power cards show the attack and damage adjustment on hover.
- Diseases: in an encounter with a disease carrier (a dire rat), the editor lists the disease and its source. In combat, click the highlighted disease name in its Bite text (it applies like a condition): the banner asks for a PC; click one, and shift-click the name to pick several. Non-PC targets are ignored. The chip under the card only shows the disease. On the PCs page, the PC shows 🦠1 and the Diseases panel shows Exposed. Use Contracted and Fought off, then enter an Endurance result: the bold button follows the DCs, Enter applies it, stage 0 removes the disease, and the final stage stops the checks.
- Location traps in encounters: link an encounter to a location with traps. Its Traps section shows them read-only ("from <location>"), XP includes them, and they join combat hidden.
- Location traps: on a location page and in a map pin's sidebar, add a published and a Custom trap with the Traps search. Each shows as its statblock and collapses to a one-line row. Delete the Custom trap from the Traps page: the location row says it no longer exists.
- Traps: add a published trap and a Custom trap to an encounter. Check the row XP, the encounter total, the preview, and the "visible" checkbox. In combat, a trap with initiative takes turns, hidden from players unless its row was visible. A trap without initiative appears in the Triggered traps strip: Trigger shows its stat block and logs it, and Disable / Re-arm toggles it. An HP-less trap shows "HP none" and ignores damage.

Manual follow-up:

- Connect an external agent using `docs/AUTHORING.md`; create the Shadow concept, find precedents, and resolve material timing/ownership questions.
- Edit a power's prose and accuracy directly, leave a targeted comment, reorder powers, restart, and ask the agent to continue. Confirm text/metadata reconciliation, that the agent builds on DM edits rather than reverting them, and that edits made while the agent revises merge (other fields) or ask (the same field). Save, edit, and save again: the campaign entry updates in place, with no duplicate.
- Switch campaigns before approval; confirm saving still uses the displayed destination. Save a draft to two campaigns, then revise a saved entry through Edit in Workshop (creatures from their view; items, traps, diseases, templates, and themes from their compendium pages).
- Open a campaign that has items from before 2026-11-13; confirm each item lists on the Items page as Custom with its powers, critical, and properties intact, and that `items/_legacy-<file>.json` holds the original. Clone a published item by editing it; confirm the clone keeps everything (powers, critical) and the published entry is unchanged.
- Check narrow/wide windows and both themes, keyboard field editing, comment focus, and screen-reader labels.
- Confirm no draft, comment, or review appears in the Player window. Linked-minion transformations and curses remain explicit DM-adjudicated rules.

The older checklist below is retained for historical reference.

Status: Historical manual regression checklist. The implementation is present; completion of every manual step was not recorded. This file is not an active implementation backlog.

The session before you applied four independent renderer-side fixes. Build/typecheck and UI-verify each one inside this devcontainer.

## Build / typecheck first

```bash
npm run typecheck
```

If that's clean, launch the app: `npx electron-vite dev -- --ozone-platform=wayland` (or whatever the project's standard dev command is — check `package.json` if unsure).

## Changes applied

| # | What | Files touched |
|---|------|---------------|
| 1 | Added `grabbed` + `invisible` conditions to the D&D 4e plugin | `plugins/dnd-4e/index.ts`, `src/renderer/plugins/dnd-4e/condition-styles.ts` |
| 2 | "Mark Dead" / "Revive" toggle in the QuickConditionMenu (for instant-death effects that bypass death saves) | `src/renderer/components/combat/QuickConditionMenu.tsx` |
| 3 | Click-to-front for `FloatingPanel`-based popouts (was fixed z-index 50) | `src/renderer/components/shared/FloatingPanel.tsx` |
| 4 | Fixed `Senses: ... [object Object]` on templated creatures (crushgrip constrictor was the report) | `src/renderer/plugins/dnd-4e/monster-templates.ts`, `src/renderer/plugins/dnd-4e/Dnd4eCombatPanel.tsx` |

## UI test plan

### Fix 1 — Conditions

1. Open any 4e encounter and enter combat.
2. Right-click a combatant → QuickConditionMenu opens.
3. Confirm **Grabbed** (✊ tan pill) and **Invisible** (👁 light grey pill) appear in the 2-column condition grid, alphabetized between existing entries.
4. Click each — should apply, show a ✓, and render as a pill on the InitiativeList row.
5. Click again to remove. Both should round-trip cleanly.

### Fix 2 — Mark Dead

1. In combat, right-click a PC.
2. Scroll to the bottom of the QuickConditionMenu — there's now a 💀 **Mark Dead** row below the second divider, above the custom-condition input.
3. Click it. Menu closes. Verify:
   - The PC is now styled as dead in `InitiativeList` (same styling that already existed for monsters at 0 HP).
   - Pressing Next Turn skips this PC.
   - The player window's `CombatDisplay` reflects the dead state.
4. Right-click the same PC again → the row should now say **Revive**. Click it. PC returns to active.
5. Repeat with a monster — should work identically (button is universal, not PC-only).

### Fix 3 — Click-to-front floating popouts

1. Open the D&D 4e creature list (or compendium with creatures). Pop out two or three creatures into floating panels.
2. They should stack newer-on-top by default.
3. Click the title bar OR body of a panel that's *underneath* another — it should jump to the top.
4. Open a *new* popout — it should appear above all existing ones.
5. Also check: combat log panel, pinned cards panel, popped-out statblocks during combat — all use `FloatingPanel`, so all should now click-to-front.
6. Sanity: the encounter editor's "DraggableTemplateWindow" and the combat SettingsModal both use `zIndex: 1000` — they should still appear above all popouts.

### Fix 4 — Senses `[object Object]`

1. Find the **Crushgrip Constrictor** in the 4e compendium.
2. Without modification, the raw JSON has `"senses": "Low-light vision"` — verify it renders cleanly in the creature viewer (this was already fine).
3. Apply an Elite or Solo template to it (in the encounter editor).
4. Open the combat panel popout (or add it to combat and pop it out).
5. The Senses line should now read something like `Senses: Perception +12; Low-light vision` (plus any senses the template adds) — **not** `[object Object]`.
6. Sanity: also check an untemplated creature still renders senses normally, and any other templated creature in the encounter renders senses as names (not objects) in both `Dnd4eCreatureViewer` and `Dnd4eCombatPanel`.

## What to watch for

- **Fix 3** uses a module-scope counter in `FloatingPanel.tsx`. If HMR replaces the module, the counter resets to 50 — close and reopen all popouts after a reload to retest cleanly.
- **Fix 4**'s root fix is in `monster-templates.ts:919-930`. If you find another place where senses are mishandled, the defensive read in `Dnd4eCombatPanel.tsx:83` should catch it but worth reporting.
- **Fix 2** relies on the engine's existing `dead` flag handling (`combat-engine.ts:112-120` for skip logic, `InitiativeList.tsx:123` for styling). No engine changes were needed.

If anything fails or behaves unexpectedly, report which fix and which step.
