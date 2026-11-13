# Agent-assisted content authoring — implementation plan

Status: first implementation delivered 2026-11-12. The iterative workshop, calculations, validation, search, draft storage, direct DM edits, comments, approval/save, CLI, MCP bridge, and three skills are implemented. See [usage and current limits](AUTHORING.md). This document retains the intended acceptance criteria; remaining refinements are tracked in TODO section 10.

## Outcome

A DM describes a creature, item, or other piece of content in ordinary language. An agent finds relevant 4e precedents, maps the description to explicit rules and numeric choices, and submits a draft. The DM reviews it in the dashboard, edits fields directly, leaves comments, and answers questions. The agent iterates without overwriting DM decisions. The DM approves a specific revision and destination; the main process saves it.

The first complete release supports monsters saved to campaigns. Later phases add writable homebrew compendiums and item/trap/disease authoring. These are parts of the intended feature, not requirements to squeeze into the first release.

## Decisions and boundaries

- Human-readable JSON remains the storage format. The main process owns drafts, comments, revisions, approval, and campaign writes. Draft state is DM-only and never sent to the Player window.
- Kit-schema content is the interchange contract. Design intent and review metadata live in a separate authoring envelope; they do not become combat fields.
- A skill manages the conversation and design process. Deterministic code calculates and validates. A separate balance-review skill also works on existing content. A precedent-search skill can be invoked independently or by authoring.
- The existing creature viewer and editing controls provide the review surface. Chat remains available for discussion and clarifications. Standalone Markdown/HTML exports are optional fallbacks, not the authoritative approval surface.
- Start with native comments on fields, traits, powers, and the whole creature. Do not add annotate.js initially. Precise text-selection annotations can be evaluated later against actual use.
- No embedded model client is required. An external agent uses a CLI and local MCP bridge. No automatic agent launch or background inference in the first release.
- Skills do not authorize publication. Only a DM action in the dashboard approves the reviewed revision and destination.
- Preserve unsupported mechanics as visible text requiring adjudication. Structured metadata and executable combat automation are separate capabilities.
- New production dependencies require discussion before installation. All installations, builds, and tests run in the devcontainer.

## Current foundations and gaps

| Existing code | Reuse / required change |
| --- | --- |
| `vendor/4e-kit/src/schema.ts`, `vocab.ts` | Canonical content vocabulary and schema; currently v4. Add shared changes in the kit repo first, commit there, then bump the submodule. |
| `src/common/rules/benchmarks.ts` | Existing DMG-based monster tables. Make policy/version and supported level ranges explicit; do not label these MM3 math. |
| `tools/content/validate/{shape,spans,bands}.ts` | Extract reusable validation from batch tooling. Keep schema errors separate from benchmark warnings. |
| `tools/content/agent/` | Reuse quote-to-span resolution; agents supply quotes, never hand-count spans. Separate original authoring from the source-cleanup workflow. |
| `Dnd4eCreatureViewer`, `Dnd4eCreatureDetails`, `PowerEntryEditor` | Reuse rendering/editing; extract storage-independent controls where necessary. |
| `src/renderer/components/campaign/CreatureEditor.tsx` | Currently saves edits directly to campaign entities. Draft editing must call a draft service instead. |
| `src/main/data/campaign-store.ts` | Currently relies on the active campaign. Add explicit-destination operations for approval/import. |
| `src/main/ipc/campaign-handlers.ts` | Reuse index invalidation and broadcasts through application services, not by invoking IPC handlers internally. |
| `src/main/compendium/compendium.ts` | Currently reads legacy parsed content with Electron-specific loading. Introduce a content-provider boundary for search and eventual homebrew libraries. |

Coordinate with TODO sections 3/5 (kit `Monster` adoption), 4 (power cards), and 8 (content packs). Authoring must not introduce a second campaign migration. If the kit migration is incomplete, use a temporary, tested adapter for preview/import and reject lossy imports explicitly. Prefer completing that migration before shipping the approval workflow. Foundation and search work can proceed independently.

## Data and revision model

Introduce versioned authoring types under `src/common/types/authoring.ts` and services under `src/main/authoring/`. These are proposed paths.

Each draft contains:

