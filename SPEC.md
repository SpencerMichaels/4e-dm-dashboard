# Tabletop Dashboard — Specification

This document specifies **Tabletop Dashboard**, a virtual-tabletop companion application for pen-and-paper TTRPG games played at a physical table. It is not for tracking token positions on a grid map, but rather for things like initiative order, monster HP, status effects, scene presentation, and campaign organization.

The primary assumption is that the DM is the sole operator — players do not have laptops. Players track their own HP, spell slots, etc. on paper; the application tracks initiative order, monster HP/status, conditions, effects, and presents information to players via a second display.

In addition to live combat tracking, the application is used by the DM to draft campaigns, set up encounters, manage NPCs/creatures, organize notes, and (in later versions) calculate treasure budgets.

---

## 1. Tech Stack

- **Framework:** Electron (portable across Linux, macOS, Windows).
- **Data storage:** Human-readable, non-proprietary formats. Campaign data is stored as JSON files in a directory tree — no SQL database. Images and audio are stored as regular files alongside the JSON.
- **Libraries:** Well-known, well-vetted libraries used sparingly. Trivial utilities are implemented in-house rather than pulling in dependencies.
- **Priority:** Interoperability and portability over marginal performance gains. The performance requirements are minimal (human-speed interactions, not real-time rendering).
- **Saving:** Autosave on every change. (If performance becomes an issue, fall back to periodic autosave, but this is unlikely at human editing speeds.)

---

## 2. High-Level Layout

The application runs on the DM's computer. An external display facing the players shows a second window (the **Player Screen**). The DM's primary window (the **DM Screen**) is where all interaction happens.

On launch, the user can:
- Select an existing campaign to open.
- Create a new campaign (which requires choosing a System).
- Optionally, a setting allows auto-opening the last-used campaign.

Only one campaign may be open at a time.

---

## 3. UI — General

- Simple, functional UI. Light and dark mode, auto-detecting system default.
- Notes are editable as WYSIWYG or raw Markdown, with a toggle to swap modes.
- **Keyboard-first design.** Every action should be accessible via keyboard shortcuts. The DM is a heavy keyboard user; hotkeys for all common operations (especially during combat: next turn, deal damage, add effect, dismiss overlay, etc.).
- **Undo/redo** for all destructive actions (v2 — nice-to-have).

---

## 4. DM Screen

### 4.1 Campaign Management View (out of combat)

A workspace with:
- **Sidebar:** Hierarchical campaign browser — Story (notes tree), Maps, Locations, Creatures, Encounters, Items, Player Characters. Clicking an entry opens it in the main content area.
- **Main content area:** Displays the selected object (note editor, creature stat block, encounter setup, map viewer, etc.).
- All objects support **bi-directional linking**: if a Location references an NPC, the NPC's page also lists that Location. If a Note links to a Creature, the Creature's page shows that Note in a "Referenced by" section. Links are maintained automatically.

### 4.2 Combat View

When combat is active, the DM screen switches to a **split view**:

- **Left panel — Initiative tracker & controls:**
  - Ordered list of all combatants (PCs and monsters) sorted by initiative.
  - Current turn highlighted. Round number displayed.
  - Each entry shows: name, circular icon, mini indicator (if assigned), HP (exact, DM-only), conditions, and active effects with remaining duration.
  - Quick-action buttons / keyboard shortcuts: deal damage, heal, add effect, add condition, mark delayed, kill/remove.
  - **Delayed creatures** float out of the initiative list into a visible "delayed" holding area. The DM can re-insert them at any point in the order.
  - An "add creature" function for mid-combat reinforcements.

- **Right panel — Detail view:**
  - Full stat block of the currently selected creature.
  - Active effects and conditions with descriptions and remaining duration.
  - System-provided hints (e.g., what a condition does mechanically).

- **Encounter notes** are accessible on demand via a quick-access shortcut/button (not permanently visible, but fast to bring up).
- The DM can **tab out** to other parts of the campaign (e.g., to check a note or NPC) without ending combat. This access is available but not prominent — it's an occasional need, not a primary workflow.

---

## 5. Player Screen

