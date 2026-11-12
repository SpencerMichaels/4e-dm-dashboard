# Best Practices — 4e DM Dashboard

Hard-won lessons from building this project. Read before writing new code.

## Architecture

### System-specific logic belongs in plugins, not the main code
The renderer and main process must be system-agnostic. If you find yourself writing `if (systemId === 'pathfinder-2e')` or checking for the *presence* of a config field to infer which system is active, you're doing it wrong. Each system plugin owns its UI components (`src/renderer/plugins/<system>/`), its data (`plugins/<system>/`), and its importers (`plugins/<system>/importer.ts`). The main code provides infrastructure; plugins provide behavior.

### Don't repeat data — use a single source of truth
If a value exists in one place (e.g. damage types in `plugins/dnd-4e/known-values.ts`), import it from there. Don't copy the list into another file. If the value needs to be accessible from both main and renderer processes, put it in `src/common/` or in the plugin's data directory and import from there.

### Config fields are data, not behavior flags
The `CreatureBuilderConfig` should contain benchmark data (stat tables, damage dice, skill lists) — not UI behavior switches like `useGroupedActions` or `hasEliteSolo`. UI decisions belong in the plugin's React components. If you need a new boolean flag on the config to switch rendering, that's a sign the rendering should be in a plugin component instead.

### Plugin UI components can import shared widgets
Plugin UI code under `src/renderer/plugins/` can freely import from `@renderer/components/shared/` (TagInput, Autocomplete, DamageEntryList, etc.) and from `@renderer/components/campaign/` (CreatureBuilder, PowerEntryEditor, SchemaForm). These are generic tools. The dependency is one-way: plugin → shared. Shared code never imports from plugins.

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

## Input Controls — Choosing the Right Widget

### Dropdowns for closed, small sets; datalist for open or large sets
If a field has a **fixed, small set** of valid values (proficiency: +2/+3; enhancement type: attack/AC/defenses; alchemical type: Volatile/Oil/Poison/Curative/Other; rarity: Common/Uncommon/Rare), use a `<select>` dropdown. If the set is **closed but large** (weapon groups, implement groups), use a dropdown or a select-to-add pattern for multi-value fields. If the set is **open-ended or very large** (item type restrictions like "Heavy blade or light blade", key skills, durations, item names), use a freeform `<input>` with a `<datalist>` for autocomplete suggestions. Never use a freeform text input for a field with fewer than ~10 valid values.

### Derive what can be derived — don't ask the user to enter computable values
Enhancement bonus is `Math.ceil(level / 5)` — show it as computed text, not an input. Price has a standard table by level — show it as a placeholder hint. Critical damage scales with enhancement bonus — compute the "+N" prefix. The user should only enter the parts that vary (which die, which damage type, any special condition).

### Structured fields beat freeform text
If a freeform field has a consistent internal structure (like critical: "+1d6 fire damage per plus, and the target is knocked prone"), decompose it into structured sub-fields (die select + type select + freeform extra). This makes the common case (74% of items) trivial to fill in, while still supporting the special cases via the freeform fallback.

### Placeholder hints should be representative values, not field names
Use `placeholder="680"` not `placeholder="price"`. Use `placeholder="1 hour"` not `placeholder="time"`. The label already tells the user what the field is — the hint should show what a valid value looks like.

### Textarea fields: auto-resize, no drag handle
Use `resize: 'none'` with `fieldSizing: 'content'` on textareas so they auto-expand to fit content without the bottom-right drag-to-resize handle.

### Placeholder text must be legible on its background
Inside dark-background headers (stat block headers, power card headers), placeholder text inherits a gray color that's invisible. Use `color: inherit; opacity: 0.4` on `::placeholder` so it adapts to whatever the parent's text color is — semi-transparent white on dark backgrounds, semi-transparent dark on light backgrounds.

## Compendium & Data Pipeline

### Separate index files from full data
Don't load 14MB of full stat blocks just to populate a search list. Pre-generate compact index files (~500KB–1MB) at build time with only the fields needed for browsing (id, name, level, role, type). Load the full data on-demand when a specific entry is previewed.

### Lazy-load large data files
Don't import large JSON files at module level — it blocks app startup. Use `fs.readFileSync` on first access with a module-level cache variable. This moved the main process bundle from 20MB to 42KB.

### Compendium browsers should show UI immediately
Render the search/filter header while the index loads in the background. Only the list area shows a loading indicator. The user can start typing a search before the data arrives.

### Use `useDeferredValue` for responsive filtering
When filtering thousands of entries, use React's `useDeferredValue` on the filter state so typing stays responsive while the list re-render is deferred.

### Deduplicate parsed data
When data exists in multiple raw files (e.g., item set entries contain embedded sub-items that also exist as standalone entries), don't extract duplicates. Parse the set as a reference entry and tag standalone items with set membership at build time.

### Strip leading whitespace from parsed text
Raw HTML often has indented text after `<br>` tags. Add `replace(/^[ \t]+/gm, '')` to `stripHtml` functions to prevent leading spaces in parsed descriptions.

### Concordance/artifact items need boundary detection
Items with concordance mechanics (24 artifacts) have multiple tiers of properties and powers. The parser must detect where base properties end and concordance content begins (at the first `<p class=mitext>` or `<h2 class=ah1>`), to avoid mashing all tiers into the base fields.

## Layout

### Compendium browser height management
Use `height: calc(100vh - var(--header-height) - 2 * var(--space-6))` on the compendium browser root to fill exactly the available viewport. Both columns (list + preview) scroll independently within this fixed height. The outer `.main` container should NOT scroll for these pages.

### Preview panel centering
When the preview panel is empty ("Click to preview"), use `alignSelf: 'stretch'` so `height: 100%` works for centering the placeholder text. When showing content, let it size to content naturally.

### Powers always use PowerCardView
Whenever powers/abilities are displayed read-only anywhere in the app (creature viewer, item viewer, trap viewer, template viewer, concordance sections), use the shared `PowerCardView` component from `src/renderer/plugins/dnd-4e/PowerCardView.tsx`. Never create inline power card rendering — it leads to drift and inconsistency. Map the data to a `PowerCardEntry` object and pass it to the component.

### Flavor/description placement
For items, traps, and diseases: italic flavor text goes directly under the header/subheader, before the stat block. For creatures: description goes at the bottom (matching 4e DMG convention). Be consistent within each entity type.
