# Codebase Cleanup Audit

Comprehensive audit of antipatterns, overcomplications, legacy cruft, and UI inconsistencies.

---

## 1. UI Inconsistencies

### 1.1 No shared Modal/Dialog component

Every modal reimplements the same overlay + panel + ESC-to-close structure inline. There are 7+ independent implementations with inconsistent behavior:

| File | minWidth | Overlay opacity | Click-outside closes? | zIndex |
|------|----------|----------------|-----------------------|--------|
| ConditionDialog.tsx | 350 | rgba(0,0,0,0.5) | No | — |
| DamageHealDialog.tsx | 300 | rgba(0,0,0,0.5) | No | — |
| ReadyActionDialog.tsx | 360 | rgba(0,0,0,0.5) | No | — |
| EffectDialog.tsx | 350 | rgba(0,0,0,0.5) | No | — |
| SaveRechargeModal.tsx | — | rgba(0,0,0,0.6) | No | 100 |
| HotkeysModal.tsx | — | — | Yes | 100 |
| SettingsModal.tsx | — | — | Yes | 1000 |

**Fix:** Extract a `<Modal>` component that standardizes overlay styling, ESC handling, click-outside behavior, focus trapping, and z-index layering.

### 1.2 Inconsistent button styling

Action buttons use a mix of hardcoded colors with no shared pattern:
- Damage: `background: '#c00'`
- Heal: `background: '#0a0'`
- Ready: `background: '#39c'`
- Condition submit: CSS vars when disabled, hardcoded otherwise
- Cancel buttons: browser defaults everywhere

Disabled state handling also varies: some use `disabled` attribute + opacity, others just opacity, some nothing.

**Fix:** Define button variant classes (primary, danger, success, secondary) in a shared CSS module or the global theme.

### 1.3 Inconsistent form label/field patterns

At least 4 different patterns for rendering form labels:
- `<label style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>` (ConditionDialog)
- `<label style={{ display: 'flex', alignItems: 'flex-start' }}>` (SettingsModal)
- `<span style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>` (ItemEditor)
- Custom `sectionLabel()` helper function (LocationEditor)

Field container spacing also varies: `marginBottom: 'var(--space-3)'` vs `gap: 'var(--space-2)'` vs `marginBottom: 'var(--space-4)'`.

**Fix:** Create a shared `<FormField>` component or at least standardize on one label pattern.

### 1.4 Inconsistent focus management

Four different approaches to auto-focusing inputs in dialogs:
1. `useRef` + `useEffect` with `.focus()` (DamageHealDialog, EffectDialog, ReadyActionDialog)
2. `autoFocus` attribute (ConditionDialog)
3. `setTimeout(() => ref.current?.focus(), 50)` (MapEditor)
4. No focus management at all (some forms)

**Fix:** Standardize on `autoFocus` for simple cases, `useRef`+`useEffect` for conditional focus.

### 1.5 Confirm-delete is `window.confirm()`

Delete confirmations use the browser's native `window.confirm()` dialog (via `confirm-delete.ts`). This works but looks out of place in an Electron app and can't be themed.

**Fix (low priority):** Replace with the new shared Modal component once it exists.

---

## 2. Styling & Theme Issues

### 2.1 Undefined CSS variable: `--color-text`

Multiple components use `var(--color-text)` which is **not defined** in `theme.css`. The defined variables are `--color-text-primary`, `--color-text-secondary`, and `--color-text-muted`. Affected files:
- ReactionsPanel.tsx
- QuickConditionMenu.tsx
- SaveRechargeModal.tsx
- CombatLogPanel.tsx
- InitiativeList.tsx

**Fix:** Replace all `var(--color-text)` with `var(--color-text-primary)`.

### 2.2 Hardcoded colors everywhere

Extensive use of hardcoded hex colors instead of CSS custom properties. The theme system defines HP, status, and action color variables that go unused, while components hardcode the same values:

- `#c00` (damage/danger), `#0a0` (heal/success), `#39c` (info/ready), `#c90` (warning/delayed) appear dozens of times
- `#fff` appears 22 times, `#000` appears 5 times
- HP colors are hardcoded (`#0a0`, `#c90`, `#c00`) despite `--color-hp-full`, `--color-hp-mid`, `--color-hp-low` existing in the theme