- Draft ID, envelope version, entity kind, current revision, timestamps, and workflow state.
- Kit-schema content (including its schema version). Incomplete drafts may be stored with validation issues; publication requires valid content.
- Intent: concept, level/role/rank, desired strengths/weaknesses, non-negotiable mechanics, and encounter assumptions.
- Decisions marked confirmed, proposed, or unresolved; structured questions with alternatives and consequences.
- Calculation recipe: policy ID/version, selected bands, per-field/per-power adjustments, explicit overrides, and rationale. Qualitative-to-numeric mappings are authoring conventions, not official exchange rates.
- Provenance and precedent references: content pack/version, entry/power identifiers, source, and explanation of relevance.
- Stable authoring IDs for powers, traits, and other editable nodes. Keep these in the envelope if the kit has no appropriate IDs. Never anchor comments or edits only to array indices.
- Comments and replies with author, revision, target node/field, optional quote, and resolution state. Deleted targets retain a visible orphaned thread.
- Validation results, balance findings, and per-power metadata reconciliation state, each tied to the content revision they describe.
- Proposed destination and create/update mode. Updates record the destination entity's expected revision/hash.
- Approval/save receipts identifying exact content, destination, approver, and saved entity IDs.

Store drafts outside campaign entity directories, initially under `<userData>/authoring/drafts/<id>/`. Use atomic JSON writes, immutable revision snapshots, and a recoverable current-revision pointer. Comments/review events can have their own sequence so a comment does not invalidate a content patch. Serialize writes per draft. Keep model reasoning summaries and decisions, not hidden chain-of-thought.

### Editing and concurrency

Both DM and agent changes use the same validated mutation service. Agent requests include a base content revision and changes addressed by stable IDs. The first version rejects stale requests with a structured conflict response and the latest revision; the agent rebases and resubmits. Later, allow a three-way merge for demonstrably independent fields. Never use last-write-wins for conflicting edits.

DM edits are authoritative decisions by default. Editing a calculated number creates a fixed override; offer “Reset to calculated value.” Distinguish fixed overrides from intentional relative adjustments so changing level does not silently reinterpret them. Show downstream recalculation as a diff. Agents may propose changing DM-owned choices but cannot silently replace them; the DM explicitly accepts or releases the override.

Changing power prose marks derived clauses/spans stale. The agent receives the exact new text and regenerates metadata through quote resolution. Changing structured mechanics must also reconcile displayed prose. In both directions, show the interpretation/diff before approval. Unsupported clauses can remain explicitly unparsed/manual; stale or contradictory metadata cannot be published as current automation.

Every content revision invalidates prior approval and conservatively marks qualitative review outdated. Deterministic checks rerun. Comment-only changes retain the content revision; unresolved blocking questions still prevent approval.

## Authoring and review behavior

The agent captures intent, retrieves precedents, proposes concrete mechanics and numbers, submits the draft, reads feedback, revises, and presents it for approval. It asks focused questions only where ambiguity materially changes behavior, continuing unrelated work while answers are pending. It records answers from chat in the draft so subsequent sessions retain them.

Examples of interpretations include accurate attacks with low damage, reduced HP with high mobility, and a specific power trading accuracy for damage. Tools compute the chosen adjustments; the agent explains why they fit. Do not implement a universal point-buy balance equation.

Balance review covers numeric baselines, action economy, summons and repeated triggers, control plus damage, defensive combinations, counterplay, encounter composition/terrain, lasting consequences, and rules completeness. Findings contain severity, affected nodes, evidence/assumptions, suggested alternatives, and unresolved uncertainty. There is no single “balanced” score. Passing schema/math checks is not proof of balance. DM acceptance of an advisory concern is recorded, rather than erased.

A separate balance-review skill can run in the same agent session. It does not inherently require another agent/model or imply independent verification. The authoring skill invokes the workflow explicitly and respects confirmed design constraints when suggesting fixes.

## Phases and acceptance criteria

### Phase 1 — Content contracts and deterministic authoring core

1. Audit kit schema adoption and choose the migration/temporary-adapter path before wiring the editor.
2. Extract pure scaffold, calculate, validate, and reconcile helpers reusable by UI, CLI, and MCP. Place cross-app 4e logic in the kit; keep application workflow/storage here.
3. Version the existing calculation policy, document its assumptions and level limits, and reject unsupported requests rather than silently clamping levels. Additional rule baselines require sourced tables and tests.
4. Implement monster scaffolding by level, role, rank, and explicit ability/stat choices; expose per-power attack/damage bands and overrides.
5. Introduce the authoring envelope and runtime validation. Ensure custom content provenance does not require fabricated published sources.
6. Add CLI commands for scaffold, benchmarks, validation, and JSON import/export. Standalone commands operate on draft files; they never write active campaign files.

