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
blocks. For each entry in your batch brief, fix what the parser got wrong and
turn the mechanics in every printed line into effect clauses. This file and
your batch brief are all you need: do not read other entries, briefs or
replies, or the tool source.

## Steps

Do the entries one at a time, in the order listed; finish one (reply written
and checked) before the next:

1. Read the entry's source text and current JSON.
2. Write its reply with the **Write tool** to the entry's reply path. Never use
   python, node, jq, sed or shell heredocs to write or edit it. The reply is
   plain JSON, with no code fence and nothing before or after it:
   `{"entry": {...the whole corrected {{KIND_TYPE}}...}, "notes": ["..."], "confidence": "high"}`
   `notes`: one short item per correction (what and why); `[]` if nothing changed.
3. Run the entry's check command exactly as written (it only checks). `PASS`
   means done (flags are information only; never re-run a passing check to add
   a note). On `FAIL`, fix the listed problems with the Edit tool and run it
   again, at most 3 times per entry; then note what is left and go on.

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

**Unknown, not guessed.** `vs: "unknown"` when an attack names no defense
("+34 vs ; 3d8+10 damage": still structured, with its bonus and damage);
`usage: "unknown"` when a power prints no usage (replacing a parser default
such as "at-will"). The check flags these; they do not lower confidence.

**Fields.**
- Correct any field the parser got wrong; it sometimes drops whole auras,
  traits or flavor text, so compare line by line. Keep `id`, `sources` and
  `description` unless wrong. Omit optional fields that do not apply; never
  add fields the schema lacks; closed lists use the schema's ids exactly.
- You may leave out `provenance`; it is rewritten from your `notes` and
  `confidence`. Its parser `notes` list what the parser could not place:
  resolve each one, or say in `notes` why it stays.
- Keep `basic` unless the source contradicts it: the basic-attack icon is the
  one printed in parentheses ("(⚔) Longsword"); a bare icon is not basic.
- A power that prints a usage but no action type (a passive "(encounter)"
  rider, or "( when first bloodied, encounter)") is `action: "no-action"`; one
  that prints neither ("( when reduced to 0 hit points, )") also has `usage:
  "unknown"`, with the printed words in `trigger`.
- A required value the print omits (level, XP or initiative "as conjurer", no
  Speed line, no range after an icon) keeps the parser's value, with a note;
  flags on it do not lower confidence. An "attack" printed with neither bonus
  nor defense ("Reach 2; 2d6+7 damage") is no attack: `range` plus `effect`. A
  power whose only attack is printed "Secondary Attack" keeps that label.
- `trigger` keeps the printed wording ("when first bloodied"), not the parser's
  rewrite ("First bloodied").