**Fix:** Add semantic color variables to theme.css (`--color-status-danger`, `--color-status-success`, `--color-status-info`, `--color-status-warning`, `--color-action-damage`, `--color-action-heal`) and replace all hardcoded values. Wire up the existing but unused HP color variables.

### 2.3 Unused CSS custom properties

These theme variables are defined but never referenced anywhere:
- `--color-hp-full`, `--color-hp-high`, `--color-hp-mid`, `--color-hp-low`, `--color-hp-down`
- `--color-turn-active`, `--color-turn-delayed`
- `--color-bg-tertiary`, `--color-accent-hover`, `--color-danger-hover`
- `--color-success`, `--color-warning`, `--color-text-inverse`
- `--font-heading`, `--font-mono`
- `--transition-fast`, `--shadow-sm`, `--shadow-md`
- `--space-5`, `--space-8`

**Fix:** Use these variables (replacing hardcoded equivalents) or prune them.

### 2.4 Raw pixel values vs CSS variables

Spacing values are a mix of raw pixels and CSS variables with no clear rule:
- `padding: '2px 8px'` (13 uses) alongside `padding: 'var(--space-2) var(--space-3)'` (12 uses)
- `gap: 4` alongside `gap: 'var(--space-2)'`
- `borderRadius: 5` alongside `borderRadius: 'var(--radius-sm)'`

**Fix:** Establish a mapping (2px = `--space-1`, 4px = `--space-2`, etc.) and do a sweep to standardize. Not every pixel value needs a variable, but spacing and radius should be consistent.

### 2.5 Inline styles vs CSS modules

Layout components (AppShell, Sidebar, CommandPalette) use CSS modules; everything else uses inline styles. This split is somewhat natural (layout = stable, content = dynamic), but the combat components in particular have massive inline style objects that would benefit from CSS modules.

**Fix (low priority):** Migrate the heaviest inline-style components (CombatantDetail, AttackApplyPanel, CombatLogPanel) to CSS modules over time.

---

## 3. Main Process / Engine Issues

### 3.1 Duplicated EONT/SONT expiration logic in combat engine

The condition expiration scanning logic appears twice in `combat-engine.ts`:
1. `buildSourceExpireItems()` (lines ~228-257) — builds preview items
2. `commitAndAdvance()` (lines ~769-804) — actually removes conditions

Both perform identical filtering, condition lookups, and label generation. Same duplication exists for SONT removal + decrement logic at lines ~545-556 vs ~794-804.

**Fix:** Extract shared expiration-scanning into a utility function used by both code paths.

### 3.2 Repeated condition definition lookups

`plugin?.conditions.find(d => d.id === condId)` is repeated 10+ times across combat-engine.ts (lines 244, 273, 290, 319, 527, 660, 776, 1145, 1319, etc.).

**Fix:** Extract a `getConditionDef(condId, plugin)` helper.

### 3.3 Redundant damage type matching

The pattern `dmgTypes.some(t => t && rType.includes(t))` for checking immunities/resistances/vulnerabilities is repeated in both `buildOngoingDamageItems()` and `buildRegenAndOngoingItems()`.

**Fix:** Extract to `matchesDamageType()` helper.

### 3.4 Overcomplicated `buildRegenAndOngoingItems()`

This 70+ line function mixes damage type parsing, resistance calculation, UI label generation, and state mutation logic. Four different return paths.

**Fix:** Split into focused functions: net healing calculation, label generation, and item construction.

### 3.5 25+ identical broadcast-after-mutate patterns in combat handlers

Nearly every handler in `combat-handlers.ts` follows:
```ts
ipcMain.handle(CMD.COMBAT_*, async (...) => {
  const state = engine.someFunction(...)
  broadcastCombatState()
  return state
})
```

**Fix:** Extract a higher-order `withBroadcast()` wrapper.

### 3.6 Duplicate NOTE_* handlers

`NOTE_SAVE`, `NOTE_DELETE`, `NOTE_GET` in campaign-handlers.ts are identical wrappers around `store.saveEntity('note', ...)`. The generic `ENTITY_SAVE`, `ENTITY_DELETE`, `ENTITY_GET` handlers already exist and do the same thing.