Acceptance: identical inputs/policy yield identical calculated content; low/high bands and overrides are explainable; rank and level edge cases are tested; invalid metadata produces field-level errors; manual mechanics survive round trips.

### Phase 2 — Find precedents in local content

1. Add provider-independent search over monster powers/traits and other supported content, with entry and power fetch operations.
2. Combine structured filters (clauses, conditions, durations, usage, role, level) with full-text search and small synonym mappings. Search unparsed prose as well as structured clauses.
3. Return bounded, ranked results with matching text, source/pack version, entry/power IDs, and reasons for matches. Allow an agent to retrieve full context before recommending a precedent.
4. Cache a rebuildable index keyed by content version. No vector database or embedding service initially. Handle missing/empty packs and incomplete metadata gracefully.
5. Keep private compendium text and derived excerpts out of public fixtures/docs. Use synthetic fixtures for automated tests and local content for manual evaluation.

Acceptance: a Shadow query can separately search surge loss, victim-linked creatures/effects, transformation at 0 HP, and persistent weakening. Results need not share its name or creature type. Tests cover prose-only matches, filters, empty content, and stable result references.

### Phase 3 — Main-owned drafts and destination-aware saving

1. Implement draft persistence, revision history, comments, decisions, questions, calculation overrides, and review records.
2. Add explicit campaign destination lookup and create/update operations. Do not temporarily change the global active campaign to save elsewhere.
3. Add revision-checked patch APIs and structured conflict responses. Preserve DM overrides and allow explicit restoration of earlier content as a new revision.
4. Define readiness checks: valid content, reconciled metadata, resolved blocking questions, current review or explicit DM acceptance of missing/stale qualitative review, and a valid destination.
5. Implement DM-only approve-and-save bound to exact content revision/hash and destination. Agents cannot forge approval records or call the approval capability.
6. Make saving retry-safe with a persisted operation ID and deterministic assigned entity IDs. Journal the approval/save operation so crashes between entity writes and receipts do not create duplicates or falsely report success. Recheck target conflicts before writing.
7. Broadcast draft changes only to DM renderers. On successful campaign save, use normal entity/index updates; never mutate running combat instances as a side effect.

Acceptance: restart preserves drafts/comments; switching campaigns cannot redirect a save; duplicate retries create one entity; stale target updates fail without data loss; disk failure leaves a recoverable draft and truthful save status; no draft data reaches Player broadcasts.

### Phase 4 — Dashboard review and direct editing

1. Add an Authoring/Drafts view using the existing ViewMode navigation and a main-broadcast-backed Zustand store.
2. Show the actual monster stat block alongside intent, numeric rationale, balance findings, questions, and destination. Reuse the creature/power components and theme tokens.
3. Extract draft-capable editing controls from campaign-bound save behavior. All creature fields and powers should be editable; edits persist to the draft, never the campaign before approval.
4. Add field/power/trait/global comment threads, replies, and explicit resolution. Include keyboard navigation, comment creation, edit/preview switching, and discoverable shortcuts without stealing text-input keystrokes.
5. Show revision diffs, DM overrides, changes since the last review, and metadata awaiting reconciliation. Keep partially typed form values locally until they form a valid edit; show unsaved/error state on write failure.
6. Provide a clear “Request revision” handoff and “Approve and save” action. Show destination, create/update mode, and advisory findings being accepted. Flush pending edits and verify the current revision before approval.
7. Support related draft entities: the Shadow and its Stolen Shadow must be inspectable together. Initial references may remain manual if runtime links are unsupported; expose that limitation instead of silently promising automation.

Acceptance: the DM can change an attack number, rewrite a power, reorder powers, comment, restart, and see everything preserved. The next agent pass receives those changes. Approval cannot race pending edits. Preview/import tests demonstrate the approved mechanics survive conversion; unsupported fields are visible.

### Phase 5 — Local agent bridge and skills

