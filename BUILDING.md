# Building 4e DM Dashboard

The app runs on Linux, macOS, and Windows. Packaged builds include Electron, so users need neither
Node.js nor Electron. No game content ships with the app: the DM imports a content pack in
Settings › Content.

Clone with the 4e-kit submodule:

```sh
git clone --recurse-submodules https://github.com/SpencerMichaels/4e-dm-dashboard.git
```

## Development

Builds and tests run in the project's Nix dev shell (`flake.nix` pins Node and Electron):

```sh
nix develop -c npm ci
nix develop -c npm test
nix develop -c npm run typecheck:node
nix develop -c npm run test:ui     # the UI suites, in hidden windows
./launch.sh                        # dev mode with hot reload
```

Without Nix, Node.js 22 and `npm ci` work too (CI does this); `npm run test:ui` then needs
`FOUR_E_OZONE_PLATFORM=x11` on an X11 display (CI uses `xvfb-run`), since it defaults to Wayland.

## Nix package (Linux)

```sh
nix build        # ./result/bin/4e-dm-dashboard and 4e-dm-dashboard-mcp
./install.sh     # into the current profile
```

The package runs nixpkgs' Electron. Update `npmDepsHash` in `default.nix` when `package-lock.json`
changes (set it to `pkgs.lib.fakeHash`, run `nix build`, copy the hash it prints).

## Native distributables

[electron-builder](https://www.electron.build/) (`electron-builder.yml`) builds on the target OS:

```sh
npm run dist:linux   # AppImage (x64)
npm run dist:mac     # universal DMG and ZIP
npm run dist:win     # NSIS installer and portable EXE (x64)
npm run package      # an unpacked app directory, for a quick look
```

Artifacts land in `release/`. The packaged app holds only the bundles in `out/` and `nanoid` (the
main process's one external module). electron-builder's own tools don't run on NixOS; use the Nix
package there, and let CI build the others.

The macOS and Windows builds are unsigned and not notarized: macOS asks the user to open the app
from its context menu (or System Settings › Privacy & Security) the first time, and Windows
SmartScreen shows "More info › Run anyway".

## CI

`.github/workflows/build.yml` runs the unit tests, `typecheck:node` and the UI suites (under xvfb) on
Linux, then builds the three platforms on native runners and the Nix package. Each build is uploaded
as a workflow artifact; pushing a `v*` tag also attaches them to that GitHub release.
`typecheck:web` has known older errors and is not gated.

## Application data

Campaigns, the shared Library, the content pack and settings live in Electron's `userData`
directory, the same for every kind of build:

- Linux: `$XDG_CONFIG_HOME/4e-dm-dashboard` (normally `~/.config/4e-dm-dashboard`)
- macOS: `~/Library/Application Support/4e-dm-dashboard`
- Windows: `%APPDATA%\4e-dm-dashboard`

## The authoring MCP server

Settings › AI agent shows the `claude mcp add` line for the build that is running:

- a packaged build is its own server: `<app> --mcp` (the AppImage, the portable EXE, or the installed
  executable), which reruns itself as Node on the bundled CLI without opening a window;
- the Nix package installs `4e-dm-dashboard-mcp`;
- a source checkout runs the CLI from source in the Nix shell.

See `docs/AUTHORING.md`.