**Fix:** Remove NOTE_* handlers; route note operations through ENTITY_* handlers.

### 3.7 Full campaign broadcast on every entity change

`broadcastCampaignState()` loads all 11 entity types via `Promise.all` and sends the entire campaign state over IPC on every single CRUD operation.

**Fix:** Implement targeted/differential broadcasts — only send the changed entity type, or debounce bulk operations.

### 3.8 Compendium handlers are D&D 4e-specific

`compendium-handlers.ts` has multiple `if (systemId !== 'dnd-4e')` checks. Adding compendium support for another system requires modifying the main process.

**Fix:** Move system-specific compendium logic into plugins; main process should be system-agnostic.

---

## 4. IPC / Data Flow Issues

### 4.1 `resolvePrompts` is called but never defined

`SaveRechargeModal.tsx:62` calls `window.api.combat.resolvePrompts(resolutions)`, but no handler, channel, or preload binding exists for this. The call silently fails.

**Fix:** Either implement the handler or remove the dead call.

### 4.2 Fire-and-forget IPC calls

Multiple renderer components invoke IPC without `await`, creating potential race conditions:
- ConditionDialog.tsx:51 — `addCondition` not awaited
- InitiativeEntry.tsx:308 — `updateCombatant` in a loop, none awaited
- QuickConditionMenu.tsx:111,124,151,162 — multiple `addCondition` calls not awaited
- EffectDialog.tsx:33 — `addEffect` not awaited
- CombatantDetail.tsx:138,231 — `removeCondition`/`removeEffect` not awaited

**Fix:** Await IPC calls or implement a command queue to serialize mutations.

### 4.3 Missing broadcasts after mutations

- `CAMPAIGN_DELETE`: Deletes campaign but doesn't broadcast — renderer keeps stale campaign list
- `NOTE_TREE_SAVE`: Saves note tree structure but doesn't broadcast the change

**Fix:** Add appropriate broadcasts after these mutations.

### 4.4 SYNC.THEME channel is dead code

`SYNC.THEME` is defined in ipc-channels.ts, both preload scripts listen for it, but it's never broadcast from the main process.

**Fix:** Either implement theme broadcasting or remove the dead listeners.

### 4.5 `CAMPAIGN_GET_META` handler never called

Defined and handled but no renderer code ever invokes it.

**Fix:** Remove or wire up.

### 4.6 Preload API uses `any` types

Entity and combatant parameters in preload/index.ts are typed as `any` (lines 18, 26, 30, 67, 70), losing type safety at the IPC boundary.

**Fix:** Use proper types from `src/common/types/`.

### 4.7 Scene state listener is a no-op

`sync-middleware.ts:27-30` listens for `sceneState` but the callback body is empty (just a comment).

**Fix:** Implement or remove.

---

## 5. Suggested Priority

### Do first (quick wins)
1. Fix undefined `var(--color-text)` — it's a bug right now (2.1)
2. Implement or remove `resolvePrompts` dead call (4.1)
3. Add missing broadcasts for CAMPAIGN_DELETE and NOTE_TREE_SAVE (4.3)

### High value refactors
4. Extract shared `<Modal>` component (1.1) — reduces the most duplicated UI code
5. Define semantic color variables and replace hardcoded colors (2.2) — enables theming
6. Extract duplicated expiration logic in combat engine (3.1)
7. Extract `withBroadcast()` wrapper for combat handlers (3.5)

### Medium priority
8. Standardize button variants (1.2)
9. Remove duplicate NOTE_* handlers (3.6)
10. Wire up unused theme variables, remove truly unused ones (2.3)
11. Await IPC calls or add serialization (4.2)
12. Extract `getConditionDef()` and `matchesDamageType()` helpers (3.2, 3.3)

### Low priority / ongoing
13. Migrate heavy inline-style components to CSS modules (2.5)
14. Standardize raw pixel values to CSS variables (2.4)
15. Standardize form field patterns (1.3)
16. Clean up dead IPC channels and no-op listeners (4.4, 4.5, 4.7)
17. Type preload API properly (4.6)
18. Differential campaign broadcasting (3.7)