The player screen is **automatically controlled** — its mode follows from what the DM is doing. The DM does not manually switch modes; starting combat switches to combat mode, navigating to a location shows its scene, etc. The DM can also manually trigger overlays (see below).

### 5.1 Story Mode

Displays a **background image or looping video** with one or more **full-body character images** overlaid, arranged in a visual-novel style. The DM selects NPCs to "summon" onto the display from the current scene's available characters.

Background audio (looping ambience/music) plays and **cross-fades** when switching between scenes.

### 5.2 Map Mode

Displays a map with labeled location pins. The DM can show/hide individual locations. Supports **zoom and pan**, and the DM can point at locations.

- **Image-based maps** (fantasy settings): The DM uploads an image and places pins. A configurable **scale** (e.g., "1 inch = 5 miles") allows the app to calculate distances between pinned locations.
- **Real-world maps** (modern settings like Delta Green): Satellite imagery tiles (e.g., Google Maps or similar provider) used as a base layer with pins on top. For personal use only. *(v2 — nice-to-have)*

### 5.3 Combat Mode

A fullscreen initiative tracker dashboard. Background image or looping video, with overlaid:

- **Left side — Initiative cards:** A vertical stack of cards, current turn-taker on top. Each card shows:
  - Circular icon (with optional mini indicator: color + pips, assigned at combat start).
  - Name.
  - HP status — **not** exact numbers by default. Instead, a **descriptive label** mapped to HP percentage thresholds, defined per-system (e.g., `{100: "Healthy", 99: "Hit", 50: "Bloodied", 25: "Near Death", 0: "Dead"}`). Showing exact HP is a configurable option.
  - Visible conditions and effects.

- **Right side — Current turn-taker spotlight:**
  - Full-body picture.
  - Name and infobox listing their conditions, active effects, and any other tracked information.

- **Round number** displayed somewhere prominent.

- PCs appear in the tracker with portrait, name, and conditions/effects (no HP or stats — players track their own).

### 5.4 DM-Triggered Overlays

The DM can manually push content to the player screen at any time:
- **Character portraits:** Display over the current background, visual-novel style (e.g., showing an NPC the party is talking to).
- **Item/clue images:** Pop over the display with a darkened backdrop (lightbox style).
- Overlays persist until the DM dismisses them (via keyboard shortcut). They do not time out.

---

## 6. Scenes

A **Scene** is not a standalone data object but is **dynamically composed** from the current context:

- When the DM navigates to a **Location**, the scene is composed from the Location's background image/video, background audio, and associated NPCs.
- When an **Encounter** starts at a Location, the scene inherits the Location's background/audio unless the Encounter specifies its own overrides.
- An Encounter can define its own background image/video and audio (e.g., a dramatic boss fight theme). If not specified, it falls back to the current Location's scene data.

Locations can have **multiple scene presets** (e.g., "Tavern — Day", "Tavern — Night", "Tavern — Brawl") with different backgrounds and audio. The DM selects which preset is active.

**Audio (v1):** Looping background ambience/music only. Cross-fades between scenes. *(v2: soundboard with triggerable one-shot sound effects.)*

---

## 7. Systems (Plugin Architecture)

The application is **system-agnostic**. A System is a plugin that defines the rules and data schemas for a specific game system. Target systems: Pathfinder 2e, D&D 4e, Delta Green.

### 7.1 What a System Plugin Defines

System plugins are **JS/TS modules** (not just JSON config) so they can express logic like auto-decrementing conditions.

A system plugin provides:

- **Conditions:** A list of valid conditions with:
  - Name and description.
  - Whether it has a numeric value (e.g., Frightened 2).
  - Duration type(s) supported (e.g., "end of turn", "start of turn", "save ends", "manual", "round count").
  - Automation behavior: e.g., Frightened auto-decrements by 1 at end of turn.
  - Description of mechanical effects (displayed as hints to the DM).

- **Stat block schema:** What fields a creature has (varies dramatically between systems — AC/HP/saves/attacks for d20 fantasy vs. percentile stats/sanity/bonds for Delta Green).

- **Initiative rules:** What to roll, what modifier(s) to use. PF2e allows different skills (Perception, Stealth, etc.); D&D 4e uses a fixed modifier; Delta Green is percentile-based.

