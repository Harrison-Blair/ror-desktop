# 01 App shell

Status: draft. This spec covers the frame every tab sits in: the left rail, the campaign folder, people, roles and the campaign's stat list, "viewing as", the Dice panel, saving, and the app-wide states. It uses the terms and fields of `00-ontology.md` and does not redefine them. Every rule names its source in `README.md`: a bold label from "Settled so far" (tagged **settled**) or a number from "Defaults adopted" (tagged **default**, open to change). Rules carried over from the current app are tagged **current app**. Anything not decided is a numbered question in [Gaps](#gaps), marked "(gap N)" where it applies.

## Contents

- [Purpose](#purpose)
- [Features](#features)
- [Layout](#layout)
- [Behaviour](#behaviour)
- [States](#states)
- [Changes from `archive/HANDOFF.md`](#changes-from-archivehandoffmd)
- [Gaps](#gaps)

## Purpose

Hold one campaign open and give every tab the same frame: a way to move between Player, World and Notes, to see whose view is shown and switch it, to roll dice beside whatever page is open, and to trust that edits are saved. The shell also owns the campaign's own settings: its name and start date, the People at the table and their roles, and the campaign's stat list.

The shell hands over to the tabs at the page area. What each tab shows is owned by `02-player.md`, `03-world.md` and `04-notes.md`. How anything is written to disk is owned by `06-storage.md`.

## Features

| Feature | When | Note |
| --- | --- | --- |
| Left rail with Player, World and Notes | now | Player, World and Notes come first |
| Map in the rail | later | Shown in the rail, marked as coming later, not openable |
| Dice toggle in the rail | now | Opens and closes the Dice panel on any tab |
| Campaign folder control in the rail | now | Shows the open campaign; opens its menu |
| Open a campaign folder | now | The folder reopens on the next launch, as today |
| Create a campaign folder | now | Collects the Campaign's fields; no migration of the old one-player folder |
| Campaign settings: name and start date | now | Start date (gap 11, gap 17) |
| Campaign settings: People and roles | now | Add People, rename them, change who is game master (gap 1) |
| Campaign settings: a Person leaving | now | Depends on gap 3 |
| Campaign settings: usual turn order | now | Where it is edited: gap 16. Who is in it: gap 2 |
| Campaign settings: stat list | now | Add, rename, reorder, remove a Stat (gap 4) |
| Campaign settings: Economy list and Divergence list | now | Edited on the World tab (gap 15) |
| Several currencies | later | US dollars only for now; shown, not chosen |
| "Viewing as" switch | now | Picks a Person; shown on every page |
| Shell bar with game date, Round and whose turn | now | On every tab is gap 26 |
| Roles with real permissions | later | Nobody is restricted in the first version |
| Record of who made each change | now | What is kept is gap 12 |
| A list of changes people can look through | later | Gap 12 |
| Dice panel beside the current page | now | Replaces the standalone Dice page |
| Dice panel: stat from the viewed Person's active Character | now | Gaps 30, 31 |
| Dice panel: optional one-off modifier | now | |
| Dice panel: any dice notation, d100 default | now | Current limits kept |
| Dice panel: "Insert into note" | now | Only when a note is open (gap 37) |
| Dice panel: recent rolls | now | Up to 50, never written to disk |
| Autosave, save chips, failed-save banner, dirty-refresh dialog, close guard | now | Carried over unchanged |
| Refresh instead of watching for outside changes | now | Carried over unchanged |
| Watching the folder for outside changes | later | Not in the first version; sync comes later |
| Preferences: sidebar width and collapse, show hidden files, line numbers | now | Carried over (gaps 23, 25) |
| Sync with other machines | later | The shell runs on one machine |
| A dedicated game master dashboard | later | The game master uses the same four tabs |

## Layout

The wireframes settle what goes where. They say nothing about colour, type or size.

### Main frame

```
+------+---------------------------------------------------------------+
| RAIL | SHELL BAR                                                     |
|      | 10 February 1962 . Round 3 . Turn: Ana   Viewing as: Ben  v   |
| [Pl] +---------------------------------------------------------------+
| [Wo] | SAVE BANNER (only after a failed save)                [Retry] |
| [No] +---------------------------------------------------------------+
| [Ma] |                                                               |
|      | PAGE                                                          |
|      | the open tab: Player, World or Notes                          |
|      |                                                               |
|      |                                                               |
| [Di] |                                                               |
|      |                                                               |
| [Ca] |                                                               |
+------+---------------------------------------------------------------+
```

- **Rail**: from the top, Player [Pl], World [Wo], Notes [No] and Map [Ma]; then, apart from the tabs, the Dice toggle [Di] and, at the bottom, the campaign folder control [Ca]. The open tab shows as pressed. Map shows as coming later and cannot be opened. The Dice toggle shows as pressed while the panel is open.
- **Shell bar**: on the left, the current game date, the Round number and whose turn it is (gap 26). On the right, the "viewing as" switch, showing the viewed Person's name and role.
- **Save banner**: appears only after a failed save, under the shell bar, with Retry. It spans the page and the Dice panel.
- **Page**: the open tab. Its contents, including where each page shows its own save chip, belong to that tab's spec.

### Main frame with the Dice panel open

```
+------+-----------------------------------------------------------------+
| RAIL | SHELL BAR                                                       |
|      | 10 February 1962 . Round 3 . Turn: Ana     Viewing as: Ben  v   |
| [Pl] +-------------------------------------+---------------------------+
| [Wo] | PAGE                                | DICE PANEL                |
| [No] | the open tab, narrower              | see "Dice panel" below    |
| [Ma] |                                     |                           |
|      |                                     |                           |
| [Di] |                                     |                           |
|      |                                     |                           |
| [Ca] |                                     |                           |
+------+-------------------------------------+---------------------------+
```

- **Page**: the open tab, which keeps working while the panel is open.
- **Dice panel**: sits beside the page, on the side away from the rail. It does not cover the page.

### Dice panel

```
+----------------------------------------+
| HEADER     Dice                    [x] |
+----------------------------------------+
| QUICK ROLL                             |
| [d4] [d6] [d8] [d10] [d12] [d20][d100] |
+----------------------------------------+
| ROLL FORM                              |
| Dice        [ 1d100                  ] |
| Stat        [ Science 63           v ] |
| Modifier    [                        ] |
|                                 [Roll] |
| error line, when the notation is wrong |
+----------------------------------------+
| RESULT                                 |
| Total 112                              |
| d100: 49   + Science 63                |
| [Roll again]        [Insert into note] |
+----------------------------------------+
| RECENT ROLLS           [Clear history] |
| Ben   1d100 + Science   49 + 63   112  |
| Ana   2d6 + 1           4, 2 + 1    7  |
| ...                                    |
+----------------------------------------+
```

- **Header**: the panel's name and a close button, which does the same as the rail's Dice toggle.
- **Quick roll**: one button per standard die, as today. Whether a quick roll uses the stat and modifier set in the form is gap 38.
- **Roll form**: the dice notation, defaulting to d100; the stat picker, listing the Stats of the viewed Person's active Character with each one's value, plus "No stat" (gaps 30, 31); the optional one-off modifier; Roll. A notation error shows under the form.
- **Result**: the latest roll: its total, then each die shown, the stat and its value, and the one-off modifier. Roll again repeats it. "Insert into note" appears only when a note is open (gap 37).
- **Recent rolls**: up to 50 recent rolls, newest first, each with who rolled (gap 29), the notation and stat, the dice shown and modifiers, and the total. Clear history empties it.

### Campaign folder menu

```
+------+---------------------------------+
| ...  | CAMPAIGN MENU                   |
|      | Hartley Campaign                |
|      | /home/ben/games/hartley         |
|      +---------------------------------+
|      | Campaign settings               |
|      | Refresh                         |
|      +---------------------------------+
|      | Open campaign...                |
| [Ca] | New campaign...                 |
+------+---------------------------------+
```

- **Name and place**: the Campaign's Name and where its folder is.
- **Campaign settings**: opens the settings page.
- **Refresh**: reloads the campaign from disk (rule 51).
- **Open campaign... / New campaign...**: open another campaign folder or create one.

### "Viewing as" menu

```
                    +-------------------------------------+
  Viewing as: Ben v | VIEWING AS MENU                     |
                    | (*) Ben       player     Ruth Hale  |
                    | ( ) Ana       player     Otto Brandt|
                    | ( ) Carla     game master           |
                    +-------------------------------------+
                    | HIDDEN NOTICE                       |
                    | Hidden means not shown, not         |
                    | protected. Anyone on this machine   |
                    | can switch to see it. (gap 22)      |
                    +-------------------------------------+
```

- **Viewing as menu**: every Person in the campaign, with their role and their active Character, if any. The viewed Person is marked.
- **Hidden notice**: one plain line saying that hidden is not protected (gap 22).

### First launch

```
+------+---------------------------------------------------------------+
| RAIL |                                                               |
|      |                    START                                      |
| [Pl] |                    Open a campaign to start                   |
| [Wo] |                    A campaign is one folder: one world,       |
| [No] |                    many players. It reopens next time.        |
| [Ma] |                                                               |
|      |                    [Open campaign]   [New campaign]           |
| [Di] |                                                               |
| [Ca] |                                                               |
+------+---------------------------------------------------------------+
```

- **Rail**: the tabs are shown but cannot be opened until a campaign is open. The Dice toggle works (gap 27). There is no shell bar.
- **Start**: a heading, one line of explanation and the two choices. The wording is for the mockup pass; it follows the copy rule (rule 50).

### New campaign

```
+-------------------------------------------------------------+
| NEW CAMPAIGN                                                |
|                                                             |
| YOU                                                         |
| Your name        [ Carla                     ]              |
| Your role        ( ) player   (*) game master   (gap 13)    |
|                                                             |
| CAMPAIGN                                                    |
| Name             [ Hartley Campaign          ]              |
| Start date       [ 10 ] [ February v ] [ 1962 ]  (gap 11)   |
| First round      ( ) month ( ) quarter ( ) year  (gap 39)   |
| Currency         US dollars                                 |
| Folder           [ choose where...           ]  (gap 14)    |
|                                                             |
| STATS (optional, can be filled in later)        (gap 9)     |
| [ + Add stat ]                                              |
|                                                             |
|                                     [Cancel] [Create]       |
+-------------------------------------------------------------+
```

- **You**: the Person creating the campaign, who becomes its first Person and its Author (gap 13).
- **Campaign**: the Campaign's Name, Start date (gap 11), the first Round's length with nothing preselected (gaps 5, 39), Currency (shown, fixed to US dollars) and where the new folder goes (gap 14).
- **Stats**: the start of the stat list, which may be left empty (gap 9).
- Other People, the turn order and the Economy and Divergence lists are not asked for here. People are added afterwards in Campaign settings; the lists start empty (gap 15; for the Economy list, ontology gap 37).

### Campaign settings

```
+------+---------------------------------------------------------------+
| RAIL | SHELL BAR                                                     |
|      +---------------------------------------------------------------+
|      | HEADER   Campaign settings                          [Close]   |
|      +---------------------------------------------------------------+
|      | GENERAL                                                       |
|      | Name         [ Hartley Campaign        ]                      |
|      | Start date   10 February 1962           (gap 17)              |
|      | Currency     US dollars                                       |
|      +---------------------------------------------------------------+
|      | PEOPLE                                       [ + Add person ] |
|      | Ben     player        Ruth Hale       [Rename] [...]          |
|      | Ana     player        Otto Brandt     [Rename] [...]          |
|      | Carla   game master   -               [Rename] [...]          |
|      | [ Make game master v ]                     (gap 1, gap 18)    |
|      |                                                               |
|      | USUAL TURN ORDER                              (gap 2, gap 16) |
|      | 1. Ben  [up][down]   2. Ana  [up][down]       [ + Add ]       |
|      +---------------------------------------------------------------+
|      | STATS                                          [ + Add stat ] |
|      | [::] Science      [Rename] [Remove]                           |
|      | [::] Charisma     [Rename] [Remove]               (gap 4)     |
|      | [::] ...                                                      |
+------+---------------------------------------------------------------+
```

- **Header**: the page's name and Close, which returns to the tab that was open.
- **General**: the Campaign's Name, its Start date (changeable: gap 17) and its Currency.
- **People**: every Person with Name, Role and active Character. Each row can be renamed and has a menu holding the role change and leaving (gap 3). Adding a Person asks for a Name and a Role. Characters are created on the Player tab.
- **Usual turn order**: the Campaign's Turn order (gaps 2, 16). A Round's own copy is changed on the World tab.
- **Stats**: the campaign's stat list in order, each with a handle [::] for reordering, Rename and Remove (gap 4).

### Opening, missing and not a campaign

```
+------+------------------------------+  +------+------------------------------+
| RAIL | OPENING                      |  | RAIL | MISSING                      |
|      |                              |  |      | Can't find hartley           |
|      |      (spinner)               |  |      | [/home/ben/games/hartley]    |
|      |      Opening hartley...      |  |      |                              |
|      |                              |  |      | [Open another] [New campaign]|
+------+------------------------------+  +------+------------------------------+

+------+------------------------------------------------------+
| RAIL | NOT A CAMPAIGN                                       |
|      | reading-group isn't a campaign                       |
|      | Open a campaign folder, or create a new campaign.    |
|      |                                                      |
|      | [Open another]   [New campaign]          (gap 14)    |
+------+------------------------------------------------------+
```

- **Opening**: a spinner and the folder's name only. No shell bar and no page until the campaign is read.
- **Missing**: the remembered folder's name, its place, and the two ways on.
- **Not a campaign**: the opened folder's name, one line, and the two ways on (gap 14).

### Dialogs

```
+-------------------------------------------------------------+
| DIRTY REFRESH                                               |
| Campaign has unsaved changes                     (gap 36)   |
| Refreshing reloads the campaign from disk.                  |
| Save and Refresh writes your version over any changes made  |
| in other apps.                                              |
|        [Cancel] [Discard and Reload] [Save and Refresh]     |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
| CHANGE GAME MASTER                               (gap 18)   |
| Make Ana the game master?                                   |
| Carla becomes a player. Ana will see game-master-only notes,|
| accounts and events; Carla will no longer see them.         |
|                                  [Cancel] [Make game master]|
+-------------------------------------------------------------+
```

- **Dirty refresh**: title, body, a note on overwriting, and the three choices, as today (wording: gap 36).
- **Change game master**: shown only if gap 18 is answered as recommended.

## Behaviour

### Rail and tabs

1. **The rail lists Player, World, Notes and Map.** Player, World and Notes come first; Map comes later. Map is shown in the rail, marked as coming later, and does nothing when chosen. [Tabs; settled]
2. **Play happens inside the tabs.** The shell opens one tab at a time in the page area. A character's turns are a section of the Player tab; the World tab shows the date, the round, whose turn it is, the interterm and the Advance step. [Where play happens; settled]
3. **The game master uses the same tabs.** There is no separate game master view in the shell. A dedicated dashboard comes later. [Game master; settled]
4. **Switching tabs waits for the latest draft**, as switching notes does today. A failed save blocks the switch (rule 48). [Existing app; settled; current app]
5. **Which tab opens** when a campaign opens is gap 24.
6. **The Dice toggle opens and closes the Dice panel** on any tab. It does not change the open tab. [Dice; settled]
7. **The campaign folder control** opens the campaign menu: Campaign settings, Refresh, Open campaign..., New campaign.... With no campaign open it shows only Open campaign... and New campaign.... [current app, extended]

### Opening and creating a campaign

8. **One opened folder is a campaign: one world, many players.** Opening a folder opens its Campaign. [Campaign; settled]
9. **The folder reopens on the next launch.** [current app] What the Notes tab shows on reopening, including whether open note tabs are restored, belongs to `04-notes.md` (its gap 9, what opens where).
10. **A folder that is not a campaign** shows the "not a campaign" state, with Open another and New campaign. Whether a campaign can be created in an existing folder that already holds files is gap 14.
11. **Fresh start.** A new campaign folder is created and old material is copied in by hand. The old one-player folder is not migrated: opened, it is a folder that is not a campaign (rule 10). [Existing data; settled]
12. **New campaign asks for the Campaign's fields.** Name (required), Start date (required; gap 11), the first Round's length (rule 16.1; gap 39), Stat list (may be empty; gap 9), and where the new folder goes (gap 14). Currency is shown as US dollars and not chosen. [Campaign; settled; Currency; settled]
13. **Several currencies come later.** The Currency shown at creation and in settings has one choice, US dollars. [Currency; settled]
14. **The first Person.** A campaign needs a Person to be its Author and the first Person in "viewing as". New campaign asks for the creator's name and role (gap 13).
15. **People are added after creation**, in Campaign settings (rule 18). The Economy list and the Divergence list start empty and are filled in on the World tab (gap 15; that the Economy list starts empty rests on ontology gap 37).
16. **The first Round.** Whether creating the campaign opens the first Round on the start date is ontology gap 8 (gap 5). Who is the Author of what the app creates then is gap 7.
    1. **The first Round's length.** If the first Round opens when the campaign is created (gap 5), New campaign asks for its length, a month, a quarter or a year, beside the start date, with nothing preselected (gap 39). [Round length; settled] [Time; settled]
17. **Rename and folder.** Renaming the Campaign changes its Name. Whether the folder's name follows belongs to `06-storage.md`.

### People and roles

18. **Adding a Person** asks for a Name and a Role. Anyone can add a Person; the viewed Person is recorded as its Author. [Who may change what; settled; Multi-user; settled]
19. **A person and their character are separate.** Characters are created and managed on the Player tab; Campaign settings only shows each Person's active Character. [People and characters; settled]
20. **Roles.** A Person is a player or the game master. How the role is recorded, whether there is exactly one game master, and whether the game master may also play a Character is gap 1.
21. **Changing who is game master** is done from a Person's row menu. If there is exactly one game master (gap 1), making another Person game master makes the previous one a player. Whether this asks first is gap 18. Who holds the role decides who sees "game master only" and "me and the game master" records (ontology, Visibility level).
22. **A Person leaving** is gap 3. Until it is answered the row menu offers no way to remove a Person.
23. **The usual turn order** is the Campaign's Turn order: People are moved up and down, added and removed (gap 16 for where; gap 2 for who is in it). Each Round copies it when it opens; a Round's copy is changed or shuffled on the World tab without changing the Campaign's. [Advancing; settled]
24. **No restrictions to start.** Everyone can edit everything, and every change records who made it. Separate roles with real permissions come later. The shell never disables an action because of the viewed Person's role. [Who may change what; settled]
25. **Every change records who made it**: the Person in "viewing as" at the time. What the record of changes holds, and whether people can look through it, is gap 12. [Who may change what; settled; Sync; settled]

### The campaign's stat list

26. **One list per campaign; every character has a number for each.** The stat list is edited only in Campaign settings. Values are set on the Player tab. [Stats; settled]
27. **Adding a Stat** asks for a Name and puts it at the end of the list. What each Character's value becomes is gap 4.
28. **Renaming a Stat** changes its Name everywhere it is shown, including saved Rolls that used it. The Stat keeps its Id.
29. **Reordering** moves a Stat in the list; every Character's stats and the Dice panel's stat picker follow the new order.
30. **Removing a Stat** is gap 4. A saved roll keeps the modifier it was rolled with, even if the stat changes later, so removing a Stat never changes a saved Roll's total. [default 12; default]

### "Viewing as"

31. **"Viewing as" picks a person.** The first version runs on one machine with a "viewing as" switch for acting as any player or as game master. [People and characters; settled; Multi-user; settled]
32. **Every page shows whose view it is.** The shell bar shows the viewed Person's name and role on every tab, in Campaign settings, and while the Dice panel is open. [Multi-user; settled]
33. **Switching** changes what every page shows to what that Person may see, and makes them the Author of anything created from then on (ontology rule 4). A roll made before the switch and inserted after it is the one case where this is not settled (ontology gap 46). Which Person is selected when a campaign opens is gap 19. What happens to unsaved edits when switching is gap 20. What happens to an open page that shows something the new viewer cannot see is gap 21.
34. **Hidden means not shown, not protected.** Until the server exists, hidden means not shown, not protected. Anyone at the machine can switch to any Person. Whether the app says so on screen is gap 22. [Secrets; settled]
35. **Hidden things stay hidden everywhere.** Link suggestions, "linked from" lists, charts and other people's view of a character's net worth leave out anything the viewer cannot see. In the shell this means the Dice panel and the shell bar show nothing from a record hidden from the viewed Person. [default 4; default]
36. **"Me" means an owner.** "Me and the game master" refers to the record's Owner, not to whoever last edited it, so switching to the Owner shows it. [default 5; default]

### Shell bar: date, Round and whose turn

37. **The World tab shows the date, the round and whose turn it is.** [Where play happens; settled] Whether the shell bar also shows them on every tab is gap 26. The game date shown is the current game date (ontology, Game date): the start date of the current Round, on the real Gregorian calendar. [Calendar; settled] Which Round is current while one is reopened is gap 6. "Whose turn" is the Person whose Turn is next in the Round's turn order.

### Dice panel

38. **A panel opened from the rail on any tab, sitting beside the current page.** The standalone Dice page goes away. Whether the panel stays open when the tab changes is gap 28. [Dice; settled]
39. **Rolling.** Die result, plus an optional stat, plus an optional one-off modifier, giving a total. Any dice notation is allowed; d100 is the default. The notation field starts as 1d100. [Rolls; settled; Resolution; settled]
    1. Notation limits are kept from the current app: at most 100 dice, 1,000,000 sides per die and 200 characters. A notation outside them shows its error under the form and rolls nothing. [current app] A further limit of 1,000,000 on each number added in the notation is believed to be current-app behaviour but is not confirmed by the current README; it is unverified.
    2. Quick-roll buttons roll one die of their kind and leave the notation field unchanged. Roll again repeats the latest roll. [current app] Whether a quick roll uses the stat and modifier set in the form is gap 38.
    3. Whether a number written in the notation (such as the 1 in 2d6 + 1) is part of the die result or of the one-off modifier is gap 32.
    4. Natural 1s and 100s: gap 10.
40. **Picking a stat.** A roll can pick a stat from the character: the picker lists the Stats of the viewed Person's active Character with their values, and "No stat". The stat's value is added as a flat modifier (Science 63 adds 63 to science rolls). When the viewed Person has no active Character: gap 30. When the open note is another Person's turn note, or the Player tab shows a different Character: gap 31. [Dice; settled; Resolution; settled]
41. **One-off modifier.** An optional number added to the total, for this roll only. [Rolls; settled]
42. **Casual rolls still work and are not saved.** A roll in the panel is casual until it is inserted. [Dice; settled]
43. **Insert into note.** A roll can be inserted into the open note as a roll block. The button appears only when a note is open (what counts: gap 37). Inserting makes a Roll whose Author is the Person who rolled (ontology: Roll, Author "Who rolled"). When "viewing as" has changed between rolling and inserting, which Person that is, is ontology gap 46, whose recommendation is: "the Author of a Roll is the Person who rolled; the Person who inserted it is recorded as having made the change (gap 42)". The Roll also holds the Character whose stat was used, the Stat and its value at the moment of rolling, the one-off modifier and the total. Rolls are saved with the action they resolved: where the block lands, and so which Action or Turn it belongs to, is owned by `04-notes.md`, as are the block's fields and how its target number and verdict are filled in (gap 33). Inserting into a note that is not a turn or interterm note: gap 8. Inserting the same roll twice: gap 34. [Dice; settled; Resolution; settled; Actions; settled]
44. **Recent rolls.** Up to 50 recent rolls, newest first, kept for the session and never written to disk; closing the app clears them. Clear history empties the list. Whether the list is shared across "viewing as" and campaigns is gap 29. [current app]
45. **Without a campaign** the Dice panel's behaviour is gap 27.

### Saving

46. **Autosave.** Edits save automatically 500ms after the last change. This applies to every edit the shell makes (Campaign settings, People, stats) as well as the tabs'. [Existing app; settled; current app]
47. **Save chips.** Unsaved, Saving..., Saved, and Save failed with a Retry pill, as today. Each tab places its own chip; Campaign settings shows one in its header. [Existing app; settled; current app]
48. **A failed save keeps the draft and blocks navigation.** The red banner appears under the shell bar with Retry. Switching tab, switching note, switching "viewing as" (gap 20), opening another campaign and Refresh all wait until the save succeeds. [Existing app; settled; current app] Whether Refresh, and so Discard and Reload, is reachable after a failed save is gap 40.
49. **One edit, several records.** When one edit writes several records (for example a money block and its Ledger entry, which are one record shown in two places) and part of it fails, the same failed-save banner appears with Retry and navigation is blocked as in rule 48. The order of writes and what is left on disk after a partial failure belong to `06-storage.md`. The banner's wording for such an edit is gap 35. [Blocks are shared records; settled]
50. **Copy rule.** Messages never name the app and never speak as the app in the first person. [current app]
51. **Refresh instead of watching.** The app does not watch the folder for changes made in other programs. Refresh, from the campaign menu, reloads the campaign from disk. With unsaved changes it shows the dirty-refresh dialog: Cancel; Discard and Reload, which drops the draft after any active save finishes (after a failed save: gap 40); Save and Refresh, which writes the draft over outside changes. The Notes tab may keep its own Refresh button (owned by `04-notes.md`). The dialog's wording is gap 36. [Existing app; settled; current app]
52. **Close guard.** Closing the window waits for the latest draft. After a failed save the window stays open and the banner reads that the window stays open and the changes are still there, with Retry. [Existing app; settled; current app]

### Preferences

53. **Carried over and remembered across launches**: the remembered campaign folder, the Notes sidebar's width (180 to 480, default 260) and whether it is collapsed, whether hidden files are shown in the Notes tree, and line numbers in the editor (off by default, shared by all notes). The Notes tree and editor that use them are owned by `04-notes.md`. Whether they are kept per machine or per Person is gap 23. How line numbers apply to live preview is gap 25. [current app; Editing; settled]
54. **No longer apply**: Player as the fixed opening tab (gap 24) and the reserved one-player files at the folder's root (rule 11).

### Coverage

| README item | Reflected in |
| --- | --- |
| **Tabs** | Rule 1; Layout, main frame |
| **Campaign** | Rules 8, 12 |
| **Time** | Not this page (World). Rule 37 shows its result |
| **Round length** | Rule 16.1; Layout, New campaign (the first Round's length, gap 39). Later Rounds: not this page (World) |
| **Turns** | Not this page |
| **Resolution** | Rules 39, 40, 43 |
| **Interterm** | Not this page |
| **Multi-user** | Rules 18, 31, 32 |
| **Stats** | Rules 26 to 30 |
| **Rolls** | Rules 39, 41 |
| **Character life** | Not this page (Player). Rule 40 reads the active Character |
| **Identity** | Not this page |
| **Money** | Not this page |
| **Currency** | Rules 12, 13 |
| **Recurring money** | Not this page |
| **Assets** | Not this page |
| **Net worth** | Not this page |
| **Timeline and divergences** | Not this page (World). Gap 15 |
| **Events** | Not this page |
| **Economy** | Not this page (World). Gap 15 |
| **Other world things** | Not this page |
| **Where play happens** | Rules 2, 37; gap 26 |
| **Turn notes** | Not this page (Notes, World) |
| **Editing** | Rule 53 (line numbers); gap 25 |
| **Links and tabs** | Not this page (Notes) |
| **Notes calendar** | Not this page |
| **Tables and charts** | Not this page |
| **Who may change what** | Rules 18, 24, 25 |
| **Secrets** | Rule 34; gap 22 |
| **Existing data** | Rule 11 |
| **Game master** | Rule 3 |
| **Dice** | Rules 6, 38, 40, 42, 43 |
| **Sync** | Rule 25; Features (sync later) |
| **People and characters** | Rules 19, 31 |
| **Turn notes and people** | Not this page |
| **Blocks are shared records** | Rule 49 |
| **Actions** | Rule 43 (hand-over to Notes) |
| **Advancing** | Rule 23 (turn order) |
| **Calendar** | Rule 37 |
| **Existing app** | Rules 4, 46 to 48, 51, 52 |
| **Process** | Layout (wireframes for the mockup pass) |
| Default 1 | Not this page |
| Default 2 | Not this page |
| Default 3 | States (introduction; Dice panel, hidden) |
| Default 4 | Rule 35 |
| Default 5 | Rule 36 |
| Default 6 | Not this page |
| Default 7 | Not this page |
| Default 8 | Not this page |
| Default 9 | Not this page |
| Default 10 | Not this page |
| Default 11 | Not this page |
| Default 12 | Rule 30 |
| Default 13 | Not this page |
| Default 14 | Not this page |
| Default 15 | Not this page |
| Default 16 | Not this page (Player, Notes) |
| Default 17 | Not this page |

## States

Every record the shell itself shows (Campaign, Person, Stat, Round number, whose turn) is always visible, so nothing in the shell is hidden by role except as stated below.

### Rail

- **Empty**: no campaign open. Player, World and Notes show but cannot be opened; Map is marked as coming later; the Dice toggle works (gap 27); the campaign control offers Open campaign... and New campaign....
- **Loading**: while a campaign opens, every rail button except the Dice toggle waits. As today, rail buttons wait while a save is in progress.
- **Error**: the rail has no error of its own. A failed save keeps it in place but blocks switching (rule 48).
- **Hidden**: nothing in the rail is hidden.

### Shell bar

- **Empty**: no Round yet (depends on gap 5): the game date shows the campaign's start date and the Round and turn parts are left out. When no Turn in the Round is unfinished, the turn part is left out.
- **Loading**: not shown until the campaign is read.
- **Error**: none of its own.
- **Hidden**: nothing; the date, Round and Person names are always visible.

### "Viewing as" menu

- **Empty**: cannot be empty once a campaign exists, since the creator is a Person (gap 13).
- **Loading**: not shown until the campaign is read.
- **Error**: none of its own. Switching while a save has failed is blocked (rule 48, gap 20).
- **Hidden**: every Person is listed, with role and active Character.

### Campaign settings

- **Empty**: People always holds at least the creator. An empty stat list reads that there are no stats yet and offers Add stat. An empty usual turn order reads that nobody is in the order yet.
- **Loading**: opens with the campaign; there is no separate load.
- **Error**: a failed save shows the save chip as Save failed with Retry and the banner (rule 48). A name that cannot be saved keeps its field open with its message, as today's inline naming does.
- **Hidden**: nothing; Campaign, Person and Stat are always visible.

### Dice panel

- **Empty**: before the first roll, the result area says to choose a die or enter a notation; recent rolls say rolls will appear here; Clear history is unavailable.
- **Loading**: a roll shows briefly as rolling; buttons wait until it finishes.
- **Error**: a notation outside the limits shows its message under the form and keeps the notation for correction. An insert that cannot be saved is a failed save of the note (rule 48).
- **Hidden**: the panel shows nothing from hidden records. Stats and Stat values are always visible (default 3). "Insert into note" is offered only for a note that is open, which the viewed Person can already see.

### App-wide

- **First launch**: the start screen with Open campaign and New campaign. No shell bar and no page.
- **Remembered folder missing**: "Can't find" and the folder's name, its place, Open another and New campaign.
- **Opening**: a spinner with the folder's name, shown at once, no placeholder rows.
- **Not a campaign**: the folder's name, one line, Open another and New campaign (gap 14).
- **Hidden**: none of these screens shows campaign records.

## Changes from `archive/HANDOFF.md`

This spec supersedes the following parts of the earlier design. Everything not listed stays as approved there.

- **Rail ("Player/Notes revision")**: superseded. The rail now holds Player, World, Notes and Map (Map coming later), the Dice toggle, and the campaign folder control at the bottom. Player is no longer the fixed opening tab (gap 24).
- **Dice**: the standalone Dice page (in the current app, not the handoff) is removed and replaced by the Dice panel.
- **Opening another folder**: superseded. The handoff's folder-name button belonged to the Notes sidebar and opened a menu with only "Open folder..." and said not to add other items without asking. The campaign folder control now lives in the rail, and its menu adds Campaign settings, Refresh, and New campaign.... This spec is that ask; the user should confirm it.
- **Refresh**: no longer only in the Notes sidebar toolbar; the campaign menu has it too, and it reloads the whole campaign. Whether the Notes toolbar keeps its button is for `04-notes.md`.
- **First launch**: superseded. "Open a folder to start" and "Pick a folder of notes and images" become a campaign start screen with Open campaign and New campaign. There is still no Notes sidebar on it.
- **Remembered folder missing**: kept, with New campaign added beside Open another.
- **Opening a folder**: kept unchanged.
- **New**: the not-a-campaign state, the New campaign form, Campaign settings, the shell bar, the "viewing as" menu.
- **Dirty-refresh dialog**: its wording named one note (handoff) or "Workspace" and "player" (current app); new wording is gap 36. Its three choices are unchanged.
- **Save chips, failed-save banner, close after a failed save, autosave**: unchanged.
- **Copy rule**: unchanged (rule 50).
- **Player profile and reserved files ("Player/Notes revision")**: the one-player profile, its reserved files at the folder's root and its shared description save session are superseded by the ontology's model and by `02-player.md`. Not migrated (rule 11).
- **Remembered across launches**: sidebar width, collapse and hidden files are kept and now belong to the Notes tree (rule 53).

## Gaps

Ontology gaps are carried in with the ontology's recommendation unchanged.

1. **How the role is recorded.** Ontology gap 1. Recommendation: a role field on Person with the values player and game master; exactly one Person holds game master at a time; the game master may also play a Character.
2. **Who takes a turn.** Ontology gap 2. Recommendation: every Person in the Round's turn order; the Campaign's order starts with every Person who has an active Character, and People are added to or removed from it by hand.
3. **A Person leaving.** Ontology gap 3. Recommendation: a Person is never deleted, because records name them as Author and Owner; they are marked as having left and drop out of the turn order.
4. **Stats added or removed mid-campaign.** Ontology gap 6. Recommendation: when a Stat is added, every Character's value starts as "not set" until entered; a removed Stat is hidden, not deleted, so saved Rolls and change histories keep its name.
5. **Opening rounds.** Ontology gap 8. Recommendation: the first Round opens when the campaign is created, starting on its start date; Advance closes the Round and opens the next at once, asking for its length with the previous length as the default.
6. **Reopened rounds.** Ontology gap 9. Recommendation: notes, blocks, marks and decided Proposals can be corrected, but not the length or start date while later Rounds exist; the latest Round stays current; closing the reopened Round retakes only its own snapshots.
7. **Author of records the app creates.** Ontology gap 10. Recommendation: the Author is the Person in "viewing as" who opened or advanced the Round.
8. **Rolls in other notes.** Ontology gap 15. Recommendation: yes; it belongs to that note only.
9. **Stat names.** Ontology gap 29. Recommendation: the Stat list starts empty and the table enters its names.
10. **Natural 1s and 100s.** Ontology gap 32. Recommendation: no special meaning; the verdict is free text.
11. **When the campaign starts.** Ontology gap 36. Recommendation: a required start date entered when the campaign is created.
12. **The record of changes.** Ontology gap 42. Recommendation: each record keeps who last changed it and when (real-world time) now; a full list of changes that people can look through is later.
13. **The first Person.** Addressed to the ontology: the Campaign's Author is "the Person who created the campaign", but no Person exists before the campaign does, and the ontology does not say how the first Person is made. Recommendation: New campaign asks for the creator's name and role; that Person is the first in People, the Author of the Campaign and of their own Person record, and the first Person in "viewing as".
14. **Where a new campaign goes, and folders that already hold files.** Recommendation: New campaign always makes a new, empty folder at a place the person chooses; an existing folder that is not a campaign is not converted, and its material is copied in by hand (**Existing data**).
15. **Who edits the Economy list and the Divergence list.** Addressed to the ontology: its Campaign life cycle says the Campaign's "fields change through the app shell", but these two lists are World matters. Recommendation: they start empty (for the Economy list, see ontology gap 37, whose recommendation is that the Economy list starts empty) and are edited on the World tab; the app shell edits Name, Start date, People, Turn order and the Stat list.
16. **Where the usual turn order is edited.** Recommendation: in Campaign settings, under People, since it is a Campaign field; the World tab changes only a Round's copy.
17. **Changing the start date after creation.** Recommendation: editable until the first Round closes, and fixed after that.
18. **Asking before changing who is game master.** Recommendation: yes, a short dialog naming who becomes a player and who will gain and lose sight of game-master-only records.
19. **Who is selected in "viewing as" when a campaign opens.** Recommendation: the Person last selected for that campaign on this machine; the creator right after creation.
20. **Switching "viewing as" with unsaved edits.** Recommendation: treat it as navigation: it waits for the latest draft, and a failed save blocks it until Retry succeeds, so every edit is recorded against the Person who made it.
21. **Open pages after switching "viewing as".** A note, account or event on screen may be hidden from the new viewer. Recommendation: the page stays where it is and shows its own hidden state in place; each tab's spec defines that state.
22. **Saying on screen that hidden is not protected.** Recommendation: one plain line in the "viewing as" menu: hidden means not shown, not protected, and anyone on this machine can switch to see it.
23. **Preferences per machine or per Person.** Recommendation: per machine, as today, since the first version runs on one machine; per Person comes with sync.
24. **Which tab opens.** Recommendation: the tab last used on this machine; Player the first time a campaign opens, as today.
25. **Line numbers and live preview.** The preference predates live preview. Recommendation: the toggle applies in raw source only; live preview shows no line numbers.
26. **Date, Round and whose turn on every tab.** The README places them on the World tab. Recommendation: a one-line strip in the shell bar on every tab, with the World tab still showing them in full.
27. **Dice with no campaign open.** Recommendation: the panel works, as Dice does today without a folder: plain rolls only, no stat picker, no insert, and a temporary session history.
28. **Dice panel across tab changes.** Recommendation: it stays open until closed from the rail or its own close button.
29. **Whose recent rolls.** Recommendation: one list per campaign for the session, shared across "viewing as", each row naming the Person who rolled; switching campaigns keeps each campaign's list for the session, as today.
30. **Stat picker with no active Character.** Recommendation: the picker is disabled and the roll is a plain roll.
31. **Whose stats when rolling in another Person's turn note.** The README says "a stat from the character"; this spec reads it as the viewed Person's active Character. A game master rolling in a player's turn note would need that Character's stats. Recommendation: when the open note is a turn note, the picker also lists the Stats of that turn note's Character. The same question arises when the Player tab shows a Character other than the viewed Person's active one (`02-player.md` lets any Person's current or former Character be opened). Recommendation for that case: the panel always uses the viewed Person's active Character, whichever Character the Player tab shows.
32. **Numbers written in the notation.** Addressed to the ontology: a Roll has a Die result and a One-off modifier, but notation such as 2d6 + 1 carries its own number. Recommendation: the Die result is everything the notation produces, including numbers written in it; the One-off modifier is only the separate field.
33. **Target number.** The panel has no target number field. Recommendation: the target number and verdict are filled in on the roll block after insertion, as `04-notes.md` defines.
34. **Inserting the same roll twice.** Recommendation: a roll can be inserted once; "Insert into note" is unavailable until the next roll.
35. **Banner wording when one edit writes several records.** Recommendation: "Couldn't save all of this change, so you're staying here. Your changes are still here." with Retry.
36. **Dirty-refresh dialog wording.** Recommendation: title "Campaign has unsaved changes"; body "Refreshing reloads the campaign from disk."; note "Save and Refresh writes your version over any changes made in other apps."
37. **What counts as an open note for "Insert into note".** Recommendation: the note being edited on the current page: on the Notes tab, its active note tab; on Player or World, a turn or interterm note shown there for editing. With none, the button is not shown.
38. **Quick rolls and the form's stat and modifier.** The current app's quick rolls leave the notation unchanged, but the panel now has a stat and a separate one-off modifier, and nothing says whether a quick roll adds them. Recommendation: a quick roll uses the stat and modifier set in the form.
39. **The first Round's length.** `03-world.md` gap 2 (the first Round's length), resting on ontology gap 8 (gap 5). Recommendation (`03-world.md`): the campaign-creation step (app shell) asks for the first Round's length beside the start date, with nothing preselected.
40. **Discard and Reload after a failed save.** Rule 48 makes Refresh wait until the save succeeds, while rule 51 offers Discard and Reload on Refresh; the current app does not say whether a draft that cannot be saved can be discarded. Recommendation: after a failed save, Refresh still opens the dirty-refresh dialog; Discard and Reload drops the draft and reloads, and Save and Refresh retries the save first and stays blocked if it fails again.
