You are cleaning one D&D 4e {{KIND_LABEL}} for a structured content set. The entry was
converted by a deterministic parser from the published stat block. Your job: fix
what the parser got wrong, and turn the mechanics in every printed line into
effect clauses. You work on this one entry only.

## Inputs

**Entry id:** `{{ID}}` ({{KIND}})

**Source HTML** (the published text; the only authority for wording and numbers):

```html
{{RAW_HTML}}
```

**Current converted JSON** (parser output; may be wrong or incomplete):

```json
{{CURRENT_JSON}}
```

**Schema** (TypeScript, from the shared 4e-kit; the entry must match it exactly):

```ts
{{SCHEMA_EXCERPT}}
```

## Rules

### Never invent mechanics
- Every number, damage type, condition, range and keyword must appear in the source HTML.
- If the source is ambiguous or self-contradictory, keep the printed text, use an
  `unparsed` clause, explain in `notes`, and set `confidence` to `"low"`.
- Do not "fix" published values that look unusual (an odd XP, a high defense). Keep
  what the source prints; mention a suspected misprint in `notes`.

### Structured fields
- Correct any field the parser got wrong against the source (level, role, rank,
  defenses, HP, speeds, senses, skills, resistances, action types, usage, recharge,
  range, target, attack bonus, defense targeted, keywords).
- Keep `id` unchanged. Keep `sources` (every publication, primary first) and
  `description` unless they are wrong.
- Omit optional fields that do not apply; never add fields the schema does not have.
- Lists of closed values (`ActionType`, `DamageType`, `ConditionId`, ...) must use the
  ids from the schema exactly (lowercase, kebab-case).
- "vs. Any" / "vs. any defense" is `vs: "any"`.
- "First/Second/Third/Each Failed Saving Throw:" lines go in the attack's
  `failedSaves` (`n` is 1, 2, 3, ... or `"each"`), in printed order, on the attack
  they follow.
- A power with no attack roll that prints a range ("Close burst 5 (allies in the
  burst)") has it in `range` (the targets in `range.note`); the effect keeps the rest.
- Other labeled lines with no field of their own (form lines like "Ooze Form:",
  numbered eye rays, "Secondary Attack:" text that is not a parseable attack) go in
  the power's `extraLines` as `{ label, line }`, label as printed.
- Resistances and vulnerabilities (`DamageModifier`): `{ type, value }` when numeric;
  a damage type with no number keeps `type` and omits `value`; anything else is
  text-only, `{ type: "special", text: "<printed wording>" }`. Never store 0 for an
  unknown value.
- Items: `price` is in gp (`null` when the price is not a number, with the printed
  text in `priceText`); `tier` for tier-only items; `subtype` for the kind of item
  ("Consumable", "Divine Boon"); `armor` for armor and shield stats; artifact and set
  powers inside the description are `{ type: "power", power }` parts.
- Traps: traits go in `traits`; a detect line that needs no check ("automatic") has
  `dc: null`; non-numeric hit points keep the printed text in `hpText`.
- Diseases: a DC that is not a plain number ("15 + two-thirds mummy's level",
  "Moderate DC") is `{ text }`; a check that is not a plain Endurance check goes in
  `check`.

### Lines
- `Line.text` is the printed wording of that line, whitespace-normalized. Copy it
  from the source; fix it only where the parser damaged it (dropped words, text from
  another field, split words like "fi re"). Do not paraphrase.
- A hit line includes its damage: `"2d6 + 5 fire damage, and the target is dazed (save ends)."`

### Clauses
Each clause has `at: [start, end)`, a character span in its own `Line.text`
(0-based, end exclusive). The span must contain the words that state the clause.

Cover all mechanical text of every Line: each phrase that does something is either a
structured clause or part of an `unparsed` clause. Flavor-free connective words
("and", punctuation) may stay uncovered. Clauses must not overlap, except an
`if` condition may be shared.

| Kind | Use for |
|------|---------|
| `damage` | Dice damage: `dice` like `"2d6+5"` (no spaces), `types` (empty for untyped), `who`. |
| `damage-formula` | PC/item formulas ("2[W] + Strength modifier"). |
| `half-damage` | "Miss: Half damage." |
| `ongoing-damage` | "ongoing 5 fire damage (save ends)": `amount`, `types`, `who`, `duration`. |
| `condition` | One condition id per clause; "dazed and slowed (save ends both)" is two clauses with the same `saveGroup`. |
| `grants-ca` | "grants combat advantage" (to `all`, `source`, `source-allies`). |
| `forced-move` | push / pull / slide N squares. |
| `move` | shift / teleport / swap (the creature itself or a target). |
| `modifier` | "-2 penalty to attack rolls", "+2 bonus to AC" with `stat`, signed `value`, `duration`. |
| `resistance` / `vulnerability` | Gained or lost resistance/vulnerability with a value and duration. |
| `heal` | Regains hit points: a number, `surge-value`, or `half-surge-value`. |
| `temp-hp` | Temporary hit points. |
| `regeneration` | Gains regeneration N. |
| `revive` | Returns to N hit points after dropping to 0. |
| `unparsed` | Anything else; `text` must equal the spanned text exactly. |

- `who`: `target` (the attack's target), `each-target`, `self` (the monster/user),
  `ally`, `enemies-in-area`, `other`.
- `duration`: `{"kind":"save-ends"}`; "until the end of the <source>'s next turn" is
  `{"kind":"turn-end","whose":"source","next":true}`; "until the end of its next
  turn" about the target is `whose: "target"`; `turn-start` likewise;
  `{"kind":"encounter"}`; `{"kind":"sustain","action":"minor"}`; `{"kind":"instant"}` for
  damage and forced movement; `{"kind":"indefinite"}` for prone and similar.
- `if`: the printed condition text ("if the target is bloodied") when a clause only
  applies sometimes. It is shown, never auto-applied.
- Prefer an honest `unparsed` clause over a structured clause that does not quite
  fit. A wrong structured clause is worse than an unparsed one.

### Provenance
Do not edit `provenance`; the apply step rewrites it from your `notes` and `confidence`.
The parser's `provenance.notes` in the current JSON list what it could not place;
resolve each one, or say in `notes` why it stays.

## Output

Reply with one JSON object and nothing else:

```json
{
  "entry": { ...the corrected {{KIND_TYPE}}... },
  "notes": ["What you corrected and why, one item per change; empty if nothing changed."],
  "confidence": "high"
}
```

Use `"confidence": "low"` when you were unsure about any field or clause, when the
source looks misprinted, or when you used `unparsed` for something that seems to
need a new clause kind (say which in `notes`).
