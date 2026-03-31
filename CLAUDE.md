# Tabletop Dashboard — Project Context

## What This Is

Electron app for a DM running physical tabletop RPGs. Two windows (DM + Player), system-agnostic via plugin architecture, campaign data stored as JSON on disk. Built with React + TypeScript + Zustand + TipTap + CSS Modules, using electron-vite as the build tool.

## User Profile

- Heavy Vim/keyboard user — wants hotkeys for everything
- Runs PF2e, D&D 4e, and Delta Green
- Strong low-level programmer, new to web/frontend — explain web-specific decisions but don't over-explain general programming
- Wants maximum automation for deterministic game mechanics (auto-decrement conditions, prompt saves, track durations)
- Strongly values human-readable, non-proprietary data (JSON files on disk, not databases)
- Prefers minimal well-known libraries; implement small utilities in-house
- Security-conscious: run npm install/builds inside the devcontainer, never directly on host
- Electron GUI launches from inside the container — Wayland socket, GPU, and env vars are passed through by `dev.sh` / `devcontainer.json`. Launch with `./launch.sh` from a host terminal, or `! npx electron-vite dev -- --ozone-platform=wayland` from inside the container

## Architecture

- **Main process**: single source of truth. Owns campaign data, combat state machine, plugin loading.
- **DM renderer**: sends commands via `ipcRenderer.invoke()`, receives state via broadcasts.
- **Player renderer**: receive-only — gets stripped state (no exact HP, no stat blocks).
- **Zustand stores** in each renderer populated entirely from main process broadcasts.
- **State flow**: `DM Renderer → invoke(command) → Main Process → mutate → broadcast to both renderers`
- **Plugins**: JS/TS modules defining conditions, schemas, initiative rules, HP descriptors, turn hooks, theme overrides (v2). Three built-in: PF2e, D&D 4e, Delta Green. User plugins from `~/.tabletop-dashboard/plugins/`.
- **Effects vs Conditions**: Conditions = system-defined with automation rules. Effects = DM-created ad-hoc during combat that can apply/remove Conditions.
- System-specific theming (fonts, colors) is v2 but architecture supports it via CSS custom properties.
- No router — ContentArea switches on Zustand store state.

## Implementation Status

### Phase 1: Skeleton — IN PROGRESS (nearly complete)
All source files written but **not yet built or tested**. Need to:
1. Run `npm install` (inside devcontainer)
2. Fix build error: `electron-vite/utils` import doesn't exist in installed version — need to fix `src/main/windows.ts` (the `is.dev` usage) and `electron.vite.config.ts` (the `externalizeDepsPlugin` import). Check actual electron-vite API.
3. Verify the app launches with two windows and IPC works.

**What exists:**
- `package.json`, `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json`, `electron.vite.config.ts`
- All common types (`src/common/types/`) — SystemPlugin, Campaign, Combat, Creature, Encounter, Item, PlayerCharacter, Scene
- All common utils (`src/common/utils/`) — ID generation (nanoid), HP descriptor resolution, link extraction
- IPC channel constants (`src/common/ipc-channels.ts`)
- Main process: entry (`src/main/index.ts`), window creation (`src/main/windows.ts`), all IPC handlers, campaign data store with atomic writes, plugin loader, full combat engine state machine
- Preload scripts: DM (full API) and Player (receive-only)
- DM renderer: entry files, App, AppShell layout, Sidebar, ContentArea, CommandPalette (Ctrl+K), Zustand stores (campaign, combat, ui), sync middleware, hooks (useIpcSync, useHotkeys, useCampaign)
- Campaign editors: HomeView (campaign create/open), NoteEditor (TipTap), CreatureEditor (schema-driven), EncounterEditor (with Start Combat), SchemaForm (renders dynamic forms from plugin schemas), EntityList
- Stub editors: LocationEditor, ItemEditor, PCEditor (placeholder divs)
- Combat: CombatView (stub — shows round/phase, "coming in Phase 5")
- Player renderer: entry files, PlayerShell (basic combat/story mode switching), player-store
- All three plugins with real condition data and schemas: PF2e (30 conditions, full stat block + PC + item schemas, turn hooks for Frightened/Stunned/Persistent Damage), D&D 4e (17 conditions, 4e-style schemas, save-ends hooks), Delta Green (5 conditions, stat-based schemas)
- CSS theme with custom properties, light/dark mode support
- `.devcontainer/` with Dockerfile, firewall script, devcontainer.json