- Errata or revision text that conflicts with the print: keep the print, note it.
- Movement before an attack ("flies up to 12 squares and makes a claw attack")
  goes in `effect` with a `move` clause; a lead-in with no mechanics ("The
  dragon uses its tail to attack the target") stays in `range.note`.
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
- **Hit or effect.** `hit` holds what happens on a hit. A printed "Effect:" or
  "Hit or Miss:" line, or a sentence that applies whether the attack hits or
  misses ("After the first or second attack, the wolf can shift 4 squares"),
  goes in the power's `effect`, even when the print runs it into the hit text.
  A sustain sentence there goes in `sustain.line`; one about how the power
  may be used ("This power counts as a ranged basic attack") in `special`,
  unparsed. Words stay verbatim; say in `notes` what moved.
- Labeled lines with no field of their own (form lines, numbered eye rays, an
  unparseable "Secondary Attack:") go in `extraLines` as `{label, line}`. An eye
  ray's "Ranged 10; +24 vs. Reflex" words are one unparsed clause.
- "1/round" and "1/turn" are `usesPerRound: 1`; "2/Encounter" is
  `usesPerEncounter: 2`. "requires greatsword" / "requires combat advantage" is
  the power's `requirement` line, as is a usage condition that is not a
  trigger ("only while bloodied" in the usage parentheses).
- A trait or aura whose name prints a condition ("Billowing Winds (while
  bloodied)", "Dragonborn Fury (only while bloodied)", no action or usage) is a
  trait or aura with that `name`; each of its clauses has those words as `if`
  (the check finds them in the name).
- "Area 1 square within 10 squares" is `{"kind": "area-burst", "size": 0, "within": 10}`.
- Set the power's `sustain` whenever it prints one; when the sustain is only
  inline ("(sustain minor)"), it is `{"action": "minor"}` with no `line`.
- Resistances and vulnerabilities: `{type, value}`; no number: no `value`
  (never 0); anything else `{type: "special", text: "<printed wording>"}`,
  with `value` for "Vulnerable 10 against close and area attacks". "Resist 15 variable (2/encounter)" keeps
  the parser's `{type: "variable", value: 15, note: "2/encounter"}`; the
  Variable Resistance trait's clause may take its `typeChoice` from the trigger line.
- An aura size that changes ("Aura 2, or 3 while the balor is bloodied") is
  `range: 2, rangeIf: [{"value": 3, "if": "while the balor is bloodied"}]`;
  "aura sight" is `rangeText: "sight"` with no `range`.
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
- `equipment` is the printed list: "heavy shield, longsword" (no space before
  commas, no trailing period), filled from the print if the parser left it empty.
- An aura's `keywords` are its printed keywords; drop the parser's "aura".
- Fill an empty `regeneration.suppressedBy` from the print ("if it takes fire damage").
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

**Lines.** `Line.text` is the printed wording, whitespace-normalized; change it
only where the parser damaged it (dropped words, text from another field,
"fi re"). Never paraphrase. A hit line includes its damage.

**Clauses.** A structured clause is `{"quote": "...", "kind": "...", ...fields}`;
never write `at`. An unparsed clause is just `{"text": "<exact printed words>"}`
(no kind, no quote). Unparsed is a legitimate result for wording no kind fits.
- Cover all mechanical text of every line: each phrase that does something is a
  structured clause or inside an unparsed one. A line with any mechanics never
  has `clauses: []`; when no kind fits, the sentence is one unparsed clause.
{{#items}}
  Item text that says what the item lets you do (scrying, light, speaking a
  language) counts.
{{/items}}
  Only trigger and requirement lines (they say when, not
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
- A zone is the persistent area a power creates ("creates a zone", "an area of
  swirling sand that remains until ..."), never a burst's targets. A condition
  it imposes ("is blinded while within the zone") has the zone's duration and
  the "in the zone" words as `if`; a printed ending of its own wins ("blinded
  until it exits": `until`).
- Words two clauses share (a duration, a subject) go in one quote only; the
  other clause still encodes them. "The cloud provides concealment, and it
  remains until the start of its next turn": the zone quotes "The cloud", the
  concealment "provides concealment"; both get the duration.
- `move` and `forced-move` have no `duration` (they are instant). `move` omits
  `squares` when the distance is not a printed number ("shifts up to its
  speed"); a forced move with no printed distance ("pulls the target with it")
  is unparsed. `move: "fly"` is "flies"; `move: "move"` is any other movement
  of its own ("moves its speed", "jumps 5 squares", "burrows"); teleporting a
  target ("the target teleports 3 squares") is `teleport` with `who: "target"`.
  "without provoking opportunity attacks" is a `status` clause `no-provoke`
  (duration `instant` when it rides on one move).
- `speed`: a movement mode gained or set ("gains a fly speed of 12": `mode:
  "fly", value: 12`; "(hover)": `hover: true`; "a climb speed equal to its
  speed": no `value`); `change` for "+2 to its fly speed". A bonus or penalty
  to speed is `modifier` `speed`.
- **Conditions and options: `if`, `unless`, `optional`.** They are shown to
  the DM, never auto-applied. `if` and `unless` hold printed words only: each
  is one exact fragment of the clause's own `Line.text`, or a list of them,
  matched like quotes (the check enforces it).
  - `if`: whenever printed words make a clause conditional ("if the target is
    bloodied", "against a prone target", "against the necrosphinx", "while
    darkened", "an enemy that starts its turn in the aura"), the clause MUST
    carry `if` with those words, verbatim, never paraphrased or shortened.
  - `if` includes every conditional phrase, including a leading one ("At the
    start of an encounter"). A condition printed in pieces is a list of the
    pieces in printed order, each copied exactly: `"if": ["At the start of an
    encounter", "against any enemy that has not yet acted during the
    encounter"]`. Never join pieces with " ... " and never add words.
  - Never put the clause's own words in `if`: a fragment must not overlap the
    clause's quote. Quote the effect ("gains combat advantage"), not the
    condition.
  - `if` says when the clause applies, never who it applies to ("to the first
    target of the attack" is not a condition). A subject phrase that also says
    where or when ("Any creature that enters or starts its turn in the zone",
    "bloodied allies within the aura") is a condition: the whole phrase is the
    `if`, and `who` names the subject.
  - Damage has no `duration`: a time limit on a damage clause ("Until the
    start of its next turn, any creature that hits it takes 5 fire damage", a
    "(save ends)" after plain damage) goes in `if`, verbatim.
  - `unless`: when the print states the condition as the case in which the
    clause does NOT apply, copy those words into `unless` (never a "not:"
    prefix), as in the Inverted condition and Or else examples below.
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
  the narrowing words in the quote, unless they also say where or when (then `if`).
- `disease` is the printed name without "level 6" ("contracts mummy rot
  (stage 1)": `"disease": "mummy rot", "stage": 1`); tools fill `diseaseId`.
- `reroll`: `what` is rerolled (a list for "an attack roll, check, or save");
  `keep` only when the print says which roll counts ("use the second result":
  `new`; "the higher result": `higher`).
- `choice`: either/or outcomes. It quotes the whole alternative (with its
  "or"); `options` has one list of clauses per option, each quoted inside the
  choice's quote; an option no kind fits is `[{"text": "..."}]`. `chooser` when
  printed (`target` or `self`). Never nested; "can" alone is `optional`.
  "makes two fang attacks, two flame attacks, or one of each": a `use-power`
  option each, the last `[{"text": "one of each"}]`.
- "falls asleep" is `condition` `unconscious` (4e sleep); its wake rule is the duration.
- `modifier` stats for checks: `skill:<skill>`, `skill-checks` (all),
  `ability:<ability>` ("Strength checks": `ability:str`), `ability-checks`;
  `initiative`. A bonus that replaces a standard one ("+2 bonus to attack
  rolls when charging (instead of +1)") stays unparsed.
- `saveModifier` (condition, ongoing damage): "(save ends, with a -2 penalty
  to the saving throw)" is `-2`; with "save ends both", on each clause.
- "cannot benefit from invisibility or concealment" is status `no-concealment`.
- `modifier` stat `defenses` already includes AC: "+4 bonus to AC and all
  defenses" is `"stat": "defenses"`, never `["ac", "defenses"]`.
- Threatening Reach ("can make opportunity attacks against all enemies within
  its reach") is `opportunity-reach` with `optional: true`.
- grants-ca `to`: `source` is the clause's source only; `source-allies` is the
  source and its allies (use it for "the dragon and its allies" and for "the
  Imperator and an ally"); `all` is every creature; `rider`, `mount` or `ally`
  when only that third party gains it (see the Rider example).
- `duration`: "until the end of your next turn" is
  `{"kind":"turn-end","whose":"source","next":true}`; `whose: "target"` when it
  is the attack target's turn. `instant` for damage; `permanent` for always-on
  traits, including state-dependent ones (with `if`: "While darkened");
  `indefinite` for prone, a grab, anything ending on escape ("(until escape)",
  "(escape ends both)"), and a condition with no printed end (say so in
  `notes`); an aura's effect with no printed end is `while-in-aura`; `until`
  with the printed words for other endings, including another creature's turn
  (`{"kind":"until","text":"until the end of the triggering enemy's next turn"}`).
  `until.text` is the printed words, never a paraphrase; a duration printed as
  its own sentence ("The effect lasts until ...") goes in the clause's `until`
  and the sentence stays uncovered (damage: in `if`). A bonus to one later roll
  ("+2 bonus to its next attack roll") is `until` with those words.
  `this-power`: only the attacks the same power makes ("each at a -2 penalty";
  "This attack does not provoke opportunity attacks" is status `no-provoke`).
  An effect only during the power's own move (insubstantial while moving) is
  `instant`. Ongoing damage with no printed duration is `save-ends` (noted).

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
| damage | the dice or flat number in printed term order ("2d6 + 5" for `2d6+5`; "crit 22 + 2d8" for `22+2d8`), not "damage"; "crit" if `critical`; each type in `types`, in the quote or the words after it |
| ongoing-damage | "ongoing" and the amount |
| condition | the condition word in any form ("dazes", "knocks prone", "removed from play"; "asleep" for unconscious); with `escapeDc`, "escape" and the number ("escape DC 21", "escapes (DC 21)"), in the quote or later in its sentence |
| condition, ongoing-damage with `saveModifier` | also the number with "penalty" or "bonus", and "saving throw", in the quote or later in its sentence |
| forced-move, move | push / pull / slide / shift / teleport / swap (or switch) / fly / move (or walk, jump, climb, burrow, swim) in any form; forced-move also the squares unless 1 |
| modifier, revive | the number (digits or a word); a check stat or `initiative` also its name ("Stealth", "Strength", "initiative") in the quote or later in its sentence |
| grants-ca | "combat advantage" |
| resistance, vulnerability | "resist", "vulnerab"; a comma list shares the first one ("resist 10 necrotic, 10 fire": quote "10 fire") |
| heal / temp-hp | "regains", "heals" or "hit points" / "temporary" |
| regeneration, recharge-power, lose-healing-surge | "regenerat" or "regain", "recharg", "surge" |
| half-damage | "half" or "halved" ("half damage", "half as much", "the damage is halved") |
| concealment | "conceal" (and "total" if `total`) |
| zone | "zone", "area", "cloud", "wall", "field" or "region" |
| speed | the mode ("fly", "flight", "climb", "swim", "burrow", "teleport", "overland flight"; walk: "speed"), `value` or `change`, and "hover" if `hover` |
| saving-throw | "save" or "saving" (and the bonus) |
| use-power, summon | the power name, "attack", "uses" or "makes"; a word of `creature` ("shadow duplicate") or "summon"/"appear"/"conjure"/"create" |
| crit-range | "crit" and `min` |
| power-restriction | "can't"/"cannot" and each `what` ("encounter", "daily", "attack"; `all`: "power") |
| redirect-attack | "instead", "redirect" or "becomes the target" |
| status | "insubstantial", "phasing", "provok" (no-provoke), "conceal" or "invisib" (no-concealment) |
| opportunity-reach | "opportunity" |
| difficult-terrain | "difficult terrain" |
| charge | "charge" in any form |
| disease | the `disease` name (and "stage" and the number if `stage`) |
| reroll | "reroll" or "roll ... again" ("roll the attack again") |
| action-point | "action point" and the amount ("an action point" for 1) |
| sense | the sense name ("tremorsense", "low-light vision") or "see invisible", and `range` |
| choice | "or" or "either"; every option clause's quote lies inside it |
| damage-formula | "damage" |

**Examples** (one clause or field each):
- Split condition ("At the start of an encounter, the assassin deals 2d6 extra damage against any enemy that has not yet acted during the encounter"): `{"quote": "2d6 extra damage", "kind": "damage", "dice": "2d6", "types": [], "who": "target", "extra": true, "if": ["At the start of an encounter", "against any enemy that has not yet acted during the encounter"]}`
- Inverted condition ("The target is slowed (save ends). If the target is already slowed, it is instead immobilized (save ends)"): `{"quote": "slowed (save ends)", "kind": "condition", "condition": "slowed", "who": "target", "duration": {"kind": "save-ends"}, "unless": "If the target is already slowed"}, {"quote": "it is instead immobilized (save ends)", "kind": "condition", "condition": "immobilized", "who": "target", "duration": {"kind": "save-ends"}, "if": "If the target is already slowed"}`
- Or else ("the target must answer the question truthfully or else take 3d8 + 11 psychic damage"): `{"quote": "take 3d8 + 11 psychic damage", "kind": "damage", "dice": "3d8+11", "types": ["psychic"], "who": "target", "unless": "the target must answer the question truthfully"}`
- Save ends both: `{"quote": "dazed", "kind": "condition", "condition": "dazed", "who": "target", "duration": {"kind": "save-ends"}, "saveGroup": "a"}, {"quote": "slowed (save ends both)", "kind": "condition", "condition": "slowed", "who": "target", "duration": {"kind": "save-ends"}, "saveGroup": "a"}`
- Several stats: `{"quote": "+2 bonus to attack rolls and damage rolls until the end of its next turn", "kind": "modifier", "stat": ["attack", "damage"], "value": 2, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
- Option ("After the first or second attack, the dire winter wolf can shift 4 squares", in `effect`): `{"quote": "the dire winter wolf can shift 4 squares", "kind": "move", "move": "shift", "squares": 4, "who": "self", "optional": true, "if": "After the first or second attack"}`
- Type choice: `{"quote": "4d10 + 6 damage of one of the following types: acid, cold, or fire", "kind": "damage", "dice": "4d10+6", "types": [], "typeChoice": ["acid", "cold", "fire"], "who": "target"}`
- Zone: `{"quote": "The blast creates a zone that lasts until the end of the dragon's next turn (sustain minor)", "kind": "zone", "duration": {"kind": "sustain", "action": "minor"}}, {"quote": "takes 10 fire damage", "kind": "damage", "dice": "10", "types": ["fire"], "who": "creatures-in-area", "if": "Any creature that enters or starts its turn in the zone"}`, and the power gets `"sustain": {"action": "minor"}`.
- Base plus ongoing ("1d10+6 and ongoing 5 poison damage (save ends)"): `{"quote": "1d10+6", "kind": "damage", "dice": "1d10+6", "types": [], "who": "target"}, {"quote": "ongoing 5 poison damage (save ends)", "kind": "ongoing-damage", "amount": 5, "types": ["poison"], "who": "target", "duration": {"kind": "save-ends"}}`
- Fly and no-provoke ("The dragon flies up to 12 squares without provoking opportunity attacks"): `{"quote": "flies up to 12 squares", "kind": "move", "move": "fly", "squares": 12, "who": "self"}, {"quote": "without provoking opportunity attacks", "kind": "status", "status": "no-provoke", "who": "self", "duration": {"kind": "instant"}}`
- Reroll ("forces the attacker to reroll the attack and use the second result"): `{"quote": "forces the attacker to reroll the attack and use the second result", "kind": "reroll", "what": "attack", "keep": "new", "who": "other"}`
- Action point and rider ("its rider gains 1 action point"): `{"quote": "gains 1 action point", "kind": "action-point", "amount": 1, "who": "rider"}`
- Sense ("The wraith gains tremorsense 10 until the end of its next turn"): `{"quote": "gains tremorsense 10 until the end of its next turn", "kind": "sense", "sense": "tremorsense", "range": 10, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
- This power only ("The dragon makes two claw attacks, each at a -2 penalty"): `{"quote": "makes two claw attacks", "kind": "use-power", "power": "claw", "times": 2, "who": "self"}, {"quote": "-2 penalty", "kind": "modifier", "stat": "attack", "value": -2, "who": "self", "duration": {"kind": "this-power"}}`
- Choice ("The target slides 4 squares or is knocked prone"): `{"quote": "slides 4 squares or is knocked prone", "kind": "choice", "options": [[{"quote": "slides 4 squares", "kind": "forced-move", "move": "slide", "squares": 4, "who": "target"}], [{"quote": "knocked prone", "kind": "condition", "condition": "prone", "who": "target", "duration": {"kind": "indefinite"}}]]}`
- Rider ("The dire wolf's rider gains combat advantage against the target until the end of the dire wolf's next turn"): `{"quote": "gains combat advantage against the target until the end of the dire wolf's next turn", "kind": "grants-ca", "to": "rider", "who": "target", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
- Skill check ("The assassin gains a +5 bonus to Stealth checks until the end of its next turn"): `{"quote": "+5 bonus to Stealth checks until the end of its next turn", "kind": "modifier", "stat": "skill:stealth", "value": 5, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
- Asleep ("The target falls asleep for 1 hour or until woken"): `{"quote": "falls asleep for 1 hour or until woken", "kind": "condition", "condition": "unconscious", "who": "target", "duration": {"kind": "until", "text": "for 1 hour or until woken"}}`
- Speed ("The dragon gains a fly speed of 12 (hover) until the end of the encounter"): `{"quote": "gains a fly speed of 12 (hover) until the end of the encounter", "kind": "speed", "mode": "fly", "value": 12, "hover": true, "who": "self", "duration": {"kind": "encounter"}}`
- Save penalty ("The target is dominated (save ends, with a -2 penalty to the saving throw)"): `{"quote": "dominated (save ends, with a -2 penalty to the saving throw)", "kind": "condition", "condition": "dominated", "who": "target", "duration": {"kind": "save-ends"}, "saveModifier": -2}`
- No concealment ("The target cannot benefit from invisibility or concealment (save ends)"): `{"quote": "cannot benefit from invisibility or concealment (save ends)", "kind": "status", "status": "no-concealment", "who": "target", "duration": {"kind": "save-ends"}}`
- Initiative ("The kobold gains a +2 bonus to initiative"): `{"quote": "+2 bonus to initiative", "kind": "modifier", "stat": "initiative", "value": 2, "who": "self", "duration": {"kind": "permanent"}}`
- Area ("The breath creates an area of swirling sand until the end of the dragon's next turn. A creature in the area is blinded until it exits"): `{"quote": "creates an area of swirling sand until the end of the dragon's next turn", "kind": "zone", "duration": {"kind": "turn-end", "whose": "source", "next": true}}, {"quote": "blinded until it exits", "kind": "condition", "condition": "blinded", "who": "creatures-in-area", "duration": {"kind": "until", "text": "until it exits"}, "if": "A creature in the area"}`
- Resist list ("It gains resist 10 necrotic, 10 fire until the end of its next turn"): `{"quote": "resist 10 necrotic", "kind": "resistance", "type": "necrotic", "value": 10, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}, {"quote": "10 fire until the end of its next turn", "kind": "resistance", "type": "fire", "value": 10, "who": "self", "duration": {"kind": "turn-end", "whose": "source", "next": true}}`
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
