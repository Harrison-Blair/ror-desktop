# Sessions features

This catalogue lists each sessions feature of the app: features that exist and features that the group plans. Each entry uses the same fields. [The app index](../README.md#catalogue-entries) defines the fields and the kinds.

The code calls a session a `Night`. The interface lists sessions under Session › Sessions.

## S-01 Start and end a session

- **Kind:** feature
- **Need:** [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Sessions and turns](../../gameplay/sessions/turn-order.md)
- **Behavior:** Session › Overview shows the running session and its duration. "Start session" opens a new numbered session. "End session" closes it. A session ends by itself after 6 hours with no session activity. Session activity is a turn action, a timer action, or a round action, for example a change of order or length. An edit of a turn note or an interterm note is also session activity. Other notes, recap edits, and chat are not session activity. The app records the end at the last session activity.
- **Data:** Local. `table.json` in the app data folder.
- **Dependencies:** none
- **Status:** done. `client/src/components/menus/SessionMenu/Overview.tsx:85`, `client/src-tauri/src/table.rs:1008`. Chat tool `get_session` (read).
- **Open questions:** none
- **Not handled:** none

## S-02 Turn order

- **Kind:** feature
- **Need:** none
- **Gameplay link:** [Turn order](../../gameplay/sessions/turn-order.md#turn-order)
- **Behavior:** "Edit order" opens a dialog with one row for each player: name, character, move up, move down, and remove. On Save, the user chooses "This round only" or "The usual order too". The next rounds copy the usual order. "Shuffle" puts the turns of the round in a random order and keeps the current turn current. The group keeps one order for a session by habit. The app does not enforce it.
- **Data:** Local. `table.json` in the app data folder.
- **Dependencies:** W-03 for the character of each player.
- **Status:** done. `client/src/components/menus/SessionMenu/OrderDialog.tsx:19`, `client/src-tauri/src/table.rs:838`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## S-03 Run a turn

- **Kind:** feature
- **Need:** [Candidate areas](../product/needs.md#candidate-areas)
- **Gameplay link:** [Player turns](../../gameplay/sessions/turn-order.md#player-turns)
- **Behavior:** The NOW card shows the current turn, the next turns, and a clock. Start, Pause, Resume, and Reset control the clock. The user can set the time left of a paused turn. "End turn" ends the turn and makes the next turn current. A click on a waiting player makes that turn current. "Reopen" makes an ended turn current again with its time left.
- **Data:** Local. `table.json` in the app data folder. The clock uses the time of day, so it continues through a restart of the app.
- **Dependencies:** S-02
- **Status:** done. `client/src/components/menus/SessionMenu/Overview.tsx:345`, `client/src-tauri/src/table.rs:643`, `client/src-tauri/src/table.rs:702`. No chat tool. The default turn length is 15:00 (`client/src-tauri/src/table.rs:25`). S-05 changes it to 20:00.
- **Open questions:** none
- **Not handled:** none

## S-04 Turn timer

- **Kind:** feature
- **Need:** [Candidate areas](../product/needs.md#candidate-areas)
- **Gameplay link:** [Player turns](../../gameplay/sessions/turn-order.md#player-turns)
- **Behavior:** The turn timer shows at the top centre of the app on every tab while a turn runs or is paused. It has a pause and play button. At zero, it changes to the alert colour, pulses one time, and counts overtime, for example `+0:42`. It is hidden before Start and during the interterm. A click on the time opens Session › Overview.
- **Data:** Local. `table.json` in the app data folder.
- **Dependencies:** S-03
- **Status:** done. `client/src/components/TimerPill/TimerPill.tsx:13`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## S-05 Timer chimes

- **Kind:** planned. Build order 1.
- **Need:** [Candidate areas](../product/needs.md#candidate-areas)
- **Gameplay link:** [Player turns](../../gameplay/sessions/turn-order.md#player-turns)
- **Behavior:** The turn timer plays a warning chime when 2 minutes are left. It plays a different chime at zero. Overtime continues without sound. With this change, the default turn length changes from 15:00 to 20:00.
- **Data:** none
- **Dependencies:** S-04
- **Status:** not started. The app has no sound code.
- **Open questions:**
  - Sound source. The recommendation is a tone that the app makes in code: 2 notes for the warning and 3 notes for zero.
  - After the game master adds time or resets the clock, do the chimes play again? The recommendation is yes, each time the running clock crosses 2:00 or 0:00.
  - Is a mute control necessary? The recommendation is to decide with sync, when more than one computer can show the timer.
- **Not handled:** More than one computer that shows the same timer. This occurs only after P-07.

## S-06 Interterm

- **Kind:** feature
- **Need:** none
- **Gameplay link:** [The interterm](../../gameplay/sessions/turn-order.md#the-interterm)
- **Behavior:** When all turns end, the current turn is `GM · Interterm`. The interterm is not timed. It has its own note and a "Next round" button.
- **Data:** Local. `table.json` and the `round-notes/` folder in the app data folder.
- **Dependencies:** S-03
- **Status:** done. `client/src/components/menus/SessionMenu/Overview.tsx:311`. Chat tool `get_round` (read).
- **Open questions:** none
- **Not handled:** none

## S-07 Rounds and the next round

- **Kind:** feature
- **Need:** [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [The next round](../../gameplay/sessions/turn-order.md#the-next-round)
- **Behavior:** A round shows its number, its length (Month, Quarter, or Year), its period, and whether it is open or closed. Round 1 opens at the game date as a quarter. "Next round" closes the current round, moves the game date to the end of the round, and opens the next round with the same length. If turns are still waiting, the app asks first.
- **Data:** Local. `table.json` and `world.json` in the app data folder.
- **Dependencies:** W-08
- **Status:** done. `client/src/components/menus/SessionMenu/Overview.tsx:494`, `client/src-tauri/src/table.rs:941`. Chat tool `get_round` (read).
- **Open questions:** none
- **Not handled:** none

## S-08 Review rounds

- **Kind:** feature
- **Need:** [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Sessions and turns](../../gameplay/sessions/turn-order.md)
- **Behavior:** Session › Rounds lists all rounds with the newest first. A round page shows its turns and their notes. "Read whole round" shows all notes of the round in turn order, then the interterm note. The user can open a closed round again and close it again.
- **Data:** Local. `table.json` and the `round-notes/` folder in the app data folder.
- **Dependencies:** S-07, S-09
- **Status:** done. `client/src/components/menus/SessionMenu/RoundsPage.tsx:10`, `client/src/components/menus/SessionMenu/ReadRound.tsx:14`. Chat tool `get_round` (read).
- **Open questions:** none
- **Not handled:** none

## S-09 Turn notes and recaps

- **Kind:** feature
- **Need:** [Note taking](../product/needs.md#where-play-loses-time), [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Notes](../../gameplay/knowledge/notes.md)
- **Behavior:** Each turn, each interterm, and each session has a Markdown note. The editor saves 500 ms after the last key. Session › Sessions lists sessions with the first line of each recap. The chat agent can replace a recap after approval.
- **Data:** Local. The `round-notes/` folder in the app data folder. These notes are not in the notes folder.
- **Dependencies:** K-02
- **Status:** done. `client/src/components/menus/SessionMenu/RoundNote.tsx:27`, `client/src/components/menus/SessionMenu/NightsPage.tsx:17`. Chat tools `get_session` (read), `write_recap` (write).
- **Open questions:** Must turn notes move into the notes folder? Then note search, links, and mentions also apply to them.
- **Not handled:** none

## S-10 Dice

- **Kind:** feature
- **Need:** none. [How the group works today](../product/overview.md#how-the-group-works-today) names online dice rollers.
- **Gameplay link:** [The roll](../../gameplay/sessions/skill-checks.md#the-roll)
- **Behavior:** The Dice panel has a "Roll d100" button and one button for each of d2, d3, d4, d6, d8, d10, d12, and d20. It also has a field for an expression such as `2d6 + 3`. The panel shows the total and each die. It keeps the last 10 rolls until the app closes. The user can clear the history.
- **Data:** none. The history is in memory only.
- **Dependencies:** none
- **Status:** done. `client/src/components/menus/DiceMenu/DiceMenu.tsx:12`, `client/src/lib/dice.ts:19`. Chat tool `dice_roll` (read).
- **Open questions:** none
- **Not handled:** none

## S-12 Interterm event log

- **Kind:** idea
- **Need:** [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [The interterm](../../gameplay/sessions/turn-order.md#the-interterm)
- **Behavior:** The app keeps a list of the events of each quarter and their effects, so that players can read them after a gap.
- **Data:** Shared.
- **Dependencies:** P-07
- **Status:** partial. Each interterm has a note (S-06). The app has no list of events across rounds.
- **Open questions:** Is the interterm note enough, or must events be separate records?
- **Not handled:** none

## S-13 Timeline

- **Kind:** idea
- **Need:** [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Player turns](../../gameplay/sessions/turn-order.md#player-turns), [Real history during play](../../gameplay/world/setting.md#real-history-during-play)
- **Behavior:** The app shows two timelines. The historical timeline shows events by game date. The turn timeline shows what each player did in each turn. A player can find the actions that affect their character and the agreements that other players made with them.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** S-09. W-09 to find the actions that mention a character.
- **Status:** partial. "Read whole round" shows the notes of one round in turn order (S-08). The app has no timeline across rounds.
- **Open questions:**
  - Does S-12 Interterm event log become part of the historical timeline?
  - The game master announces each change to real history in the interterm. Today, players must remember it or note it. Does the historical timeline show where the campaign differs from real history?
- **Not handled:** none

## S-14 Session transcription

- **Kind:** idea
- **Need:** [Note taking](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Player turns](../../gameplay/sessions/turn-order.md#player-turns)
- **Behavior:** The app records the talk of a session and makes a transcript. Today, one player uses a separate tool for this.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** S-01
- **Status:** not started. The app has no audio code.
- **Open questions:** Does the transcript feed the turn notes or the timeline (S-13)?
- **Not handled:** none

## S-15 Session start orientation

- **Kind:** idea
- **Need:** [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Sessions and turns](../../gameplay/sessions/turn-order.md)
- **Behavior:** When a session starts, each user sees where the group stopped. The view shows the game date, the round, and the last interterm. It also shows what the other players did and the ongoing items of the user. Today, every player and the game master take a few minutes to read their notes before play.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** S-01. The view gathers W-08, S-07, S-06, S-13, K-09, and K-13.
- **Status:** not started. Session › Overview shows the game date and the current round only.
- **Open questions:** none
- **Not handled:** none