### Phase 2: Plugin System — DONE (built into Phase 1)
Types, plugin loader, and all three plugins already written with real data.

### Phase 3: Campaign Data Layer — DONE (built into Phase 1)
Campaign CRUD, entity CRUD, atomic file I/O (write .tmp then rename), autosave on every change, bi-directional link index with debounced rebuild. All in `src/main/data/`.

### Phase 4: DM Campaign Management UI — PARTIALLY DONE
- Done: AppShell, Sidebar, ContentArea, CommandPalette, HomeView, NoteEditor, CreatureEditor, EncounterEditor, EntityList, SchemaForm
- Remaining: flesh out LocationEditor, ItemEditor, PCEditor (currently stubs). Image upload + circular icon crop. Backlinks panel.

### Phase 5: Combat Tracker — NOT STARTED (engine exists, UI is stub)
Combat engine is fully implemented in `src/main/combat/combat-engine.ts` with: start/end combat, add/remove combatants, initiative sorting, next/prev turn with plugin hooks, delay/undelay, damage/heal (temp HP absorbs first), conditions (replace-if-same, automation), effects (round decrement), player-safe state stripping.

UI needed: Initiative entry dialog, CombatView split layout, InitiativeList, CombatantDetail panel, condition/effect management dialogs, damage/heal dialogs, mini indicators, reinforcements, combat keyboard shortcuts.

### Phase 6: Player Screen — NOT STARTED (basic shell exists)
PlayerShell exists with combat round display and story mode placeholder. Need: initiative cards with HP descriptors, turn spotlight, story mode with location background images, auto mode switching from main process.

### Phase 7: Polish — NOT STARTED
Full keyboard shortcut audit, empty states, error handling, window persistence, last-opened campaign setting.

## Key Files to Know

| File | Role |
|------|------|
| `electron.vite.config.ts` | Build config — dual renderer entry points |
| `src/common/ipc-channels.ts` | All IPC channel names (CMD.* and SYNC.*) |
| `src/common/types/system-plugin.ts` | The core plugin interface |
| `src/main/combat/combat-engine.ts` | Combat state machine (most complex logic) |
| `src/main/data/campaign-store.ts` | Campaign data CRUD + file I/O |
| `src/main/windows.ts` | BrowserWindow creation + broadcast helpers |
| `src/renderer/stores/ui-store.ts` | ViewMode type drives all navigation |
| `src/renderer/components/layout/AppShell.tsx` | Top-level DM layout |
| `src/renderer/components/campaign/SchemaForm.tsx` | Renders dynamic forms from plugin schemas |
| `plugins/pathfinder-2e/index.ts` | Reference plugin implementation |

## Known Issues / Next Steps

1. **Build not yet attempted** — `npm install` + `electron-vite build` need to run in devcontainer
2. **electron-vite API mismatch** — `externalizeDepsPlugin` and `is` from `electron-vite/utils` may not exist. Check installed version's actual exports.
3. **Stub components** need fleshing out: LocationEditor, ItemEditor, PCEditor, shared components (ConditionBadge, EffectBadge, HpBar, CreatureIcon)
4. **Combat UI** is the biggest remaining work — engine is done but no renderer components
5. **Player screen** needs initiative cards and story mode

## Design Spec

Full spec is in `SPEC.md` at the project root.