- **HP status descriptors:** A map of HP percentage thresholds to labels for the player-facing display (e.g., D&D 4e has "Bloodied" at 50%).

- **Item schema:** Fields for items (name, description, level, value, plus any system-specific fields).

- **PC schema:** What stats the DM tracks for player characters (initiative modifier, AC, saving throws, Perception, passive scores, etc.).

- **System-specific tracked resources:** e.g., Delta Green's Sanity and Bond points.

- **Turn lifecycle hooks:** Logic that runs at start/end of a creature's turn (e.g., "prompt for save vs. Dazed", "decrement Frightened by 1", "take ongoing damage").

### 7.2 Plugin Extensibility

Systems are designed to be created by the DM as needed. A new system plugin is a JS/TS module placed in a known directory. The application loads it and makes it available for new campaigns.

---

## 8. Campaign Data Model

A campaign is a directory on disk containing JSON data files and asset subdirectories (images, audio).

### 8.1 Campaign

- **System reference:** Set at creation, immutable.
- **Player Characters:** List of PCs (see 8.7).
- **Story, Maps, Locations, Creatures, Encounters, Items** as below.

### 8.2 Story

A hierarchical structure of directories and **Notes**. Functions as the DM's campaign notebook — session plans, world lore, NPC backstories, plot threads, etc.

### 8.3 Note

One or more paragraphs of formatted text (Markdown). Can contain **links** to other campaign objects (Locations, Creatures, Items, other Notes, etc.). Links are bi-directional — the linked object's page shows a "Referenced by" backlink.

### 8.4 Map

An image with zero or more **location pins**. Each pin has:
- An icon or letter, and a color.
- A name.
- A reference to a **Location** object.
- Visibility toggle (DM can hide/show individual pins on the player screen).

Maps have an optional **scale** setting for distance calculation between pins.

### 8.5 Location

A place on a Map. Has:
- A **Note** (description, lore, etc.).
- Associated **NPCs/Creatures** (who can be found here).
- Associated **Encounters** (combats that can occur here).
- Associated **Items** (things that can be found here).
- **Scene presets:** One or more scene configurations, each with:
  - A label (e.g., "Day", "Night", "Under Attack").
  - Background image or looping video.
  - Background audio (looping ambience/music).
  - Available NPCs to display on the player screen.

All associations are bi-directional.

### 8.6 Creature

A **template** (class, not instance). Represents a type of creature, not an individual combatant. Has:
- **Full-body image:** Uploaded by the DM.
- **Circular icon:** By default, auto-cropped from the full-body image. The DM can override with a separate image and adjust crop parameters (e.g., centering on the face).
- **Stat block:** Fields defined by the campaign's System plugin.
- **Name.**

When added to an encounter, creatures are **instantiated** — each instance gets its own HP, conditions, effects, and initiative.

### 8.7 Player Character

Similar to a Creature but with a reduced stat block — the DM doesn't track everything (players handle their own sheets). Tracked stats are defined by the System plugin but typically include:
- Name, portrait (full-body + icon, same as creatures).
- Initiative modifier(s).
- AC / defenses.
- Saving throw bonuses.
- Perception / passive scores.
- Any other system-specific quick-reference stats.

These values are approximations — players may have floating modifiers from feats, buffs, etc. — but are useful as a quick DM reference (e.g., secret Perception checks).

### 8.8 Encounter (Template)

A pre-built combat setup. Has:
- A list of **Creature references** with quantities. Each creature instance can be renamed (defaults to "\<creature name\> 1", "\<creature name\> 2", etc.).
- A **Note** (terrain, hazards, tactics, special rules).
- An optional **Location** reference (where this encounter takes place).
- Optional **scene overrides** (background image/video, audio) that override the Location's scene when combat starts.

### 8.9 Item

- Name.
- Description (rich text / Markdown).
- Level (if applicable to the system).
- Value (currency amount, for treasure budget calculations).
- Additional system-specific fields defined by the System plugin.

### 8.10 Effects and Conditions