1. Expose the application services through a local bridge, with a thin stdio MCP adapter and a CLI client. CLI file-only calculation/search remains usable without the app; live draft/review operations report clearly when it is unavailable.
2. Use a per-user local socket (or platform equivalent), scoped connection credentials, bounded validated messages, and no arbitrary filesystem paths or generic code execution. Confirm host/devcontainer socket mounting and permissions with the existing launch setup. Do not expose a public network listener.
3. Offer tools for destinations, scaffold/benchmarks, precedent search/fetch, create/get/list draft, revision-checked patch, validation, review submission, questions/comments, and opening the review view. Tool results return IDs, revisions, issues, and compact changes rather than repeatedly returning the entire compendium.
4. Keep approval and final commit out of the agent tool surface. Agent-provided review/provenance fields cannot change approval state. Renderer approval handlers verify the DM sender.
5. Provide review status/events or an explicit fetch command. First release supports “I have updated the draft; continue” from chat, without requiring a perpetually running agent. Reconnection resumes from saved draft/event IDs.
6. Write repository-owned authoring, precedent-search, and balance-review skills with narrowly scoped references, tool examples, synthetic examples, and clear stopping/clarification behavior. Use the skill-creator workflow when implementing these files.
7. Document installation, local transport, devcontainer use, and manual JSON fallback. Choose and review any MCP SDK dependency before adding it.

Acceptance: an external agent completes create → dashboard edits/comments → fetch feedback → revise → DM approval. The bridge enforces revision checks and cannot approve content. Disconnect/restart loses no state. An agent can resume the process without reading the earlier chat transcript.

### Phase 6 — Writable homebrew compendiums and more content kinds

1. Add named user-owned JSON libraries with manifests and stable IDs. Published content packs remain read-only; customizations clone into a homebrew library or campaign.
2. Expand destination selection to library, campaign, or library plus campaign copy. Record origin/version on copies; library updates never silently overwrite campaign edits.
3. Define retry/recovery for two-destination saves explicitly: journal each write, report partial completion, and resume idempotently. Do not imply multi-file atomicity from individual atomic writes.
4. Include user libraries in precedent search, distinguish homebrew from published sources, and invalidate indexes on edits.
5. Add item authoring using its own level/category/enhancement/price defaults and review criteria. Then support traps and diseases using their schemas and existing viewers/editors where available. Do not apply monster balance equations to items.
6. Evaluate text-selection annotations and shareable stat-block exports after the native review loop has been used. If an annotation library is adopted, comments still live in main-owned JSON and use semantic/revision anchors.

Acceptance: approved content can be reused across campaigns; updates preserve campaign customizations; missing destinations cause a clear recoverable error; item/trap/disease workflows have kind-specific validation and previews.

## Validation and rollout

Use focused Vitest tests for calculation invariants, overrides, quote reconciliation, searches, revision conflicts, DM-edit preservation, approval boundaries, retry/recovery, and destination correctness. Add integration tests around main-process services and representative preview/import round trips. Do not rely on tests that merely repeat table constants.

Use the user's local `~/Downloads/level_7_shadow_4e.md` as a manual acceptance scenario; do not make CI depend on Downloads or copy published references into public fixtures. Build a synthetic equivalent for tests. The scenario must exercise low direct damage plus surge depletion, insubstantiality, victim-specific targeting, a spawned minion, transformation, a linked persistent condition, and encounter-only restrictions. The workflow must distinguish supported metadata from missing runtime automation and ask about unresolved timing/ownership.

Manual end-to-end checks:

1. Start from prose; choose level/role and a numeric policy; find precedents and inspect source context.
2. Submit a draft and resolve an agent question in chat, recording the decision in the draft.
3. DM edits accuracy and power prose, leaves a comment, reorders powers, and closes/reopens the app.
4. Agent reads current feedback, preserves the numeric override, reconciles prose/clauses, and submits a current balance review.
5. Simulate a stale agent edit, destination change/deletion, double-clicked approval, save failure, and restart during save.
6. Approve the exact final version; verify destination content and displayed powers, and confirm no draft leaked to the Player window or altered active combat.

Run relevant tests, `npm run typecheck:node`, and `npm run build` inside the devcontainer. Check changed renderer types and document existing `typecheck:web` failures separately from regressions. Expand `TESTING.md` with the manual authoring loop when implemented. Update this plan, TODO, and AGENTS implementation status phase by phase; do not mark the feature complete when only the skill or tools exist.

## Delivery sequence

Phases 1–2 establish reusable authoring/search functions. Phase 3 establishes persistence and safe saving. Phase 4 supplies a DM-usable review editor. Phase 5 completes the first agent-assisted monster-to-campaign release. Phase 6 completes the broader destination/content scope.

Before implementation, settle concrete policy naming and calculation sources, the schema migration timing, and the local transport/SDK choice. These are implementation decisions within this plan; they do not require reopening the agreed iterative authoring workflow. The initial release does not depend on embeddings, a generic annotation platform, embedded AI, or complete combat automation for arbitrary homebrew powers.
