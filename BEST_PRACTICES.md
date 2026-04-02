# Best Practices — Tabletop Dashboard

Hard-won lessons from building this project. Read before writing new code.

## Architecture

### System-specific logic belongs in plugins, not the main code
The renderer and main process must be system-agnostic. If you find yourself writing `if (systemId === 'pathfinder-2e')` or checking for the *presence* of a config field to infer which system is active, you're doing it wrong. Each system plugin owns its UI components (`src/renderer/plugins/<system>/`), its data (`plugins/<system>/`), and its importers (`plugins/<system>/importer.ts`). The main code provides infrastructure; plugins provide behavior.

### Don't repeat data — use a single source of truth
If a value exists in one place (e.g. damage types in `plugins/dnd-4e/known-values.ts`), import it from there. Don't copy the list into another file. If the value needs to be accessible from both main and renderer processes, put it in `src/common/` or in the plugin's data directory and import from there.

### Config fields are data, not behavior flags
The `CreatureBuilderConfig` should contain benchmark data (stat tables, damage dice, skill lists) — not UI behavior switches like `useGroupedActions` or `hasEliteSolo`. UI decisions belong in the plugin's React components. If you need a new boolean flag on the config to switch rendering, that's a sign the rendering should be in a plugin component instead.

### Plugin UI components can import shared widgets
Plugin UI code under `src/renderer/plugins/` can freely import from `@renderer/components/shared/` (TagInput, Autocomplete, DamageEntryList, etc.) and from `@renderer/components/campaign/` (CreatureBuilder, ActionEntryEditor, SchemaForm). These are generic tools. The dependency is one-way: plugin → shared. Shared code never imports from plugins.

## Parsing & Importing

### Use structural markup, not regex, for field boundaries
When parsing structured data (HTML, markdown), use the structural elements (tags, delimiters, line breaks) to find field boundaries. Don't use regex to search for field names within free text — this leads to over-capture where one field's content leaks into another. The 4e HTML data has `<i>Label:</i>` tags and `<p>` block boundaries that reliably separate fields. Use them.

### Parse each field from its own structural block
Each `<p class=flavorIndent>` in the 4e HTML is one field. Parse it individually by extracting its `<i>` label. Don't join multiple blocks into one text blob and then try to regex-split them apart — that's the root cause of every over-capture bug.

### Validate imports against the source
After writing or modifying an importer, sample 10+ creatures of varying complexity (minions, standards, elites, solos, different levels) and systematically compare every parsed field against the original. Don't just check that the build passes — verify the data.

### Import warnings should surface to the user
When the parser encounters text it can't confidently classify, add a warning rather than silently dropping it. Store warnings on `statBlock._importWarnings` so the creature editor displays them. The DM can then manually fix the affected fields.

### Don't monkeypatch regex — fix the approach
If a regex keeps causing over-capture across multiple fixes, the regex approach itself is wrong. Step back and look for structural alternatives (HTML tags, delimiter characters, section headers). Three patches to the same regex is a code smell.

## UI

### Stat blocks and info displays should be dense and inline
Follow the formatting conventions of official game sources (e.g. the 4e stat block format on iws.mx, PF2e stat blocks on AoN). Key principles:
- **Labels inline with values**, not on separate lines. `Initiative +10  Perception +11; low-light vision` — not three separate labeled rows.
- **Group related stats on one line**: AC + defenses together, alignment + languages together, initiative + perception + senses together.
- **Use separator lines** (border-bottom) between logical groups, not section headers or whitespace.
- **No section headers** for obvious groupings — the labels are self-documenting.
- **Flavor text (description) at the bottom** — after the mechanical stats, before the source citation.
- **Two-column responsive layout**: stats on the left, powers/abilities on the right. Use `flex-wrap` so columns stack on narrow windows.
- **No max-width constraints** — let the layout fill available space and respond to window size.
- **Semicolons between same-line items**: `Initiative 5; Senses Perception 11; darkvision` — not just whitespace.
- **Readability is paramount**: text must have high contrast on its background. In dark mode, bump `--color-text-secondary` and `--color-text-muted` high enough to be easily legible.
- The goal is to fit as much information as possible on screen without scrolling, matching the density a DM expects from a printed stat block.

