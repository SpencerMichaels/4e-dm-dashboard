# Shadow authoring usability test

Input: `~/Downloads/level_7_shadow_4e.md`. Draft: `57c56e7c-53db-4f3f-8203-564413f672e2`, revision 2. The running dashboard accepted `open_review`. No approval or destination save was performed.

## Completed

- Used the repository CLI inside the running devcontainer, with no connection flag or credential disclosure. Default connection discovery already works; corrected setup examples that unnecessarily required copying the path.
- Created a faithful level-7 Shadow draft, preserving all printed numbers and power concepts. Schema/span validation reports no errors or numeric flags. Recorded a number recipe, source comparisons, conditional balance findings and unresolved questions.
- Checked full local entries for Shadow Stalker (MM3 p.172), Battle Wight (MM p.262 / DMG2 p.213), and Sovereign Wraith (Monster Vault p.287). These support individual mechanics, not the balance of the combination.
- Opened the draft for DM review. Destination, minion timing/ownership/stacking, and ritual/transformed-XP details remain questions. Party composition and encounter context are also unknown.

## Friction and unsupported steps

- Docker access required sandbox escalation; the authorized container commands then worked. No package installation, build or test ran on the host.
- **Compendium adapter loses important text:** `fetch` for `published/monster/monster5053`, `monster80`, and `monster115916` returns attacks without their hit text/damage, and omits some effects. Corresponding `content/parsed/monsters.json` and `content/raw/monsters.json` entries contain that information. Thus a search for surge loss cannot reliably find the Battle Wight. Worked around this by reading the full local source entries after fetching. Repaired 2026-11-13: the catalog now converts monsters and traps from `content/raw` with their printed text (`tools/content/convert/published.ts`), as the content repo writer does.
- The linked Stolen Shadow is preserved in Wrench Shadow's special text. Entity creation, linked weakening, transformation and curse recovery are manual DM operations, not executable automation. Direct damage and surge loss have structured clauses.
- Only campaign `aoeu` was listed; no library existed. The advertised agent tools cannot create a library. The DM can create one in the workshop if desired; no campaign was assumed.
- Connection discovery currently means the fixed default Linux user-data path. Custom user-data paths require the environment variable or flag; this test does not establish cross-platform discovery.

The documentation-only follow-up required no build. Live CLI calls verified automatic discovery, validation, draft creation/patching, comments, review and opening the review screen. Visual UI inspection was not performed.
