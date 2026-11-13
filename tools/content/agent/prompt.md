<!-- Agent brief template. tools/content/agent/prompt.ts fills the {{NAME}} values and keeps a {{#name}}...{{/name}} block only for that kind or mode (single: one entry per brief; batch: a rules file per kind plus batch briefs). In batch mode everything outside the batch-head and entry markers is the kind's rules file (<kind>-rules.md); a batch brief is the batch-head part followed by the entry part once per entry, with the entry headings one level down (so its "# Entry" heading becomes "## Entry"). The quote and if/unless rules mirror tools/content/validate/spans.ts; keep them in step. This comment is dropped from briefs. -->
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
   `PASS` means you are done (flags are information only and need no note;
   never re-run a passing check just to add one). On `FAIL`, fix the
   listed problems with the Edit tool and run the same command again. Run it at
   most 3 times in all; if it still fails, stop and say what is left.

If the reply file already exists (an earlier run), Read it, review it against
the source and these rules, edit what is wrong, and run the check.
{{/single}}
{{#batch}}
# Rules for cleaning {{KIND_LABEL}} entries ({{KIND}})

A parser converted D&D 4e {{KIND_LABEL}} entries from their published stat
blocks. For each entry in your batch brief, fix what the parser got wrong, and
turn the mechanics in every printed line into effect clauses. The steps, rules,
examples and schema in this file apply to every entry; your batch brief lists
the entries. This file and your batch brief are all you need: do not read other
entries, other batch briefs, other agents' replies or the tool source.

## Steps

Do the entries in your batch brief one at a time, in the order listed. Finish
one (reply written and checked) before you start the next:

1. Read the entry's source text and current JSON.
2. Write its reply with the **Write tool** to the entry's reply path. Never use
   python, node, jq, sed or shell heredocs to write or edit it. The reply is
   plain JSON, with no code fence and nothing before or after it:
   `{"entry": {...the whole corrected {{KIND_TYPE}}...}, "notes": ["..."], "confidence": "high"}`
   `notes`: one short item per correction (what and why); `[]` if nothing changed.
3. Run the entry's check command, exactly as written (it only checks; replies
   are applied later in one batch). `PASS` means the entry is done (flags are
   information only and need no note; never re-run a passing check just to add
   one). On `FAIL`, fix the listed problems with the Edit tool and
   run the same command again, at most 3 times per entry; if it still fails,
   note what is left and go on to the next entry.

If an entry's reply file already exists (an earlier run), Read it, review it
against the source and these rules, edit what is wrong, and run its check.

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
  passive "(encounter)" rider) is `action: "no-action"`. A triggered power that
  prints neither ("( when reduced to 0 hit points, )") is `action: "no-action"`,
  `usage: "unknown"`, with the printed words in `trigger`.
- `trigger` keeps the printed wording ("when first bloodied"), not the parser's
  rewrite ("First bloodied").
- Errata or revision text that conflicts with the print: keep the print, note it.
- Movement before an attack ("flies up to 12 squares and makes a claw attack"):
  that sentence goes in `effect` with a `move` clause, not in `range.note`. A
  lead-in with no mechanics ("The dragon uses its tail to attack the target")
  stays in `range.note`.
- A secondary attack with no printed range copies the primary's `range`; say so
  in `notes`. An attack with no printed target has `target: ""`. "makes a
  secondary attack against the same target" in a hit line stays an unparsed
  clause (the attack itself is the next entry in `attacks`).
- A targeting lead-in on the attack line ("makes a separate attack against 3
  different targets", "it can make this attack against it twice") stays in
  `range.note`.
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
  unparseable "Secondary Attack:") go in `extraLines` as `{label, line}`. An eye
  ray's "Ranged 10; +24 vs. Reflex" words are one unparsed clause.
- "1/round" and "1/turn" are `usesPerRound: 1`; "2/Encounter" is
  `usesPerEncounter: 2`. "requires greatsword" / "requires combat advantage" is
  the power's `requirement` line, as is a usage condition that is not a
  trigger ("usable only while bloodied", "only while bloodied" in the usage
  parentheses).
- "Area 1 square within 10 squares" is `{"kind": "area-burst", "size": 0, "within": 10}`.
- Set the power's `sustain` whenever it prints one; when the sustain is only
  inline ("(sustain minor)"), it is `{"action": "minor"}` with no `line`.
- Resistances and vulnerabilities: `{type, value}`; a damage type with no number
  omits `value`; anything else is `{type: "special", text: "<printed wording>"}`.
  Never store 0 for an unknown value. A number with a qualifier instead of a
  type ("Vulnerable 10 against close and area attacks") is `{type: "special",
  value: 10, text: "against close and area attacks"}`. "Resist 15 variable (2/encounter)" keeps
  the parser's `{type: "variable", value: 15, note: "2/encounter"}`; the
  Variable Resistance trait's clause may take its `typeChoice` from the trigger line.
- An aura size that changes ("Aura 2, or 3 while the balor is bloodied") is
  `range: 2, rangeIf: [{"value": 3, "if": "while the balor is bloodied"}]`.
{{#monsters}}
- The parser stored some traits and auras as no-action powers (see its notes):
  move them to `traits` or `auras` (`range` is the aura size). A triggered
  action stored as a trait goes back to `powers`.
- Conditional skill bonuses ("(+5 to Stealth checks when in ice or snow)") go in
  `skillNotes`, verbatim. Conditional saving throw bonuses go in
  `savingThrowNotes`, verbatim, never in `savingThrowBonus`: "Saving Throws +5
  against fear effects" is `0` and `["+5 against fear effects"]`; "+2 (+4
  against charm effects)" is `2` and `["+4 against charm effects"]`.
- Conditional defenses ("AC 24 (28 against opportunity attacks)", "Fortitude
  23 (25 while bloodied)") are `defensesIf`, the base value stays in
  `defenses`: `[{"defense": "ac", "value": 28, "if": "against opportunity
  attacks"}]`; a signed one ("+2 while flying") stores the result (base + 2).
  The parser fills them; check them against the print.
- `senses` is the Senses line only. A trait or power that grants a sense
  ("Truesight 10", "can see invisible creatures") gets a `sense` clause.
- "phasing" or "(hover)" on the speed line stays in `speed.notes`: every note
  in printed order, separated by "; ", with the mode first when it belongs to
  one ("fly: hover; phasing"). A walk-speed note has no mode: "ice walk", not
  the parser's "land: ice walk".
- `equipment` is the printed list, normalized: "heavy shield, longsword" (no
  space before commas, no trailing period). Fill it from the print when the
  parser left it empty.
- An aura's `keywords` are its printed keywords; drop the parser's "aura".
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
- **Damage parts.** Each damage part is its own clause, and its quote needs
  only the dice (or the flat number), not the word "damage". "2d8+10 plus 2d6
  lightning damage" is two clauses: "2d8+10" (untyped: `types: []`) and "2d6
  lightning damage". A shared trailing type word types an earlier part only when
  the print clearly applies it to both ("2d6 + 5 or 3d6 + 5 fire damage"). An
  alternative roll ("or 5d6 + 7 against a prone target") is a damage clause
  quoting the dice, with `if`; the base roll gets the same words as `unless`.
- One effect on several subjects ("The overseer and one ally turn invisible")
  is one clause with a `who` list: `["self", "ally"]`.
- A condition a zone imposes ("is blinded while within the zone") has the
  zone's duration, with the "in the zone" words as `if`.
- Words two clauses share (a duration, a subject) go in one quote only; the
  other clause still encodes them in its fields. When one sentence makes an
  area and says what it does ("The cloud provides concealment, and it remains
  until the start of the tendril's next turn"), the zone clause quotes the area
  word ("The cloud") and the concealment clause quotes "provides concealment";
  both get the printed duration.
- `move` and `forced-move` have no `duration` (they are instant). `move` omits
  `squares` when the distance is not a printed number ("shifts up to its
  speed"); a forced move with no printed distance ("pulls the target with it")
  is unparsed. `move: "fly"` is "flies"; `move: "move"` is any other movement
  of its own ("moves its speed", "jumps 5 squares"). "without provoking
  opportunity attacks" is a `status` clause `no-provoke` (duration `instant`
  when it rides on one move).
- **Conditions and options: `if`, `unless`, `optional`.** They are shown to
  the DM, never auto-applied. `if` and `unless` hold printed words only: each
  is one exact fragment of the clause's own `Line.text`, or a list of them,
  matched like quotes (the check enforces it).
  - `if`: whenever printed words make a clause conditional ("if the target is
    bloodied", "against a prone target", "while darkened", "an enemy that
    starts its turn in the aura", "a target that has one or more allies
    adjacent to it"), the clause MUST carry `if` with those words, verbatim,
    never paraphrased or shortened. Leaving it out makes the effect look
    unconditional.
  - `if` includes every conditional phrase, including a leading one ("At the
    start of an encounter"). A condition printed in pieces is a list of the
    pieces in printed order, each copied exactly: `"if": ["At the start of an
    encounter", "against any enemy that has not yet acted during the
    encounter"]`. Never join pieces with " ... " and never add words.
  - Never put the clause's own words in `if`: a fragment must not overlap the
    clause's quote. Quote the effect ("gains combat advantage") and put the
    condition in `if` ("against a target that has one or more of the wolf's
    allies adjacent to it").
  - `if` says when the clause applies, never who it applies to ("to the first
    target of the attack" is not a condition). A subject phrase that also says
    where or when ("Any creature that enters or starts its turn in the zone",
    "Any enemy adjacent to two or more azers at the start of its turn") is a
    condition: the whole phrase is the `if`, and `who` names the subject.
  - Damage has no `duration`: a time limit on a damage clause ("Until the
    start of its next turn, any creature that hits it takes 5 fire damage")
    goes in `if`, verbatim.
  - `unless`: when the print states the condition as the case in which the
    clause does NOT apply, copy those words into `unless` (never a "not:"
    prefix). "...slowed (save ends). If the target is already slowed, it is
    instead immobilized": the slowed clause has `"unless": "If the target is
    already slowed"`; the immobilized clause has `"if": "If the target is
    already slowed"`. "or else": "the target must answer the question
    truthfully or else take 3d8 + 11 psychic damage": the damage clause quotes
    "take 3d8 + 11 psychic damage" with `"unless": "the target must answer the
    question truthfully"`.
  - `optional: true`: the print makes the effect a choice ("can shift 4
    squares", "the target can be grabbed", "can make a melee basic attack",
    "can make a saving throw"). The quote keeps the "can" words. Never express
    an option through `if`; a condition on the option still goes in `if`
    ("After the first or second attack").
  - The words that open a branch ("On a save", "On a failure", or the check
    that allows it) are the `if` of each clause in that branch.
- `who`: `target` is the attack's target, `self` the {{KIND_LABEL}}; `rider` the
  creature riding it, `mount` its mount; `other` any subject no value names
  (creatures attacking it, creatures adjacent to it with no area). A narrower
  group ("undead in the burst", "Fey allies") takes the nearest value and keeps
  the narrowing words in the quote, never in `if`.
- `charge`: "charges" and "can charge" (`optional: true`); the attack it makes
  is the power's own attack.
- `disease`: `disease` is the name as printed, without "level 6" ("contracts
  level 6 mummy rot": "mummy rot"); `stage` when printed. Tools fill `diseaseId`.
- `reroll`: `what` is rerolled; `keep` only when the print says which roll
  counts ("use the second result": `new`; "the higher result": `higher`).
- `sense`: the sense id or `see-invisible` ("can see invisible creatures");
  `range` when printed; an always-on trait has duration `permanent`.
- `modifier` stat `defenses` already includes AC: "+4 bonus to AC and all
  defenses" is `"stat": "defenses"`, never `["ac", "defenses"]`.
- Threatening Reach ("can make opportunity attacks against all enemies within
  its reach") is `opportunity-reach` with `optional: true`.
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
  `until.text` is the printed words wherever they exist, never a paraphrase; a
  duration printed as its own sentence ("The effect lasts until ...") goes in
  the clause's `until` and the sentence stays uncovered. `this-power`: only the
  attacks the same power makes ("each at a -2 penalty"). A grab "(until
  escape)" is `indefinite`. Ongoing damage with no printed duration is
  `save-ends` (the 4e default); say so in `notes`.
- `typeChoice`: "damage of one of the following types: acid, cold or fire" is
  chosen when used: `types: []` and `typeChoice` lists them (resistance: `type: "choice"`).

**Quote rules** (the check enforces these):
- A quote is a contiguous substring of its own `Line.text`. Matching ignores case,
  curly vs straight quote marks and dash kinds (- – — −); nothing else, so
  spacing and punctuation must match. Dice match with or without spaces
  ("2d12+6" or "2d12 + 6").
- List a line's clauses in printed order; each quote is looked up after the
  previous clause's words, so a repeated phrase needs no extra context.
- Quotes must not overlap. `if` and `unless` fragments may lie inside another
  clause's quote, never inside the clause's own.
- The quote must contain its kind's words (any inflection: "grabs" or "is
  grabbed", "pushes" or "pushed"). If the words are not there, the phrase does
  not state that clause: make it unparsed.

| kind | the quote must contain |
|---|---|
| damage | the dice or flat number ("2d6 + 5" for `2d6+5`), not "damage"; "crit" if `critical`; each type in `types`, in the quote or the words after it |
| ongoing-damage | "ongoing" and the amount |
| condition | the condition word in any form ("dazes", "knocks prone", "removed from play"); with `escapeDc`, "escape" and the number ("escape DC 21", "escapes (DC 21)"), in the quote or later in its sentence |
| forced-move, move | push / pull / slide / shift / teleport / swap (or switch) / fly / move (or walk, jump, climb) in any form; forced-move also the squares unless 1 |
| modifier, revive | the number (digits or a word) |
| grants-ca | "combat advantage" |
| resistance, vulnerability | "resist", "vulnerable" |
| heal / temp-hp | "regains", "heals" or "hit points" / "temporary" |
| regeneration, recharge-power, lose-healing-surge | "regenerat" or "regain", "recharge", "surge" |
| half-damage | "half" or "halved" ("half damage", "half as much", "the damage is halved") |
| concealment | "conceal" (and "total" if `total`) |
| zone | "zone", "cloud" or "wall" |
| saving-throw | "save" or "saving" (and the bonus) |
| use-power, summon | the power name, "attack", "uses" or "makes"; a word of `creature` ("shadow duplicate") or "summon"/"appear"/"conjure"/"create" |
| crit-range | "crit" and `min` |
| power-restriction | "can't"/"cannot" and each `what` ("encounter", "daily", "attack"; `all`: "power") |
| redirect-attack | "instead", "redirect" or "becomes the target" |
| status | "insubstantial", "phasing", or "provok" (no-provoke) |
| opportunity-reach | "opportunity" |
| difficult-terrain | "difficult terrain" |
| charge | "charge" in any form |
| disease | the `disease` name (and "stage" and the number if `stage`) |
| reroll | "reroll" or "roll ... again" ("roll the attack again") |
| action-point | "action point" and the amount ("an action point" for 1) |
| sense | the sense name ("tremorsense", "low-light vision") or "see invisible", and `range` |
| damage-formula | "damage" |

**Examples** (one clause or field each):
- Conditional trait: `{"quote": "gains combat advantage", "kind": "grants-ca", "to": "source", "who": "target", "duration": {"kind": "permanent"}, "if": "against a target that has one or more of the wolf's allies adjacent to it"}`
- Split condition ("At the start of an encounter, the assassin deals 2d6 extra damage against any enemy that has not yet acted during the encounter"): `{"quote": "2d6 extra damage", "kind": "damage", "dice": "2d6", "types": [], "who": "target", "extra": true, "if": ["At the start of an encounter", "against any enemy that has not yet acted during the encounter"]}`
- Inverted condition ("The target is slowed (save ends). If the target is already slowed, it is instead immobilized (save ends)"): `{"quote": "slowed (save ends)", "kind": "condition", "condition": "slowed", "who": "target", "duration": {"kind": "save-ends"}, "unless": "If the target is already slowed"}, {"quote": "it is instead immobilized (save ends)", "kind": "condition", "condition": "immobilized", "who": "target", "duration": {"kind": "save-ends"}, "if": "If the target is already slowed"}`
- Or else ("the target must answer the question truthfully or else take 3d8 + 11 psychic damage"): `{"quote": "take 3d8 + 11 psychic damage", "kind": "damage", "dice": "3d8+11", "types": ["psychic"], "who": "target", "unless": "the target must answer the question truthfully"}`
- Save ends both: `{"quote": "dazed", "kind": "condition", "condition": "dazed", "who": "target", "duration": {"kind": "save-ends"}, "saveGroup": "a"}, {"quote": "slowed (save ends both)", "kind": "condition", "condition": "slowed", "who": "target", "duration": {"kind": "save-ends"}, "saveGroup": "a"}`
- Several stats: `{"quote": "+2 bonus to attack rolls and damage rolls until the end of its next turn", "kind": "modifier", "stat": ["attack", "damage"], "value": 2, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
- Extra damage: `{"quote": "2d10 extra damage", "kind": "damage", "dice": "2d10", "types": [], "who": "target", "extra": true, "if": "with melee attacks against a prone target"}`
- Option ("After the first or second attack, the dire winter wolf can shift 4 squares", in `effect`): `{"quote": "the dire winter wolf can shift 4 squares", "kind": "move", "move": "shift", "squares": 4, "who": "self", "optional": true, "if": "After the first or second attack"}`; "the target can be grabbed" is a grabbed condition clause with `"optional": true`.
- Type choice: `{"quote": "4d10 + 6 damage of one of the following types: acid, cold, or fire", "kind": "damage", "dice": "4d10+6", "types": [], "typeChoice": ["acid", "cold", "fire"], "who": "target"}`
- Zone: `{"quote": "The blast creates a zone that lasts until the end of the dragon's next turn (sustain minor)", "kind": "zone", "duration": {"kind": "sustain", "action": "minor"}}, {"quote": "takes 10 fire damage", "kind": "damage", "dice": "10", "types": ["fire"], "who": "creatures-in-area", "if": "Any creature that enters or starts its turn in the zone"}`, and the power gets `"sustain": {"action": "minor"}`.
- Trigger: `"trigger": {"text": "An enemy hits the guard.", "clauses": []}`; its interrupt: `{"quote": "The triggering attack targets the guard instead", "kind": "redirect-attack", "who": "self"}`
- Base plus typed part ("2d8+10 plus 2d6 lightning damage"): `{"quote": "2d8+10", "kind": "damage", "dice": "2d8+10", "types": [], "who": "target"}, {"quote": "2d6 lightning damage", "kind": "damage", "dice": "2d6", "types": ["lightning"], "who": "target"}`
- Base plus a cold part ("1d8+5 plus 1d10 cold damage"): `{"quote": "1d8+5", "kind": "damage", "dice": "1d8+5", "types": [], "who": "target"}, {"quote": "1d10 cold damage", "kind": "damage", "dice": "1d10", "types": ["cold"], "who": "target"}` (cold is not the base's type)
- Base plus ongoing ("1d10+6 and ongoing 5 poison damage (save ends)"): `{"quote": "1d10+6", "kind": "damage", "dice": "1d10+6", "types": [], "who": "target"}, {"quote": "ongoing 5 poison damage (save ends)", "kind": "ongoing-damage", "amount": 5, "types": ["poison"], "who": "target", "duration": {"kind": "save-ends"}}`
- Difficult terrain ("The aura is difficult terrain for enemies"): `{"quote": "is difficult terrain", "kind": "difficult-terrain", "who": "enemies-in-area", "duration": {"kind": "permanent"}}`
- Fly and no-provoke ("The dragon flies up to 12 squares without provoking opportunity attacks"): `{"quote": "flies up to 12 squares", "kind": "move", "move": "fly", "squares": 12, "who": "self"}, {"quote": "without provoking opportunity attacks", "kind": "status", "status": "no-provoke", "who": "self", "duration": {"kind": "instant"}}`
- Several subjects ("The overseer and one ally turn invisible until the end of the overseer's next turn"): `{"quote": "turn invisible until the end of the overseer's next turn", "kind": "condition", "condition": "invisible", "who": ["self", "ally"], "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
- Grab ("the choker grabs the target (escape DC 21)"): `{"quote": "grabs the target (escape DC 21)", "kind": "condition", "condition": "grabbed", "who": "target", "duration": {"kind": "indefinite"}, "escapeDc": 21}`
- Charge ("The hippogriff can charge and make the following attack"): `{"quote": "can charge", "kind": "charge", "who": "self", "optional": true}`
- Disease ("the target contracts werewolf moon frenzy (stage 1)"): `{"quote": "contracts werewolf moon frenzy (stage 1)", "kind": "disease", "disease": "werewolf moon frenzy", "stage": 1, "who": "target"}`
- Reroll ("forces the attacker to reroll the attack and use the second result"): `{"quote": "forces the attacker to reroll the attack and use the second result", "kind": "reroll", "what": "attack", "keep": "new", "who": "other"}`
- Action point and rider ("its rider gains 1 action point"): `{"quote": "gains 1 action point", "kind": "action-point", "amount": 1, "who": "rider"}`
- Sense ("The wraith gains tremorsense 10 until the end of its next turn"): `{"quote": "gains tremorsense 10 until the end of its next turn", "kind": "sense", "sense": "tremorsense", "range": 10, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`; ("The beholder can see invisible creatures"): `{"quote": "can see invisible creatures", "kind": "sense", "sense": "see-invisible", "who": "self", "duration": {"kind": "permanent"}}`
- This power only ("The dragon makes two claw attacks, each at a -2 penalty"): `{"quote": "makes two claw attacks", "kind": "use-power", "power": "claw", "times": 2, "who": "self"}, {"quote": "-2 penalty", "kind": "modifier", "stat": "attack", "value": -2, "who": "self", "duration": {"kind": "this-power"}}`
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

<!-- batch-head -->
# Clean {{COUNT}} {{KIND_LABEL}} entries ({{KIND}}, {{BATCH}})

First read the rules file `{{RULES_PATH}}` in full with the Read tool (not
`cat`: it is over the Bash output limit): its steps, rules, examples and
schema apply to every entry below. Then do the entries one at a time, in
this order: {{IDS}}. Each has its own reply path and check command. At the
end, list each id with PASS or FAIL.

<!-- /batch-head -->
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
