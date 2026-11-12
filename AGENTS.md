# 4e DM Dashboard — Agent Context

This is the canonical repository guidance for coding agents. Keep it current as the project evolves.

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

## Working Agreements

- Preserve the human-readable, file-based data model and the main-process-as-source-of-truth architecture.
- Prefer focused changes and small, well-known dependencies. Ask before adding a production dependency.
- Do not discard or overwrite unrelated working-tree changes.
- Run package installation, builds, and tests inside the devcontainer, not directly on the host.
- When changing behavior, update the relevant project documentation and add or update tests when practical.
- Keep the implementation-status section below current when completing a documented task.

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

The application is functional across its main workflows:

- Campaign data and entities are stored as human-readable JSON with atomic writes and differential renderer broadcasts.
- Campaign management includes notes, creatures, encounters, locations, items, maps, player characters, images, and compendium browsing/editing.
- The combat tracker includes initiative entry and reordering, current/inspected stat blocks, damage/healing, conditions and effects, delay/ready actions, reaction tracking, turn automation, and combat logging.
- The player window supports combat and story displays while receiving player-safe state.
- Built-in PF2e, D&D 4e, and Delta Green plugins provide their system definitions and renderer integrations.
- Renamed from "Tabletop Dashboard" to "4e DM Dashboard" (2026-11-12). On first launch, `src/main/data/migrate-user-data.ts` moves the old `~/.config/tabletop-dashboard` userData dir to the new location.
- `npm run build` and `npm run typecheck:node` pass in the devcontainer as of 2026-11-12.

Current planned implementation work is maintained in `TODO.md`. Historical completed batches are recorded in `CLEANUP.md`, `issues.txt`, `tasks.md`, and `feedback.md`.

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

- `TODO.md` is the authoritative implementation backlog.
- `TESTING.md` is a retained manual regression checklist; it is not an implementation backlog.
- The production build is green, but `npm run typecheck:web` still exposes older TypeScript project-boundary, alias, and component-typing issues that electron-vite does not require for bundling.

## Design Spec

Full spec is in `SPEC.md` at the project root.
