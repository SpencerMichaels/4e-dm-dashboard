# 4e DM Dashboard

A desktop companion for a Dungeon Master running Dungeons & Dragons 4th Edition at a physical table.
It tracks initiative, monster hit points, conditions and effects, and shows a player-facing window on
a second display. It also holds the campaign itself: creatures, encounters, locations, items, traps,
maps and player characters. Players keep their own sheets; the dashboard is the DM's.

- **Combat tracker**: initiative, damage and healing, conditions with automatic durations and saves,
  ongoing damage, recharges, delay/ready, reactions, and click-to-apply effects from power cards.
- **Player window**: initiative order, HP descriptors (never exact HP), and story displays.
- **Campaign data as JSON files** in a plain directory tree, readable and editable outside the app.
- **Compendium pages** for creatures, items, traps, diseases, templates and themes, with editors and
  the published 4e monster math, plus a shared Library of custom entries across campaigns.
- **Character Builder import** (`.dnd4e`) for the party's defenses and passive skills.
- **Keyboard-first**, with hotkeys for the common actions.
- An optional local **MCP server**, so an AI agent such as Claude Code can draft and review entries
  in what the DM has open (`docs/AUTHORING.md`).

## Content

The app ships no published game content. Monsters, items and the rest come from a **content pack**,
which the DM imports in Settings › Content. Content packs are not part of this repository. Without
one, the app works with your own entries only.

## Install and build

Releases provide a Linux AppImage, a macOS DMG/ZIP and a Windows installer or portable EXE
(unsigned). On NixOS or with Nix, `nix build` builds the package. See [BUILDING.md](BUILDING.md).

```sh
git clone --recurse-submodules https://github.com/SpencerMichaels/4e-dm-dashboard.git
```

Shared 4e code (the content schema, vocabulary and design tokens) is in
[4e-kit](https://github.com/SpencerMichaels/4e-kit), included as a submodule.

## License

GPL-3.0 ([LICENSE](LICENSE)).

Not affiliated with or endorsed by Wizards of the Coast. Dungeons & Dragons is a trademark of
Wizards of the Coast LLC.
