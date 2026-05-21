# Combat tracker features

## DM Screen

- Indicate which monster is next up in the initiative
- Indicate which player character is next up in the initiative
- On a monster's turn (or when clicking on a monster), show the monster's stat block (adjusted with modifiers from any current conditions), status (HP, conditions, etc.) and power cards.
  - Allow the monster's power cards to be clicked and marked as used. 
  - For each monster, track whether or not each encounter and recharge power has been used or not. Used powers gray out. At the end of a monster's turn, prompt the DM to roll to recharge any spent recharge powers (or auto-roll for it; there should be a setting that toggles this behavior, prompt roll or auto roll)
- For any creatures with reactions, display those reactions' titles and triggering conditions on the screen during the players' turns (this way if the PC does something that would trigger the reaction. Only display reactions that are not already spent (i.e., if they are used encounter or recharge powers, don't show them). Also take into account whether a monster actually has a reaction to use or has used the reaction already (monsters regain a reaction on their turn).
- For any conditions affecting a monster or PC, show "condition cards" on both the player and DM screen when that monster's turn is up, explaining the definition of the condition(s), as well as the remaining time of the condition or the save condition ("save ends", or "save (+2) ends" etc. if the creature has an innate save bonus)

## Player Screen
- Show approximate HP indicators only, not numbers
- Show an indicator of which player is next
