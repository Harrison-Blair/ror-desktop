# 02 Player tab

Status: draft. This spec uses the vocabulary and record fields of `00-ontology.md` and does not redefine them. Each rule says where it comes from in `README.md`: a bold label from "Settled so far" (tagged settled) or a number from "Defaults adopted" (tagged default, open to change). Anything not decided is a question in [Gaps](#gaps): "(gap N)" for a question new to this page, "(ontology gap N)" for one the ontology already asks.

## Contents

- [Purpose](#purpose)
- [Features](#features)
- [Layout](#layout)
- [Behaviour](#behaviour)
- [States](#states)
- [Changes from `archive/HANDOFF.md`](#changes-from-archivehandoffmd)
- [Gaps](#gaps)

## Purpose

The Player tab is a Character's page, opened by a Person. It shows one Character at a time: who they are, what they have, and the turns they have taken. It has three sections:

- **Profile**: Name, Photo, age, Status, the Identity fields with their history, the Stat values with their history, and the Description.
- **Money and assets**: net worth, Accounts with their Ledger entries, Recurring items and Assets.
- **Turns**: the Character's turn notes, one per Round, each opening in the Notes tab.

Play itself happens in notes. This page is where a Character's standing is kept and read; the turn notes are written in the Notes tab, and rounds are opened and advanced in the World tab.

## Features

| Feature | When | Note |
| --- | --- | --- |
| Show the viewed person's active Character | now | What opens by default is gap 1 |
| Open another Person's Character | now | From the character picker |
| Open a past (retired or dead) Character | now | From the character picker |
| Create a Character | now | Starting stat values: ontology gap 31 |
| Retire a Character, mark it dead, make it active | now | Dating and the previous active Character: ontology gap 4 |
| Name and Photo | now | Carried over (default 16) |
| Age from Birth date and the current game date | now | Birth date may be just a year (default 17) |
| Identity fields with dated history | now | Occupation or position, Location, Nationality |
| Description written the way a note is written | now | Field or Note: ontology gap 5 |
| Stat values for the campaign's Stat list | now | The list itself belongs to the app shell |
| Change a Stat value with date, reason and attachment | now | |
| Stat value history | now | |
| Several Accounts per Character | now | |
| Ledger with running balance | now | |
| Add, edit and remove a Ledger entry | now | Removing one that has a block: gap 5 |
| Ledger entry shows the money block's note | now | Shared record; Notes owns the rule's wording |
| Visibility level per Account | now | |
| Lose or transfer an Account | now | Behaviour is ontology gap 35 |
| List and edit Recurring items | now | Proposals are decided in the World tab's Advance step |
| Free-form Asset list | now | |
| Quantity and per-unit Value | now | Default 9 |
| Dated Asset value history | now | |
| Asset linked to a price item, "not valued" state | now | Default 10 |
| Asset Location and Linked note | now | |
| Debts as negative values | now | |
| Current net worth and how it is made up | now | |
| Net worth chart per Round from snapshots | now | Snapshots are taken by the World tab's Advance step |
| Net worth seen by others without hidden Accounts | now | Default 4; ontology gap 22 |
| Turn notes by Round, current one prominent | now | |
| Several currencies with exchange rates | later | **Currency** |
| Real permissions on who may edit a Character | later | **Who may change what** |
| A full list of changes people can look through | later | Ontology gap 42 |
| A place as a record of its own, shown on the Map tab | later | Ontology gap 27 |
| Hidden Accounts protected, not only not shown | later | **Secrets**: comes with the server |

## Layout

The wireframes show arrangement only. Letters in brackets label regions; the list under each wireframe says what each region holds.

### Page frame

```
+--[A] character header----------------------------------------------------+
| +-------+  <Name>                               [Character: <Name>   v]  |
| | photo |  <Person> · <Status>                  [New character]          |
| +-------+                                       [Status v]               |
+--[B] section switcher----------------------------------------------------+
|  Profile  |  Money and assets  |  Turns                      [D] Saved   |
+--[C] section body--------------------------------------------------------+
|                                                                          |
|  the chosen section (Profile, Money and assets or Turns)                 |
|                                                                          |
+--------------------------------------------------------------------------+
```

- **A, character header**: the shown Character's Photo, Name, Person and Status. On the right: the character picker, the New character button and the Status menu (Make active, Retire, Mark dead).
- **B, section switcher**: the three sections; one is shown at a time.
- **C, section body**: the chosen section.
- **D, save chip**: this page's save chip, at the right of the section switcher, for edits made in any section. Its states (Unsaved, Saving..., Saved, Save failed with Retry) and the failed-save banner belong to `01-app-shell.md`; this page only places the chip. [settled: **Existing app**]

### Character picker

```
+--[A] Characters---------------------------------+
| <Person 1>                                      |
|   <Character>             active                |
|   <Character>             retired               |
| <Person 2>                                      |
|   <Character>             dead                  |
| <Person 3>                no characters         |
+--[B] footer-------------------------------------+
| [New character]                                 |
+-------------------------------------------------+
```

- **A, Characters**: every Person in the campaign, each with their Characters and each Character's Status. Choosing a Character opens it on this page.
- **B, footer**: New character, the same as the button in the header.

### New character dialog

```
+--[A] title: New character-----------------------------+
+--[B] who----------------------------------------------+
| Person      [<Person>                v]               |
| Name        [                         ]               |
| Photo       [Choose photo]                            |
| Birth date  [day or year              ]               |
| Status      (o) active   ( ) retired                  |
+--[C] starting stat values (ontology gap 31)-----------+
| <Stat>      [   ]                                     |
| <Stat>      [   ]                                     |
+--[D] buttons------------------------------------------+
|                               [Cancel]  [Create]      |
+-------------------------------------------------------+
```

- **A, title.**
- **B, who**: Person (defaults to the viewed person), Name, Photo, Birth date and Status.
- **C, starting stat values**: one row per Stat in the campaign's Stat list. How these are set is ontology gap 31.
- **D, buttons**: Cancel and Create.

### Status change dialog

```
+--[A] title: Retire <Name>? / Mark <Name> dead? / Make <Name> active?---+
+--[B] details-----------------------------------------------------------+
| Status after:  <retired | dead | active>                               |
| Date:          ontology gap 4                                          |
| Other active character of <Person>: ontology gap 4                     |
+--[C] buttons-----------------------------------------------------------+
|                                        [Cancel]  [Confirm]             |
+------------------------------------------------------------------------+
```

- **A, title**: names the change.
- **B, details**: the new Status, and two placeholders for ontology gap 4: whether the change is dated, and what happens to the Person's current active Character when this one is made active.
- **C, buttons**: Cancel and Confirm.

### Profile section

```
+--[A] summary-------------------------------------------------------------+
| +--------+  Name        <Name>                              [Edit]       |
| | photo  |  Age         <age> (born <Birth date>)           [Edit]       |
| |        |  Status      <Status>                                         |
| +--------+  [Choose photo]  [Remove photo]                               |
+--[B] identity------------------------------------------------------------+
| Occupation or position  <value>   since <date>     [Change]  [History]   |
| Location                <value>   since <date>     [Change]  [History]   |
| Nationality             <value>   since <date>     [Change]  [History]   |
+--[C] stats---------------------------------------------------------------+
| <Stat>        <value>   <date>: <Reason>           [Change]  [History]   |
| <Stat>        <value>   <date>: <Reason>           [Change]  [History]   |
+--[D] description---------------------------------------------------------+
| the Description, written and shown the way a note is (ontology gap 5)    |
|                                                                          |
+--------------------------------------------------------------------------+
```

- **A, summary**: Photo with Choose photo and Remove photo; Name; age with the Birth date it comes from; Status. Name and Birth date can be edited in place.
- **B, identity**: the three Identity fields, each with its current value, the date of the latest Identity change, Change and History.
- **C, stats**: one row per Stat in the campaign's order: the Stat's Name, this Character's Value, the date and Reason of the latest Stat change, Change and History.
- **D, description**: the Description.

### Identity change dialog

```
+--[A] title: Change <Occupation or position | Location | Nationality>--+
+--[B] fields-----------------------------------------------------------+
| Value   [                              ]                              |
| Date    [<date>                        ]   (ontology gap 7)           |
+--[C] buttons----------------------------------------------------------+
|                                        [Cancel]  [Save]               |
+-----------------------------------------------------------------------+
```

- **A, title**: names the Identity field.
- **B, fields**: the new Value and its Date.
- **C, buttons**: Cancel and Save.

### Identity history panel

```
+--[A] title: <field> history-----------------------------------+
+--[B] entries, newest first------------------------------------+
| <date>     <Value>                         by <Person>        |
| <date>     <Value>                         by <Person>        |
+--[C] close----------------------------------------------------+
|                                                    [Close]    |
+---------------------------------------------------------------+
```

- **A, title**: names the Identity field.
- **B, entries**: every Identity change for that field: Date, Value and Author. Correcting an entry is gap 4.
- **C, close.**

### Stat change dialog

```
+--[A] title: Change <Stat>----------------------------------------+
+--[B] fields------------------------------------------------------+
| Current value   <value>                                          |
| New value       [      ]                                         |
| Date            [<date>              ]   (ontology gap 7)        |
| Reason          [                                         ]      |
| Attached to     [none | <Action> | <Interterm>         v]        |
+--[C] buttons-----------------------------------------------------+
|                                        [Cancel]  [Save]          |
+------------------------------------------------------------------+
```

- **A, title**: names the Stat.
- **B, fields**: the current Value for reference; New value, Date, Reason and Attached to for the new Stat change.
- **C, buttons**: Cancel and Save.

### Stat history panel

```
+--[A] title: <Stat> history------------------------------------------+
+--[B] changes, newest first------------------------------------------+
| <date>  <New value>  <Reason>            <Action | Interterm>  by <P> |
| <date>  <New value>  starting value                            by <P> |
+--[C] close----------------------------------------------------------+
|                                                          [Close]    |
+---------------------------------------------------------------------+
```

- **A, title**: names the Stat.
- **B, changes**: every Stat change: Date, New value, Reason, what it is Attached to (opens that note in the Notes tab) and Author. The first is the starting value. Correcting an entry is gap 4.
- **C, close.**

### Money and assets section

```
+--[A] net worth-----------------------------------------------------------+
| Net worth  <amount>   valued at <date> (gap 3)     [How it is made up]   |
| Not valued: <Asset>, <Asset> (gap 16)                                    |
+--[B] net worth per round-------------------------------------------------+
|   chart: one point per closed Round, from Net-worth snapshots            |
|   Round 1 ---- Round 2 ---- Round 3 ---- Round 4                         |
+--[C] accounts------------------------------------------------------------+
| <Account Name>     <Visibility>          <Balance>     [Open ledger]     |
| <Account Name>     <Visibility>          <Balance>     [Open ledger]     |
| [New account]                                                            |
+--[D] recurring items-----------------------------------------------------+
| <Description>  <Account>  <Amount>  <Cadence>  <Start>-<End>  [Edit]     |
| [Add recurring item]   Proposals are decided at Advance, in World        |
+--[E] assets--------------------------------------------------------------+
| Name     Kind    Quantity  Value     Total     Location  Note   [Edit]   |
| <Name>   <Kind>  <n>       <amount>  <amount>  <text>    <link>          |
| <Name>   <Kind>  <n>       not valued                                    |
| <debt>   <Kind>  1         -<amount> -<amount>                           |
| [Add asset]                                                              |
+--------------------------------------------------------------------------+
```

- **A, net worth**: the current figure, the date it is valued at, any Assets that are not valued, and How it is made up, which opens the breakdown panel.
- **B, net worth per round**: a chart of this Character's Net-worth snapshots, one per closed Round.
- **C, accounts**: each Account the viewer can see: Name, Visibility, Balance and Open ledger. New account below.
- **D, recurring items**: each Recurring item: Description, Account, Amount, Cadence, Start date and End date, with Edit. Add recurring item, and a pointer to the World tab's Advance step.
- **E, assets**: each Asset: Name, Kind, Quantity, per-unit Value, total (Quantity times Value), Location, Linked note and Edit. Add asset below.

### Net worth breakdown panel

```
+--[A] title: How <Name>'s net worth is made up-------------------+
+--[B] accounts---------------------------------------------------+
| <Account Name>                                   <Balance>      |
| <Account Name>                                   <Balance>      |
+--[C] assets-----------------------------------------------------+
| <Asset Name>   <Quantity> x <Value>              <total>        |
| <Asset Name>   not valued                                       |
+--[D] total------------------------------------------------------+
| Net worth, valued at <date>                      <amount>       |
+--[E] close------------------------------------------------------+
|                                                    [Close]      |
+-----------------------------------------------------------------+
```

- **A, title.**
- **B, accounts**: each Account the viewer can see, with its Balance.
- **C, assets**: each Asset with its Quantity, per-unit Value and total, or "not valued".
- **D, total**: the net worth and the date it is valued at.
- **E, close.**

### Account ledger

```
+--[A] account header------------------------------------------------------+
| <Account Name>   Owner <Person>   <Visibility>   Balance <amount>        |
| [Account settings]        Lose / transfer: behaviour is ontology gap 35  |
+--[B] ledger, oldest first------------------------------------------------+
| Date        Description        Amount     Balance    Source              |
| <date>      <Description>      <amount>   <amount>   <Recurring item>    |
| <date>      <Description>      <amount>   <amount>   note: <Note>        |
| <date>      <Description>      <amount>   <amount>   Action: <Heading>   |
+--[C] actions-------------------------------------------------------------+
| [Add entry]                                                [Back]        |
+--------------------------------------------------------------------------+
```

- **A, account header**: Name, Owner, Visibility, Balance; Account settings; and a placeholder for losing or transferring the Account, whose behaviour is ontology gap 35.
- **B, ledger**: each Ledger entry with its Date, Description, Amount, the running balance after it, and its source: the Recurring item it came from, the note holding its money block, or the Action it is linked to. Choosing an entry opens the ledger entry dialog.
- **C, actions**: Add entry, and Back to the Money and assets section.

### Ledger entry dialog

```
+--[A] title: New entry / Edit entry----------------------------------+
+--[B] fields---------------------------------------------------------+
| Date          [<date>             ]                                 |
| Amount        [          ]  US dollars                              |
| Description   [                                             ]       |
| Action        [none | <Action>                          v]          |
+--[C] source---------------------------------------------------------+
| Shown in note: <Note>  [Open in Notes]     or: From <Recurring item> |
+--[D] buttons--------------------------------------------------------+
| [Remove entry]                          [Cancel]  [Save]            |
+---------------------------------------------------------------------+
```

- **A, title.**
- **B, fields**: Date, Amount, Description and Action.
- **C, source**: shown only for an entry with a money block (the note, with Open in Notes) or an entry made from a Proposal (its Recurring item).
- **D, buttons**: Remove entry (existing entries only), Cancel and Save.

### Account dialog

```
+--[A] title: New account / Account settings---------------------+
+--[B] fields----------------------------------------------------+
| Name         [                            ]                    |
| Owner        [<Person>                  v]                     |
| Visibility   (o) Everyone                                      |
|              ( ) Me and the game master                        |
|              ( ) Game master only                              |
| Currency     US dollars                                        |
+--[C] lose or transfer------------------------------------------+
| Lose / transfer: behaviour is ontology gap 35                  |
+--[D] buttons---------------------------------------------------+
| [Delete account] (gap 7)               [Cancel]  [Save]        |
+----------------------------------------------------------------+
```

- **A, title.**
- **B, fields**: Name, Owner, Visibility and Currency (US dollars only).
- **C, lose or transfer**: a placeholder; ontology gap 35.
- **D, buttons**: Delete account (gap 7), Cancel and Save.

### Recurring item dialog

```
+--[A] title: New recurring item / Edit recurring item-----------+
+--[B] fields----------------------------------------------------+
| Account       [<Account>                 v]                    |
| Description   [                                    ]           |
| Amount        [          ]  US dollars                         |
| Cadence       (o) monthly  ( ) quarterly  ( ) yearly           |
| Start date    [<date>          ]                               |
| End date      [<date or none>  ]                               |
+--[C] buttons---------------------------------------------------+
| [Delete]                               [Cancel]  [Save]        |
+----------------------------------------------------------------+
```

- **A, title.**
- **B, fields**: the Recurring item's Account (one of this Character's), Description (ontology gap 44), Amount, Cadence, Start date and End date.
- **C, buttons**: Delete (existing items only), Cancel and Save.

### Asset dialog

```
+--[A] title: New asset / Edit asset------------------------------------+
+--[B] fields-----------------------------------------------------------+
| Name           [                               ]                      |
| Kind           [               ]   typed-in tag                       |
| Quantity       [      ]                                               |
| Linked price   [none | <price item>          v]                       |
| Value          [          ] per unit, dated [<date>]  (ontology gap 7) |
|                or: follows <price item>: <Reading> on <date>           |
| Location       [                               ]                      |
| Linked note    [<Note>                       v]                       |
+--[C] value history----------------------------------------------------+
| <date>   <Value> per unit                          by <Person>        |
+--[D] buttons----------------------------------------------------------+
| [Delete asset]                           [Cancel]  [Save]             |
+-----------------------------------------------------------------------+
```

- **A, title.**
- **B, fields**: Name, Kind, Quantity, Linked price, Value (a new hand-entered per-unit value with its date, or, when linked, the Reading it follows), Location and Linked note.
- **C, value history**: every Asset value, newest first, with Author. Correcting an entry is gap 4.
- **D, buttons**: Delete asset (existing assets only), Cancel and Save.

### Turns section

```
+--[A] current round-------------------------------------------------------+
| Round <n> · <start date> to <end date>          <done | skipped | open>  |
| <turn note Name>                     [Open in Notes]   [Mark done] gap 12|
+--[B] earlier rounds------------------------------------------------------+
| Round   Period                          Mark       Turn note             |
| <n>     <start date> to <end date>      done       [Open in Notes]       |
| <n>     <start date> to <end date>      skipped    [Open in Notes]       |
| <n>     <start date> to <end date>      done       hidden (gap 10)       |
+--------------------------------------------------------------------------+
```

- **A, current round**: the current Round's number and period, this Character's Turn mark, the turn note's Name with Open in Notes, and Mark done (gap 12). Shown only when this Character has a Turn in the current Round.
- **B, earlier rounds**: every other Turn whose Character is this one, newest first: Round number, period, mark and Open in Notes.

## Behaviour

Numbered rules. A rule that restates a README decision quotes it and ends with its source in square brackets.

### Which character is shown

1. Opening the Player tab shows the viewed person's active Character (gap 1). The "viewing as" switch itself belongs to `01-app-shell.md`.
   - 1a. Arriving from a Character link in a note opens the Player tab on that Character, not on the viewed person's active Character. This rests on `04-notes.md` gap 10 (links to Characters and Events), whose recommendation is copied unchanged under [Gaps](#gaps).
   - 1b. Arriving from an Asset in the World tab's Economy section, where an item may list the Assets that follow it, opens the Player tab on that Asset's Character in the same way. This rests on `03-world.md` gap 37 (showing which Assets follow an item) and applies only if that gap is accepted.
2. The character picker lists every Person and every Character they have played, with its Status. Choosing one opens it. "The game master can open any character" [settled: **Game master**], and since "Everyone can edit everything, and every change records who made it" [settled: **Who may change what**], any Person can open and edit any Character. A Person who has left the campaign: ontology gap 3.
3. "A person can have more than one character over time" [settled: **Character life**]. Retired and dead Characters stay in the picker under their Person and open the same way; whether a Character can be deleted is ontology gap 43; the page offers no delete.
4. New character opens the new character dialog. Anyone can create a Character for any Person. The dialog offers active or retired; which status a new Character may start with is ontology gap 43. Its Name is required; "every character keeps a name and photo" [default: 16]. Its Birth date is required and "can be just a year" [default: 17]. Its starting stat values follow ontology gap 31; their range is ontology gap 30.
5. The Status menu changes the shown Character's Status. "A character is active, retired or dead" [settled: **Character life**] and "A person has one active character at a time" [settled: **People and characters**]. Whether the change is dated, and what happens to the Person's current active Character when another is made active, are ontology gap 4; the status change dialog leaves both as placeholders.
6. Retiring a Character or marking it dead changes no Account's Owner or Visibility: "Private things belong to the person, so they outlive a character" [settled: **People and characters**].
7. Every change made on this page records the Person in "viewing as" as its Author or as the Person who changed it: "every change records who made it" [settled: **Who may change what**]. What that record holds is ontology gap 42.

### Profile

8. Name and Photo can be changed at any time; "every character keeps a name and photo" [default: 16]. Choose photo picks a picture; Remove photo clears the Photo. Choosing the Photo opens it in the viewer: "Images render inside notes and open in the viewer" [default: 16].
9. "A birth date is stored and the age is shown from the game date" [settled: **Character life**]. The age is worked out from the Birth date and the current game date. How an age is shown when the Birth date is only a year is gap 2. The age of a dead Character is ontology gap 4. Which Round's date counts while a Round is reopened is ontology gap 9, and before any Round exists, ontology gap 8.
10. The Identity fields are "occupation or position, location and nationality, plus the free description. Changes are dated." [settled: **Identity**]. Change on an Identity field opens the identity change dialog; saving adds an Identity change with the Value and Date given, and the field shows the latest. The Date's kind and default are ontology gap 7. Location is text (ontology gap 27).
11. History on an Identity field shows every Identity change for it, newest first. Earlier entries are kept. Correcting a mistaken entry is gap 4.
12. The Description is "the free description" [settled: **Identity**], written and shown the way a note is written: "live preview in one pane, with a switch to raw source" [settled: **Editing**], with links that "can also point to characters and events" [settled: **Links and tabs**]. Whether it is a field on the Character or a Note is ontology gap 5; the editor belongs to `04-notes.md`. Whether Description changes are dated is gap 13.
13. "Non-player characters are notes, not sheets" [settled: **Identity**]. The picker lists only Characters played by a Person; a non-player character opens in the Notes tab.

### Stats

14. "One list per campaign; every character has a number for each." [settled: **Stats**]. The Stats region shows one row per Stat in the campaign's Stat list, in its order. Adding, renaming and reordering Stats belongs to `01-app-shell.md`. A Character with no value for a Stat added later: ontology gap 6. The Stat names are ontology gap 29.
15. Change on a Stat opens the stat change dialog. Saving adds a Stat change: "Changes are dated and kept, with a short reason, and can be attached to an action or an interterm." [settled: **Stats**]. New value and Reason are required. The Date's kind and default are ontology gap 7. The New value's range is ontology gap 30.
16. Attached to offers none, the Actions in this Character's turn notes, and Interterms. Attaching to a Turn with no heading is ontology gap 14. What happens to the attachment when the Action's heading is renamed or deleted is ontology gap 12.
17. History on a Stat shows every Stat change, newest first, the starting value last. Choosing an attached Action or Interterm opens its note in the Notes tab. Correcting a mistaken entry is gap 4.
18. Changing a Stat value does not change saved Rolls: "A saved roll keeps the modifier it was rolled with, even if the stat changes later" [default: 12].
19. Stat values are always visible: "Stats, assets and economy readings are always visible" [default: 3].
20. "A roll can pick a stat from the character" [settled: **Dice**]: the Dice panel reads the Stat values of the viewed Person's active Character, not of whichever Character this page is showing. The panel belongs to `01-app-shell.md`; whose stats are used when rolling in another Person's turn note is its gap 31, and the picker with no active Character its gap 30.

### Accounts

21. "A character has several accounts, each a ledger of dated entries (date, amount, description, optional link to an action)." [settled: **Money**]. Each Account the viewer can see is listed with its Balance, the sum of its Ledger entries.
22. New account opens the account dialog. Name is required. Currency is "US dollars only for now" [settled: **Currency**]. Owner is "the creator by default and changeable" [default: 5]; who it should default to when one Person creates an Account for another's Character is gap 9. Visibility defaults to everyone.
23. Visibility is one of "three levels: everyone, me and the game master, game master only. The default is everyone." [settled: **Secrets**]. "'Me' means an owner" [default: 5]: the Account's Owner. Who holds the game master role is ontology gap 1. "Ledger entries follow their account" [default: 3].
24. An Account the viewer cannot see is not listed, and its entries appear nowhere on the page: "Until the server exists, hidden means not shown, not protected." [settled: **Secrets**]; "Hidden things stay hidden everywhere" [default: 4].
25. "An account can be lost or transferred independently of the others." [settled: **Money**]. The account header and account dialog hold a labelled placeholder. Its behaviour is ontology gap 35.
26. Deleting an Account: gap 7.
27. Open ledger shows the Account's Ledger entries, oldest first, each with the running balance after it. The order of entries on the same Date is gap 8.
28. Add entry opens the ledger entry dialog. Date, Amount and Description are required. "A ledger entry … is stored as a day, defaulting to the first day of the current round" [default: 7]. Amount is positive in and negative out. Action is optional: "optional link to an action" [settled: **Money**]; it offers the Actions in this Character's turn notes. Linking to a Turn with no heading instead is ontology gap 14.
29. Choosing an entry opens it for editing. Every field can be changed, except the Action of an entry that has a money block, which comes from the block's place in the note (rule 30).
30. An entry that came from a money block shows the note it is in, with Open in Notes. It is one record: "a money or event block in a note and its ledger entry or timeline event are one record shown in two places. Editing either changes both." [settled: **Blocks are shared records**]. The full rule, including posting, belongs to `04-notes.md`. Its Action comes from its place in the note: "every block under it belongs to that action" [settled: **Actions**]; to change it, the block is moved in the note. A money block in a copied note that has not been posted has no Ledger entry and does not appear here [settled: **Blocks are shared records**].
31. A money block in a note whose Visibility differs from its Account's: ontology gap 17.
32. An entry made by accepting a Proposal shows the Recurring item it came from.
33. Remove entry on an entry with no money block: gap 6. On an entry whose money block still exists in a note: gap 5.

### Recurring items

34. "Characters list recurring income and spending." [settled: **Recurring money**]. "Recurring items each name an account, an amount, a cadence (monthly, quarterly, yearly), a start date and an optional end date." [default: 8]. The Account must be one of this Character's. Whether a Recurring item has a Description, and how the entries it makes get theirs, is ontology gap 44 (gap 14).
35. Add recurring item and Edit open the recurring item dialog. Recurring items can be created, changed and deleted. What a change does to Proposals already made but not yet decided is ontology gap 45.
36. "On advance the app proposes the entries for the period and a person confirms them." [settled: **Recurring money**]. Proposals are made and decided in the World tab's Advance step, which belongs to `03-world.md`; this page shows only the pointer and, afterwards, the entries made (rule 32).
37. Whether a Recurring item is hidden with its Account: ontology gap 20.

### Assets

38. "A free-form list. Each asset has a name, a typed-in kind tag, a quantity, an estimated value with a dated history, an optional location and an optional linked note." [settled: **Assets**]. Name, Kind and Quantity are required. Kind is typed in, not chosen from a list (ontology gap 33). An Asset belongs to one Character (ontology gap 34).
39. "Asset value is per unit." [default: 9]. Each row shows the per-unit Value and its total, Quantity times Value.
40. Entering a new Value in the asset dialog adds an Asset value with its date; earlier values are kept in the value history. The date's kind and default are ontology gap 7. Correcting a mistaken entry is gap 4. An Asset with no Value and no Linked price: gap 15.
41. Linked price offers only price items: "Only price items can be linked." [default: 10]. How an Economy item is marked as a price is ontology gap 25. A linked Asset is valued at "the latest reading on or before the date in question. With no reading, the asset shows as "not valued" rather than zero." [default: 10]. Whether its hand-entered values still apply is ontology gap 24. Readings are entered in the World tab's Economy section, which belongs to `03-world.md`.
42. Location is text (ontology gap 27). Linked note opens the Note in the Notes tab. A deleted Linked note stays, shown as missing: "Deleting something that is linked to leaves the links in place, shown as missing." [default: 14]. A Linked note the viewer cannot see is left out [default: 4].
43. "Debts are assets with a negative value." [settled: **Assets**]. A debt is entered as a negative per-unit Value.
44. Delete asset removes the Asset from net worth from then on. Snapshots already taken are not changed: "Later corrections do not redraw the past unless that round is reopened." [default: 11].
45. Assets are always visible [default: 3].

### Net worth

46. "Net worth is all account balances plus each asset's quantity times its value, with debts negative." [default: 9]. The current figure is valued at the date in gap 3. Assets that are "not valued" [default: 10] are named beside the figure; whether and how they count towards the total is gap 16.
47. How it is made up opens the breakdown panel: each Account's Balance, each Asset's total or "not valued", and the net worth.
48. "Net worth is charted per round." [settled: **Net worth**]. The chart shows one point per closed Round from this Character's Net-worth snapshots. "Net worth history is a snapshot taken when each round closes." [default: 11]. Snapshots are taken by the World tab's Advance step, which belongs to `03-world.md`. The date a snapshot is valued at is ontology gap 23.
49. A viewer who cannot see some of this Character's Accounts sees a figure, breakdown and chart that leave them out: "other people's view of a character's net worth leave out anything the viewer cannot see" [default: 4]. How a snapshot does this is ontology gap 22. Whether the page says that something is left out is gap 11.
50. A chart block in a note can also draw a Character's net worth: chart blocks draw from "app data such as an economy item, an account or net worth" [settled: **Tables and charts**]. Chart blocks belong to `04-notes.md`.

### Turns

51. "A character's turns are a section of the Player tab" [settled: **Where play happens**]. The Turns section lists every Turn whose Character is this one. "The turn note belongs to the character that was active when the round opened." [settled: **Turn notes and people**], so a Character made active mid-Round has no Turn in that Round, and a Character retired mid-Round keeps its Turn there.
52. Turn notes are created when a Round opens: "Each player gets one note per round, created for them" [settled: **Turn notes**]. Opening a Round belongs to `03-world.md`; the layout of a turn note belongs to `04-notes.md`.
53. The current Round's Turn is shown first and on its own. Each row shows the Round's number and period; the period follows "Round dates run date-to-date" [default: 6].
54. Open in Notes opens the turn note in the Notes tab: "Open notes are tabs." [settled: **Links and tabs**].
55. Each row shows the Turn's mark: done, skipped, or neither. "Each turn and the interterm get a 'done' mark, and a turn can be skipped." [settled: **Advancing**]. Whether the mark can be set from this page is gap 12.
56. A turn note the viewer cannot see: gap 10. Its Owner is ontology gap 11.
57. The game master sees this list for any Character they open; the list of every Person's turn note for a Round is "the World tab's Round section" [settled: **Game master**].

### Hand-overs

58. Saving: this page autosaves like the rest of the app (**Existing app**) and places its own save chip (region D of the page frame); the chip's states and what a person sees when a save fails belong to `01-app-shell.md`. The order of writes when one edit changes several records, such as a Ledger entry and its money block, belongs to `06-storage.md`.

### Coverage

| README item | Reflected in |
| --- | --- |
| **Tabs** | Purpose; Features |
| **Campaign** | Rule 2 (every Person in the campaign) |
| **Time** | Rules 51, 53 |
| **Round length** | Rule 53 (the period shown) |
| **Turns** | Rules 16, 28 (Actions offered for attachment) |
| **Resolution** | Rules 18, 20 |
| **Interterm** | Rules 16 (attach to an Interterm), 41 (Readings belong to World) |
| **Multi-user** | Rules 1, 7 |
| **Stats** | Rules 14, 15, 16, 17 |
| **Rolls** | Rule 18 |
| **Character life** | Rules 3, 4, 5, 9 |
| **Identity** | Rules 10, 11, 12, 13 |
| **Money** | Rules 21, 25, 28 |
| **Currency** | Rule 22; Features (later) |
| **Recurring money** | Rules 34, 36 |
| **Assets** | Rules 38, 43 |
| **Net worth** | Rules 41, 48 |
| **Timeline and divergences** | not this page |
| **Events** | not this page |
| **Economy** | Rule 41 |
| **Other world things** | not this page |
| **Where play happens** | Rule 51 |
| **Turn notes** | Rule 52 |
| **Editing** | Rule 12 |
| **Links and tabs** | Rules 1a, 12, 54 |
| **Notes calendar** | not this page |
| **Tables and charts** | Rule 50 |
| **Who may change what** | Rules 2, 7; Features (later) |
| **Secrets** | Rules 23, 24; Features (later) |
| **Existing data** | Changes from `archive/HANDOFF.md` |
| **Game master** | Rules 2, 57 |
| **Dice** | Rule 20 |
| **Sync** | Rule 7 (every change names a Person) |
| **People and characters** | Rules 5, 6 |
| **Turn notes and people** | Rule 51 |
| **Blocks are shared records** | Rule 30 |
| **Actions** | Rule 30 |
| **Advancing** | Rules 36, 55 |
| **Calendar** | Rule 9 (age from Gregorian dates) |
| **Existing app** | Rule 58; Changes from `archive/HANDOFF.md` |
| **Process** | Layout (wireframes for a later mockup pass) |
| Default 1 | not this page |
| Default 2 | not this page |
| Default 3 | Rules 19, 23, 45 |
| Default 4 | Rules 24, 42, 49 |
| Default 5 | Rules 22, 23 |
| Default 6 | Rule 53 |
| Default 7 | Rule 28 |
| Default 8 | Rule 34 |
| Default 9 | Rules 39, 46 |
| Default 10 | Rules 41, 46 |
| Default 11 | Rules 44, 48 |
| Default 12 | Rule 18 |
| Default 13 | not this page |
| Default 14 | Rule 42 |
| Default 15 | not this page |
| Default 16 | Rules 4, 8 |
| Default 17 | Rules 4, 9 |

## States

Loading and error messages follow the copy rule carried over from `archive/HANDOFF.md`: they never name the app and never speak as the app in the first person. Loading shows a loading line in place of the region, with no placeholder rows, as in that file's approved opening state. A region that fails to load shows "Couldn't load <region>." with Retry; the other regions are unaffected. What a person sees when a save fails belongs to `01-app-shell.md`.

| Section | Empty | Loading | Error | Hidden from the viewer |
| --- | --- | --- | --- | --- |
| Page frame | The viewed person has no Characters: "No characters yet" with New character. The viewed person has only retired or dead Characters: gap 1. The campaign has no People: belongs to `01-app-shell.md` | "Loading character…" in the section body; the header shows the Name once known | "Couldn't load this character." with Retry; the picker still works | Characters are always visible; nothing is hidden at this level |
| Character picker | A Person with no Characters shows "no characters" | Loading line in the list | "Couldn't load characters." with Retry | Nothing hidden; every Person and Character is always visible |
| Profile: summary | No Photo: an empty photo frame with Choose photo. Name and Birth date are required, so never empty | Loading line | Photo fails to load: "Couldn't load this image" in the frame, as in `archive/HANDOFF.md`. Other fields: section error | Always visible |
| Profile: identity | A field with no Identity change shows "Not set" with Change; its History says "No changes yet" | Loading line | Region error | Always visible |
| Profile: stats | The campaign's Stat list is empty: "No stats in this campaign yet", pointing to where `01-app-shell.md` manages the list. A Stat with no Value: ontology gap 6 | Loading line | Region error | Always visible (default 3) |
| Profile: description | "No description yet", ready to type into | Loading line | Region error | Always visible (ontology gap 5) |
| Net worth | No Accounts and no Assets: the figure shows zero with "No accounts or assets yet". No closed Rounds: the chart shows "Charted once a round closes" | Loading line for the figure and the chart separately | Region error; a chart that fails to draw shows its own error and leaves the figure | Hidden Accounts are left out of the figure, breakdown and chart (default 4; ontology gap 22). Whether this is marked: gap 11 |
| Accounts | "No accounts yet" with New account | Loading line | Region error | An Account the viewer cannot see is not listed. If every Account is hidden, the region shows the empty state, so it does not reveal that hidden ones exist (gap 11) |
| Account ledger | "No entries yet" with Add entry | Loading line | "Couldn't load this ledger." with Retry | The ledger of a hidden Account cannot be opened. A money block's note the viewer cannot see: ontology gap 17 |
| Recurring items | "No recurring items" with Add recurring item | Loading line | Region error | Ontology gap 20 |
| Assets | "No assets yet" with Add asset | Loading line | Region error | Assets are always visible (default 3). A Linked note the viewer cannot see is left out (default 4) |
| Turns | No Turns: "No turns yet. Turn notes are created when a round opens." No Turn in the current Round: region A is not shown | Loading line | Region error. A turn note that cannot be opened is handled by the Notes tab | A turn note the viewer cannot see: gap 10 |

## Changes from `archive/HANDOFF.md`

Only the "Player/Notes revision" section of that file concerns this page. The rest of it (editor, sidebar, viewer, dialogs, empty, loading and error states) is not changed by this spec.

| Earlier design | This spec |
| --- | --- |
| One player profile per opened folder | Superseded. A campaign holds many People and Characters; the page shows one Character at a time, chosen with the character picker (rules 1 to 5) |
| Profile fields: name, photo, ordered custom label and value stats, Markdown description | Superseded in part. Name and Photo are kept (default 16). Custom stats are replaced by the campaign's Stat list with a dated history per Character (rules 14 to 17). The description stays, written the way a note is written (rule 12, ontology gap 5). Added: Birth date and age, Status, Identity fields |
| The related-notes list of notes from a fixed folder, each revealed and focused in Notes | Superseded. Replaced by the Turns section (rules 51 to 57). Notes can link to a Character (`04-notes.md`), but nothing yet lists the notes that link to one; whether a Character has a "linked from" list is gap 17 |
| The profile and description files at the root of the folder, reserved from ordinary create, rename and trash | Superseded. Fresh start: the old profile files are not migrated (**Existing data**). How records are stored belongs to `06-storage.md` |
| One shared save session for the description, and the order in which pending saves are flushed before navigating or closing | Not decided here. This page places its save chip (region D); the chip's states and the failed-save banner belong to `01-app-shell.md`, and the order of writes to `06-storage.md` |
| A left rail placing Player before Notes, and Player as the default when the app starts or a folder opens | Not decided here. The rail and the starting tab belong to `01-app-shell.md` |
| Neutral grayscale palette, fonts and spacing; photos keep their colour | Not decided here. Visual design is for the mockup pass |
| Money, assets, net worth and turns | New in this spec |

## Gaps

### Carried from the ontology

Each is cited in the body as "ontology gap N". The recommendation is copied unchanged from `00-ontology.md`.

- **Ontology gap 1. How the role is recorded.** Recommendation: a role field on Person with the values player and game master; exactly one Person holds game master at a time; the game master may also play a Character.
- **Ontology gap 3. A Person leaving.** Recommendation: a Person is never deleted, because records name them as Author and Owner; they are marked as having left and drop out of the turn order.
- **Ontology gap 4. Character status changes.** Whether status changes are dated, and what happens to a Person's active Character when another is made active. Recommendation: each status change records its game date, so a dead Character's age stops at death; making a Character active asks whether the previous one is retired or dead.
- **Ontology gap 5. The free description.** Whether a Character's free description is a field or a Note. Recommendation: a field on the Character, edited with the note editor and able to hold links, always visible.
- **Ontology gap 6. Stats added or removed mid-campaign.** Recommendation: when a Stat is added, every Character's value starts as "not set" until entered; a removed Stat is hidden, not deleted, so saved Rolls and change histories keep its name.
- **Ontology gap 7. Dates on stat, identity and asset value changes.** Default 7 covers only Ledger entries and Readings. Recommendation: the same rule, a day defaulting to the first day of the current Round.
- **Ontology gap 8. Opening rounds.** How the first Round opens, and whether Advance opens the next Round at once. Recommendation: the first Round opens when the campaign is created, starting on its start date; Advance closes the Round and opens the next at once, asking for its length with the previous length as the default.
- **Ontology gap 9. Reopened rounds.** What may change in a reopened Round and which Round is current meanwhile. Recommendation: notes, blocks, marks and decided Proposals can be corrected, but not the length or start date while later Rounds exist; the latest Round stays current; closing the reopened Round retakes only its own snapshots.
- **Ontology gap 11. Owner and date of app-created notes.** Recommendation: a turn note is owned by its Turn's Person; an interterm note is owned by the game master; an interterm note is dated to its Round, like a turn note.
- **Ontology gap 12. What identifies an Action when its heading changes.** Recommendation: an Action keeps its Id when its heading is renamed; when the heading is deleted, its blocks join the Action above (or the Turn as a whole), and Ledger entries, Stat changes and Events that pointed at it point at the Turn instead. How the Id is kept with the heading belongs to `06-storage.md`.
- **Ontology gap 14. Records with no heading.** Whether a Roll, a Ledger entry and a Stat change attach to an Action or to the Turn or Interterm when there is no heading. Recommendation: they attach to the Turn or Interterm as a whole, the same as blocks above the first heading; Ledger entries and Stat changes may point at a Turn or Interterm as well as an Action.
- **Ontology gap 17. A block's note and its record at different levels.** For example a money block in an everyone note posting to a game-master-only account. Recommendation: the record keeps its own level; viewers who cannot see the record see the block as hidden in the note.
- **Ontology gap 20. Visibility of Recurring items and Proposals.** Recommendation: both follow their Account, like Ledger entries.
- **Ontology gap 22. Net-worth snapshots and hidden accounts.** Recommendation: a snapshot stores each Account's balance and each Asset's value as parts, so each viewer's total leaves out what they cannot see (default 4).
- **Ontology gap 23. The date a snapshot values at.** Recommendation: the Round's last day, the day before its end date.
- **Ontology gap 24. Hand values on a linked Asset.** Recommendation: while linked, an Asset uses only the price; its hand-entered history is kept and used again if it is unlinked.
- **Ontology gap 25. How an Economy item is marked as a price.** Recommendation: a yes/no "price" field set when the item is created, with the unit read as an amount per unit.
- **Ontology gap 27. Does a place become a record of its own.** Carried over from `05-map.md`, gap 1. Recommendation (from there): a named place with an optional point, so that "Chicago" is entered once and reused; until then, text.
- **Ontology gap 29. Stat names.** Carried over from "Still to settle". Recommendation: the Stat list starts empty and the table enters its names.
- **Ontology gap 30. Stat range.** Carried over. Recommendation: whole numbers with no fixed range until the range is given.
- **Ontology gap 31. Starting stat values.** Carried over. Recommendation: typed in by hand when the Character is created.
- **Ontology gap 33. The kinds of things characters own.** Carried over. Recommendation: the kind stays a typed-in tag.
- **Ontology gap 34. Co-owned assets.** Carried over. Recommendation: one Character per Asset until co-ownership is described.
- **Ontology gap 35. Lost or transferred accounts.** Carried over. Recommendation: an Account status of open, lost or transferred; a lost or transferred Account keeps its history and counts nothing towards net worth from that date.
- **Ontology gap 42. The record of changes.** **Who may change what** says every change records who made it, but not what is kept. Recommendation: each record keeps who last changed it and when (real-world time) now; a full list of changes that people can look through is later.
- **Ontology gap 43. Deleting records, and a new Character's status.** The README does not say whether a Campaign, Character, Round, Turn or Interterm can be deleted in the app, or which status a new Character may start with. Recommendation: none of them can be deleted in the app, so history stays whole (a Turn nobody writes is skipped; a campaign ends when its folder is removed outside the app); a new Character may start with any status, so that a past Character can be entered.
- **Ontology gap 44. A description on a Recurring item.** Default 8 names an account, an amount, a cadence and dates, but every Ledger entry needs a description. Recommendation: a Recurring item has a required description, copied to each Proposal and the Ledger entry it makes, where it can be edited.
- **Ontology gap 45. Changing a Recurring item while its Proposals are undecided.** Recommendation: undecided Proposals are remade from the changed item; decided ones are left alone.

### Carried from other specs

- **`04-notes.md` gap 10. Links to Characters and Events.** How they are suggested and what clicking opens. Hand-over to `02-player.md` and `03-world.md`. Recommendation: suggestions label each match note, character or event; a Character link opens the Player tab on that Character, an Event link opens the World tab's timeline with the Event selected.

### New to this page

1. **Which Character the tab opens on.** The README says the game master can open any Character but not what the tab shows first, nor what it shows when the viewed person has no active Character. Recommendation: the viewed person's active Character; when "viewing as" changes, the page returns to the new person's active Character; with no active Character, the page shows the empty state with the person's past Characters listed and New character.
2. **Age from a year-only Birth date.** Default 17 allows a Birth date that is only a year, but the age it gives can be off by one. Recommendation: work out the age from the years alone and show it as "about N".
3. **The date the current net worth is valued at.** Default 10 values a linked Asset "on or before the date in question", but the live figure has no such date. Recommendation: the date the next snapshot will use (ontology gap 23), so the live figure matches what the Round will record when it closes.
4. **Correcting history entries.** The ontology keeps past Stat changes, Identity changes and Asset values, and says a Stat value is "changed only by adding a Stat change", so a mistyped entry cannot be fixed. Addressed to the ontology. Recommendation: a past entry can be edited to fix a mistake, recording who changed it (ontology gap 42); entries are not removed, so the history stays complete.
5. **Removing a Ledger entry whose money block still exists in a note.** Recommendation: ask whether to keep or delete the block, mirroring the question asked when the block is removed.
6. **Removing a Ledger entry that has no block.** The ontology's Ledger entry life cycle names removal only through its block. Addressed to the ontology. Recommendation: Remove entry deletes it after a confirmation that names its Date, Amount and Description.
7. **Deleting an Account.** The ontology's Account life cycle has no deletion. Addressed to the ontology. Recommendation: an Account with no Ledger entries can be deleted; one with entries can only be lost or transferred (ontology gap 35).
8. **Order of entries on the same day.** The running balance needs an order, and a Ledger entry's Date is only a day. Recommendation: by Date, then in the order the entries were added.
9. **Owner of an Account made for someone else's Character.** Default 5 makes the creator the Owner, so a game master who creates a "me and the game master" Account for a player's Character owns it, and the player cannot see it. Recommendation: keep default 5, and show Owner in the new account dialog so it can be set to the Character's Person in the same step; ask the user whether the Character's Person should be the default instead.
10. **A turn note the viewer cannot see.** The Turn is always visible but its note carries a level. Recommendation: the row stays, with "hidden" in place of Open in Notes.
11. **Saying that something is left out.** Default 4 leaves hidden Accounts out of another viewer's view of net worth, but does not say whether the page marks the figure as partial. Recommendation: no marker, because a marker would reveal that hidden Accounts exist.
12. **Setting a Turn's done mark from this page.** The README gives each Turn a done mark and a skip, and the World tab's Advance shows them, but does not say where they are set. Recommendation: the current Round's Turn has Mark done here; it is the same Turn record the World tab shows, so either place changes both. Skipping stays in the World tab.
13. **Whether Description changes are dated.** **Identity** lists "plus the free description. Changes are dated.", which can be read as dating Description changes too; the ontology keeps the Description out of the Identity history. Addressed to the ontology. Recommendation: follow the ontology: the Description is not a dated history.
14. **Description on a Recurring item.** Now asked by the ontology as ontology gap 44; its recommendation is under [Carried from the ontology](#carried-from-the-ontology).
15. **An Asset with no Value.** An Asset's Value is "required (derived)" from its value history, but the history is optional, and "not valued" is defined only for linked Assets. Addressed to the ontology. Recommendation: the asset dialog asks for a Value when the Asset is created without a Linked price, so every unlinked Asset has one.
16. **How "not valued" Assets count.** Default 10 says a linked Asset with no Reading "shows as 'not valued' rather than zero", but not how the net worth total treats it. Recommendation: the total leaves it out and names it beside the figure, as a Net-worth snapshot's Not valued list does.
17. **A "linked from" list on a Character.** **Links and tabs** lets links point to Characters, but the ontology gives a "linked from" list to Note only, so nothing shows which notes link to a Character. The old related-notes list is superseded (Changes from `archive/HANDOFF.md`). Recommendation: yes, on the Profile section, following the same hiding rule as the Notes list.
