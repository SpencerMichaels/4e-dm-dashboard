<!-- Agent brief template. tools/content/agent/prompt.ts fills the {{NAME}} values and keeps a {{#kind}}...{{/kind}} block only for that kind. This comment is dropped from briefs. -->
# Clean {{KIND_LABEL}} `{{ID}}` ({{KIND}})

A parser converted this D&D 4e {{KIND_LABEL}} from the published stat block. Fix
what it got wrong, and turn the mechanics in every printed line into effect
clauses. Work on this entry only.

## Steps

1. Read the source text, the current JSON and the schema below. Nothing else is needed.
2. Write your reply with the **Write tool** to `{{REPLY_PATH}}`. Never use python,
   node, jq, sed or shell heredocs to write or edit it. The reply is plain JSON,
   with no code fence and nothing before or after it:
   `{"entry": {...the whole corrected {{KIND_TYPE}}...}, "notes": ["..."], "confidence": "high"}`
   `notes`: one short item per correction (what and why); `[]` if nothing changed.
3. Check it with this command, exactly as written:
   ```
   {{CHECK_COMMAND}}
   ```
   `PASS` means you are done (flags are information only). On `FAIL`, fix the
   listed problems with the Edit tool and run the same command again. Run it at
   most 3 times in all; if it still fails, stop and say what is left.

## Rules

**Never invent mechanics.** Every number, damage type, condition, range and
keyword must appear in the source text. If the source is ambiguous or
self-contradictory, keep the printed text, use an `unparsed` clause, explain in
`notes` and set `confidence` to `"low"`. Do not "fix" published values that look
odd (XP, a high defense); mention a suspected misprint in `notes`. A wrong
structured clause is worse than an honest `unparsed` one.

**Fields.**
- Correct any field the parser got wrong against the source. Keep `id`; keep
  `sources` and `description` unless wrong. Omit optional fields that do not
  apply; never add fields the schema lacks. Closed lists use the schema's ids exactly.
- You may leave out `provenance`; apply rewrites it from your `notes` and
  `confidence`. Its parser `notes` list what the parser could not place:
  resolve each one, or say in `notes` why it stays.
- Failed saving throw lines go in the attack's `failedSaves`, in printed order.
- A power with no attack roll that prints a range ("Close burst 5 (allies in
  the burst)") has it in `range`, targets in `range.note`; the effect keeps the rest.
- Labeled lines with no field of their own (form lines, numbered eye rays, an
  unparseable "Secondary Attack:") go in `extraLines` as `{label, line}`.
- "1/round" is `usesPerRound: 1`; "2/Encounter" is `usesPerEncounter: 2`.
- Resistances and vulnerabilities: `{type, value}`; a damage type with no number
  omits `value`; anything else is `{type: "special", text: "<printed wording>"}`.
  Never store 0 for an unknown value.
{{#monsters}}
- The parser stored some traits and auras as no-action powers (see its notes):
  move them to `traits` or `auras` (`range` is the aura size).
{{/monsters}}
{{#items}}
- `price` is in gp. `armor` holds armor and shield stats; artifact and set powers
  in the description are `{type: "power", power}` parts.
- Property scaling ("Level 15: +2 ...") is `propertyLevelSteps`; power scaling is
  the power's `levelSteps`. `special`, `requirement`, `weight` (non-weapons) and
  `alchemical` (`type`, `formulaCost`) are item fields.
{{/items}}
{{#traps}}
- Aura traits ("Aura 1") go in `auras` with `range`. "At-Will Terrain" /
  "Single-Use Terrain" is `usage`.
- A power under "Triggered Actions" with no printed action type has `action: "triggered"`.
{{/traps}}

**Lines.** `Line.text` is the printed wording, whitespace-normalized. Copy it from
the source; change it only where the parser damaged it (dropped words, text from
another field, split words like "fi re"). Never paraphrase. A hit line includes
its damage.

**Clauses.** Never write `at` and never count characters. Each clause gives
`quote`: words copied exactly from its own `Line.text` (contiguous; same
spelling and punctuation). List a line's clauses in printed order; the quote is
looked up after the previous clause's words, so a repeated phrase needs no
extra context. An `unparsed` clause gives only `text` (the exact words), which
also serves as its quote.
- Cover all mechanical text of every line: each phrase that does something is a
  structured clause or inside an `unparsed` one. Connecting words may stay
  uncovered. Clauses must not overlap, except that `if` wording may be shared.
- Clause kinds and their fields are in the schema below, with examples in its
  comments. Newer kinds that replace many old `unparsed` clauses: `use-power`,
  `recharge-power`, `lose-healing-surge`, `concealment`, `zone`,
  `saving-throw`, `summon`; also `damage` with `extra`/`critical`, `modifier`
  with a list of stats, and the `while-in-aura` and `permanent` durations.
- One condition per clause: "dazed and slowed (save ends both)" is two clauses
  with the same `saveGroup`.
- `damage`: `dice` without spaces ("2d6+5"), `types` empty when untyped.
- `zone`: what the zone does is separate clauses with `if` ("if it starts its
  turn in the zone"), usually `who: "creatures-in-area"`.
- `who`: `target` is the attack's target, `self` the {{KIND_LABEL}}.
- `duration`: "until the end of your next turn" is
  `{"kind":"turn-end","whose":"source","next":true}`; `whose: "target"` when it
  is the target's turn. `instant` for damage and forced movement.
- `if`: the printed condition ("if the target is bloodied"); shown, never auto-applied.
- Example: `{"text": "2d6 + 5 fire damage, and the target is dazed (save ends).", "clauses": [{"quote": "2d6 + 5 fire damage", "kind": "damage", "dice": "2d6+5", "types": ["fire"], "who": "target"}, {"quote": "the target is dazed (save ends)", "kind": "condition", "condition": "dazed", "who": "target", "duration": {"kind": "save-ends"}}]}`

**Confidence.** `"low"` when you were unsure about any field or clause, when the
source looks misprinted, or when you used `unparsed` for something that seems to
need a new clause kind (name the kind in `notes`). Otherwise `"high"`.

## Source text (from the published HTML; the only authority for wording and numbers)

```
{{SOURCE_TEXT}}
```

## Current JSON (parser output; may be wrong or incomplete)

```json
{{CURRENT_JSON}}
```

## Schema (4e-kit; the entry must match it exactly)

```ts
{{SCHEMA_EXCERPT}}
```
