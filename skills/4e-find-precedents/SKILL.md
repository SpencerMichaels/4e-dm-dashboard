---
name: 4e-find-precedents
description: Find published D&D 4e creatures, templates, themes, powers, and traits with mechanics similar to a proposed design or a creature being ported from another game.
---

Use the 4e DM Dashboard `search` and `fetch` tools. CLI equivalents and connection instructions are in the repository's `docs/AUTHORING.md`.

Always search the local game data corpus first: the dashboard `search`/`fetch` tools (or the CLI `search-local` when the app is not running), which cover the published compendium (creatures, items, traps, diseases, templates, and themes). Do not reach for a web search for 4e rules, monsters, powers, or items before exhausting the local corpus with several queries and synonyms. Use the web only as a last resort when the local corpus has no relevant entry or the question is outside it (for example, rules errata or another game system being ported), say that you did so, and prefer local entries over web summaries when they disagree.

Break the concept into independent mechanics: movement, control, resource drain, trigger, duration, summoning, transformation, linked entities, or recovery. Search each separately. A differently themed creature may be a better mechanical precedent than one with the same name.

Combine prose queries with filters for kind, role, level, clause kind, or condition. Structured coverage is incomplete, so broaden to plain text when a filter returns nothing. Try a few relevant synonyms (spawn/summon/create; drain/lose healing surge). Fetch the full entry before drawing conclusions; search results are short excerpts and can omit exceptions.

Return a small set of useful matches. For each, identify the entry and power, level/role, source and content key, shared mechanic, and important differences. Distinguish published content from homebrew. Explain what could be borrowed and what would need adjustment for the proposed level, action economy, or encounter.

If no close precedent exists, say so. Do not fabricate a citation or treat a thematic match as a numeric balance rule. When porting from another system, map the intended play experience to 4e actions/defenses/durations instead of copying numbers. Reading precedents does not authorize modifying campaign content.
