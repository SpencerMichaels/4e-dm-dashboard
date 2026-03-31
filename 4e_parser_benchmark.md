# 4e Parser Benchmark Round 2

## Yuan-ti Soulform (L21 Soldier Minion)
- HP:1 AC:37 Init:+17 Senses:none
- Speed:7 Align:Evil Scores:yes
- Abilities (2):
  - [aura] **Venomous Presence** — A slowed enemy that willingly leaves the aura takes 14 poison damage. An enemy c
  - [action] **Scimitar** (standard/at-will) +26 vs AC dmg="14" hit="the target is slowed (save ends)."
- ✅ No issues

## Warped Slave (L16 Brute Standard)
- HP:193 AC:28 Init:+11 Senses:Darkvision
- Speed:6 (can't shift) Align:chaotic evil Scores:yes
- Abilities (5):
  - [aura] **Disintegrating Mind** — Any enemy that ends its turn within the aura takes 5 psychic damage. Whenever a 
  - [action] **Bite** (standard/at-will) +21 vs AC dmg="3d12 + 6"
  - [action] **Tentacle** (standard/at-will) +19 vs Reflex dmg="2d12 + 6" hit="the warped slave grabs the target. The warped slave then pulls the tar"
  - [action] **Flailing Tentacles** (standard/at-will) +21 vs AC dmg="2d12 + 6" hit="the warped slave pulls the target 1 square."
  - [action] **Str** (standard/at-will)
- ✅ No issues

## Sand Golem (L15 Skirmisher Standard)
- HP:148 AC:29 Init:+11 Senses:Darkvision
- Speed:6 Align:Unaligned Scores:yes
- Abilities (4):
  - [action] **Slam** (standard/at-will) +20 vs AC dmg="3d6+4"
  - [action] **Sandstorm** (standard/encounter) +17 vs Fortitude dmg="1d8+4" hit="the target is blinded (save ends)."
  - [action] **Evasive Slide** (immediate-reaction/at-will) trig="a melee attack misses the sand golem"
  - [action] **Shifting Sands** (move/at-will)
- ✅ No issues

## Gray Slaad Havoc (L15 Artillery, Leader Standard)
- HP:116 AC:27 Init:+10 Senses:low-light vision
- Speed:6, teleport 6 Align:Chaotic Evil Scores:yes
- Abilities (4):
  - [action] **Havoc Claw** (standard/at-will) +22 vs AC dmg="1d8+6 damage, the gray slaad havoc slides the targ"
  - [action] **Havoc Bolt** (standard/at-will) +20 vs Reflex dmg="2d8+6" hit="the gray slaad havoc slides the target 3 squares. If the attack scores" **⚠ Long hit text (142)**
  - [action] **Fog of Chaos** (immediate-interrupt/recharge) +20 vs Will dmg="the triggering attack instead targets one of the t" trig="hit by a ranged attack" recharge="4-6"
  - [action] **Reality Shift** (move/at-will) +20 vs Will dmg="; the gray slaad havoc teleports the target to any"
- **Issues**: Long hit text (142)

## Norker Stone Walker (L15 Skirmisher Standard)
- HP:150 AC:29 Init:+14 Senses:Low-light vision
- Speed:6 Align:chaotic evil Scores:yes
- Abilities (7):
  - [trait] **Combat Advantage** — The stone walker's attacks deal 5 extra damage against any creature granting com
  - [trait] **Nimble Reaction** — The stone walker gains a +4 bonus to AC against opportunity attacks.
  - [action] **Handaxe** (standard/at-will) +20 vs AC dmg="3d6 + 13"
  - [action] **Handaxe** (standard/at-will) +20 vs AC dmg="3d6 + 8"
  - [action] **Earth Glide** (move/at-will) eff="The stone walker moves its speed and can pass through earth and rock a"
  - [action] **Elemental Rebuke** (free/at-will) +20 vs AC dmg="1d8 + 2" trig="An enemy hits the stone walker with a melee attack."
  - [action] **Str** (free/at-will)
- ✅ No issues

## Thannu, Shadar-kai Battle Champion (L8 Soldier Elite)
- HP:172 AC:26 Init:+11 Senses:low-light vision
- Speed:5 Align:Unaligned Scores:yes
- Abilities (7):
  - [action] **Katar** (standard/at-will) +13 vs AC dmg="1d6+3 damage (crit 1d6+11)."
  - [action] **Double Attack** (standard/at-will)
  - [action] **Cage of Gloom** (standard/recharge) recharge="5-6"
  - [trait] **Battle Lord Tactics** — Thannu and his allies deal an extra 1d6 damage against enemies that he flanks.
  - [trait] **Battle Talent** — Thannu can score critical hits on attack rolls of natural 19 and 20.
  - [trait] **Inspiring Assault** — Whenever he scores a critical hit, Thannu and all allies within 5 squares of him
  - [action] **Shadow Jaunt** (move/encounter)
- ✅ No issues

## Firbolg Bloodbear (L15 Brute Elite)
- HP:240 AC:27 Init:+12 Senses:low-light vision
- Speed:8 Align:Unaligned Scores:yes
- Abilities (7):
  - [action] **Slam** (standard/at-will) +18 vs AC dmg="2d8+9"
  - [action] **Claw** (standard/at-will) +18 vs AC dmg="2d12+9"
  - [action] **Double Attack** (standard/at-will)
  - [action] **Bloodbear Maul** (standard/recharge) recharge="when bloodied"
  - [action] **Bite** (standard/at-will) +18 vs AC dmg="3d12+9" hit="if the target is granting combat advantage to the firbolg bloodbear, t"
  - [action] **Moonfire** (minor/recharge) +15 vs Will dmg="until the end of the firbolg bloodbear's next turn" recharge="4-6"
  - [action] **Bloodbear Form** (standard/encounter)
- ✅ No issues

## Goblin Cursespewer (L2 Artillery, Leader Standard)
- HP:34 AC:14 Init:+2 Senses:low-light vision
- Speed:6 Align:Chaotic Evil Scores:yes
- Abilities (4):
  - [action] **Sacrificial Knife** (standard/at-will) +7 vs AC dmg="1d4+3"
  - [action] **Confounding Curse** (standard/at-will) +7 vs Will dmg="1d6+3" hit="the target grants combat advantage to allies until the end of the curs"
  - [action] **Goblin Doom** (immediate-interrupt/at-will) +5 vs Reflex dmg="1d10+3" [poison] hit="ongoing 5 poison damage (save ends)." trig="a goblin within 5 squares is hit by a melee attack"
  - [action] **Goblin Tactics** (immediate-reaction/encounter) trig="the goblin cursespewer is missed by a melee attack"
- ✅ No issues

## Minotaur Mercenaries (L15 Soldier Standard)
- HP:150 AC:31 Init:+12 Senses:none
- Speed:5 Align:Unaligned Scores:yes
- Abilities (4):
  - [action] **Battleaxe** (standard/at-will) +22 vs AC dmg="2d12+3" hit="the target is marked until the end of the minotaur mercenary's next tu"
  - [action] **Goring Charge** (standard/at-will) +22 vs AC dmg="2d6+7" hit="the target is knocked prone."
  - [action] **Ferocity** (standard/at-will)
  - [action] **Shield Spikes** (free/at-will) trig="missed by a melee attack"
- ✅ No issues

## Dabus Custodian (L15 Artillery Standard)
- HP:118 AC:27 Init:+11 Senses:Darkvision
- Speed:8 (hover) Align:Unaligned Scores:yes
- Abilities (3):
  - [action] **Hammer** (standard/at-will) +22 vs AC dmg="1d10+5"
  - [action] **Psychic Ray** (standard/at-will) +20 vs Will dmg="2d8+6" [psychic] hit="the target is dazed (save ends)."
  - [action] **Psychic Burst** (standard/recharge) +18 vs Will dmg="3d10+6" [psychic] hit="the target is stunned (save ends)." recharge="5-6"
- ✅ No issues

## Summary
- Creatures tested: 10
- Total field issues: 1