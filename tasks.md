# Completed combat tracker tasks

Status: Completed. Retained as an acceptance-criteria record.

## Two-column DM view for combat tracker

- The right side pane of the DM's view in the combat tracker should be changed to be a two-column layout. Currently, it displays only the statblock of the creature whose turn it currently is. We should split that into the current creature (left half) and whichever other creature has been selected in the initiative tracker via left-click (right half). This will allow a DM to see statblocks for both an attacker and the target, simultaneously.

## Delaying changes; readying actions

- Creatures delaying their turns should not be required to take their turns at the end of the round, and instead be able to roll over to the next round. Rounds as a concept should become indicators only, with the initiative order being a continuous cycle.

- It should be possible to mark a creature as readying an action, which is distinct from delaying. Unlike delaying, creatures readying an action should be displayed _before_ the creature whose turn it currently is, since their readied action can interrupt the current creature.

- Creatures must always specify WHAT action they are readying. When marking a creature as readying; the DM should be able to input text specifying what action is being readied and what the trigger is. For now this should be a single freeform text field.

- After a creatures uses its readied action, its place in the initiative order moves to directly before the creature whose turn it currently is; in other words, it re-orderes as if it had just completed its turn.

## Show conditions to the DM

Completed as part of the combat tracker condition-pill and detail-panel work.
