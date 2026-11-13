<!-- Agent brief template. tools/content/agent/prompt.ts fills the {{NAME}} values and keeps a {{#name}}...{{/name}} block only for that kind or mode (single: one entry per brief; batch: several). The part between the entry markers is repeated per entry in a batch brief, with its headings one level down (so its "# Entry" heading becomes "## Entry"). The quote rules mirror tools/content/validate/spans.ts; keep them in step. This comment is dropped from briefs. -->
{{#single}}
# Clean {{KIND_LABEL}} `{{ID}}` ({{KIND}})

A parser converted this D&D 4e {{KIND_LABEL}} from the published stat block. Fix
what it got wrong, and turn the mechanics in every printed line into effect
clauses. Work on this entry only. Everything you need is in this brief: do not
read other entries, other agents' replies or the tool source.

## Steps

1. Read the source text, the current JSON and the schema below.
2. Write your reply with the **Write tool** to `{{REPLY_PATH}}`. Never use python,
   node, jq, sed or shell heredocs to write or edit it. The reply is plain JSON,
   with no code fence and nothing before or after it:
   `{"entry": {...the whole corrected {{KIND_TYPE}}...}, "notes": ["..."], "confidence": "high"}`
   `notes`: one short item per correction (what and why); `[]` if nothing changed.
3. Check it with this command, exactly as written (it only checks; replies are
   applied later in one batch):
   ```
   {{CHECK_COMMAND}}
   ```
   `PASS` means you are done (flags are information only). On `FAIL`, fix the
   listed problems with the Edit tool and run the same command again. Run it at
   most 3 times in all; if it still fails, stop and say what is left.
{{/single}}
{{#batch}}
# Clean {{COUNT}} {{KIND_LABEL}} entries ({{KIND}}, {{BATCH}})

A parser converted these D&D 4e {{KIND_LABEL}} entries from their published
stat blocks. For each, fix what the parser got wrong, and turn the mechanics in
every printed line into effect clauses. The rules, examples and schema below
apply to every entry; the entries follow them. Everything you need is in this
brief: do not read other entries, other agents' replies or the tool source.

## Steps

Do the entries one at a time, in the order listed ({{IDS}}). Finish one
(reply written and checked) before you start the next:

1. Read the entry's source text and current JSON.
2. Write its reply with the **Write tool** to the entry's reply path. Never use
   python, node, jq, sed or shell heredocs to write or edit it. The reply is
   plain JSON, with no code fence and nothing before or after it:
   `{"entry": {...the whole corrected {{KIND_TYPE}}...}, "notes": ["..."], "confidence": "high"}`
   `notes`: one short item per correction (what and why); `[]` if nothing changed.
3. Run the entry's check command, exactly as written (it only checks; replies
   are applied later in one batch). `PASS` means the entry is done (flags are
   information only). On `FAIL`, fix the listed problems with the Edit tool and
   run the same command again, at most 3 times per entry; if it still fails,
   note what is left and go on to the next entry.

Each entry stands alone: its source text is the only authority for it. At the
end, list each id with PASS or FAIL.
{{/batch}}

## Rules

**Never invent mechanics.** Every number, damage type, condition, range and
keyword must appear in the source text. Do not "fix" published values that look
odd (XP, a high defense); keep the print and mention a suspected misprint in
`notes`. A wrong structured clause is worse than an honest unparsed one.

**Unknown, not guessed.** When the print gives no value for a required field,
write `"unknown"` instead of guessing: `vs: "unknown"` when an attack names no
defense ("+34 vs ; 3d8+10 damage": the attack is still structured, with its
printed bonus and damage), `usage: "unknown"` when a power prints no usage
(also replace a parser default such as "at-will" that the print does not
show). The check flags these for review; that is expected, and they do not
lower confidence.

**Fields.**
- Correct any field the parser got wrong against the source; it sometimes drops
  whole auras, traits or flavor text, so compare line by line. Keep `id`; keep
  `sources` and `description` unless wrong. Omit optional fields that do not
  apply; never add fields the schema lacks. Closed lists use the schema's ids exactly.
- You may leave out `provenance`; it is rewritten from your `notes` and
  `confidence`. Its parser `notes` list what the parser could not place:
  resolve each one, or say in `notes` why it stays.
- Keep `basic` unless the source contradicts it: the basic-attack icon is the
  one printed in parentheses ("(⚔) Longsword"); a bare icon is not basic.
- A power that prints a usage but no action type and acts on its own (a
  passive "(encounter)" rider) is `action: "no-action"`.
- Failed saving throw lines go in the attack's `failedSaves`, in printed order.
- A printed conditional attack bonus ("(+37 while bloodied)", "or +20 vs.
  Reflex if the target is bloodied") is the attack's `altBonus`:
  `[{"value": 37, "if": "while bloodied"}]`, with `vs` only when the print names
  a different defense. Take it out of `range.note`.
- A power with no attack roll that prints a range ("Close burst 5 (allies in
  the burst)") has it in `range`, targets in `range.note`; the effect keeps the rest.
- **Hit or effect.** `hit` holds what happens on a hit. A printed "Effect:" line,
  or a sentence that applies whether the attack hits or misses ("After the
  first or second attack, the wolf can shift 4 squares"), goes in the power's
  `effect`, even when the print runs it into the hit text. Words stay verbatim;
  say in `notes` what moved.
- Labeled lines with no field of their own (form lines, numbered eye rays, an
  unparseable "Secondary Attack:") go in `extraLines` as `{label, line}`.
- "1/round" and "1/turn" are `usesPerRound: 1`; "2/Encounter" is
  `usesPerEncounter: 2`. "requires greatsword" / "requires combat advantage" is
  the power's `requirement` line.
- Set the power's `sustain` whenever it prints one; when the sustain is only
  inline ("(sustain minor)"), it is `{"action": "minor"}` with no `line`.
- Resistances and vulnerabilities: `{type, value}`; a damage type with no number
  omits `value`; anything else is `{type: "special", text: "<printed wording>"}`.
  Never store 0 for an unknown value.
{{#monsters}}
- The parser stored some traits and auras as no-action powers (see its notes):
  move them to `traits` or `auras` (`range` is the aura size). A triggered
  action stored as a trait goes back to `powers`.
- Conditional skill bonuses ("(+5 to Stealth checks when in ice or snow)") go in
  `skillNotes`, verbatim. "phasing" or "(hover)" on the speed line stays in
  `speed.notes`: every note in printed order, separated by "; ", with the mode
  first when it belongs to one ("fly: hover; phasing").
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
  "Single-Use Terrain" is `usage`. A printed "Speed 5" is `speed` (`{"walk": 5}`).
- A power under "Triggered Actions" with no printed action type has `action: "triggered"`.
- Stats printed inside a countermeasure for one part of the trap ("each
  stalagmite: AC 32, hp 25") stay in that countermeasure line; the trap-level
  `hp`/`defenses`/`resist` come only from the trap's own stat lines.
{{/traps}}

**Lines.** `Line.text` is the printed wording, whitespace-normalized. Copy it from
the source; change it only where the parser damaged it (dropped words, text from
another field, split words like "fi re"). Never paraphrase. A hit line includes
its damage.

**Clauses.** A structured clause is `{"quote": "...", "kind": "...", ...fields}`;
never write `at`. An unparsed clause is just `{"text": "<exact printed words>"}`
(no kind, no quote). Unparsed is a legitimate result for wording no kind fits.
- Cover all mechanical text of every line: each phrase that does something is a
  structured clause or inside an unparsed one. A line with any mechanics never
  has `clauses: []`; when no kind fits, the sentence is one unparsed clause.
  Item text that says what the item lets you do (scrying, light, speaking a
  language) counts. Only trigger and requirement lines (they say when, not
  what) and pure flavor have `clauses: []`. Connecting words may stay uncovered.
- One clause per distinct mechanic. One condition per clause; "dazed and slowed
  (save ends both)" is two clauses with the same `saveGroup`. Damage types come
  from the clause's own words, not from a power keyword like "(poison)".
- Words two clauses share (a duration, a subject) go in one quote only; the
  other clause still encodes them in its fields. When one sentence makes an
  area and says what it does ("The cloud provides concealment, and it remains
  until the start of the tendril's next turn"), the zone clause quotes the area
  word ("The cloud") and the concealment clause quotes "provides concealment";
  both get the printed duration.
- `move` and `forced-move` have no `duration` (they are instant). `move` omits
  `squares` when the distance is not a printed number ("shifts up to its
  speed"); a forced move with no printed distance ("pulls the target with it")
  is unparsed.
- **`if`**: whenever the printed words make a clause conditional ("if the target
  is bloodied", "against a prone target", "while darkened", "an enemy that
  starts its turn in the aura", "a target that has one or more allies adjacent
  to it"), the clause MUST carry `if` with those printed words copied verbatim,
  never paraphrased and never shortened. `if` is shown to the DM, never
  auto-applied; leaving it out makes the effect look unconditional.
  - `if` includes every conditional phrase, including a leading one ("At the
    start of an encounter,"). When the pieces are not next to each other, copy
    each verbatim and join them with " ... ": `"if": "At the start of an
    encounter ... against any enemy that has not yet acted during the encounter"`.
  - `if` says when the clause applies, never who it applies to ("to the first
    target of the attack" is not a condition).
  - `if` must not read backwards. When the print states the condition only as
    its opposite ("must answer the question truthfully or else take 3d8 + 11
    psychic damage"; "If the target is already slowed, it is instead
    immobilized" for the slow), write `"not: "` and then the verbatim words:
    `"if": "not: the target must answer the question truthfully"`,
    `"if": "not: If the target is already slowed"`. This prefix is the only
    word you may add.
  - A printed option ("can shift 4 squares", "the target can be grabbed",
    "can make a saving throw") is a choice, not automatic: the clause carries
    `if` with the option words through the verb ("can shift", "can be grabbed"),
    joined to any other condition with " ... ".
  - The words of the branch after "On a save," / "On a failure," (or the
    check that allows it) are the `if` of each clause in that branch.
- `who`: `target` is the attack's target, `self` the {{KIND_LABEL}}.
- grants-ca `to`: `source` is the clause's source only; `source-allies` is the
  source and its allies (use it for "the dragon and its allies" and for "the
  Imperator and an ally"); `all` is every creature.
- `duration`: "until the end of your next turn" is
  `{"kind":"turn-end","whose":"source","next":true}`; `whose: "target"` when it
  is the attack target's turn. `instant` for damage; `permanent` for always-on
  traits, including state-dependent ones (with `if`: "While darkened");
  `indefinite` for prone or a grab with no printed end; `until` with the printed
  words for other endings, including another creature's turn
  (`{"kind":"until","text":"until the end of the triggering enemy's next turn"}`).
- `typeChoice`: "damage of one of the following types: acid, cold or fire" is
  chosen when used: `types: []` and `typeChoice` lists them (resistance: `type: "choice"`).

**Quote rules** (the check enforces these):
- A quote is a contiguous substring of its own `Line.text`. Matching ignores case,
  curly vs straight quote marks and dash kinds (- – — −); nothing else, so
  spacing and punctuation must match. Dice match with or without spaces
  ("2d12+6" or "2d12 + 6").
- List a line's clauses in printed order; each quote is looked up after the
  previous clause's words, so a repeated phrase needs no extra context.
- Quotes must not overlap, except that `if` words may also lie in another quote.
- The quote must contain its kind's words (any inflection: "grabs" or "is
  grabbed", "pushes" or "pushed"). If the words are not there, the phrase does
  not state that clause: make it unparsed.

| kind | the quote must contain |
|---|---|
| damage | the dice ("2d6 + 5" for `2d6+5`), "damage" ("crit" if `critical`), each type in `types` |
| ongoing-damage | "ongoing" and the amount |
| condition | the condition word in any form ("dazes", "knocks prone", "removed from play") |
| forced-move, move | push / pull / slide / shift / teleport / swap (or switch) in any form; forced-move also the squares unless 1 |
| modifier, revive | the number (digits or a word) |
| grants-ca | "combat advantage" |
| resistance, vulnerability | "resist", "vulnerable" |
| heal / temp-hp | "regains", "heals" or "hit points" / "temporary" |
| regeneration, recharge-power, lose-healing-surge, half-damage | "regenerat" or "regain", "recharge", "surge", "half" |
| concealment | "conceal" (and "total" if `total`) |
| zone | "zone", "cloud" or "wall" |
| saving-throw | "save" or "saving" (and the bonus) |
| use-power, summon | the power name, "attack", "uses" or "makes"; a word of `creature` ("shadow duplicate") or "summon"/"appear"/"conjure"/"create" |
| crit-range | "crit" and `min` |
| power-restriction | "can't"/"cannot" and each `what` ("encounter", "daily", "attack"; `all`: "power") |
| redirect-attack | "instead", "redirect" or "becomes the target" |
| status | "insubstantial" or "phasing" |
| opportunity-reach | "opportunity" |
| damage-formula | "damage" |

**Examples** (one clause or field each):
- Conditional trait: `{"quote": "gains combat advantage against a target that has one or more of the wolf's allies adjacent to it", "kind": "grants-ca", "to": "source", "who": "target", "duration": {"kind": "permanent"}, "if": "a target that has one or more of the wolf's allies adjacent to it"}`
- Save ends both: `{"quote": "dazed", "kind": "condition", "condition": "dazed", "who": "target", "duration": {"kind": "save-ends"}, "saveGroup": "a"}, {"quote": "slowed (save ends both)", "kind": "condition", "condition": "slowed", "who": "target", "duration": {"kind": "save-ends"}, "saveGroup": "a"}`
- Several stats: `{"quote": "+2 bonus to attack rolls and damage rolls until the end of its next turn", "kind": "modifier", "stat": ["attack", "damage"], "value": 2, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
- Extra damage: `{"quote": "2d10 extra damage", "kind": "damage", "dice": "2d10", "types": [], "who": "target", "extra": true, "if": "with melee attacks against a prone target"}`
- Option: `{"quote": "the dire winter wolf can shift 4 squares", "kind": "move", "move": "shift", "squares": 4, "who": "self", "if": "After the first or second attack ... can shift"}` (in `effect`)
- Type choice: `{"quote": "4d10 + 6 damage of one of the following types: acid, cold, or fire", "kind": "damage", "dice": "4d10+6", "types": [], "typeChoice": ["acid", "cold", "fire"], "who": "target"}`
- Zone: `{"quote": "The blast creates a zone that lasts until the end of the dragon's next turn (sustain minor)", "kind": "zone", "duration": {"kind": "sustain", "action": "minor"}}, {"quote": "takes 10 fire damage", "kind": "damage", "dice": "10", "types": ["fire"], "who": "creatures-in-area", "if": "Any creature that enters or starts its turn in the zone"}`, and the power gets `"sustain": {"action": "minor"}`.
- Trigger: `"trigger": {"text": "An enemy hits the guard.", "clauses": []}`; its interrupt: `{"quote": "The triggering attack targets the guard instead", "kind": "redirect-attack", "who": "self"}`
{{#items}}
- Weapon critical: `"critical": {"text": "+1d6 damage per plus", "clauses": [{"quote": "+1d6 damage per plus", "kind": "damage-formula", "text": "+1d6 damage per plus", "types": []}]}`
- An entry with nothing to structure (a ritual is often only description) needs
  no clauses; returning it with only the parser fixes is a complete answer.
{{/items}}

**Confidence.** `"high"` when every structured clause and field is right as far
as you can tell; unparsed clauses and `"unknown"` fields do not lower it.
`"low"` only when you are unsure whether a structured clause or field is right.
If a common mechanic needs a new clause kind, name it in `notes`.
{{#batch}}

## Schema (4e-kit; every entry must match it exactly)

```ts
{{SCHEMA_EXCERPT}}
```
{{/batch}}

<!-- entry -->
{{#batch}}
# Entry {{N}} of {{COUNT}}: `{{ID}}`

Reply path: `{{REPLY_PATH}}`

Check command:
```
{{CHECK_COMMAND}}
```

{{/batch}}
## Source text (from the published HTML; the only authority for wording and numbers)

```
{{SOURCE_TEXT}}
```

## Current JSON (parser output; may be wrong or incomplete)

```json
{{CURRENT_JSON}}
```
<!-- /entry -->
{{#single}}

## Schema (4e-kit; the entry must match it exactly)

```ts
{{SCHEMA_EXCERPT}}
```
{{/single}}