**Conditions** are system-defined (e.g., Frightened, Dazed, Prone). They have rules for automation, descriptions, and duration types baked into the System plugin.

**Effects** are DM-created on the fly during combat. An Effect represents something like a spell or ability and has:
- A name (e.g., "Bless", "Entangle").
- Optional notes.
- A **duration** — either a round count (expires after N rounds), an end condition (e.g., "save ends"), or manual (DM removes it).
- Zero or more **associated Conditions** that are automatically applied to the target. When the Effect expires or is dismissed, its associated Conditions are removed.

This two-layer model means: the System defines what Conditions exist and how they behave; Effects are ad-hoc containers the DM creates to track why a Condition is present and when it should end.

---

## 9. Combat Lifecycle

### 9.1 Starting Combat

1. DM opens an Encounter template (or creates an ad-hoc encounter).
2. The player screen switches to **combat mode** with the encounter's scene (or current Location's scene).
3. The app prompts the DM to enter initiative for each **PC**, one at a time. The flow is fast: show creature name → DM types a number → Enter → next creature.
4. **Monster initiative** is either rolled automatically by the app or entered manually by the DM (configurable per-campaign or per-encounter).
5. All combatants are sorted by initiative. Combat begins at round 1.

### 9.2 During Combat

- The DM advances turns with a keyboard shortcut.
- **On turn start:** The system plugin's turn-start hooks fire (e.g., display reminders, apply ongoing damage).
- **On turn end:** The system plugin's turn-end hooks fire (e.g., auto-decrement Frightened, prompt "Goblin 2 needs to save vs. Dazed").
- The DM can at any time: deal damage, heal, add/remove effects and conditions, mark a creature as delayed, re-insert a delayed creature, add new creatures (reinforcements), or kill/remove creatures.
- **Mini indicators** (color + pips, or a short text label) are assigned to creature instances at combat start to match physical tabletop minis. These are not part of the encounter template — you don't know what minis are available until you're at the table.
- Round number increments when the initiative order cycles back to the top.

### 9.3 Ending Combat

- The DM ends combat manually.
- Any end-of-encounter bookkeeping (XP, treasure) is applied to PC data by the DM.
- The active combat state is discarded (not saved as a log).
- The player screen returns to the previous mode (story/map).

---

## 10. Data Import *(v2 — nice-to-have)*

System plugins can define **importers** for external data sources:

- **Pathfinder 2e:**
  - [Archives of Nethys (2e.aonprd.com)](https://2e.aonprd.com) — creature stat blocks, conditions, items. Textual data can be prefetched/cached for fast lookup; images fetched on demand.
  - [Pathbuilder 2e](https://pathbuilder2e.com) — PC data import (JSON export).

- **D&D 4e:**
  - [iws.mx/dnd](https://iws.mx/dnd) — creature and power data.

Import architecture: a combination of prefetched/cached textual data for fast search and on-demand fetching for heavier assets like images.

---

## 11. Treasure Calculator *(v2 — nice-to-have)*

A utility for calculating encounter treasure and tracking party wealth by level. Uses system-defined tables (e.g., PF2e/D&D treasure-by-level guidelines) to help the DM allocate loot within the "treasure budget" for each level.

---

## 12. Feature Prioritization

### Core (v1)
- Campaign structure and data model (story, notes, creatures, encounters, locations, items, PCs).
- Bi-directional linking between all objects.
- System plugin architecture (JS/TS modules).
- Creature and PC management with stat blocks.
- Combat tracker — full lifecycle (both DM and player screens).
- Conditions and Effects with automation hooks.
- Basic scene support (background image/video on player screen, scene presets on locations).
- Keyboard shortcuts for all common operations.
- Autosave.
- Light/dark mode.
- WYSIWYG + Markdown note editing.

### Nice-to-Have (v2+)
- Map mode with scale, distance calculation, zoom/pan.
- Real-world satellite map integration (Delta Green).
- Import from external data sources (AoN, Pathbuilder, iws.mx).
- Treasure budget calculator.
- Undo/redo.
- Background audio with cross-fade.
- Soundboard with triggerable one-shot effects.
- DM-triggered overlays on player screen (character portraits, item/clue lightbox).
