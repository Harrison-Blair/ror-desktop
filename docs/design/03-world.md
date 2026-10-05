# 03 World

Status: draft. This is the spec for the World tab. It uses the vocabulary and fields of `00-ontology.md` and states only what `README.md` settles ("Settled so far", tagged **settled**) or adopts ("Defaults adopted", tagged **default**, open to change). Anything not decided is a numbered question in [Gaps](#gaps), marked "(gap N)" where it applies. Ontology gaps are cited as "ontology gap N".

## Contents

- [Purpose](#purpose)
- [Features](#features)
- [Layout](#layout)
- [Behaviour](#behaviour)
- [States](#states)
- [Changes from `archive/HANDOFF.md`](#changes-from-archivehandoffmd)
- [Gaps](#gaps)

## Purpose

The World tab is where the table runs the shared side of play and keeps the shared world. It answers four questions at a glance: what the game date is, which Round is being played, whose turn it is, and what is left before the date can advance.

It has a header and four sections:

- **Round**: the current Round, its turn order, every Turn with its turn note, the Interterm with its interterm note, the Advance step, and the list of past Rounds.
- **Timeline**: the campaign's one timeline of Events.
- **Divergences**: the Events that depart from real history, together with the campaign's free-text list of broad divergences.
- **Economy**: the campaign's Economy items and their Readings, as a table and a chart.

The World tab owns opening a Round, which creates the Turns, turn notes, the Interterm and the interterm note, and the Advance step, including taking Net-worth snapshots. It hands over to other pages here:

- **Notes** (`04-notes.md`) owns editing turn notes and interterm notes, their layout, the event block and money block, and the wording of the shared-record rule (ontology rules 5 to 7, including the Posted field). Opening a note from this page opens it in the Notes tab.
- **Player** (`02-player.md`) owns a Character's accounts, assets, recurring items and net-worth chart. This page only makes Proposals and takes snapshots from them.
- **App shell** (`01-app-shell.md`) owns the rail, "viewing as", roles, managing people, the campaign's stat list, the Dice panel, and what a person sees when a save fails.
- **Storage** (`06-storage.md`) owns how and in what order records are written, including when one action on this page writes several records.

## Features

| Feature | When | Note |
| --- | --- | --- |
| Header: game date, Round number and period, whose turn it is | now | Shown above every section |
| Section switcher: Round, Timeline, Divergences, Economy | now | |
| Open a Round and choose its length (month, quarter, year) | now | First Round and next Round: gaps 1, 2 |
| Round's turn order, changed by hand or shuffled | now | Does not change the campaign's usual order |
| Turn list with done and skipped marks and a link to each turn note | now | Every Turn of the Round, beside the interterm note |
| Interterm with its note and done mark | now | |
| Advance: soft checklist of unfinished items | now | Lets the table go ahead with unfinished Turns and Interterm |
| Advance: decide each Proposal (accept, edit, skip) | now | Required before the Round closes |
| Advance: take Net-worth snapshots | now | One per Character (gap 14) |
| Reopen a closed Round to correct it | now | What may change: gap 3 |
| Past Rounds list | now | |
| Timeline of Events in date order, any date precision | now | Ordering mixed precisions: gap 18 |
| Add and edit an Event (date and title required) | now | |
| Event marker and "in our world" line | now | Marker optional |
| Category tags, place, linked notes and characters on an Event | now | Place is text (gap 28) |
| Event visibility level and Owner | now | |
| Promote an Action to an Event | now | How and where: gaps 21, 22 |
| Event made by an event block shows its source note | now | Shared record; detail owned by Notes |
| Delete an Event | now | Links stay, shown as missing; block: gap 27 |
| Filter the timeline | now | Not decided: gap 19 |
| Events on the Notes calendar | later | README defers events on the calendar |
| Divergences view: marked Events and the divergence list | now | Which markers: gap 30 |
| Add, edit, reorder and delete Divergence entries | now | |
| Economy list: add, rename and delete Economy items | now | |
| Mark an Economy item as a price | now | How: gap 31 |
| Readings: add, correct and delete, with an optional note | now | Entered on demand, not every Round |
| Table and chart per Economy item | now | |
| Pre-fill Readings from real history where the world has not diverged | now | Source not chosen: gaps 33, 34 |
| Several currencies with exchange rates | later | US dollars only for now |
| Events and Rounds on the Notes calendar | later | Owned by Notes when it comes |
| Real permissions by role | later | Everyone can edit everything for now |
| Registries for places, countries, organisations | later | They are notes for now |
| A dedicated game master dashboard | later | The Round section serves for now |
| Map of Events | later | Map tab, out of scope |

## Layout

The World tab fills the content area beside the rail. The header and the section switcher stay in place whichever section is shown; the section fills the rest. The Dice panel, when open, sits beside the page (owned by the app shell).

### World tab frame

```
+------------------------------------------------------------------------------+
| [A] Game date        [B] Round number, length, period   [C] Whose turn       |
+------------------------------------------------------------------------------+
| [D] Round | Timeline | Divergences | Economy                     [AK] Saved  |
+------------------------------------------------------------------------------+
|                                                                              |
|                         [E] Section content                                  |
|                                                                              |
+------------------------------------------------------------------------------+
```

- **A, game date**: the current game date (ontology: Game date, current game date).
- **B, Round**: the current Round's Number, its Length, and its period from Start date to End date, plus its Status when it is not open (gap 3).
- **C, whose turn**: the Person whose Turn is next in the Round's turn order, or what shows when no Turn is next (gap 6).
- **D, section switcher**: the four sections; one is selected.
- **E, section content**: one of the sections below.
- **AK, save chip**: this page's save chip, at the right of the section switcher, for edits made in any section. Its states (Unsaved, Saving..., Saved, Save failed with Retry) and the failed-save banner belong to `01-app-shell.md` (its rules 47 and 48); this page only places the chip. [**Existing app**; settled]

### Round section

```
+------------------------------------------------------------------------------+
| [F] Round 4  quarter  10 February 1962 to 10 May 1962   status   [Advance]   |
+--------------------------------------------+---------------------------------+
| [G] Turn order          [Shuffle] [Edit]   | [I] Interterm                   |
|                                            |                                 |
| [H] 1. Person A  Character A               |   interterm note  [Open]        |
|        turn note [Open]   [Done] [Skipped] |   [Done]                        |
|     2. Person B  Character B               |                                 |
|        turn note [Open]   [Done] [Skipped] |                                 |
|     3. Person C  Character C               |                                 |
|        turn note (hidden) [Done] [Skipped] |                                 |
+--------------------------------------------+---------------------------------+
| [J] Past rounds                                                              |
|   Round 3  quarter  10 November 1961 to 10 February 1962  closed  [View]     |
|   Round 2  month    10 October 1961 to 10 November 1961   closed  [View]     |
|   Round 1  ...                                                               |
+------------------------------------------------------------------------------+
```

- **F, round bar**: the Round's Number, Length, period and Status, and the Advance button that starts the Advance step. When the shown Round is closed, Advance is replaced by Reopen; when it is reopened, by Close again (gap 4).
- **G, turn order controls**: Shuffle reorders the Round's turn order at random; Edit lets the order be changed by hand.
- **H, turn list**: one row per Turn, in the Round's turn order: Position, Person, the Turn's Character, a link that opens the turn note, and the Done and Skipped marks. A turn note the viewer cannot see shows as hidden (gap 10).
- **I, interterm**: the Interterm, a link that opens the interterm note, and its Done mark. It sits beside the turn list (**Game master**).
- **J, past rounds**: every closed or reopened Round, newest first, with Number, Length, period and Status, and a View button that shows that Round in F to I.

### Editing the turn order

```
+------------------------------------------------------------------------------+
| [K] Turn order for round 4                                                   |
|   1. Person A                                                [up] [down]     |
|   2. Person B                                                [up] [down]     |
|   3. Person C                                                [up] [down]     |
| [L] The campaign's usual order is not changed.                               |
|                                                        [Cancel] [Save]       |
+------------------------------------------------------------------------------+
```

- **K, order list**: the Round's turn order; each Person can be moved up or down. Who is in the list: gap 5.
- **L, reminder**: a line saying the campaign's usual order is unchanged. Where the usual order is changed: gap 7.

### Opening a Round

```
+--------------------------------------------------+
| [M] Open round 5                                 |
|     Starts 10 May 1962                           |
|                                                  |
| [N] Length   ( ) Month  ( ) Quarter  ( ) Year    |
|     Ends     10 August 1962                      |
|                                                  |
| [O] Turn order: Person A, Person B, Person C     |
|                                                  |
|                         [Cancel] [Open round]    |
+--------------------------------------------------+
```

- **M, title and start**: the new Round's Number and Start date.
- **N, length**: the choice of Length, and the End date it gives.
- **O, turn order**: the order the Round will copy from the campaign; it can be changed after opening.

When this dialog is shown, and whether it is shown at all for the first Round, depends on gaps 1 and 2.

### Advance step

```
+--------------------------------------------------------------------------+
| [P] Advance round 4 to 10 May 1962                                       |
+--------------------------------------------------------------------------+
| [Q] Unfinished                                                           |
|   Turn: Person C (neither done nor skipped)                [Open note]   |
|   Interterm: not done                                      [Open note]   |
|   The round can close with these unfinished.                             |
+--------------------------------------------------------------------------+
| [R] Recurring money: decide each before closing                          |
|   Character A  Salary   Account 1  10 March 1962  +500   [Accept] [Edit] |
|                                                                 [Skip]   |
|   Character B  Rent     Account 2  1 April 1962   -120   accepted [Undo] |
|   [S] 2 more proposals are in accounts hidden from this view (gap 12)    |
+--------------------------------------------------------------------------+
| [T] Closing takes a net-worth snapshot for each character.               |
|                                              [Cancel] [Close round]      |
+--------------------------------------------------------------------------+
```

- **P, title**: the Round being closed and the date the game will advance to (its End date).
- **Q, unfinished**: each Turn that is neither done nor skipped and the Interterm if not done, each with a link to its note, and a line saying the table may go ahead anyway.
- **R, proposals**: one row per Proposal for the Round: the Character, the Recurring item's Description (ontology gap 44, gap 50), the Account, the Proposal's Date (gap 13) and Amount, and its Decision. An undecided row offers Accept, Edit and Skip; a decided row shows the Decision and can be changed back.
- **S, hidden proposals**: what shows for Proposals the viewer cannot see (gaps 11, 12).
- **T, snapshot notice and buttons**: a line saying snapshots will be taken; Close round is available only when every Proposal is decided.

### Editing a Proposal

```
+--------------------------------------------------+
| [U] Character A  Salary  Account 1               |
|     Date     [10 March 1962]                     |
|     Amount   [500]                               |
|                              [Cancel] [Save]     |
+--------------------------------------------------+
```

- **U, proposal form**: the Proposal's Date and Amount, prefilled from the Recurring item. The Amount can be edited (ontology: Proposal). The Date is the occurrence date (ontology gap 21, gap 13) and is shown; whether it can be edited is gap 46. Saving sets the Decision to edited.

### Timeline section

```
+------------------------------------------------------------------------------+
| [V] Filter (gap 19)                                          [Add event]     |
+------------------------------------------------------------------------------+
| [W] 1961                     Event title          marker   tags              |
|     March 1961               Event title          changed  tags   place      |
|     12 April 1961            Event title                   tags              |
|     10 Nov 1961 to Jan 1962  Event title          new here                   |
|     ...                                                                      |
+------------------------------------------------------------------------------+
| [X] Selected event                                                           |
|   Title                                                     [Edit] [Delete]  |
|   Date   Marker   Place   Category tags   Visibility   Owner                 |
|   In our world: line                                                         |
|   Description                                                                |
|   Linked notes and characters: Note A, Character B                           |
|   Source: event block in Turn note X (round 4), under heading Y   [Open]     |
+------------------------------------------------------------------------------+
```

- **V, timeline bar**: the filter controls (gap 19) and the Add event button.
- **W, event list**: every Event the viewer can see, in date order (gap 18), each row with its Date, Title, Marker, Category tags and Place.
- **X, event detail**: the selected Event's fields, its "in our world" line when it has one, and where it came from: its source note and heading when it has a Block (gap 22 for the Action), or its Interterm (gap 24). Whether it lists the notes that link to it: gap 29.

### Adding or editing an Event

```
+------------------------------------------------------------+
| [Y] New event                                              |
|   Date *        [ day | month | year | range ]  [........]  |
|   Title *       [.......................................]  |
|   Description   [.......................................]  |
|   Marker        ( ) none ( ) in our world ( ) changed      |
|                 ( ) new here ( ) did not happen            |
|   In our world  [.......................................]  |
|   Category tags [.......................................]  |
|   Place         [.......................................]  |
|   Linked notes and characters [.........................]  |
|   Visibility    ( ) everyone ( ) me and the game master    |
|                 ( ) game master only                       |
|   Owner         [Person]                                   |
|                                          [Cancel] [Save]   |
+------------------------------------------------------------+
```

- **Y, event form**: the Event's fields. Date and Title are marked required. The "in our world" field appears only when the Marker is changed or did not happen. Linked notes and characters offer name suggestions. Editing uses the same form with the current values.

### Deleting an Event

```
+------------------------------------------------------------+
| [Z] Delete "Event title"?                                  |
|   Links to it stay in place and show as missing.           |
|   [AA] It also appears as an event block in Turn note X.   |
|                                    [Cancel] [Delete]       |
+------------------------------------------------------------+
```

- **Z, confirmation**: names the Event and says links to it will show as missing.
- **AA, block line**: shown only when the Event has a Block; what is asked here is gap 27.

### Divergences section

```
+------------------------------------------------------------------------------+
| [AB] Divergent events                                                        |
|   March 1961        Event title    changed         In our world: line        |
|   10 Nov 1961       Event title    new here                                  |
|   20 January 1961   Event title    did not happen  In our world: line        |
+------------------------------------------------------------------------------+
| [AC] Broad divergences                                       [Add]           |
|   1. Text of a divergence entry                     [Edit] [up] [down] [x]   |
|   2. Text of a divergence entry                     [Edit] [up] [down] [x]   |
+------------------------------------------------------------------------------+
```

- **AB, divergent events**: the marked Events (gap 30) the viewer can see, in the timeline's date order, with Date, Title, Marker and the "in our world" line. Selecting one shows it in the Timeline section's detail.
- **AC, broad divergences**: the campaign's Divergence entries in their Position order, with Add, Edit, reorder and delete.

### Economy section

```
+---------------------------+--------------------------------------------------+
| [AD] Economy items  [Add] | [AE] Item name   unit   price    [Edit] [Delete] |
|                           +--------------------------------------------------+
|   Wheat      $ per bushel | [AF] Chart of readings over time                 |
|   Steel      $ per ton    |                                                  |
|   Unemployment  percent   |                                                  |
|                           +--------------------------------------------------+
|                           | [AG] Readings            [Add reading] [Pre-fill]|
|                           |   10 Feb 1962    2.10    note                    |
|                           |   10 Nov 1961    2.05                            |
|                           +--------------------------------------------------+
|                           | [AH] Followed by: Asset 1 (Character A)  (gap 37)|
+---------------------------+--------------------------------------------------+
```

- **AD, item list**: the campaign's Economy items with Name and Unit, and Add.
- **AE, item header**: the selected item's Name, Unit and whether it Is a price (gap 31), with Edit and Delete.
- **AF, chart**: the item's Readings plotted over time.
- **AG, readings table**: the item's Readings, newest first, with Date, Value and Note; Add reading, and Pre-fill (gaps 33, 34).
- **AH, followed by**: the Assets that follow the item, if shown at all (gap 37).

### Adding an Economy item or a Reading

```
+--------------------------------------------+  +----------------------------+
| [AI] New economy item                      |  | [AJ] New reading: Wheat    |
|   Name *   [............................]  |  |   Date *  [10 May 1962]    |
|   Unit *   [............................]  |  |   Value * [............]   |
|   [ ] This is a price (gap 31)             |  |   Note    [............]   |
|                        [Cancel] [Save]     |  |        [Cancel] [Save]     |
+--------------------------------------------+  +----------------------------+
```

- **AI, item form**: the Economy item's Name, Unit and Is a price.
- **AJ, reading form**: the Reading's Date, prefilled with the first day of the current Round, its Value in the item's unit, and an optional Note.

## Behaviour

"The viewer" is the Person picked by "viewing as". Every change made on this page records the viewer as the Person who made it, and anything created names the viewer as its Author (ontology rule 4; gap 8 for records the app creates; gap 41 for what is kept). Nothing on this page is restricted by role (ontology rule 37).

### Header

1. The header shows the current game date, the current Round's Number, Length and period, and whose turn it is, above every section. [**Where play happens**; settled]
2. The current game date is the start date of the current Round (ontology: Game date). Which Round is current while a closed Round is reopened is ontology gap 9 (gap 3).
3. Whose turn it is means the Person whose Turn is next in the Round's turn order; a Turn that is done or skipped is not next (ontology: Terms in the README). When every Turn is done or skipped, see gap 6.
4. Before any Round exists, the header shows the campaign's start date (gap 39) and no Round (gaps 1, 2).

### Opening a Round

5. "Round length: chosen when the round opens. Every turn and the interterm in that round cover the same period." The opening dialog asks for the Length: month, quarter or year. [**Round length**; settled] [**Time**; settled]
6. The new Round's Start date is the previous Round's End date. Its End date is worked out date to date: "A quarter from 10 February ends 10 May. A month from 31 January ends on the last day of February. The end date belongs to the next round." [Default 6; default]
7. On opening, the Round copies the campaign's turn order as its own, and the app creates one Turn and one turn note for each Person in it, and one Interterm with its interterm note (ontology rule 2). "Each player gets one note per round, created for them." [**Turn notes**; settled] Who is in the Round is gap 5; the Author, Owner and date of these records are gaps 8 and 9.
8. "The turn note belongs to the character that was active when the round opened." The Turn's Character is fixed when the Round opens. [**Turn notes and people**; settled]
9. A turn note is dated to its Round. [Default 7; default] The interterm note's date is gap 9.
10. How the first Round of a new campaign opens, and whether Advance opens the next Round at once, is ontology gap 8 (gap 1). The first Round's length is gap 2.

### Turn order

11. "The campaign has a turn order that can be changed per round, with a button to shuffle it." Shuffle puts the Round's turn order in a random order; Edit lets it be changed by hand. Neither changes the campaign's usual order. [**Advancing**; settled]
12. Changing the turn order changes each Turn's Position and therefore whose turn it is (rule 3). Done and Skipped marks are kept.
13. Where the campaign's usual order is changed is gap 7.

### Turns and the Interterm

14. The Round section lists every Turn's turn note for the Round beside the interterm note. [**Game master**; settled]
15. Open on a Turn or the Interterm opens its note in the Notes tab. Notes owns how the note looks and is edited, including the blocks inside it.
16. "Each turn and the interterm get a 'done' mark, and a turn can be skipped." Done and Skipped can be set and cleared at any time by anyone. [**Advancing**; settled] [**Who may change what**; settled]
17. Either mark makes the Turn finished: a Turn is unfinished when it is neither done nor skipped (ontology: Turn). Whether a Turn can be both done and skipped at once is gap 43.

### Advance step

18. Advance is "a soft checklist". The Advance step "shows what is unfinished and lets the table go ahead anyway": each Turn that is neither done nor skipped, and the Interterm if it is not done, each with a link to its note. [**Advancing**; settled]
19. On opening the Advance step, the app makes the Round's Proposals: "Advance proposes one entry per occurrence that falls in the round, with no part-payments." [Default 8; default] [**Recurring money**; settled] Occurrence dates are ontology gap 21 (gap 13).
20. "Each undecided recurring-money proposal must be accepted, edited or skipped in that step." Close round stays unavailable while any Proposal is undecided. [**Advancing**; settled]
21. Accept makes a Ledger entry as proposed. Edit opens the Proposal's Amount, which "can be edited" (ontology: Proposal), and makes a Ledger entry with the changes; whether its Date can be edited is gap 46. Skip makes none. Changing a decision before the Round closes is gap 44. "On advance the app proposes the entries for the period and a person confirms them." [**Recurring money**; settled]
22. Proposals in Accounts the viewer cannot see are handled as gaps 11 and 12.
23. Cancel leaves the Round open. What happens to Proposals already made and decided when the Advance step is cancelled and opened again is gap 44. What a change to a Recurring item does to its undecided Proposals is ontology gap 45 (gap 49).
24. Close round closes the Round, takes a Net-worth snapshot for each Character (gap 14), and moves the current game date to the Round's End date (ontology rule 28). "Net worth history is a snapshot taken when each round closes. Later corrections do not redraw the past unless that round is reopened." [Default 11; default] [**Net worth**; settled]
25. Each snapshot's Net worth is "all account balances plus each asset's quantity times its value, with debts negative". [Default 9; default] Linked Assets use "the latest reading on or before the date in question. With no reading, the asset shows as 'not valued' rather than zero." [Default 10; default] The date valued on is ontology gap 23 (gap 15); what a snapshot stores for hidden accounts is ontology gap 22 (gap 16).
26. "The date advances once the interterm is complete." [**Time**; settled] Advance also "lets the table go ahead anyway" with an unfinished Interterm. [**Advancing**; settled] The two read differently (gap 45); until settled, this page follows ontology rule 28, which lists an unfinished Interterm without stopping the Round closing.
27. What happens next, an opening dialog for the next Round or none, is gap 1.

### Past and reopened Rounds

28. Past rounds lists every Round that is not the current one, newest first. View shows that Round's turn list, interterm and Proposals in the Round section.
29. "A closed round can be reopened to correct it." Reopen sets its Status to reopened. [**Advancing**; settled] What may change while it is reopened, and which Round is current meanwhile, is ontology gap 9 (gap 3).
30. Closing a reopened Round again sets its Status back to closed and retakes its snapshots: corrections do not redraw the past "unless that round is reopened". [Default 11; default] How it is closed again is gap 4.
31. Whether a Round can be deleted is ontology gap 43 (gap 48). The page offers no delete.

### Timeline

32. "One timeline." Every Event the viewer can see is listed in date order. [**Timeline and divergences**; settled] How Events of different precision are ordered is gap 18.
33. An Event's date "can be a day, a month, a year or a range" on "the real Gregorian calendar". [**Events**; settled] [**Calendar**; settled] The precision of each end of a range is ontology gap 28 (gap 17).
34. "A changed event sits at the date it happened in the game. A did-not-happen event sits at its real-world date." The form says this beside the Date when one of these markers is chosen. [Default 2; default]
35. Add event opens the event form with no title; the date it starts with is gap 47. "Only the date and title are required." The rest are optional: description, category tags, place, links to notes and characters. [**Events**; settled]
36. "Each event is marked as in our world, changed, new here or did not happen." The marker is optional: "An unmarked event does not appear under Divergences." [**Timeline and divergences**; settled] [Default 1; default]
37. "The 'in our world' line is asked for only on changed and did-not-happen events." The field appears only for those markers. [Default 1; default] What happens to a written line when the marker changes away from them is gap 20.
38. Category tags are free text typed in. Place is text (ontology gap 27, gap 28).
39. Linked notes and characters are chosen with name suggestions. Suggestions leave out anything the viewer cannot see. [Default 4; default]
40. A new Event's Visibility is everyone. It can be set to "me and the game master" or "game master only". [**Secrets**; settled] Its Owner is the creator by default and can be changed; it is not whoever last edited it. [Default 5; default] Who counts as the game master is ontology gap 1 (gap 40).
41. Edit opens the same form with the Event's current values. Saving changes the Event everywhere it shows, including its event block if it has one.
42. "Events are created during an interterm, promoted from a player's action, or added directly." Add event adds one directly. [**Events**; settled] When the Event's Interterm field is set is gap 24.
43. Promoting an Action to an Event: how is ontology gap 26 (gap 21), and where it is started is gap 22. What happens to the Event's Action when the heading is renamed or deleted is ontology gap 12 (gap 23).
44. An Event that has a Block shows its source note, and the heading it sits under, in the event detail, with a link that opens the note. The Event and its event block are one record: "Editing either changes both." Notes owns the full shared-record rule. [**Blocks are shared records**; settled] Where the note and the Event have different levels is ontology gap 17 (gap 26).
45. Delete asks for confirmation, then deletes the Event. "Deleting something that is linked to leaves the links in place, shown as missing." [Default 14; default]
46. Deleting an Event from the timeline while its event block still exists in a note is gap 27.
47. Filtering the timeline is not decided (gap 19).
48. Selecting an Event shows its detail; whether the detail lists notes that link to it is gap 29.
    1. Arriving from an Event link in a note opens this tab's Timeline section with that Event selected and its detail shown. This receives the hand-over in `04-notes.md` gap 10 (links to Characters and Events) and rests on it. "Links can also point to characters and events." [**Links and tabs**; settled]

### Divergences

49. "The Divergences view shows both": the marked Events and the separate free-text list "for broad divergences that are not single dated events". [**Timeline and divergences**; settled] Which markers count is gap 30.
50. Divergent Events appear in the timeline's date order, each with its "in our world" line when it has one. Selecting one shows it in the Timeline section.
51. Add puts a new Divergence entry at the end of the list with the text typed. Entries can be edited, moved up or down, and deleted by anyone (ontology: Divergence entry).
52. Divergent Events the viewer cannot see are left out. [Default 4; default] Divergence entries are always visible (ontology rule 21).

### Economy

53. "Economy: a list defined per campaign. Each item has a name, a unit and dated readings with an optional note; any number can be tracked, not only prices; shown as a table and a chart." [**Economy**; settled] Which items the table will use is ontology gap 37 (gap 32).
54. Add opens the item form: Name and Unit are required. Whether an item is a price, and how that is marked, is ontology gap 25 (gap 31).
55. "Only price items can be linked." [Default 10; default] Deleting an item, or ceasing to mark it as a price, while Assets follow it, is gap 36.
56. "Prices are not updated every round; they are updated when a player needs a reading of the economy, and may also be updated during an interterm." Add reading is available at any time; nothing asks for Readings at Advance. [**Interterm**; settled]
57. A Reading is "stored as a day, defaulting to the first day of the current round". [Default 7; default] Two Readings on the same day are gap 35.
58. "Readings are entered by hand, and may be pre-filled from real history where the world has not diverged." [**Economy**; settled] The source of real numbers is ontology gap 38 (gap 33); who decides the world has not diverged is gap 34. Pre-fill depends on both.
59. A Reading can be corrected or deleted (ontology: Reading).
60. A new, corrected or deleted Reading changes the value of every Asset linked to the item for dates on or after it, until the next Reading: linked assets use "the latest reading on or before the date in question". [Default 10; default] Whether a linked Asset also keeps hand values is ontology gap 24 (gap 38). Snapshots of closed Rounds are not redrawn. [Default 11; default]
61. The chart and the table show every Reading of the item; Readings are always visible. [Default 3; default]
62. A chart block in a note can draw an Economy item (**Tables and charts**); Notes owns chart blocks.

### Coverage

| README item | Reflected in |
| --- | --- |
| **Tabs** | Purpose (World is one of the tabs); Changes from `archive/HANDOFF.md` |
| **Campaign** | Purpose; rule 7 (one world, many people). Folder: not this page |
| **Time** | Rules 5, 26; gap 45 |
| **Round length** | Rule 5; Layout: Opening a Round |
| **Turns** | Not this page (turn content lives in turn notes; Notes) |
| **Resolution** | Not this page |
| **Interterm** | Rules 14, 16, 56 |
| **Multi-user** | Behaviour introduction (viewer); States (hidden) |
| **Stats** | Not this page |
| **Rolls** | Not this page |
| **Character life** | Rule 8; gap 14 |
| **Identity** | Not this page |
| **Money** | Rule 21 (Ledger entries from Proposals) |
| **Currency** | Features (later); Layout: Advance step amounts |
| **Recurring money** | Rules 19, 20, 21, 23; gaps 46, 49, 50 |
| **Assets** | Rule 25; rule 60 |
| **Net worth** | Rules 24, 25, 60 |
| **Timeline and divergences** | Rules 32, 36, 49 |
| **Events** | Rules 33, 35, 42, 43; gap 47 |
| **Economy** | Rules 53, 58 |
| **Other world things** | Rule 39 (events link to notes); Features (registries later) |
| **Where play happens** | Rule 1; Purpose |
| **Turn notes** | Rule 7 |
| **Editing** | Not this page (Notes) |
| **Links and tabs** | Rules 39, 45, 48.1; gap 29 |
| **Notes calendar** | Features (events and rounds on the calendar: later) |
| **Tables and charts** | Rule 62 |
| **Who may change what** | Behaviour introduction; rule 16 |
| **Secrets** | Rule 40; States |
| **Existing data** | Not this page |
| **Game master** | Rule 14; Layout: Round section |
| **Dice** | Not this page (app shell); Layout introduction |
| **Sync** | Behaviour introduction (Author); not otherwise this page |
| **People and characters** | Rules 3, 8 |
| **Turn notes and people** | Rules 7, 8 |
| **Blocks are shared records** | Rule 44; gaps 26, 27 |
| **Actions** | Rule 43 |
| **Advancing** | Rules 11, 16, 18, 20, 26, 29; gaps 43, 44, 45 |
| **Calendar** | Rule 33 |
| **Existing app** | Layout: World tab frame (AK, save chip); States; Changes from `archive/HANDOFF.md` |
| **Process** | Layout introduction (mockup pass follows) |
| Default 1 | Rules 36, 37 |
| Default 2 | Rule 34 |
| Default 3 | Rule 61; States |
| Default 4 | Rules 39, 52; States |
| Default 5 | Rule 40 |
| Default 6 | Rule 6 |
| Default 7 | Rules 9, 57 |
| Default 8 | Rule 19 |
| Default 9 | Rule 25 |
| Default 10 | Rules 25, 55, 60 |
| Default 11 | Rules 24, 30, 60 |
| Default 12 | Not this page |
| Default 13 | Not this page |
| Default 14 | Rule 45 |
| Default 15 | Not this page (chart blocks: Notes) |
| Default 16 | Not this page |
| Default 17 | Not this page |

## States

Loading and saving follow the app shell. This page places its own save chip (region AK); the chip's states and the failed-save banner belong to `01-app-shell.md`. Messages never name the app and never speak as the app in the first person.

### Header

- **Empty**: no Round yet. Shows the campaign's start date and no Round number or turn (rule 4; gaps 1, 2, 39).
- **Loading**: the header regions are blank until the campaign is read.
- **Error**: if the current Round cannot be read, the header shows the game date as unknown and a short message pointing to the Round section (gap 42).
- **Hidden**: nothing in the header can be hidden. Round, Turn and Person are always visible.

### Round section

- **Empty**: no Round yet: a message that no round has been opened, and what opens one (gaps 1, 2). Past rounds is empty until the first Round closes, and says so in one line. A Round with no Turns (no one in the turn order, gap 5) shows the Interterm alone and a line saying no one is in the turn order.
- **Loading**: a spinner only, with no placeholder rows.
- **Error**: a Round, Turn or Interterm that cannot be read: gap 42. In the Advance step, a Ledger entry that fails to save is shown as the app shell decides; the order of writes is `06-storage.md`'s.
- **Hidden**: Turns and the Interterm are always visible. A turn note or interterm note the viewer cannot see shows as hidden in its row and cannot be opened (gap 10). Proposals in Accounts the viewer cannot see: gaps 11, 12.

### Timeline section

- **Empty**: no Events yet: a message saying the timeline is empty and pointing to Add event. When a filter (gap 19) leaves nothing, a message says no events match and offers to clear the filter.
- **Loading**: a spinner only, with no placeholder rows.
- **Error**: Events that cannot be read: gap 42.
- **Hidden**: Events the viewer cannot see are left out of the list, the detail, link suggestions and counts. Nothing marks where they were. [Default 4; default] Their links inside visible notes are Notes' concern.

### Divergences section

- **Empty**: each half has its own message: no divergent events (pointing to the Timeline and the marker), and no broad divergences (pointing to Add).
- **Loading**: a spinner only, with no placeholder rows.
- **Error**: gap 42.
- **Hidden**: divergent Events the viewer cannot see are left out, as in the Timeline. Divergence entries are always visible.

### Economy section

- **Empty**: no Economy items: a message pointing to Add (ontology gap 37, gap 32). An item with no Readings shows an empty table and chart with a message pointing to Add reading.
- **Loading**: a spinner only, with no placeholder rows.
- **Error**: gap 42.
- **Hidden**: nothing. Economy items, Readings and Assets are always visible. [Default 3; default]

## Changes from `archive/HANDOFF.md`

The earlier design has no World tab and nothing like it. Nothing in it is superseded by this spec. Specifically:

- **New tab.** The World tab is added. Where it sits on the rail is the app shell's to decide; the earlier rail placed only Player before Notes.
- **Carried over unchanged:** the copy rule (messages never name the app and never speak as the app in the first person); the loading pattern (a spinner only, with no placeholder rows); dialogs in the earlier shape, with Cancel and a primary button, and destructive buttons marked as destructive, as in the Trash confirmation; save chips, which this page places itself (region AK), with their states and the failed-save banner owned by the app shell.
- **Visual language.** Colours, type and sizes come from the earlier design until the mockup pass for this page says otherwise.

## Gaps

Questions this page needs answered. Each has one recommended answer. Ontology gaps are cited by number with the ontology's recommendation copied unchanged.

1. **Opening rounds.** Ontology gap 8: how the first Round opens, and whether Advance opens the next Round at once. Recommendation (ontology): the first Round opens when the campaign is created, starting on its start date; Advance closes the Round and opens the next at once, asking for its length with the previous length as the default.
2. **The first Round's length.** Ontology gap 8's recommendation opens the first Round when the campaign is created but does not say how its length is chosen. Recommendation: the campaign-creation step (app shell) asks for the first Round's length beside the start date, with nothing preselected.
3. **Reopened rounds.** Ontology gap 9: what may change in a reopened Round and which Round is current meanwhile. Recommendation (ontology): notes, blocks, marks and decided Proposals can be corrected, but not the length or start date while later Rounds exist; the latest Round stays current; closing the reopened Round retakes only its own snapshots.
4. **Closing a reopened Round again.** Rule 29 of the ontology says closing it again retakes its snapshots, but not whether it goes through the Advance step. Recommendation: Close again shows the same checklist and its existing Proposals for correction, makes no new Proposals, retakes only its own snapshots, and does not move the current game date or open a Round.
5. **Who takes a turn.** Ontology gap 2. Recommendation (ontology): every Person in the Round's turn order; the Campaign's order starts with every Person who has an active Character, and People are added to or removed from it by hand.
6. **The header when no Turn is next.** The Terms definition leaves no one when every Turn is done or skipped. Recommendation: the header says the Interterm is next while it is not done, and that the Round is ready to advance once it is done.
7. **Where the campaign's usual turn order is changed.** Rule 36 says the Campaign has one; no page is named. Recommendation: it is changed where people are managed, in the app shell; this page changes only the Round's copy.
8. **Author of records the app creates.** Ontology gap 10. Recommendation (ontology): the Author is the Person in "viewing as" who opened or advanced the Round.
9. **Owner and date of app-created notes.** Ontology gap 11. Recommendation (ontology): a turn note is owned by its Turn's Person; an interterm note is owned by the game master; an interterm note is dated to its Round, like a turn note.
10. **A hidden turn or interterm note in the Round section.** Turns and the Interterm are always visible but their notes may not be. Recommendation: the row stays, with the note link shown as hidden and not openable, matching ontology gap 17's recommendation for blocks.
11. **Visibility of Recurring items and Proposals.** Ontology gap 20. Recommendation (ontology): both follow their Account, like Ledger entries.
12. **Deciding Proposals the viewer cannot see.** If Proposals follow their Account (gap 11), a viewer may be unable to see Proposals that must be decided before closing. Recommendation: the Advance step shows how many undecided Proposals are hidden from the viewer, and Close round stays unavailable until someone who can see them decides them under "viewing as".
13. **Occurrence dates of a Recurring item.** Ontology gap 21. Recommendation (ontology): occurrences step from the start date by the cadence, date to date as in default 6; each Proposal and its Ledger entry take the occurrence date.
14. **Which Characters get a snapshot.** Addressed to the ontology: Net-worth snapshot says "taken for every Character when its Round closes", while Character says "One per closed Round in which the Character existed", and neither says whether retired or dead Characters are included. Recommendation: every Character that is not dead when the Round closes. This recommendation would change an accepted rule, not fill a silence: ontology rule 20 says a snapshot "is taken for each Character when each Round closes" and Net-worth snapshot's life cycle says "taken for every Character when its Round closes"; leaving out dead Characters needs that wording changed.
15. **The date a snapshot values at.** Ontology gap 23. Recommendation (ontology): the Round's last day, the day before its end date.
16. **Net-worth snapshots and hidden accounts.** Ontology gap 22. Recommendation (ontology): a snapshot stores each Account's balance and each Asset's value as parts, so each viewer's total leaves out what they cannot see (default 4).
17. **Precision of range ends.** Ontology gap 28. Recommendation (ontology): each end of a range is a day, month or year on its own.
18. **Ordering Events of different precision.** Not decided. Recommendation: order by the first day each date could mean (a month or year sorts at its first day, a range at its start); at the same first day, coarser dates come before finer ones, then by title.
19. **Filtering the timeline.** Not decided. Recommendation: filter by marker, category tag and date range.
20. **The "in our world" line when the marker changes.** Default 1 asks for the line only on changed and did-not-happen Events. Recommendation: a written line is kept but not shown when the marker changes to another value, and shows again if it changes back.
21. **Promoting an Action to an Event.** Ontology gap 26. Recommendation (ontology): promotion inserts an event block under the Action's heading, so the Event and the turn note stay one record.
22. **Where promotion is started.** Not decided. Recommendation: from the Action's heading in the turn note, in the Notes tab; this page shows the resulting Event with its source.
23. **What identifies an Action when its heading changes.** Ontology gap 12. Recommendation (ontology): an Action keeps its Id when its heading is renamed; when the heading is deleted, its blocks join the Action above (or the Turn as a whole), and Ledger entries, Stat changes and Events that pointed at it point at the Turn instead. How the Id is kept with the heading belongs to `06-storage.md`.
24. **When an Event's Interterm is set.** Addressed to the ontology: Event says "Set when created during an Interterm", which could mean made in the interterm note or added on this page while an Interterm is open. Recommendation: set only when the Event is made by an event block in an interterm note.
25. **Headings in an interterm note.** Ontology gap 13. Recommendation (ontology): they are not Actions; every block in an interterm note belongs to the Interterm, matching **Stats**, which attaches changes to "an action or an interterm".
26. **A block's note and its record at different levels.** Ontology gap 17. Recommendation (ontology): the record keeps its own level; viewers who cannot see the record see the block as hidden in the note.
27. **Deleting an Event whose event block still exists.** Not decided. Recommendation: ask whether to keep or delete the block, mirroring the question asked when the block is removed.
28. **Does a place become a record of its own.** Ontology gap 27. Recommendation (ontology, from `05-map.md`): a named place with an optional point, so that "Chicago" is entered once and reused; until then, text.
29. **A "linked from" list on Events.** Addressed to the ontology: the README gives each note a "linked from" list and lets links point to events, but Event has no such field. Recommendation: the event detail lists the notes that link to it, leaving out what the viewer cannot see (default 4).
30. **Which marked Events appear under Divergences.** The README says the Divergences view shows marked events "and" the list, and ontology rule 32 says "marked Events"; neither excludes an Event marked in our world, which is not a divergence. Recommendation: only Events marked changed, new here or did not happen appear under Divergences. This recommendation would change an accepted rule, not fill a silence: ontology rule 32 says "The Divergences view shows marked Events", and **Timeline and divergences** names in our world as one of the marks; leaving out Events marked in our world needs that wording changed.
31. **How an Economy item is marked as a price.** Ontology gap 25. Recommendation (ontology): a yes/no "price" field set when the item is created, with the unit read as an amount per unit.
32. **Which economy items the table asks about.** Ontology gap 37. Recommendation (ontology): the Economy list starts empty.
33. **Where real historical numbers come from.** Ontology gap 38. Recommendation (ontology): hand entry only until a source is chosen.
34. **Who decides the world has not diverged, for pre-filling.** Not decided. Recommendation: a Person chooses Pre-fill for an item and a date range; the app does not judge divergence itself.
35. **Two Readings on the same day.** Default 10 uses "the latest reading on or before the date", which is unclear when two share a day. Recommendation: one Reading per item per day; adding a second for that day asks whether to replace the first.
36. **Deleting a price item, or unmarking it, while Assets follow it.** Not decided. Recommendation: ask first, listing the Assets; on going ahead they stop following it and fall back to their hand-entered values (see gap 38), and chart blocks drawing a deleted item show as missing (default 14).
37. **Showing which Assets follow an item.** Not decided. Recommendation: the item shows a "followed by" list of Assets and their Characters, each opening the Character's Player tab.
38. **Hand values on a linked Asset.** Ontology gap 24. Recommendation (ontology): while linked, an Asset uses only the price; its hand-entered history is kept and used again if it is unlinked.
39. **When the campaign starts.** Ontology gap 36. Recommendation (ontology): a required start date entered when the campaign is created.
40. **How the role is recorded.** Ontology gap 1. Recommendation (ontology): a role field on Person with the values player and game master; exactly one Person holds game master at a time; the game master may also play a Character.
41. **The record of changes.** Ontology gap 42. Recommendation (ontology): each record keeps who last changed it and when (real-world time) now; a full list of changes that people can look through is later.
42. **A section with records that cannot be read.** Not decided; causes belong to `06-storage.md`. Recommendation: the section shows what it could read, with a line saying how many records could not be read and a Retry button.
43. **A Turn both done and skipped.** The ontology gives Turn two separate yes/no fields, Done and Skipped. Recommendation: setting one clears the other, so a Turn shows one state.
44. **Proposals before the Round closes.** The ontology says Proposals are made at Advance and kept with the Round, but not what happens if the Advance step is cancelled or a decision is changed. Recommendation: Proposals are made the first time the Advance step opens for a Round and kept, with their decisions, if it is cancelled; a decision can be changed until the Round closes, and changing it removes or replaces the Ledger entry it made.
45. **Time and Advancing on an unfinished Interterm.** **Time** says "the date advances once the interterm is complete"; **Advancing** says Advance "lets the table go ahead anyway" with unfinished items, which ontology rule 28 applies to the Interterm. Recommendation: follow **Advancing** and ontology rule 28: an unfinished Interterm is listed but does not stop the Round closing.
46. **Editing a Proposal's date.** The ontology lets a Proposal's Amount be edited ("can be edited") and gives its Date as the occurrence date (ontology gap 21, gap 13), but does not say whether Edit may change the Date, nor how a changed date affects the occurrence, the Round it falls in or the Ledger entry made. Recommendation: no; the date stays the occurrence date.
47. **The date a new Event's form starts with.** **Events** requires a date and a title but does not say what the date field holds when Add event opens the form. Recommendation: the current game date, matching `04-notes.md` gap 17's recommendation for the date a new ordinary note starts with.
48. **Deleting a Round.** Ontology gap 43. Recommendation (ontology): none of them can be deleted in the app, so history stays whole (a Turn nobody writes is skipped; a campaign ends when its folder is removed outside the app); a new Character may start with any status, so that a past Character can be entered.
49. **Changing a Recurring item while its Proposals are undecided.** Ontology gap 45. Recommendation (ontology): undecided Proposals are remade from the changed item; decided ones are left alone.
50. **A description on a Recurring item.** Ontology gap 44. Recommendation (ontology): a Recurring item has a required description, copied to each Proposal and the Ledger entry it makes, where it can be edited.
