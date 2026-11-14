---
name: 4e-review-balance
description: Review a D&D 4e creature, item, trap, disease, monster template, or monster theme for numeric outliers, action economy, interacting effects, counterplay, and rules ambiguities, including drafts in the 4e DM Dashboard.
---

Use the dashboard's authoring tools; setup is in the repository's `docs/AUTHORING.md`. This review can run independently on existing content or during authoring. A separate skill is not an independent reviewer or another model.

Read the latest draft, intent, decisions, DM overrides, and unresolved comments. Establish the rule baseline and encounter assumptions. Run deterministic validation; for monsters compare against the explicitly versioned benchmarks. Treat schema errors as correctness failures and numeric outliers as review prompts, not automatic rejection.

Assess:

- Accuracy and damage, including multiple attacks, areas, ongoing damage, and riders; do not evaluate each attack as though it were the whole turn.
- Effective durability from defenses, resistances, insubstantiality, healing, mobility, and terrain access.
- Action economy: additional creatures, immediate actions, repeated triggers, and loops.
- Control duration and stacking, player counterplay, targeting restrictions, and whether players can recognize escape/recovery options.
- Resource depletion and lasting consequences, including curses, permanent conditions, and monster multiplication.
- Timing, ownership, and end conditions: who acts when, which creature/effect is linked to which victim, and what happens on death, transformation, or encounter end.
- Templates and themes: judge them applied to typical creatures of the levels and roles they suit. A template adds elite-level durability and actions on top of the base creature; a theme adds one attack and one utility power, so compare its powers with others a creature of that role would pick.
- Item-specific concerns such as stacking, usage frequency, enhancement/price precedents, slot opportunity cost, and party-wide combinations. Do not use monster damage tables to justify item balance. For traps/diseases check detection, countermeasures, stages, and recovery.

Explain calculated evidence separately from judgment. For precedents and rules references, search the local game data corpus (`search`/`fetch`, or `search-local`) before any web search, as in `4e-find-precedents`. Use conditional findings when party composition, quantity, or terrain is unknown. Preserve essential creative goals when proposing changes. Compare with fetched source context when useful; do not rely on a search snippet alone.

Submit `review` for the exact revision, with assumptions and findings `{severity, target, message, suggestion}`. Set each finding's `target` to the node or field it concerns (`/content/powers/@ID`, `/content/hp`) so it appears beside that line; lead `message` with a one-sentence summary, since the dashboard shows the first sentence until expanded. Use `info` for observations and check results that need no change (shown to the DM as "Note"), `concern` for a balance or rules risk the DM may reasonably accept ("Risk"), and `high` for something likely too strong, too weak, or unworkable at the table ("Problem"); do not produce a universal balance score or claim a passing validator proves balance. Grade severity against the recorded intent and DM decisions. An intended effect is `info` even when it is dangerous or lasting (a curse, monster multiplication, a harsh condition); put the play advice in `suggestion`. Use `concern` only for something the DM has not chosen: an unintended interaction, an ambiguity, or a magnitude beyond what the decisions describe. Use `high` only when the evidence shows it is unworkable. Re-grade every finding carried over from an earlier revision instead of keeping its old severity. Use a question only for an unresolved decision needed to define the rules; the DM may keep advisory balance risks.

If a revision changes the content, inspect the changes and update the review. Do not edit content as part of a review unless asked. The DM decides what stays; findings never block anything.
