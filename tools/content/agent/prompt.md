<!-- Agent brief template. tools/content/agent/prompt.ts fills the {{NAME}} values and keeps a {{#name}}...{{/name}} block only for that kind or mode (single: one entry per brief; batch: a rules file per kind plus batch briefs). In batch mode everything outside the batch-head and entry markers is the kind's rules file (<kind>-rules.md); a batch brief is the batch-head part followed by the entry part once per entry, with the entry headings one level down (so its "# Entry" heading becomes "## Entry"). The quote and if/unless rules mirror src/common/authoring/spans.ts; keep them in step. This comment is dropped from briefs. -->
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
   `PASS` means you are done (flags are information only; a flag you take for
   a misprint may be noted with one Edit, never a re-run). On `FAIL`, fix the
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
   means done (flags are information only; a flag you take for a misprint may
   be noted with one Edit, never a re-run). On `FAIL`, fix the listed problems with the Edit tool and run it
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
`usage: "unknown"` when a power prints no usage (not the parser's default).
The check flags these; they do not lower confidence.

**Fields.**
- Correct any field the parser got wrong; it sometimes drops whole auras,
  traits or flavor text, so compare line by line. Keep `id`, `sources` and
  `description` unless wrong. Omit optional fields that do not apply; never
  add fields the schema lacks; closed lists use the schema's ids exactly.
- You may leave out `provenance`; it is rewritten from your `notes` and
  `confidence`. Its parser `notes` list what the parser could not place:
  resolve each one, or say in `notes` why it stays.
- Keep `basic` unless the source contradicts it (only a parenthesized icon,
  "(⚔) Longsword", is basic).
- A power that prints a usage but no action type (a passive "(encounter)"
  rider, or "( when first bloodied, encounter)") is `action: "no-action"`; one
  that prints neither ("( when reduced to 0 hit points, )") also has `usage:
  "unknown"`, with the printed words in `trigger`. One that prints an action
  but no usage ("(standard)", "(minor, when first bloodied)") keeps it, with
  `usage: "unknown"` and any "when ..." words in `trigger`.
- A required value the print omits (level, XP or initiative "as conjurer", no
  Speed line, no range after an icon) keeps the parser's value, with a note;
  flags on it do not lower confidence. An "attack" printed with neither bonus
  nor defense ("Reach 2; 2d6+7 damage") is no attack: `range` plus `effect`. A
  power whose only attack is printed "Secondary Attack" keeps that label. A
  broken "+8 vs or (whichever is lower); ." (Dungeon prints) is an attack with
  `vs: "unknown"`, "or (whichever is lower)" in `range.note`, no `hit`; the
  words after the stray "." are the `effect`. "Melee or Ranged 10": the first
  kind, the rest in `range.note`.
- Errata against the print: keep the print, noted; drop revision
  lines ("Update (8/11/2011) ..."), noted.
- Two action types or usages ("move or immediate reaction"): the first printed, noted.
- Movement before an attack ("flies up to 12 squares and makes a claw attack")
  goes in `effect` with a `move` clause; a lead-in with no mechanics stays in
  `range.note`.
- A secondary attack with no printed range copies the primary's `range`, noted.
  One printed inline in a hit or effect line ("makes a secondary
  attack ...: ranged 10; +33 vs. Reflex; 2d8 + 10 damage") becomes its own
  attack (`after` as printed); the lead-in stays in the line. An attack with no printed target has `target: ""`. "makes a
  secondary attack against the same target" in a hit line stays an unparsed
  clause (the attack itself is the next entry in `attacks`).
- A targeting lead-in on the attack line ("makes a separate attack against 3
  different targets") stays in `range.note`. Named sub-attacks of one power ("Earth Shock") have `name`.
  Mechanics on the attack line ("This attack doesn't provoke opportunity
  attacks", "automatically hits a dazed target") move to `effect`, noted.
- Failed saving throw lines go in the attack's `failedSaves`, in printed order.
- A printed conditional attack bonus is `altBonus` (its `if` only the condition
  words, "while bloodied"; `value` the whole bonus), not `range.note`.
- A power with no attack roll that prints a range ("Close burst 5 (allies in
  the burst)") has it in `range`, targets in `range.note`; the effect keeps the
  rest. So does a range left in the effect ("Wall 8 within 10; ...").
- **Hit or effect.** A printed "Effect:" or "Hit or Miss:" line, or a
  sentence that applies whether the attack hits or misses, goes in the power's
  `effect`, even when run into the hit text; two "Effect:" lines join into one. A sustain sentence in an effect or hit line goes in
  `sustain.line` without its "Sustain Minor:" label ("The zone persists." or
  a restated duration alone: `clauses: []`, the zone `sustain`); one about how the power may be used ("This power
  counts as a ranged basic attack") in `special`, unparsed. Words stay
  verbatim; note what moved.
- Labeled lines with no field of their own (form lines, numbered eye rays, an
  unparseable "Secondary Attack:") go in `extraLines` as `{label, line}`. An eye
  ray's "Ranged 10; +24 vs. Reflex" words are one unparsed clause.
- "1/round" or "1/turn" is `usesPerRound: 1`, "2/Encounter" `usesPerEncounter:
  2`. A usage condition that is not a trigger ("requires greatsword", "only
  while bloodied") is the `requirement` line.
- A trait or aura whose name prints a condition ("Billowing Winds (while
  bloodied)", "Dragonborn Fury (only while bloodied)", no action or usage) is a
  trait or aura with that `name`, parenthesis included; each of its clauses has
  those words as `if` (the check finds them in the name).
- "Area 1 square within 10 squares" is `{"kind": "area-burst", "size": 0, "within": 10}`.
- Set the power's `sustain` whenever it prints one; when the sustain is only
  inline ("(sustain minor)"), it is `{"action": "minor"}` with no `line`.
- Resistances and vulnerabilities: `{type, value}` (no number: no `value`,
  never 0), else `{type: "special", text}` (with `value` for "Vulnerable 10
  against close and area attacks"). "Resist 15 variable (2/encounter)" is
  `{type: "variable", value: 15, note: "2/encounter"}`; a resistance clause "to
  the triggering damage type" is `type: "choice"`, `typeChoice` the trigger's types.
{{#monsters}}
- Traits and auras the parser stored as no-action powers (see its notes) move
  to `traits` or `auras`, as does a passive line with keywords but no action or
  usage ("Vicious Strike ✦ Weapon"); a triggered action stored as a trait
  goes back to `powers`.
- Conditional skill and saving throw bonuses go in `skillNotes` /
  `savingThrowNotes`, verbatim.
- Conditional defenses are `defensesIf` (a signed one, "+2 while flying",
  stores base + 2; "+1 to all defenses against X" is one entry per defense),
  alternative hit points `hpIf`; the parser fills them, check them. An HP line that prints
  no number or a rule ("HP 0; ... The colossus has infinite hit points") is
  `hp: 0` with the words in `hpText`; a qualified immunity ("Immune fear (while
  bloodied only)") is `{"type": "fear", "note": "while bloodied only"}`.
- `senses` is the Senses line only. A trait or power that grants a sense
  ("Truesight 10", "can see invisible creatures") gets a `sense` clause.
- Speed-line notes ("phasing", "(hover)") stay in `speed.notes`, in printed
  order, "; "-separated, a walk note first and bare ("ice walk"), others with
  their mode ("fly: hover; phasing"); "see also X" too (in a hit or effect line, uncovered).
- `equipment` is the printed list ("heavy shield, longsword"), filled if empty.
- Aura `keywords`: the printed ones, without the parser's "aura".
- Fill an empty `regeneration.suppressedBy` from the print ("if it takes fire
  damage"); other suppressors ("direct sunlight") are `suppressedText`, printed.
  In a line, "its regeneration doesn't function" is regeneration `value: 0`.
- Companion/NPC "Healing Surges 11; Surge Value 12": `healingSurges`/`surgeValue`;
  a class role ("Level 4 Defender", no XP): `classRole`, `role: null`, `xp: 0`.
  A disease block after the stat block is left out (noted).
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
- A power under "Triggered Actions" with no printed action type has `action: "triggered"`. A trap power that prints no usage is `usage: "unknown"` (not flagged for traps).
- Stats printed inside a countermeasure for one part of the trap ("each
  stalagmite: AC 32, hp 25") stay in that countermeasure line; the trap-level
  `hp`/`defenses`/`resist` come only from the trap's own stat lines.
- Each countermeasure line gets a `countermeasure` clause: `effect` what a
  success does (a "Disable:"/"Delay:" label decides it), `checks` each printed
  skill and DC ("Thievery DC 22 or Arcana DC 27"; "(trained only)": `trained`;
  "Strength DC 20": `ability:str`), `action` when printed ("(minor action)"),
  `complexity` for "Complexity 1 (4 successes before 2 failures)". Attacking a
  part ("AC 32, other defenses 29; hp 25") is `destroy` with its `defenses`
  (each named one) and `hp`. The quote holds the check and what success does;
  "Failure: ..." outcomes are other clauses with `if` "Failure"; check
  results that only give knowledge are `identify`; an escape check is `avoid`.
{{/traps}}
{{#templates,themes}}
- There is no HTML: the source text is the entry's printed lines, transcribed
  from the books, and it is the authority.
- Level scaling ("Increase to 2d6 at 11th level and 3d6 at 21st level",
  "Level 11: Ongoing 10 damage.") is `byLevel` on the clause it scales
  (`[{"level": 11, "value": "2d6"}, {"level": 21, "value": "3d6"}]`), the
  scaling words uncovered; one that changes anything else (area, condition, plain to ongoing damage) stays unparsed.
- Amounts of the creature's level: "one-half its level" is `half-level`, "8 +
  this creature's level" `level` with `plus: 8` (damage: `amount`, no
  `dice`). "2d8 + Strength modifier necrotic damage" is `damage-formula` (its `byLevel` values the formula text).
- A theme's "[damage type]" (chosen when applied): resistance `type: "choice"`, damage and `damage-type` `types: []`, with no `typeChoice`.
- "gains the necrotic keyword" is `keyword`; "change a power's energy keyword
  to necrotic" is `damage-type`.
{{/templates,themes}}

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
  (save ends both)" is two clauses with the same `saveGroup`, as are two effects
  under one "(save ends)" ("is immobilized and takes ongoing 10 damage (save
  ends)"). Damage types come from the clause's own words, not from a power
  keyword like "(poison)".
- **Damage parts.** Each damage part is its own clause, and its quote needs
  only the dice (or the flat number), not the word "damage". "2d8+10 plus 2d6
  lightning damage" is two clauses: "2d8+10" (untyped: `types: []`) and "2d6
  lightning damage". A shared trailing type word types an earlier part only when
  the print clearly applies it to both ("2d6 + 5 or 3d6 + 5 fire damage"). An
  alternative roll ("or 5d6 + 7 against a prone target") is a damage clause
  quoting the dice, with `if`; the base roll gets the same words as `unless`.
  A critical sentence ("If it scores a critical hit, the damage is 4d8 + 39")
  is `critical`, quoting the dice. An amount that is not dice ("damage equal
  to half its bloodied value") is `amount`, no `dice`. Ongoing damage that
  "increases to 10" is a new ongoing 10 (no `increase`) with `if`.
- Damage dealt later during a window has `duration` (`who: "target"` in "its attacks against the
  target deal 1d6 extra damage until the end of its next turn"), and so does
  damage each turn while a state lasts: "While dominated, the target takes 5
  fire damage at the start of each of its turns" has the domination's
  duration, the rest as `if`; never one-time. A "(save ends)" after plain
  damage is `if`; under "(save ends both)" it is `save-ends` with the `saveGroup`. `by`: another creature deals
  it ("undead allies in the burst deal 2d6 extra fire damage": `by:
  "allies-in-area"`, `who: "other"`). `per` (damage, modifier, heal, temp-hp):
  the printed scaling words ("for each creature in the burst").
- A zone is the persistent area a power creates, never a burst's targets. A condition
  it imposes ("is blinded while within the zone") has the zone's duration and
  the "in the zone" words as `if`; a printed ending of its own wins ("blinded
  until it exits": `until`). A zone printing an end and "(sustain minor)" has
  the `sustain` duration; one that "blocks line of sight" has `blocksLineOfSight`.
- Words two clauses share (a duration, a subject) go in one quote only; the
  other clause still encodes them.
- `move`, `forced-move` have no `duration`. `move` omits `squares` when no
  number is printed ("shifts up to its speed"); a forced move with none has the
  printed distance in `squaresText` ("slides the target to the edge of the
  burst": "to the edge of the burst"), as may a move ("1d4"); its own slide is
  forced-move, `who: "self"`. "the target teleports 3 squares" is `teleport` with `who: "target"`. "without provoking
  opportunity attacks" is status `no-provoke` (`instant` when it rides on one move).
- **Conditions and options: `if`, `unless`, `optional`.** Shown to the DM,
  never auto-applied; `if` and `unless` hold exact printed fragment(s) of the line.
  - `if`: whenever printed words make a clause conditional ("if the target is
    bloodied", "against the necrosphinx", "an enemy that starts its turn in
    the aura"), the clause MUST carry `if` with those words, verbatim,
    including a leading phrase. A condition printed in pieces is a list of the
    pieces in printed order (Split condition example). Never join pieces with
    " ... ", never add words, never overlap the clause's own quote (except
    a (forced) move's between its verb and squares: Inner condition example).
  - `if` says when, never who ("to the first target of the attack" is not a
    condition). A subject phrase that also says where or when ("Any creature
    that enters or starts its turn in the zone", "bloodied allies within the
    aura") is the whole `if`, and `who` names the subject.
  - `unless`: the condition under which it does NOT apply (never "not:").
  - `optional: true`: the print makes the effect a choice ("can shift 4
    squares", "the target can be grabbed", "can make a saving throw"); the
    quote keeps the "can" words. Never an option through `if`; a condition on
    the option still goes in `if` ("After the first or second attack").
  - The words that open a branch ("On a save", "On a failure", or the check
    that allows it) are the `if` of each clause in that branch.
- `who`: `target` is the attack's target, `self` the {{KIND_LABEL}};
  `other` any subject no value names. A narrower
  group ("undead in the burst", "Fey allies") takes the nearest value and keeps
  the narrowing words in the quote, unless they also say where or when (then `if`).
  The printed target of a power with no attack ("(the triggering enemy)") is
  `target`; a triggering creature it does not target is `other`.
- `use-power`: `power` is the power's name when the print points to one ("claw
  attack": "Claw"), else the printed words ("melee basic attack"); `who` makes
  it ("the ally makes a basic attack": `ally`).
- `choice`: either/or outcomes; it quotes the whole alternative (with its
  "or"), each option's clauses quoted inside it (none fits: `[{"text":
  "..."}]`); `chooser` when printed; never nested; "can" alone is `optional`.
  "makes two fang attacks, two flame attacks, or one of each": a `use-power`
  option each, the last `[{"text": "one of each"}]`. Options may share the
  kind's words ("recharges cascade of fire or grasping tendrils": two
  recharge-power options). A die table ("Roll a d6: 1-3, ...; 4-6, ...") is
  `chooser: "roll"` with `rolls: ["1-3", "4-6"]`; a list headed "one of the
  following" is a choice too.
- `modifier`: "moves 1 square fewer than the effect specifies" is
  `forced-movement` -1; bare "checks" is both check stats; `defenses` includes
  AC. A bonus replacing a standard one ("+2 bonus to attack rolls when
  charging (instead of +1)") stays unparsed.
- `saveModifier`: "(save at -2 ends)" is `-2` too; with "save ends both", on each clause.
- `automatic`: "automatically succeeds on saving throws against charm" is
  `save` with the "against" words as `if`. "cannot be knocked prone" is
  immunity `["prone"]`.
- Damage another creature takes, shared or passed on, is `share-damage`;
  "any critical hit reduces it to 0 hit points" is `drop-to-zero` with `if`.
  "is swallowed" is `swallow`; what happens while
  swallowed is other clauses with `if` ("While swallowed"). So for a `state`
  ("is cursed (save ends)", a form, a stance: "While cursed"). Options by
  variant ("Vulture: ...") take the variant name as `if`. "reappears" ending
  removed from play is `end-effect`.
- "treats the dragon as invisible" is condition invisible, `who: "self"`,
  `observer: "target"`; "can't move away from the dragon" is `move-limit` `away`.
- "spends a healing surge" is heal `surge-value` with `spendSurge`.
- `turns`: "rolls initiative twice", "acts three times in a round, on
  initiative counts 20, 15, and 5" (`counts`); a turn set by another
  creature's count stays unparsed. `one-of`: "uses one of the following eye
  rays" whose options are the power's following attacks or labeled lines
  (options in its own sentence are a `choice`). `summon` has `duration` when printed.
- "This penalty is cumulative, to a maximum of -5" is `stacks: true, max: 5`
  on the clause it qualifies ("do not stack": `stacks: false`), the sentence
  uncovered. "cannot make saving throws" is status `no-saving-throws`;
  "ignores forced movement" immunity `["forced-movement"]`. Also `light`
  ("sheds bright light in a 5-square radius"; "reduced to dim light": `dim`),
  `damage-type` ("deals cold damage instead"), `aura-off`, `keyword`.
- `duration`: "until the end of your next turn" is
  `{"kind":"turn-end","whose":"source","next":true}`; `whose: "target"` for the
  attack target's or affected creature's turn ("the target is dazed until the
  end of its next turn"; in "the dragon marks the target until the end of its
  next turn", the dragon's). `instant` for damage and for effects only during
  the power's own move; `permanent` for always-on traits (state-dependent ones
  with `if`: "While darkened"); `indefinite` for prone, a grab, escape endings
  ("(escape ends both)") and no printed end (noted); `while-in-aura` for an
  aura's effect with no end; else `until` with the printed words ("until the
  end of the triggering enemy's next turn"), never a paraphrase. A duration in
  its own sentence ("The effect lasts until ...") or cut off by an `if` goes in
  each clause it covers (a turn end as `turn-end`), the sentence uncovered.
  "while the target is dazed" ("while grabbed") alone is that state's
  duration, the words as `if`; "until X (save ends)" is `save-ends`, noted. A
  bonus to one later roll ("+2 bonus to its next attack roll") is `until` with
  those words; one for the triggering attack only ("+3 bonus to AC against that
  attack") is `instant` with them as `if`. `this-power`: the same power's
  attacks only ("each at a -2 penalty"; "This attack does not provoke
  opportunity attacks": status `no-provoke`). Ongoing damage with no printed
  duration is `save-ends` (noted).

**Quote rules** (the check enforces these):
- A quote is a contiguous substring of its own `Line.text`. Matching ignores case,
  curly vs straight quote marks and dash kinds (- – — −); nothing else, so
  spacing and punctuation must match. Dice match with or without spaces
  ("2d12+6" or "2d12 + 6").
- List a line's clauses in printed order; each quote is looked up after the
  previous clause's words, so a repeated phrase needs no extra context.
- Quotes must not overlap. `if` and `unless` fragments may lie inside another
  clause's quote, never inside the clause's own (but see Inner condition).
- The quote must contain its kind's words (any inflection: "grabs" or "is
  grabbed", "pushes" or "pushed"). If the words are not there, the phrase does
  not state that clause: make it unparsed.

| kind | the quote must contain |
|---|---|
| damage | the dice or flat number in printed term order ("2d6 + 5" for `2d6+5`), not "damage"; "crit" in it or its sentence if `critical`; each type in `types`, in the quote or the words after it; `amount`: "surge", "bloodied", "damage" or "level" (and "half"; `plus` its number) |
| ongoing-damage | "ongoing" and the amount (`increase`: "increases"; "ongoing" may be earlier in its sentence) |
| condition | the condition word in any form ("dazes", "knocks prone", "removed from play", "banished", "disappears"; "asleep" for unconscious); with `escapeDc`, "escape" and the number ("escape DC 21", "escapes (DC 21)"), in the quote or later in its sentence |
| condition, ongoing-damage with `saveModifier` | also the number with "penalty" or "bonus", and "saving throw", in the quote or later in its sentence; or "save at -2 ends" |
| forced-move, move | push / pull / slide / shift / teleport / swap (or switch) / fly / move (or walk, jump, leap, climb, burrow, swim) in any form; the squares unless 1, or `squaresText` |
| modifier, revive | the number (digits or a word) or dice; a check stat, `initiative`, `recharge`, `death-saves`, `escape`, `roll` or `forced-movement` also its word ("Stealth", "Strength", "checks", "initiative", "recharge", "death saving", "escape", "roll"; "fewer", "less", "reduce", "forced" or "extra square") in the quote or later in its sentence |
| grants-ca | "combat advantage" |
| resistance, vulnerability | "resist", "vulnerab"; a comma list shares the first one ("resist 10 necrotic, 10 fire": quote "10 fire") |
| heal / temp-hp | "regains", "heals" or "hit points" (`spendSurge`: "surge") / "temporary"; a dice amount its dice |
| regeneration, recharge-power, lose-healing-surge | "regenerat" or "regain", "recharg" or "regains the use" (and each of `others`), "surge" |
| half-damage, double-damage, max-damage | "half" or "halved" ("half as much", "the damage is halved"); "double" or "twice"; "maximum" |
| concealment | "conceal" or "obscured" (and "total" or "heavily" if `total`) |
| zone | "zone", "area", "cloud", "wall", "field" or "region"; `blocksLineOfSight`: "line of sight" here or later in the line |
| speed | the mode ("fly", "flight", "climb", "swim", "burrow", "teleport", "overland flight"; walk: "speed"), `value` or `change`, and "hover" if `hover` |
| saving-throw | "save" or "saving" (and the bonus) |
| use-power, summon | the power name, "attack", "uses" or "makes"; a word of `creature` ("shadow duplicate") or "summon"/"appear"/"conjure"/"create" |
| crit-range | "crit"; `min` in it or later in its sentence |
| power-restriction | "can't"/"cannot"/"only" and each `what` ("encounter", "opportunity", "shift", "fly", "basic", "at-will"; `all`: "power"; `named`: each name in `powers`; each of `except`) |
| redirect-attack | "instead", "redirect" or a target wording ("becomes the target", "targets another creature", "make the attack against") |
| status | "insubstantial", "phasing", "provok", "conceal"/"invisib", "regain"/"heal", "surge", "difficult terrain", "stand", "cover", "flank", "through"/"enter", "pull"/"drag"/"with it", "temporary", "save" |
| opportunity-reach | "opportunity" |
| difficult-terrain | "difficult terrain" |
| charge | "charge" in any form |
| disease | the `disease` name (and "stage" and the number if `stage`) |
| reroll | "reroll", "roll (make) ... again (twice)", "second"/"new attack roll" or "two attack rolls" |
| action-point | "action point" and the amount ("an action point" for 1) |
| sense | the sense name ("tremorsense", "low-light vision"), "see invisible", or "see"/"sight" (`sight-limit`), and `range` |
| choice | "or", "either" or "one of the following" (`roll`: "roll" or "d6" and each of `rolls`); every option's quote lies inside it |
| automatic | "automatic" or "instead", and "hit", "miss", "crit" or "save"/"succeed"; "is (treated as, considered) a critical hit" or "misses" alone |
| lose-resistance, immunity | "resist" (and `value`; `what`: "vulnerab", "immun"), "immun", "cannot be" or "ignores" |
| end-effect | "end(s)", "no longer", "removes" or "reappears" |
| extra-action | the action ("move", "standard", "minor", "reaction") |
| no-damage, drop-to-zero | "no damage", "negate" or "harmless"; "0 hit points", "kill", "dies" or "destroy" |
| move-limit | `away` "away", `closer` "closer"/"toward", `leave` "leave"/"exit"/"out of", `stop` "stop"/"ends", `within` "more than" and `squares` |
| swallow | "swallow", "engulf", "absorb" or "inside" (`escapeDc` as for a grab) |
| share-damage | "damage" (`half`: "half"; `rest`: "rest" or "remaining") |
| aura-size, size-change | "aura" and the number; the size word, or "reach" and the number |
| set-hp, move-zone, state | "hit point(s)" and `hp`; "move" (and `squares`); the `name` |
| condition-swap | the new condition and "instead" (each replaced one in its sentence) |
| reduced-healing | "heal", "regain" or "hit points", and "half" or `value` |
| damage-formula | "damage" |
| countermeasure | each check's skill (or ability) and `dc`; `hp` and each defense number |
| turns, one-of | "initiative", "turn" or "acts", `turns` ("twice", "three") and each count; "following" |
| light | "light", "dark" or "dim", the level's word, `radius` |
| damage-type, keyword | each type, in the quote or the words after it; the keyword |
| aura-off | "aura" (or its name) and "ends", "suppressed", "loses", "no longer" or "does not function" |

**Examples** (one clause or field each):
- Split condition ("At the start of an encounter, the assassin deals 2d6 extra damage against any enemy that has not yet acted during the encounter"): `{"quote": "2d6 extra damage", "kind": "damage", "dice": "2d6", "types": [], "who": "target", "extra": true, "if": ["At the start of an encounter", "against any enemy that has not yet acted during the encounter"]}`
- Inverted condition ("The target is slowed (save ends). If the target is already slowed, it is instead immobilized (save ends)"): `{"quote": "slowed (save ends)", "kind": "condition", "condition": "slowed", "who": "target", "duration": {"kind": "save-ends"}, "unless": "If the target is already slowed"}, {"quote": "it is instead immobilized (save ends)", "kind": "condition", "condition": "immobilized", "who": "target", "duration": {"kind": "save-ends"}, "if": "If the target is already slowed"}`
- Turns ("The whelp acts three times in a round, on initiative counts 20, 15, and 5."): `{"quote": "acts three times in a round, on initiative counts 20, 15, and 5", "kind": "turns", "turns": 3, "counts": [20, 15, 5], "who": "self"}`
- Zone: `{"quote": "The blast creates a zone that lasts until the end of the dragon's next turn (sustain minor)", "kind": "zone", "duration": {"kind": "sustain", "action": "minor"}}, {"quote": "takes 10 fire damage", "kind": "damage", "dice": "10", "types": ["fire"], "who": "creatures-in-area", "if": "Any creature that enters or starts its turn in the zone"}`, and the power gets `"sustain": {"action": "minor"}`.
- Inner condition ("The dragon slides any enemy that ends its turn in the aura 2 squares"): `{"quote": "slides any enemy that ends its turn in the aura 2 squares", "kind": "forced-move", "move": "slide", "squares": 2, "who": "enemies-in-area", "if": "any enemy that ends its turn in the aura"}`
{{#traps}}
- Countermeasure ("Delay: Thievery DC 21 (minor action). Success: The trap does not attack during its next turn."): `{"quote": "Thievery DC 21 (minor action). Success: The trap does not attack during its next turn", "kind": "countermeasure", "effect": "delay", "checks": [{"skill": "thievery", "dc": 21}], "action": "minor"}`
{{/traps}}
{{#templates,themes}}
- Level scaling ("The champion deals an extra 1d6 damage against enemies it flanks. Increase to 2d6 at 11th level and 3d6 at 21st level."): `{"quote": "1d6 damage", "kind": "damage", "dice": "1d6", "types": [], "who": "target", "extra": true, "if": "against enemies it flanks", "duration": {"kind": "permanent"}, "byLevel": [{"level": 11, "value": "2d6"}, {"level": 21, "value": "3d6"}]}`
{{/templates,themes}}
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
## Source text (the printed entry; the only authority for wording and numbers)

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