### Inputs should be ghost-styled and content-sized
Use CSS class `ghost` for inline editable fields — transparent background and no border by default, subtle bottom-border on hover, full input on focus. This makes stat blocks read like printed text while still being editable. Use `field-sizing: content` so inputs auto-size to their value (no fixed widths creating trailing whitespace). Number inputs should have zero padding. Within stat block contexts, override the global ghost padding to 0 and use `border-width: 0` with only a bottom border.

### Use chips for list-valued fields
Skills, languages, speeds, immunities, resistances, and subtypes should all use the chip pattern: colored background pills with a `×` (Unicode multiplication sign, not ASCII "x") to remove, and a `<select>` dropdown or compact TagInput `+` button to add. Chips should:
- Have consistent gap (3-4px between chips)
- Use `var(--color-bg-hover)` background
- Inherit font size from parent (don't hardcode `9px`)
- For typed values (resist fire 10), show the number input inline in the chip with a bottom-border underline
- When inside dark-background headers, override CSS custom properties (`--color-bg-hover`, `--color-text-muted`, etc.) so chips remain visible

### Dropdowns should be native selects, not button stacks
Use `<select>` with `appearance: none` and dotted underline for inline dropdowns (alignment, origin, creature type, role). This is more compact than a row of toggle buttons and handles long option lists. Set `option { background: var(--color-bg-primary) }` to fix dark mode dropdown backgrounds. Use `field-sizing: content` so selects auto-size to the selected option.

### Derive values that can be computed
XP is derived from level + modifier. Bloodied = HP/2. Don't make derived values editable — display them as plain text computed from the source fields. If a value mostly follows a formula but has exceptions (e.g. resistances), keep it editable.

### Compact TagInput behavior
In compact mode (`compact` prop), TagInput should: use `display: inline` on the outer wrapper so it flows with surrounding text, hide the text input when values exist and not focused (show a `+` button instead), and use tiny chip sizes (`font-size-xs`, minimal padding). This prevents the input from taking space and breaking inline layouts like `magical beast (dragon, aquatic)`.

### Match the official rulebook styling
For system-specific UI, match the official source material's visual language: fonts, colors, layout order, and density. For 4e, the DMG stat block uses a dark warm-brown header bar, serif body font (Mentor), and very dense inline layout. Extract fonts from PDFs if needed (even subsets work for testing). Use CSS custom properties scoped to the stat block class (`.stat-block-4e { --sb-header-bg: ... }`) so the theme doesn't leak.

### Freeform text fields should be textareas, not inputs
Any field that might contain more than ~40 characters of text (effect descriptions, trigger text, ability descriptions) should use `<textarea>` so the content wraps visually. Use CSS `field-sizing: content` for auto-expansion.

### Hide empty optional fields, show them on demand
Most creature powers won't use all fields (hit, miss, effect, trigger, sustain). Show only fields that have content, with small "+ hit", "+ effect" etc. buttons to add empty ones. This keeps the UI compact for simple powers.

### Autocomplete from known values, don't use freeform for finite sets
If a field has a known set of valid values (damage types, skills, traits, alignments), use autocomplete (TagInput or Autocomplete component) rather than a plain text input. The known values come from the plugin's config data.

### System-specific labels and constants belong in plugin UI
Labels like "Abilities" vs "Powers", "Weaknesses" vs "Vulnerabilities", action type icons (▶▶▶ vs "Std"), alignment options — these are all system-specific and should be defined as constants in the plugin's UI component, not passed through the config.

## Data Model

### Creature statBlock is a flexible record — don't over-type it
The `statBlock: Record<string, unknown>` is intentionally untyped because each system stores different fields. Don't try to create a union type of all possible statBlock shapes. Each plugin's UI and importer know what fields they expect.

### Use consistent field names across systems where possible
Both PF2e and 4e store `statBlock.level`, `statBlock.ac`, `statBlock.speed`, `statBlock.traits`, `statBlock.actions`, `statBlock.immunities`, etc. Keep these consistent so shared code (combat engine, player display) can access them without system-specific logic.

### Imported data should match the editor's expectations
The importer should produce the exact same data structure that the creature editor reads. If the editor checks `creature.statBlock.monsterModifier`, the importer must write `monsterModifier`, not `eliteSolo`. Test by importing a creature and verifying every field appears correctly in the editor.
