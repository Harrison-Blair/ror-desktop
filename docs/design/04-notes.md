# 04 Notes

Status: draft. This is the spec for the Notes tab. It uses the vocabulary and fields of `00-ontology.md` and states only what `README.md` settles or adopts. Rules are tagged **settled** (decided by the user) or **default** (adopted, open to change). Anything not decided is a numbered question in [Gaps](#gaps), marked "(gap N)" where it applies, or a question already raised by the ontology, marked "(ontology gap N)".

## Contents

- [Purpose](#purpose)
- [Features](#features)
- [Layout](#layout)
- [Behaviour](#behaviour)
- [States](#states)
- [Changes from `archive/HANDOFF.md`](#changes-from-archivehandoffmd)
- [Gaps](#gaps)

## Purpose

The Notes tab is where the campaign is written. It holds every Note in the campaign folder, including turn notes and interterm notes, and the Images and Table files beside them. Play is written here: a Person writes their Character's Turn as prose in a turn note, and the game master writes the Interterm in the interterm note (**Turn notes**). Where structure is wanted, a note holds roll, money and event blocks that are the same records the Player and World tabs show (**Blocks are shared records**), and chart and table file blocks that show numbers.

The page has five parts:

- the **file tree**, carried over from the current app;
- **tabs**, one for each open note, image or table file;
- the **editor**, with live preview and a switch to raw source;
- the **calendar**, which shows notes by game date;
- the **table file grid**, for editing a Table file.

It hands over to other specs at these points:

- `01-app-shell.md`: the rail, the campaign folder, "viewing as", the Dice panel, roles, managing people, and what a person sees when a save fails.
- `02-player.md`: a Character's page, its Accounts and their Ledger entries.
- `03-world.md`: opening a Round (which creates the turn notes and the interterm note), the Round section, the timeline, Events, the economy and the Advance step.
- `06-storage.md`: how notes, blocks and table files are written to disk, where app-created notes are kept, and what happens when one edit writes several records.

## Features

| Feature | When | Note |
| --- | --- | --- |
| File tree with folders, notes, images and other files | now | Carried over from the current app |
| Table files in the tree | now | Created, renamed, moved and deleted like a note |
| Turn notes and interterm notes created by the app | now | Created when World opens a Round; where they sit in the tree is gap 1 |
| Open notes as tabs | now | One tab per open note, image or table file (gap 9) |
| Save state per tab | now | Autosave and file safety carried over; save failures belong to the app shell |
| Live preview in one pane | now | What live preview shows is gap 11 |
| Switch to raw source | now | Per tab (gap 12) |
| Images inline and in the viewer | now | Carried over |
| Markdown tables | now | Shown as tables in live preview |
| Wiki links with name suggestions | now | Same-named notes told apart by folder |
| Standard Markdown links | now | |
| Links to Characters and Events | now | What they open is gap 10 |
| "Linked from" list | now | Leaves out what the viewer cannot see |
| Links updated on rename or move inside the app | now | |
| Broken and missing links shown | now | Broken: renamed outside the app. Missing: deleted |
| Roll block | now | Inserted from the Dice panel |
| Money block | now | One record with its Ledger entry |
| Event block | now | One record with its Event |
| Unposted blocks in copied notes | now | Posted when someone says so |
| Chart block | now | From a table file, a Markdown table or app data |
| Table file block | now | Display-only |
| Headings as actions in turn notes | now | |
| Promote an Action to an Event from its heading | now | Gap 30; ontology gap 26 |
| Note header: game date, visibility, owner | now | |
| Notes calendar | now | Notes only; views are gap 18 |
| Table file grid with on-screen sorting and column totals | now | Sorting does not change the file |
| Events on the calendar | later | **Notes calendar** |
| Rounds on the calendar | later | **Notes calendar** |
| Full spreadsheets with formulas | later | **Tables and charts** |
| Synced notes between several machines | later | **Campaign**, **Sync** |
| Hidden notes protected, not only not shown | later | **Secrets** |
| Real permissions on who may edit a note | later | **Who may change what** |
| Amounts in currencies other than US dollars | later | **Currency** |
| Registries of countries, organisations and people | later | **Other world things** |
| A list of changes people can look through | later | Ontology gap 42 |

## Layout

The wireframes settle what goes where, not how it looks. Colours, fonts, sizes and exact controls are left to the visual mockup pass (**Process**).

### Notes tab

```
+----+------------------+------------------------------------------+-------+
| R  | TREE             | TAB STRIP                                | DICE  |
| A  | [Campaign name]  | [Round 3 - Ada x][Chicago x][prices x] + | PANEL |
| I  | [+N][+F][+T][R][o]+------------------------------------------+       |
| L  | [Notes|Calendar] | NOTE HEADER                              | (app  |
|    |                  | Round 3 - Ada   Turn note  [Insert v]    | shell,|
| (  | v Rounds         | Date  Feb-May 1962   Everyone   Owner Ada| when  |
| a  |   v Round 3      | [Done]                [Live | Source]    | open) |
| p  |     Ada          +------------------------------------------+       |
| p  |     Ben          | EDITOR                                   |       |
|    |     Interterm    | Prose, headings, links, images, tables   |       |
| s  | > People         | and blocks, in one centred column.       |       |
| h  |   Chicago        |                                          |       |
| e  |   prices         |                                          |       |
| l  |   map            +------------------------------------------+       |
| l  |                  | LINKED FROM (collapsible)                |       |
| )  |                  | Chicago - People/   Round 2 - Ben        |       |
+----+------------------+------------------------------------------+-------+
```

- **Rail**: the app shell's rail. Not described here.
- **Tree**: the campaign name, the toolbar (New note, New folder, New table, Refresh, show hidden files), a switch between the tree and the calendar, and the tree itself. Where turn and interterm notes sit is gap 1.
- **Tab strip**: one tab per open note, image or table file, each with its name, its save state and a close button. A tab whose note is hidden from the viewer shows as described in States.
- **Note header**: the note's name, its kind (ordinary note, turn note, interterm note), the Insert menu (gap 13), its Game date, Visibility and Owner, the switch between live preview and raw source, and, on turn and interterm notes, the done mark (gap 23).
- **Editor**: the note's body.
- **Linked from**: every Link that points to this note, each shown with its source's name and folder.
- **Dice panel**: the app shell's panel, beside the page when open.

### Tree menus and toolbar

```
TOOLBAR                       FOLDER MENU            FILE MENU
+--------------------------+  +-----------------+    +-----------------+
| [Campaign name v]   [<<] |  | New note        |    | Rename          |
| [+N] [+F] [+T]  [R] [o]  |  | New folder      |    | Move to...      |
+--------------------------+  | New table       |    | Duplicate       |
                              | --------------- |    | --------------- |
                              | Rename          |    | Move to Trash   |
                              | Move to...      |    +-----------------+
                              | --------------- |
                              | Move to Trash   |
                              +-----------------+
```

- **Toolbar**: the campaign name button (owned by the app shell), collapse, New note (+N), New folder (+F), New table (+T), Refresh (R) and show hidden files (o).
- **Folder menu**: New note, New folder and New table create inside the folder. "Move to..." is gap 4.
- **File menu**: "Move to..." is gap 4; "Duplicate" is gap 5. On a turn or interterm note, Move to Trash follows gap 3.

### Note header

```
+------------------------------------------------------------------------+
| NAME                    KIND               INSERT                      |
| Chicago                 Note               [Insert v]                  |
+------------------------------------------------------------------------+
| GAME DATE               VISIBILITY         OWNER        CHANGED        |
| [1962 v]  [clear]       [Everyone v]       [Ada v]      by Ben         |
+------------------------------------------------------------------------+
| ACTIONS (turn and interterm notes)          VIEW                       |
| [Done] [Skipped]                            [Live preview | Source]    |
+------------------------------------------------------------------------+
```

- **Name**: the Note's Name; renamed from the tree or here.
- **Kind**: the Note's Kind. A turn note also shows its Round, Person and Character; an interterm note shows its Round.
- **Insert**: the menu that inserts blocks (gap 13).
- **Game date**: the Note's Game date, with a choice of day, month, year or range. On a turn note it is the Round's period and cannot be edited. On an interterm note, see ontology gap 11.
- **Visibility**: the Note's Visibility level.
- **Owner**: the Note's Owner, chosen from the campaign's People.
- **Changed**: who last changed the note (ontology gap 42).
- **Actions**: the Turn's Done and Skipped marks, or the Interterm's Done mark (gap 23). Not shown on ordinary notes.
- **View**: the switch between live preview and raw source.

### Turn note

```
+------------------------------------------------------------------------+
| NOTE HEADER: Round 3 - Ada   Turn note   Ada plays Ada Ross            |
| Feb-May 1962 (the Round's period)    Everyone   Owner Ada  [Done]      |
+------------------------------------------------------------------------+
| TURN AS A WHOLE                                                        |
| Prose before the first heading.                                        |
| [money block: Salary  +$1,200  1 Feb 1962  Bank]                       |
|                                                                        |
| ACTION  ## Bribe the alderman                      [Promote to event]  |
| Prose for this action.                                                 |
| [roll block]                                                           |
| [money block]                                                          |
|                                                                        |
| ACTION  ## Buy the warehouse                       [Promote to event]  |
| Prose.                                                                 |
| [event block]                                                          |
+------------------------------------------------------------------------+
```

- **Note header**: as above, with the Round, the Person and the Turn's Character.
- **Turn as a whole**: prose and blocks above the first heading; its blocks belong to the Turn.
- **Action**: each heading, marked as an Action; the blocks under it, up to the next heading, belong to it.
- **Promote to event**: a control on each Action's heading that promotes the Action to an Event (gap 30, resting on ontology gap 26 and `03-world.md` gap 22, where promotion is started).

An interterm note has the same layout with no Character. Whether its headings are Actions is ontology gap 13.

### Roll block

```
+------------------------------------------------------------------------+
| ROLL  d100   by Ada (Ada Ross)                          [Edit] [x]     |
| DIE RESULT 41  + SCIENCE 63  + ONE-OFF 5  = TOTAL 109                  |
| TARGET 100                                                             |
| VERDICT  The alderman takes the money but talks.                       |
+------------------------------------------------------------------------+
```

- **Heading line**: the Roll's Dice, its Author and its Character; Edit (ontology gap 16) and Remove.
- **Sum**: Die result, the Stat's name with its Stat modifier, the One-off modifier and the Total. Parts that are absent are left out.
- **Target**: the Target number, when there is one.
- **Verdict**: the Verdict, which can be written later.

### Money block

```
POSTED
+------------------------------------------------------------------------+
| MONEY  Bank (Ada Ross)                                  [Edit] [x]     |
| 1 Feb 1962   -$5,000   Bribe for the alderman                          |
+------------------------------------------------------------------------+

NOT POSTED (in a copied note)
+------------------------------------------------------------------------+
| MONEY  Not posted                                       [Post] [x]     |
| Bank (Ada Ross)   1 Feb 1962   -$5,000   Bribe for the alderman        |
+------------------------------------------------------------------------+

EDITING
+------------------------------------------------------------------------+
| ACCOUNT     [Bank (Ada Ross) v]                                        |
| DATE        [1 Feb 1962]                                               |
| AMOUNT      [-5000] US dollars                                         |
| DESCRIPTION [Bribe for the alderman                    ]               |
|                                              [Cancel] [Save]           |
+------------------------------------------------------------------------+
```

- **Posted**: the Ledger entry's Account (with its Character), Date, Amount and Description; Edit and Remove.
- **Not posted**: the same fields, marked not posted, with Post instead of Edit.
- **Editing**: the Ledger entry's editable fields. Its Action comes from where the block sits, not from a field.

### Event block

```
+------------------------------------------------------------------------+
| EVENT  March 1962   Strike at the stockyards     Changed  [Edit] [x]   |
| Place: Chicago     Tags: labour, unrest          Everyone   Owner Ada  |
| In our world: The strike was settled in a week.                        |
| Description (first lines) ...                                          |
+------------------------------------------------------------------------+
```

- **Heading line**: the Event's Date, Title and Marker; Edit and Remove. An unposted event block shows "Not posted" and Post, as the money block does.
- **Details**: Place, Category tags, Visibility and Owner.
- **In our world**: shown only for changed and did-not-happen events.
- **Description**: the start of the Description.
- **Editing**: a form with the Event's fields, laid out like the money block's. Its Date and Marker are the ones the timeline shows; which date to enter follows default 2 (rule 44).

### Chart block and table file block

```
CHART BLOCK
+------------------------------------------------------------------------+
| CHART  from prices (table file)   line            [Edit] [x]           |
|  ^                                                                     |
|  |        ___/\__                                                      |
|  |   ____/       \___                                                  |
|  +--------------------------------------->                             |
| LEGEND  wheat   coal          SKIPPED  2 cells were blank or not numbers|
+------------------------------------------------------------------------+

TABLE FILE BLOCK
+------------------------------------------------------------------------+
| TABLE  prices (Economy/)                          [Open] [x]           |
| Year  | Wheat | Coal                                                   |
| 1960  | 1.80  | 6.10                                                   |
| 1961  | 1.95  | 6.40                                                   |
| TOTAL | 3.75  | 12.50                                                  |
+------------------------------------------------------------------------+
```

- **Chart heading**: the Source and the Chart kind (ontology gap 19); Edit and Remove.
- **Chart area**: the chart.
- **Legend**: the value columns drawn; a count of skipped cells (gap 31).
- **Table heading**: the Table file's Name and Folder; Open (in its own tab) and Remove.
- **Table body**: the file's rows and column totals, read-only (gap 28).

### Chart block setup

```
+------------------------------------------------------------------------+
| SOURCE   ( ) Table file      [prices (Economy/) v]                     |
|          ( ) Markdown table  [Year | Wheat | Coal  v]                  |
|          ( ) Economy item    [Wheat price v]                           |
|          ( ) Account         [Bank (Ada Ross) v]                       |
|          ( ) Net worth       [Ada Ross v]                              |
| LABELS   [Year v]                                                      |
| VALUES   [x] Wheat  [x] Coal                                           |
| KIND     [Line v]                                                      |
|                                                  [Cancel] [Insert]     |
+------------------------------------------------------------------------+
```

- **Source**: one of the five kinds of Source, each with its picker.
- **Labels** and **Values**: the Columns the chart names (gap 24). For app data the columns are fixed and only shown.
- **Kind**: the Chart kind (ontology gap 19).

### Remove-block question

```
+------------------------------------------------------+
| TITLE    Remove this money block?                    |
| BODY     It is also the entry "Bribe for the         |
|          alderman" in Bank (Ada Ross).               |
| ACTIONS  [Cancel] [Keep the entry] [Delete the entry]|
+------------------------------------------------------+
```

- **Title**: names the kind of block.
- **Body**: names the Ledger entry and its Account, or the Event and its date.
- **Actions**: Cancel, keep the record and remove only the block, or delete both.

### Link suggestions

```
EDITOR
| The deal went through [[Chic|                                          |
|                       +----------------------------------+             |
|                       | SUGGESTIONS                      |             |
|                       | Chicago          note  People/   |             |
|                       | Chicago          note  Places/   |             |
|                       | Chicago Tribune  event 1962      |             |
|                       | Chick Ross       character       |             |
|                       +----------------------------------+             |
```

- **Suggestions**: Notes, Characters and Events whose name or title matches what is typed, each with its kind; a Note also shows its folder, an Event its date. Anything the viewer cannot see is left out.

### Calendar

```
MONTH VIEW
+------------------------------------------------------------------------+
| [<]  March 1962  [>]          [Month | Year]        [Today: game date] |
+------------------------------------------------------------------------+
| WHOLE MONTH OR YEAR   Chicago (1962)   Strike notes (March 1962)       |
+------------------------------------------------------------------------+
| Mon     Tue     Wed     Thu     Fri     Sat     Sun                    |
|                          1       2       3       4                     |
| [=== Round 3 - Ada (Feb-May) ===================================>]    |
|  5       6       7       8       9      10      11                     |
|         Meeting                                                        |
| ...                                                                    |
+------------------------------------------------------------------------+
| UNDATED   14 notes have no game date                                   |
+------------------------------------------------------------------------+

YEAR VIEW
+------------------------------------------------------------------------+
| [<]  1962  [>]                [Month | Year]        [Today: game date] |
+------------------------------------------------------------------------+
| WHOLE YEAR   Chicago (1962)                                            |
+------------------------------------------------------------------------+
| JAN          | FEB              | MAR              | APR               |
| -            | Round 3 - Ada    | Strike notes     | Round 3 - Ada     |
|              | Round 3 - Ben    | Meeting (5 Mar)  | Round 3 - Ben     |
| MAY ...      | JUN ...          | JUL ...          | AUG ...           |
+------------------------------------------------------------------------+
```

- **Navigation**: previous and next, the period shown, the view switch (gap 18) and a button that returns to the current game date.
- **Whole month or year**: notes whose Game date is a month or a year covering the period shown (gap 19).
- **Days** or **months**: notes dated to a day, and ranges drawn across the days or months they cover.
- **Undated**: a count of notes with no Game date (gap 19).

### Table file grid

```
+------------------------------------------------------------------------+
| TAB HEADER  prices (Economy/)                      [Saved]  [Rows v]   |
+------------------------------------------------------------------------+
| COLUMN HEADERS  Year ^  | Wheat     | Coal      | [+ column]           |
+------------------------------------------------------------------------+
| CELLS           1960    | 1.80      | 6.10      |                      |
|                 1961    | 1.95      | 6.40      |                      |
|                 [+ row]                                                |
+------------------------------------------------------------------------+
| TOTALS          -       | 3.75      | 12.50     |                      |
+------------------------------------------------------------------------+
| SORT NOTE       Sorted by Year on screen only. The file is unchanged.  |
+------------------------------------------------------------------------+
```

- **Tab header**: the Table file's Name and Folder, its save state, and the menu for adding and removing rows and columns (gap 27).
- **Column headers**: the Columns, which sort the grid when clicked; the current sort is marked.
- **Cells**: the Rows, edited in place.
- **Totals**: the Column totals (gap 26).
- **Sort note**: shown while the grid is sorted.

## Behaviour

Rules are numbered once across the section. A rule taken from the README cites the bold label of the "Settled so far" bullet or the number of the default, and is tagged settled or default.

### File tree

1. One opened folder is a campaign. The tree lists the campaign folder's folders, notes, images, table files and other files. [**Campaign**; settled]
2. The tree, its toolbar, inline naming, name checks, context menus, keyboard support, hidden files, resizing and collapsing work as in the current app. [**Existing app**; settled]
3. The toolbar and the folder menu add New table, which creates an empty Table file. A Table file is "created, edited, renamed, moved and deleted like a note" (ontology, Table file).
4. Countries, organisations and non-player characters are ordinary Notes: "Non-player characters are notes, not sheets", and there is no registry for now. [**Other world things**, **Identity**; settled]
5. A person does not create turn notes or interterm notes. The app creates them when the World tab opens a Round: "Each player gets one note per round, created for them." Where they appear in the tree is gap 1; the hand-over is to `06-storage.md`. [**Turn notes**; settled]
6. Records the app keeps for itself are not listed as notes (gap 2).
7. Moving a note in the app is gap 4. Copying a note in the app is gap 5.
8. Renaming a note or folder inside the app updates every link to it. The current rename warning that links are not rewritten goes away; the extension warning stays. [Default 13; default]
9. Move to Trash on a note that holds money or event blocks: ontology gap 18. On a turn or interterm note: gap 3.
10. Refresh reloads the tree and every open tab from disk, as today. A note renamed outside the app is found on Refresh, and links to its old name show as broken. [Default 13; default]

### Tabs

11. "Open notes are tabs." [**Links and tabs**; settled] Opening a note from the tree, the calendar, a link or a "linked from" list opens or switches to its tab (gap 9). Images and table files open in tabs too (gap 9).
12. Clicking a tab switches to it. The close button closes it. Each tab has its own view, live preview or raw source (gap 12).
13. Each tab shows its own save state: unsaved, saving, saved or save failed. Edits autosave; closing a tab, switching away and closing the window wait for the latest draft, as switching notes does today. [**Existing app**; settled] What a person sees when a save fails belongs to `01-app-shell.md`.
14. Whether open tabs reopen on the next launch is part of gap 9.

### Editor

15. "Live preview in one pane, with a switch to raw source." [**Editing**; settled] What live preview shows while the cursor is in a line is gap 11. The switch applies to one tab (gap 12).
16. "Images render inside notes and open in the viewer." Clicking an image inside a note opens the image in its own tab with the fitted viewer. [Default 16; default]
17. A Markdown table shows as a table in live preview and as text in raw source. It can be a chart's Source (rule 52).
18. Every change to a note records the Person picked by "viewing as": "every change records who made it". The header shows who last changed the note (ontology gap 42). [**Who may change what**; settled]
19. "Everyone can edit everything." The editor does not lock any note for any Person or role. [**Who may change what**; settled]

### Links

20. "Wiki links with name suggestions, and standard Markdown links also work." Typing the start of a wiki link opens suggestions; choosing one inserts the link. [**Links and tabs**; settled]
21. "Links can also point to characters and events." Suggestions include Characters and Events as well as Notes, each labelled with its kind (gap 10). What clicking such a link opens is gap 10. [**Links and tabs**; settled]
22. "Two notes with the same name are told apart by folder in suggestions." A hand-typed wiki link whose name matches several notes is gap 29. [Default 13; default]
23. "Each note has a 'linked from' list." It lists every Link that points to the note: from other notes, and from fields such as an Event's linked notes or an Asset's linked note (ontology, Link). [**Links and tabs**; settled]
24. "Renaming a note updates links to it." Renaming or moving a note or folder inside the app updates every link to it, in every note and field. [**Links and tabs**, settled; default 13, default]
25. "Renames made outside the app show as broken links." [Default 13; default]
26. "Deleting something that is linked to leaves the links in place, shown as missing." This covers notes, Characters, Events, images and table files. [Default 14; default]
27. "Link suggestions, 'linked from' lists, charts ... leave out anything the viewer cannot see." A link in a visible note to a note the viewer cannot see is gap 20. [Default 4; default]

### Blocks

28. "Roll, money and event blocks can be inserted where structure is wanted; a block shows inside the note and also updates the ledger or timeline." [**Turn notes**; settled] Blocks are inserted at the cursor from the note header's Insert menu (gap 13); roll blocks come from the Dice panel (rule 33).
29. "A money or event block in a note and its ledger entry or timeline event are one record shown in two places. Editing either changes both." Editing a posted block edits the Ledger entry or Event; editing them on the Player or World tab changes the block. [**Blocks are shared records**; settled]
30. "Removing the block asks whether to keep or delete the entry." Keep removes the block and leaves the Ledger entry or Event in place; delete removes both. Cancel leaves both. [**Blocks are shared records**; settled] Undo after either choice is gap 15.
31. "Copying a note makes copies that are not posted until someone says so." In the copy, each money and event block is marked not posted and has no Ledger entry or Event (the ontology's Posted field is no). Post creates the record. [**Blocks are shared records**; settled] Roll blocks in a copy: gap 8. Copies made outside the app: gap 6. Pasting blocks: gap 7.
32. A block whose record was deleted from its own page: gap 16.

#### Roll block

33. "A roll can pick a stat from the character and be inserted into the open note as a roll block." The open note is the active tab. "Casual rolls still work and are not saved." [**Dice**; settled] The Dice panel itself belongs to `01-app-shell.md`.
34. "Rolls are saved with the action they resolved." A roll block under a heading in a turn note belongs to that Action; above the first heading, to the Turn as a whole. [**Resolution**, **Actions**; settled] Roll blocks in other notes: ontology gap 15.
35. A roll block shows the Roll's fields: "die result, plus an optional stat, plus an optional one-off modifier, giving a total and a free-text verdict. A target number is optional. Any dice notation is allowed; d100 is the default." [**Rolls**; settled]
36. "A saved roll keeps the modifier it was rolled with, even if the stat changes later." [Default 12; default]
37. Which parts of a saved Roll can be edited: ontology gap 16. Natural 1s and 100s: ontology gap 32.
38. Removing a roll block removes the Roll, since there is no other copy (ontology, Roll). Whether removing it asks first is part of gap 15.

#### Money block

39. A money block shows its Ledger entry: "date, amount, description, optional link to an action". The link to an Action comes from the block's place under a heading. [**Money**, **Actions**; settled]
40. Amounts are in US dollars. [**Currency**; settled]
41. "A ledger entry ... is stored as a day, defaulting to the first day of the current round." Which date a block in an older Round's note starts with, and which Account it starts with, are gap 14. [Default 7; default]
42. A money block whose Account the viewer cannot see: ontology gap 17.

#### Event block

43. An event block shows its Event: "a date that can be a day, a month, a year or a range; a title; a description; optional category tags; an optional place; links to notes and characters. Only the date and title are required." [**Events**; settled]
44. "The 'in our world' line is asked for only on changed and did-not-happen events." An unmarked event block shows no marker. [Default 1; default] The form edits the same Date and Marker the timeline shows (rule 29): "A changed event sits at the date it happened in the game. A did-not-happen event sits at its real-world date." [Default 2; default]
45. An event block inserted in an interterm note is an Event "created during an interterm". Whether one inserted under a heading in a turn note counts as promoted from that Action is ontology gap 26. [**Events**; settled] "Events are created ... promoted from a player's action": the Notes tab receives `03-world.md` gap 22 (where promotion is started) with a Promote to event control on each Action's heading in a turn note (gap 30). How promotion works is ontology gap 26.
46. An event block shows and edits the Event's Visibility and Owner, since they belong to the shared record (rule 29). A note and its Event at different levels: ontology gap 17.

#### Chart block

47. "Chart blocks draw from a table file, a Markdown table, or app data such as an economy item, an account or net worth." [**Tables and charts**; settled]
48. "Chart blocks name their columns. Blank or non-numeric cells are skipped." [Default 15; default] The block shows how many cells it skipped (gap 31). Which columns a chart names: gap 24. Chart kind: ontology gap 19.
49. A chart from an Account draws its balance over time. A chart from net worth draws the Character's Net-worth snapshots: "Net worth is charted per round." [**Net worth**, settled; default 11, default]
50. Charts leave out anything the viewer cannot see. [Default 4; default] A net-worth chart for a Character with hidden accounts: ontology gap 22.
51. A chart whose Source was deleted shows the Source as missing; one whose named column is gone shows which column is missing. [Default 14; default]
52. A chart from a Markdown table: which tables it may use is gap 25.
53. A chart block is display-only. Removing it removes only the block (ontology, Block).

#### Table file block

54. A table file "can be shown inside a note". The block is display-only: it shows the file's rows and totals (gap 28) and opens the file in its own tab. Removing it removes only the block. [**Tables and charts**; settled]
55. A table file block whose file was deleted shows it as missing. [Default 14; default]

### Turn notes and interterm notes

56. "A turn is a note. Each player gets one note per round, created for them, and writes prose as today." [**Turn notes**; settled]
57. "Each round has one turn per person. The turn note belongs to the character that was active when the round opened." The header names the Person and that Character. [**Turn notes and people**; settled]
58. "Turns are written as notes today, so the structured turn format is exploratory and must stay close to note-writing." A turn note uses the same editor, links and blocks as any note. [**Where play happens**; settled]
59. "Every turn and the interterm in that round cover the same period." "A turn note is dated to its round": its Game date is the Round's period and is not edited by hand. [**Round length**, settled; default 7, default] Round periods "run date-to-date" (default 6). The interterm note's date: ontology gap 11.
60. "The game master's interterm note works the same way." The Interterm is "events and narration": an interterm note holds prose and event blocks, and any other block. [**Turn notes**, **Interterm**; settled]
61. "A heading in a turn note marks an action, and every block under it belongs to that action. Blocks above the first heading belong to the turn as a whole. Headings are optional." [**Actions**; settled] Heading levels: gap 22. Renaming or deleting a heading: ontology gap 12. Headings in an interterm note: ontology gap 13. Records with no heading: ontology gap 14.
62. "A turn is a list of free-form actions. An action can carry several dice rolls and can affect money, the world and later events": an Action may hold any number of roll, money and event blocks. [**Turns**; settled]
63. A turn or interterm note's Owner and Author: ontology gaps 10 and 11. Its Visibility starts as everyone, like any note: "The default is everyone." [**Secrets**; settled]
64. Done and skipped marks are set on the World tab's Round section ("Each turn and the interterm get a 'done' mark, and a turn can be skipped"). Whether the note header shows and sets them too is gap 23. [**Advancing**; settled]

### Game date, visibility and owner

65. "Each note can have a game date." It can be a day, a month, a year or a range ("Notes can use the looser dates events use"), and can be changed or cleared in the note header. [**Notes calendar**, settled; default 7, default] Range ends: ontology gap 28. The date a new ordinary note starts with: gap 17.
66. Dates are on "the real Gregorian calendar, since the setting is alternate history." [**Calendar**; settled]
67. "Notes, accounts and events each have one of three levels: everyone, me and the game master, game master only. The default is everyone." The header sets the note's level. [**Secrets**, settled; default 3, default] Who holds the game master role: ontology gap 1.
68. "Each private thing has an owning person, the creator by default and changeable. It is not whoever last edited it." The header sets the Owner. "Private things belong to the person." [Default 5, default; **People and characters**, settled]
69. "'Viewing as' picks a person." What the viewer sees follows that Person (rule 70 and States). [**People and characters**, **Multi-user**; settled]
70. "Hidden things stay hidden everywhere." A note the viewer cannot see is left out of the tree, the calendar, link suggestions and "linked from" lists. [Default 4; default] An open tab on such a note: gap 21.
71. "Until the server exists, hidden means not shown, not protected." The note is still on the machine. [**Secrets**; settled]
72. Table files and images are always visible; only notes, accounts and events are secret. [Default 3; default]

### Calendar

73. "The calendar shows notes only for now; events and rounds on the calendar are later." [**Notes calendar**; settled]
74. Each note with a Game date appears at that date; a range spans the days or months it covers. Turn notes appear across their Round's period. Views: gap 18. Month- and year-precision notes and undated notes: gap 19.
75. Clicking a note on the calendar opens it in a tab (rule 11).

### Table file grid

76. "Table files (CSV) open as an editable grid with sorting and column totals." [**Tables and charts**; settled]
77. "Sorting the grid on screen does not change the file or the chart." [Default 15; default]
78. Edits to cells save with the same autosave and file safety as notes. [**Existing app**; settled]
79. How totals treat non-numeric cells: gap 26. Adding and removing rows and columns: gap 27.
80. "Full spreadsheets with formulas are the eventual goal, not the first version." The first version has no formulas, no cell references, no merged cells and no several sheets in one file; a cell holds text, and only totals are worked out. What the table would put in a spreadsheet is ontology gap 41. [**Tables and charts**; settled]

### Coverage

| README item | Reflected in |
| --- | --- |
| **Tabs** | Purpose (the Notes tab) |
| **Campaign** | Rule 1; Features (synced notes, later) |
| **Time** | Rules 5, 56 (turn notes come from rounds); opening a round belongs to `03-world.md` |
| **Round length** | Rule 59 |
| **Turns** | Rule 62 |
| **Resolution** | Rule 34 |
| **Interterm** | Rule 60 |
| **Multi-user** | Rule 69; States (hidden) |
| **Stats** | not this page |
| **Rolls** | Rule 35 |
| **Character life** | not this page |
| **Identity** | Rule 4 |
| **Money** | Rule 39 |
| **Currency** | Rule 40; Features (later) |
| **Recurring money** | not this page |
| **Assets** | not this page |
| **Net worth** | Rule 49 |
| **Timeline and divergences** | Rule 44 (event block marker and "in our world" line) |
| **Events** | Rules 43, 45 |
| **Economy** | Rule 47 (economy item as a chart source) |
| **Other world things** | Rule 4; Features (registries, later) |
| **Where play happens** | Rule 58 |
| **Turn notes** | Rules 5, 28, 56, 60 |
| **Editing** | Rule 15 |
| **Links and tabs** | Rules 11, 20, 21, 23, 24 |
| **Notes calendar** | Rules 65, 73 |
| **Tables and charts** | Rules 47, 54, 76, 80 |
| **Who may change what** | Rules 18, 19 |
| **Secrets** | Rules 63, 67, 71 |
| **Existing data** | Changes from `archive/HANDOFF.md` |
| **Game master** | not this page (the Round section belongs to `03-world.md`) |
| **Dice** | Rule 33 |
| **Sync** | not this page beyond Features (synced notes, later) |
| **People and characters** | Rules 68, 69 |
| **Turn notes and people** | Rule 57 |
| **Blocks are shared records** | Rules 29, 30, 31 |
| **Actions** | Rules 34, 39, 61 |
| **Advancing** | Rule 64 |
| **Calendar** | Rule 66 |
| **Existing app** | Rules 2, 13, 78 |
| **Process** | Layout (introduction) |
| Default 1 | Rule 44 |
| Default 2 | Rule 44 |
| Default 3 | Rules 67, 72 |
| Default 4 | Rules 27, 50, 70 |
| Default 5 | Rule 68 |
| Default 6 | Rule 59 |
| Default 7 | Rules 41, 59, 65 |
| Default 8 | not this page |
| Default 9 | not this page |
| Default 10 | not this page |
| Default 11 | Rule 49 |
| Default 12 | Rule 36 |
| Default 13 | Rules 8, 10, 22, 24, 25 |
| Default 14 | Rules 26, 51, 55 |
| Default 15 | Rules 48, 77 |
| Default 16 | Rule 16 |
| Default 17 | not this page |

## States

### Tree

- **Empty**: a campaign folder with no notes shows "This folder is empty" and points to the New note, New folder and New table buttons, as today. Turn and interterm notes appear once the first Round opens.
- **Loading**: while the campaign opens, the tree is blank and the page shows the opening spinner, as today.
- **Error**: a failed create, rename or move keeps the naming box open with its message; a failed Move to Trash shows the existing Trash failed dialog.
- **Hidden**: notes the viewer cannot see are left out (rule 70).

### Tabs

- **Empty**: with no tab open, the editor area shows "No note open" and "Pick a note from the tree or the calendar."
- **Loading**: a tab opening a note shows its name and an opening message until the note is read.
- **Error**: a note that cannot be read shows a message in its tab and a Refresh suggestion; a failed save shows on the tab's save state, and the rest belongs to `01-app-shell.md`.
- **Hidden**: an open tab whose note becomes hidden when "viewing as" changes: gap 21.

### Editor

- **Empty**: an empty note shows an empty body ready for typing; an empty turn note shows its header with the Round, Person and Character.
- **Loading**: as for tabs.
- **Error**: an image that fails to load shows "Couldn't load this image" in place, as today; an unsupported file shows "Can't open this file".
- **Hidden**: a link to a note the viewer cannot see is gap 20.

### Links and "linked from"

- **Empty**: a note nothing links to shows "Nothing links here."
- **Loading**: the list fills in after the note opens; nothing is shown until it has.
- **Error**: a broken link is shown as broken (renamed outside the app), a missing link as missing (deleted); clicking either says which, and does not open anything.
- **Hidden**: sources the viewer cannot see are left out of "linked from"; targets they cannot see are left out of suggestions (rule 27).

### Roll, money and event blocks

- **Empty**: a block never has no record: an unposted block shows "Not posted" with Post.
- **Loading**: a block shows its frame until its record is read.
- **Error**: a block whose record cannot be found shows as missing (gap 16); a failed save of the record belongs to `01-app-shell.md` and `06-storage.md`.
- **Hidden**: a money or event block whose record the viewer cannot see: ontology gap 17.

### Chart and table file blocks

- **Empty**: a chart with no numeric cells, or an Account with no Ledger entries, or an Economy item with no Readings, shows "Nothing to chart yet". A table file block of an empty file shows its column headers only.
- **Loading**: the block shows its frame until its source is read.
- **Error**: a deleted source shows as missing; a named column that no longer exists is named in the block (rule 51).
- **Hidden**: a chart whose whole source is hidden from the viewer shows "Hidden" in place of the chart; a chart with some hidden parts leaves them out (rule 50, ontology gap 22). Table files are always visible.

### Turn notes and interterm notes

- **Empty**: before the first Round opens there are none (ontology gap 8 decides when it opens). A newly created turn note has only its header.
- **Loading**: as for tabs.
- **Error**: as for tabs.
- **Hidden**: a turn note set to "me and the game master" is left out for everyone else, like any note (rule 70).

### Calendar

- **Empty**: with no dated notes, the calendar shows the current game date's period and "No notes have a game date yet."
- **Loading**: the period shows with no notes until they are read.
- **Error**: a note whose date cannot be read is counted with the undated notes (gap 19).
- **Hidden**: notes the viewer cannot see are left out (rule 70).

### Table file grid

- **Empty**: a new table file shows one empty column header and an add-row control.
- **Loading**: the tab shows its name and an opening message.
- **Error**: a file that cannot be read as a table shows "Can't open this table" and leaves the file unchanged; a failed save shows on the tab's save state.
- **Hidden**: none. Table files are always visible.

## Changes from `archive/HANDOFF.md`

The earlier design stays wherever this list does not change it. These parts are superseded:

- **One open note** becomes **tabs**: opening a note no longer replaces the current one (rule 11).
- **Source editor** becomes **live preview with a switch to raw source** (rule 15). The line-number toggle, the monospace column and the editor's look are open to the mockup pass; the earlier look is no longer approved.
- **Rename warning** "Links to this note in other notes won't be updated" goes away, because renames inside the app update links (rule 8). The second warning, "Changing the extension may stop this file opening here", stays.
- **Table previews under their source** become tables shown in live preview (rule 17).
- **Toolbar A** gains New table; the folder menu gains New table; the file and folder menus may gain "Move to..." and "Duplicate" (gaps 4, 5).
- **Image viewer** opens in a tab rather than in place of the open note (rule 16, gap 9).
- **"No file open"** becomes "No note open" with the calendar named as a second way in.
- **Player/Notes revision**: its reserved one-player profile files and its `player-notes/` folder do not apply to a campaign folder. The old one-player profile files are not migrated (**Existing data**). What the campaign folder reserves belongs to `06-storage.md` (gap 2).
- **Opening another folder**: the folder button now opens a campaign; it belongs to `01-app-shell.md`.

Unchanged: tree rows, inline naming, name checks, context menu keys, hidden files, resizing, collapse, the dirty-refresh dialog, the Trash dialogs, the empty, loading and error messages not listed above, and the rule that messages never speak as the app in the first person.

## Gaps

### Gaps for this page

Each has one recommended answer.

1. **Where turn and interterm notes appear in the tree.** The hand-over is to `06-storage.md`. Recommendation: a folder per Round, named by its number and period, holding one turn note per Person, named after the Turn's Character, and the interterm note; the app keeps track of them by Id if they are renamed or moved.
2. **App records in the tree.** Whether the files that hold Characters, Accounts, Events and other records are listed. Addressed to `06-storage.md`. Recommendation: no; the tree lists only folders, notes, images, table files and other files people put in the campaign folder.
3. **Renaming, moving and trashing turn and interterm notes.** A Turn and an Interterm each require a note. Recommendation: they can be renamed and moved like any note, but Move to Trash is refused with a message saying the note belongs to a Round; its text can be cleared instead.
4. **Moving notes in the app.** The ontology says notes are "renamed or moved inside the app" but the current app has no move. Recommendation: drag a row onto a folder, and a "Move to..." item on the file and folder menus; links update (default 13).
5. **Copying a note in the app.** Rule 7 of the ontology assumes notes can be copied. Recommendation: a "Duplicate" item on the file menu makes "<name> copy" in the same folder, with its money and event blocks not posted.
6. **Notes copied outside the app.** A note copied in another program holds blocks that show records already shown elsewhere. Addressed to `06-storage.md`. Recommendation: when the app finds a second block showing the same record, it treats the one in the newer note as an unposted copy.
7. **Copying, cutting and pasting blocks.** **Blocks are shared records** covers copying a note, not a block. Recommendation: pasting a copied block makes an unposted copy; cutting and pasting within the app moves the block, which stays posted and asks nothing.
8. **Roll blocks in a copied note.** The ontology's Posted field covers money and event blocks only. Addressed to the ontology. Recommendation: a copied roll block is a separate Roll with the same values; it needs no posting, since a Roll has no other place.
9. **What opens where.** Recommendation: opening a note, image or table file from anywhere switches to its tab if open, or opens a new tab after the current one; open tabs reopen on the next launch.
10. **Links to Characters and Events.** How they are suggested and what clicking opens. Hand-over to `02-player.md` and `03-world.md`. Recommendation: suggestions label each match note, character or event; a Character link opens the Player tab on that Character, an Event link opens the World tab's timeline with the Event selected.
11. **What live preview shows.** Recommendation: formatting is shown rendered except in the line or table holding the cursor, which shows its source; blocks always show as blocks and are edited through their own form.
12. **The raw source switch.** Recommendation: the switch belongs to one tab, and each tab starts in live preview; in raw source a block shows as one read-only line that opens its form when clicked.
13. **How blocks are inserted.** Recommendation: an Insert menu in the note header with money block, event block, chart block and table file block, and "Roll..." which opens the Dice panel.
14. **A new money block's Account and date.** Default 7 says "the first day of the current round", which differs from the note's Round while a Round is reopened (ontology gap 9). Recommendation: in a turn note, the Account starts as the Turn's Character's first Account; elsewhere it must be picked; the date starts as the first day of the note's Round for turn and interterm notes, and of the current Round otherwise. This changes default 7 ("defaulting to the first day of the current round") for notes of an older Round, such as one being corrected while it is reopened.
15. **Removing a roll block, and undo after removing any block.** Recommendation: removing a roll block does not ask; undo puts the block back; if the record was deleted with it, undo restores the record with the same Id.
16. **A block whose record was deleted on its own page.** Mirrors the gap `02-player.md` and `03-world.md` raise for their side. Recommendation: the person deleting the Ledger entry or Event is asked whether to keep or delete the block, mirroring the question asked when the block is removed; a kept block shows as missing, like a link (default 14).
17. **The date a new ordinary note starts with.** Recommendation: the current game date, which can be changed or cleared.
18. **Calendar views.** Recommendation: a month view and a year view, because rounds are often a quarter or a year long; the calendar opens on the current game date.
19. **Loose and missing dates on the calendar.** Recommendation: month- and year-precision notes sit in a strip above the period they cover; ranges are drawn across the days or months they cover; undated notes are not placed, and a count of them is shown.
20. **A link to a note the viewer cannot see.** The ontology's Link State has no value for it. Addressed to the ontology. Recommendation: the link text shows as plain text, not clickable, and not as missing, so it does not claim the note was deleted.
21. **An open tab whose note becomes hidden.** When "viewing as" changes. Recommendation: the tab stays, named "Hidden note", with a message that the note is not shown to this Person; switching back shows it again.
22. **Which headings are actions.** **Actions** says "a heading". Recommendation: every heading, at any level, marks an Action, as worded; nesting carries no meaning.
23. **Done marks in the note.** **Advancing** gives each Turn and the Interterm a done mark but not where it is set. Hand-over to `03-world.md`. Recommendation: the turn or interterm note's header shows the marks and can set them; they are the same marks the World tab's Round section shows.
24. **Which columns a chart names.** Recommendation: a chart names one label column and one or more value columns; for app data these are fixed: Reading dates and values, Ledger entry dates and the running balance, or Round numbers and net worth.
25. **Markdown tables as a chart source.** Recommendation: only tables in the same note, picked by their header row; if the table is removed, the chart shows its source as missing.
26. **Column totals.** Recommendation: each total adds the column's numeric cells, skipping blank and non-numeric cells as charts do (default 15); a column with no numbers shows no total.
27. **Editing the grid's shape.** Recommendation: the first row is the header; rows and columns are added and removed from the grid; clicking a header sorts ascending, then descending, then not at all; the sort is not remembered.
28. **What a table file block shows.** Recommendation: the whole grid, read-only, unsorted, with column totals, and an Open button.
29. **A hand-typed wiki link matching several notes.** Default 13 covers suggestions only. Recommendation: it shows as broken until the folder is added, and hovering it lists the matching notes; the ontology's Link State needs no new value.
30. **Promoting an Action from its heading.** `03-world.md` gap 22 (where promotion is started) recommends: "from the Action's heading in the turn note, in the Notes tab; this page shows the resulting Event with its source." How promotion works is ontology gap 26 (recommendation: "promotion inserts an event block under the Action's heading, so the Event and the turn note stay one record"). Recommendation: a Promote to event control on each Action's heading in a turn note inserts an event block under that heading, with the Event's Action set to that Action, and opens the block's form.
31. **Showing skipped cells in a chart.** Default 15 says "blank or non-numeric cells are skipped" but not whether the chart says so. Recommendation: show the count of skipped cells in the legend.

### Carried from the ontology

Cited in the body as "ontology gap N". Each recommendation is copied unchanged from `00-ontology.md`.

- **Ontology gap 1. How the role is recorded.** Recommendation: a role field on Person with the values player and game master; exactly one Person holds game master at a time; the game master may also play a Character.
- **Ontology gap 8. Opening rounds.** Recommendation: the first Round opens when the campaign is created, starting on its start date; Advance closes the Round and opens the next at once, asking for its length with the previous length as the default.
- **Ontology gap 9. Reopened rounds.** Recommendation: notes, blocks, marks and decided Proposals can be corrected, but not the length or start date while later Rounds exist; the latest Round stays current; closing the reopened Round retakes only its own snapshots.
- **Ontology gap 10. Author of records the app creates.** Recommendation: the Author is the Person in "viewing as" who opened or advanced the Round.
- **Ontology gap 11. Owner and date of app-created notes.** Recommendation: a turn note is owned by its Turn's Person; an interterm note is owned by the game master; an interterm note is dated to its Round, like a turn note.
- **Ontology gap 12. What identifies an Action when its heading changes.** Recommendation: an Action keeps its Id when its heading is renamed; when the heading is deleted, its blocks join the Action above (or the Turn as a whole), and Ledger entries, Stat changes and Events that pointed at it point at the Turn instead. How the Id is kept with the heading belongs to `06-storage.md`.
- **Ontology gap 13. Headings in an interterm note.** Recommendation: they are not Actions; every block in an interterm note belongs to the Interterm, matching **Stats**, which attaches changes to "an action or an interterm".
- **Ontology gap 14. Records with no heading.** Recommendation: they attach to the Turn or Interterm as a whole, the same as blocks above the first heading; Ledger entries and Stat changes may point at a Turn or Interterm as well as an Action.
- **Ontology gap 15. Rolls in other notes.** Recommendation: yes; it belongs to that note only.
- **Ontology gap 16. Editing a saved Roll.** Recommendation: the die result, dice, stat and modifiers are fixed once saved; the target number and verdict can be edited.
- **Ontology gap 17. A block's note and its record at different levels.** Recommendation: the record keeps its own level; viewers who cannot see the record see the block as hidden in the note.
- **Ontology gap 18. Deleting a note that holds shared blocks.** Recommendation: ask once, listing the Ledger entries and Events, whether to keep or delete them all.
- **Ontology gap 19. Chart kind.** Recommendation: a chart block names its kind; the first version offers line and bar.
- **Ontology gap 22. Net-worth snapshots and hidden accounts.** Recommendation: a snapshot stores each Account's balance and each Asset's value as parts, so each viewer's total leaves out what they cannot see (default 4).
- **Ontology gap 26. Promoting an Action to an Event.** Recommendation: promotion inserts an event block under the Action's heading, so the Event and the turn note stay one record.
- **Ontology gap 28. Precision of range ends.** Recommendation: each end of a range is a day, month or year on its own.
- **Ontology gap 32. Natural 1s and 100s.** Recommendation: no special meaning; the verdict is free text.
- **Ontology gap 39. "Generated role notes".** Recommendation: ask what was meant before adding any record for it.
- **Ontology gap 40. Recording real-world play sessions.** Recommendation: no session record until asked for.
- **Ontology gap 41. What goes in a spreadsheet.** Recommendation: Table files stay plain grids until examples are given.
- **Ontology gap 42. The record of changes.** Recommendation: each record keeps who last changed it and when (real-world time) now; a full list of changes that people can look through is later.
