# 00 Ontology

Status: draft. This file is the shared vocabulary for the design specs. It names every kind of record in a campaign, defines its fields, says what it links to and how it is created, changed and ended. The other specs use these terms and do not redefine fields. The source of every statement is the decision list in `README.md`: "Settled so far" (tagged **settled** below) and "Defaults adopted" (tagged **default**, open to change). Anything the decision list does not settle is a numbered question in [Gaps](#gaps), marked "(gap N)" where it applies.

The current app's single-player profile is replaced by this model. Nothing is migrated (**Existing data**).

## Contents

- [How to read this file](#how-to-read-this-file)
- [Relationships](#relationships)
- [Terms in the README](#terms-in-the-readme)
- [Common terms](#common-terms): Game date, Visibility level, Owner and Author, Place
- [Campaign and people](#campaign-and-people): Campaign, Person, Character, Stat, Stat value, Identity fields, Image
- [Play](#play): Round, Turn, Interterm, Turn note and Interterm note, Action, Roll
- [Notes](#notes): Note, Block, Link, Table file
- [Money](#money): Account, Ledger entry, Recurring item and Proposal, Asset, Net-worth snapshot
- [World](#world): Event, Divergence entry, Economy item and Reading
- [Rules that span records](#rules-that-span-records)
- [Gaps](#gaps)
- [Coverage](#coverage)

## How to read this file

Each kind of record has a short definition, a field table, what it links to, its life cycle, and its owner and visibility where it has them.

Field tables use these columns:

- **Field**: the name used in every spec.
- **Kind of value**: text, number, yes/no, a choice from a fixed list, a Game date, or a reference to another record.
- **Required**: required or optional. "Derived" means the app works the value out; nobody types it.
- **When**: "now" for the first version, "later" only where the README defers the feature.
- **Notes**: anything else, including the gap that leaves the field open.

Every record has an **Id** and an **Author**, so every field table begins with them. An Id identifies one record in the campaign and never changes, even when the record is renamed (**Sync**). The Author is the Person who created the record. Every later change also records the Person who made it (**Who may change what**). What that record of changes holds, and whether people can look through it, is gap 42; how it is kept on disk belongs to `06-storage.md`.

A record is "always visible" when it has no visibility level of its own. Only Note, Account and Event carry a level (rule 21).

## Relationships

How play is organised:

```
                        +------------+
                        |  Campaign  |  turn order, stat list,
                        +------------+  economy list, divergence list
                         |     |     |
           +-------------+     |     +--------------+
           v                   v                    v
     +----------+  plays  +-----------+        +---------+
     |  Person  |-------->| Character |        |  Round  | period, own turn
     +----------+  one    +-----------+        +---------+ order, status
       |         active        ^                 |      |
       |                       | belongs to      |      | one
       | takes                 |   one per person|      v
       |                 +-----------+           |  +-----------+
       +---------------->|   Turn    |<----------+  | Interterm |
                         +-----------+              +-----------+
                               | has                     | has
                               v                         v
                         +-----------+          +----------------+
                         | Turn note |          | Interterm note |
                         +-----------+          +----------------+
                           |       | each heading        |
                           |       v marks an            |
                           |   +--------+                |
                           |   | Action |                |
                           |   +--------+                |
                           |       | groups the blocks   |
                           v       v under it            v
                     +--------------------------------------+
                     | Block: roll | money | event          |
                     |        chart | table file (display)  |
                     +--------------------------------------+
                           |            |            |
                           v            v            v
                         Roll     Ledger entry     Event
                     (the block    (same record shown in two places)
                      itself)
```

What a character holds, and the world:

```
 +-----------+
 | Character |--+--> Stat value -------> Stat (the campaign's list)
 +-----------+  |      '-- dated changes, each optionally on an Action or Interterm
                +--> Identity fields (occupation or position, location,
                |      nationality), each with a dated history
                +--> Account ---------> Ledger entry <--- accepted Proposal
                |      ^                                      ^
                |      '------------ Recurring item ----------'
                +--> Asset ---- value history (per unit)
                |      '-- may follow --> Economy item (price) --> Reading
                +--> Net-worth snapshot (one per closed Round)
                +--> Image (photo)

 Event ------------- marker, "in our world" line, tags, place (text)
 Divergence entry -- item in the campaign's free-text list
 Note --- Link ---> Note | Character | Event
 Note --- shows --> Image, Table file, chart drawn from data
```

## Terms in the README

The README often says "player" for both the friend at the table and the human they play. This file uses **Person** for the friend and **Character** for the human in the game. "Player" survives only as the name of the Player tab and of the role (rule 37, gap 1).

| README wording | Where | Means |
| --- | --- | --- |
| "several players and a game master" | **Campaign** | Persons, one of whom holds the game master role |
| "one world, many players" | **Campaign** | Persons, each playing a Character |
| "Each player takes a turn" | **Time** | A Person takes the Turn |
| "what a player may attempt" | **Turns** | What a Character attempts, written by its Person in the turn note |
| "acting as any player or as game master" | **Multi-user** | "Viewing as" picks a Person |
| "every character has a number for each" | **Stats** | Character (already the right word) |
| "characters have several accounts", "characters list recurring income" | **Money**, **Recurring money** | Character; the Owner of a private account is a Person |
| "promoted from a player's action" | **Events** | An Action in a Character's turn note |
| "Each player gets one note per round, created for them" | **Turn notes** | One Turn per Person per Round; the turn note belongs to the Character active when the round opened |
| "whose turn it is" | **Where play happens** | The Person whose Turn is next in the Round's turn order |
| "every player's turn note" | **Game master** | The turn note of every Turn in the Round |
| "A person at the table and the character they play" | **People and characters** | Person and Character |
| "Non-player characters are notes, not sheets" | **Identity** | Characters of the world played by no Person; they are Notes, not Character records |
| "Player tab" | **Tabs** | Stays the tab's name. The Player tab is a Character's page, opened by a Person |
| "campaign, player, round, ..." | Spec list for this file | Person and Character |

## Common terms

### Game date

A date on the real Gregorian calendar inside the game's world (**Calendar**). It is distinct from the real-world time at which a record was created or changed.

A Game date has one of four precisions:

| Precision | Example | Used by |
| --- | --- | --- |
| Day | 10 February 1962 | Round start, Ledger entry, Reading, Recurring item dates, Character birth date |
| Month | February 1962 | Event, Note |
| Year | 1962 | Event, Note, Character birth date (default 17) |
| Range | 10 February 1962 to May 1962 | Event, Note, Turn note (dated to its round) |

Each end of a range has its own precision (gap 28).

The **current game date** is the start date of the current Round (gap 9 for which round is current while one is reopened). Ages, defaults for new dates and the World tab's date all read it.

### Visibility level

A choice that says who may see a record. Only Note, Account and Event carry one (default 3).

| Level | Who sees the record |
| --- | --- |
| Everyone | Every Person. The default for a new record |
| Me and the game master | The record's Owner and the Person who holds the game master role (gap 1) |
| Game master only | The Person who holds the game master role |

A Ledger entry follows its Account's level. Stat, Stat value, Asset and Reading are always visible. Every other record is always visible too (rule 21). In the first version "hidden" means not shown, not protected: the data is on the machine (**Secrets**). Real protection comes with the server, later.

### Owner and Author

- **Author**: the Person who created a record. Every record has one. The Author is the Person picked by "viewing as" at the moment of creation (rule 4). Where the app itself creates a record, see gap 10.
- **Owner**: the Person a private record belongs to. Only records that can be private have one: Note, Account and Event. The Owner is the creator by default and can be changed. It is not whoever last edited the record (default 5). "Me" in the visibility level means the Owner. Private things belong to the Person, not the Character, so they outlive any one Character (**People and characters**).

### Place

In the first version a place is text, not a record. Three records carry one:

- an Event's place;
- an Asset's location;
- a Character's Identity location, with its dated history.

Whether a place becomes a record of its own, shared by several records and shown on the Map tab, is gap 27 (carried over from `05-map.md`, gap 1).

## Campaign and people

### Campaign

One opened folder is one campaign: one world, many people (**Campaign**). Everything in this file belongs to exactly one campaign.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | The Person who created the campaign |
| Name | text | required | now | |
| Start date | Game date, day | required | now | The actual date is not yet given (gap 36). The first Round opens on it (gap 8) |
| People | list of Person | required | now | Everyone at the table, including the game master |
| Turn order | ordered list of Person | required | now | The campaign's usual order. Each Round copies it when it opens (rule 36). Who is in it: gap 2 |
| Stat list | ordered list of Stat | required | now | One list for the whole campaign (**Stats**). May be empty at first |
| Economy list | list of Economy item | optional | now | Defined per campaign (**Economy**) |
| Divergence list | ordered list of Divergence entry | optional | now | |
| Currency | choice: US dollars | required | now | US dollars only. Several currencies with exchange rates: later (**Currency**) |

**Links to:** Person, Character, Stat, Round, Economy item, Divergence entry; every other record through them.

**Life cycle:** created when a new campaign folder is set up. Old material is copied in by hand (**Existing data**). Its fields change through the app shell. Whether a campaign can be ended or deleted in the app is gap 43.

**Owner and visibility:** none. Always visible.

#### Turn order

The campaign's turn order is the usual order in which People take their Turns. When a Round opens it copies the campaign's order as its own. The Round's order can then be changed by hand or shuffled with a button, without changing the campaign's usual order (**Advancing**, rule 36).

### Person

A friend at the table. A Person plays Characters, takes Turns, authors and owns records, and is what "viewing as" picks (**People and characters**).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | Who added this Person to the campaign |
| Name | text | required | now | |
| Role | choice: player, game master | required | now | How the role is recorded is gap 1. In the first version it restricts nothing (rule 37). Real permissions: later |
| Characters | list of Character | required (derived) | now | Every Character this Person has played. May be empty |
| Active character | Character | required (derived) | now | The one Character with status active, if any (rule 3) |

**Links to:** Character (plays), Turn (takes), every record (as Author), Note, Account and Event (as Owner).

**Life cycle:** added to the campaign by anyone. Name and role can be changed. Whether and how a Person leaves a campaign is gap 3.

**Owner and visibility:** none. Always visible.

#### Role

A Person is a player or the game master. Who holds the game master role decides who sees "game master only" records and "me and the game master" records, and who is shown the interterm. How the role is recorded, whether there is exactly one game master, and whether the game master may also play a Character are gap 1. In the first version the role restricts nothing: everyone can edit everything (**Who may change what**). Separate roles with real permissions come later.

### Character

A human in the game world, played by one Person. A Person can have several Characters over time but only one active at a time (**Character life**, **People and characters**). Each Character has a page: the Player tab.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Person | Person | required | now | Who plays this Character |
| Name | text | required | now | Carried over from the current app (default 16) |
| Photo | Image | optional | now | Carried over (default 16) |
| Birth date | Game date, day or year | required | now | A year alone is allowed (default 17). The age is shown from the current game date (rule 33) |
| Status | choice: active, retired, dead | required | now | One active Character per Person (rule 3). Dating of status changes: gap 4 |
| Description | text with links | optional | now | The free description (**Identity**). Whether it is a Note: gap 5 |
| Stat values | one Stat value per Stat | required | now | See Stat value |
| Identity fields | occupation or position, location, nationality | optional | now | See Identity fields |
| Accounts | list of Account | optional | now | |
| Assets | list of Asset | optional | now | |
| Recurring items | list of Recurring item | optional | now | |
| Net-worth snapshots | list of Net-worth snapshot | required (derived) | now | One per closed Round in which the Character existed |

**Links to:** Person, Image, Stat value, Identity fields, Account, Asset, Recurring item, Net-worth snapshot, Turn (the Turns whose note belongs to it). Notes and Events can link to a Character (Link).

**Life cycle:** created by anyone for a Person. Which status a new Character may start with is gap 43; what happens to a Person's current active Character when another is made active is gap 4. Status moves between active, retired and dead. Whether a Character can be deleted is gap 43. Its private things belong to its Person (rule 3).

**Owner and visibility:** no Owner, no level. Always visible. Its Accounts carry their own levels.

### Stat

One entry in the campaign's list of stats, such as Science (**Stats**). The actual names are not yet given (gap 29).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Name | text | required | now | |
| Position | number | required | now | Order in the campaign's list |

**Links to:** Campaign; Stat value (one per Character); Roll (the stat a roll used).

**Life cycle:** added, renamed and reordered by anyone. What happens to Characters' values when a Stat is added or removed mid-campaign is gap 6.

**Owner and visibility:** none. Always visible (default 3).

### Stat value

A Character's number for one Stat, with its dated change history (**Stats**). Science 63 adds 63 to science rolls (**Resolution**).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Character | Character | required | now | |
| Stat | Stat | required | now | |
| Value | number | required (derived) | now | The value of the latest change. Range not yet given (gap 30); starting values not yet given (gap 31) |
| Changes | list of Stat change | required | now | The first entry is the starting value |

Each entry in the history is a **Stat change**:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Date | Game date | required | now | Kind of date: gap 7 |
| New value | number | required | now | |
| Reason | text, short | required | now | **Stats** says changes are kept "with a short reason" |
| Attached to | Action or Interterm | optional | now | **Stats**. Attaching to a Turn with no heading: gap 14 |

**Links to:** Character, Stat; each change optionally to an Action or Interterm.

**Life cycle:** created with the Character (or the Stat, gap 6). Changed only by adding a Stat change; past changes are kept. Ends with its Character or Stat.

**Owner and visibility:** none. Always visible (default 3).

### Identity fields

A Character's occupation or position, location and nationality, each with a dated history (**Identity**). The free description sits on the Character and is not part of this history.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | One per Character |
| Author | Person | required | now | |
| Character | Character | required | now | |
| Occupation or position | text | optional (derived) | now | Latest entry in its history |
| Location | text (a place) | optional (derived) | now | Latest entry. A place is text in the first version (gap 27) |
| Nationality | text | optional (derived) | now | Latest entry |
| History | list of Identity change | optional | now | |

Each entry is an **Identity change**:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Field | choice: occupation or position, location, nationality | required | now | |
| Value | text | required | now | |
| Date | Game date | required | now | Kind of date: gap 7 |

**Links to:** Character.

**Life cycle:** an Identity change is added whenever one of the three fields changes. Past entries are kept.

**Owner and visibility:** none. Always visible.

### Image

A picture in the campaign: a Character's photo, or an image shown inside a note. Images render inside notes and open in the viewer (default 16).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | Who added it |
| Name | text | required | now | Shown in the Notes tab |
| Folder | folder in the campaign | required | now | |

**Links to:** nothing. Characters (as photo) and Notes (shown inside) point to it.

**Life cycle:** added by choosing a picture or placing one in the campaign folder. Renamed, moved and deleted like a note. A note that shows a deleted image shows it as missing (default 14).

**Owner and visibility:** none. Always visible.

## Play

### Round

One step of play covering one period of game time. Each Person takes a Turn, the game master runs the Interterm, and then the date advances (**Time**).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | Who opened it (gap 10) |
| Number | number | required (derived) | now | 1 for the first Round, counting up |
| Length | choice: month, quarter, year | required | now | Chosen when the Round opens (**Round length**) |
| Start date | Game date, day | required | now | The previous Round's end date, or the campaign's start date for the first Round (gap 8) |
| End date | Game date, day | required (derived) | now | Start date plus length, date to date. It belongs to the next Round (default 6, rule 15) |
| Turn order | ordered list of Person | required | now | Copied from the campaign when the Round opens; changeable; can be shuffled (rule 36) |
| Status | choice: open, closed, reopened | required | now | See life cycle |
| Turns | list of Turn | required | now | One per Person (rule 2) |
| Interterm | Interterm | required | now | Exactly one |
| Proposals | list of Proposal | optional | now | Made at Advance (rule 16) |
| Net-worth snapshots | list of Net-worth snapshot | required (derived) | now | Taken when the Round closes (rule 20) |

The Round's **period** runs from its start date up to, but not including, its end date. Every Turn and the Interterm in the Round cover that period (rule 1).

**Links to:** Campaign, Turn, Interterm, Proposal, Net-worth snapshot.

**Life cycle:**

1. **Opened.** Its length is chosen and its turn order copied from the campaign. Its Turns, turn notes, Interterm and interterm note are created (rule 2). Status: open. How the first Round opens, and whether Advance opens the next Round at once, is gap 8.
2. **Played.** Turns and the Interterm are written and marked done or skipped.
3. **Closed** by Advance. Advance shows the checklist, the table may go ahead with unfinished items, every Proposal must be decided, snapshots are taken, and the date advances (rule 28). Status: closed.
4. **Reopened** to correct it. Status: reopened. Closing it again sets it back to closed and retakes its snapshots (rule 29). What may change while reopened is gap 9.

Whether a Round can be deleted is gap 43.

**Owner and visibility:** none. Always visible.

### Turn

One Person's part in one Round: a slot in the turn order with a turn note, a done mark and a skipped state (**Turn notes and people**, **Advancing**).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | gap 10 |
| Round | Round | required | now | |
| Person | Person | required | now | Who takes the Turn |
| Character | Character | required | now | The Person's active Character when the Round opened (rule 2). Fixed for the Turn even if the Character's status later changes |
| Turn note | Note | required | now | See Turn note |
| Position | number | required (derived) | now | From the Round's turn order |
| Done | yes/no | required | now | Starts as no. Anyone can set or clear it (rule 37) |
| Skipped | yes/no | required | now | Starts as no. Anyone can set or clear it |

A Turn is **unfinished** when it is neither done nor skipped (rule 28).

**Links to:** Round, Person, Character, Turn note; Actions through its note.

**Life cycle:** created for each Person in the Round when it opens (who is in it: gap 2). Marked done or skipped, and unmarked, at any time. Whether a Turn can be deleted is gap 43.

**Owner and visibility:** none. Always visible. Its turn note carries a level as a Note.

### Interterm

The game master's part of a Round: events and narration covering overlaps between turns and world events the turns did not (**Time**, **Interterm**).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | gap 10 |
| Round | Round | required | now | One Interterm per Round |
| Interterm note | Note | required | now | See Interterm note |
| Done | yes/no | required | now | Starts as no |

An Interterm is **unfinished** when it is not done (rule 28).

**Links to:** Round, Interterm note; Stat changes attached to it (**Stats**); Events created in it (**Events**).

**Life cycle:** created when its Round opens. Marked done and unmarked at any time. Whether an Interterm can be deleted is gap 43.

**Owner and visibility:** none. Always visible. Its note carries a level as a Note.

### Turn note and Interterm note

A **turn note** is the Note in which a Person writes their Character's Turn as prose. An **interterm note** is the Note in which the game master writes the Interterm. Both are ordinary Notes with the same editor, links and blocks (**Turn notes**). They add these fields:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | As for any Note |
| Author | Person | required | now | gap 10 |
| Turn or Interterm | Turn or Interterm | required | now | The one this note belongs to |
| Character | Character | required (derived) | now | Turn notes only: the Turn's Character. The turn note belongs to this Character (rule 2) |
| Owner | Person | required | now | gap 11 |
| Game date | Game date, range | required (derived) | now | Turn note: its Round's period (default 7). Interterm note: gap 11 |
| Actions | list of Action | optional (derived) | now | Turn notes: one per heading (rule 8). Interterm notes: gap 13 |

All other fields are a Note's.

**Links to:** Turn or Interterm; Blocks inside; Actions (turn notes).

**Life cycle:** created by the app when the Round opens, one per Turn and one for the Interterm (rule 2). Written and edited like any Note. Deleting one that holds blocks is gap 18.

**Owner and visibility:** as for any Note. Owner: gap 11.

### Action

One free-form thing a Character attempts in a Turn, marked by a heading in the turn note (**Turns**, **Actions**). An Action is derived from the heading: it is not written anywhere else.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | What keeps it when the heading is renamed or deleted: gap 12 |
| Author | Person | required (derived) | now | Who wrote the heading |
| Turn | Turn | required (derived) | now | The Turn whose note holds the heading |
| Heading | text | required (derived) | now | The heading's text, shown as the Action's name |
| Position | number | required (derived) | now | Order in the note |
| Blocks | list of Block | optional (derived) | now | Every block under the heading, up to the next heading (rule 8) |

**Links to:** Turn; Blocks under it, and through them Rolls, Ledger entries and Events. Ledger entries, Stat changes and Events can point to an Action (**Money**, **Stats**, **Events**).

**Life cycle:** exists while its heading exists in a turn note. Renaming or deleting the heading: gap 12. Headings are optional; a turn note with none has no Actions, and its blocks belong to the Turn as a whole (rule 8). Whether headings in an interterm note are Actions: gap 13.

**Owner and visibility:** none of its own. It is part of its turn note.

### Roll

A saved dice roll: the die result, plus an optional stat, plus an optional one-off modifier, giving a total and a free-text verdict (**Rolls**). A Roll is saved as a roll block in a note, under the Action it resolved, or under the Turn as a whole when there is no heading. There is no separate list of Rolls (rule 9). Casual rolls in the Dice panel are not saved and are not Rolls.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | The same record as its roll block |
| Author | Person | required | now | Who rolled. When "viewing as" changes between rolling and inserting: gap 46 |
| Dice | text, any dice notation | required | now | d100 by default (**Rolls**) |
| Die result | number or list of numbers | required | now | What the dice showed. Natural 1s and 100s: gap 32. Editing after saving: gap 16 |
| Stat | Stat | optional | now | Picked from the Character (**Dice**) |
| Stat modifier | number | optional | now | The Stat value at the moment of rolling. Kept even if the stat changes later (default 12, rule 10) |
| One-off modifier | number | optional | now | |
| Total | number | required (derived) | now | Die result plus stat modifier plus one-off modifier, worked out when rolled |
| Target number | number | optional | now | |
| Verdict | text | optional | now | Free text, usually the game master's judgement (**Resolution**) |
| Character | Character | optional | now | Whose stat was used |

**Links to:** its Block, and through it the Action, Turn or Interterm (gaps 13, 14) or other note (gap 15); Stat; Character.

**Life cycle:** created when a roll from the Dice panel is inserted into the open note (**Dice**). Its verdict can be written later. Removing the roll block removes the Roll.

**Owner and visibility:** none of its own. It is seen wherever its note is seen.

## Notes

### Note

A Markdown document in the campaign: prose with links, images, blocks and tables. Turn notes, interterm notes, notes about countries, organisations and non-player characters (**Other world things**, **Identity**) are all Notes.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Owner | Person | required | now | Creator by default, changeable (default 5) |
| Visibility | Visibility level | required | now | Default everyone (**Secrets**) |
| Name | text | required | now | Two notes may share a name in different folders (default 13) |
| Folder | folder in the campaign | required | now | |
| Body | Markdown text | required | now | May be empty. Holds headings, Links, Blocks, Images and tables |
| Game date | Game date, any precision | optional | now | Shown on the Notes calendar (**Notes calendar**). Turn notes are dated to their Round (default 7) |
| Linked from | list of Link | required (derived) | now | Every Link that points to this note, leaving out what the viewer cannot see (default 4) |
| Kind | choice: ordinary note, turn note, interterm note | required (derived) | now | Set by the app when it creates the note |

**Links to:** Notes, Characters and Events through Links; Images and Table files it shows; Blocks inside it; Turn or Interterm (turn and interterm notes).

**Life cycle:** created by anyone, or by the app for turn and interterm notes. Edited in live preview or raw source (**Editing**). Renamed or moved inside the app: every Link updates (default 13). Copied: blocks in the copy are not posted (rule 7). Deleted: Links to it remain, shown as missing (default 14); blocks inside: gap 18.

**Owner and visibility:** has both.

### Block

A structured element inserted into a note where structure is wanted (**Turn notes**). Three kinds are shared records; two are display-only.

| Kind | What it is |
| --- | --- |
| Roll block | The Roll itself, shown in the note. No other copy exists (rule 9) |
| Money block | A Ledger entry shown in the note. One record shown in two places (rule 5) |
| Event block | An Event shown in the note. One record shown in two places (rule 5) |
| Chart block | Display-only. Draws a chart from a table file, a Markdown table, or app data (**Tables and charts**) |
| Table file block | Display-only. Shows a Table file inside the note (**Tables and charts**) |

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | For roll, money and event blocks, the Id of the record shown |
| Author | Person | required | now | |
| Kind | choice: roll, money, event, chart, table file | required | now | |
| Note | Note | required | now | |
| Belongs to | Action, Turn or Interterm | optional (derived) | now | From its place under a heading (rule 8). Interterm notes: gap 13. Other notes: gap 15 |
| Record | Roll, Ledger entry or Event | required for roll, money, event | now | The shared record |
| Posted | yes/no | required for money, event | now | No in a copied note until someone posts it (rule 7). An unposted block has no Ledger entry or Event yet |
| Source | Table file, a Markdown table in a note, Economy item, Account, or a Character's net worth | required for chart | now | |
| Columns | named columns of the source | required for chart | now | Chart blocks name their columns (default 15) |
| Chart kind | choice | optional | now | gap 19 |
| Table file | Table file | required for table file block | now | |

**Links to:** its Note; the shared record; a chart's source; a Table file.

**Life cycle:** inserted into a note by anyone. Editing a shared block edits the record, and editing the record changes the block (rule 5). Removing a money or event block asks whether to keep or delete the entry (rule 6). Removing a roll block removes the Roll. Removing a display-only block removes only the block. Copying a note copies its blocks unposted (rule 7).

**Owner and visibility:** none of its own. The block is part of its note; the shared record keeps its own level. Where the two differ: gap 17.

### Link

A reference from one record to a Note, a Character or an Event (**Links and tabs**). Links are written in text as wiki links (with name suggestions) or standard Markdown links, or held in a field such as an Event's linked notes or an Asset's linked note.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | Who wrote the link |
| From | Note, Event, Character or Asset | required | now | Where the link is written or held |
| To | Note, Character or Event | required | now | |
| Form | choice: wiki link, Markdown link, field | required | now | |
| Text shown | text | optional | now | |
| State | choice: working, missing, broken | required (derived) | now | Missing: the target was deleted (default 14). Broken: the target was renamed outside the app (default 13) |

**Links to:** its source and target.

**Life cycle:** created by writing it or filling the field. Renaming or moving a note inside the app updates every link to it (default 13). Deleting the target leaves the link in place, shown as missing (default 14). Removed by deleting it from the text or field.

**Owner and visibility:** none of its own. Suggestions and "linked from" lists leave out targets and sources the viewer cannot see (default 4).

### Table file

A CSV file in the campaign, opened as an editable grid with sorting and column totals, and showable inside a note (**Tables and charts**).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Name | text | required | now | |
| Folder | folder in the campaign | required | now | |
| Columns | list of text | required | now | Header names, used by chart blocks (default 15) |
| Rows | list of rows of text | optional | now | Cells are text; charts skip blank and non-numeric cells (default 15) |
| Column totals | numbers | required (derived) | now | Shown in the grid |
| Formulas | | | later | Full spreadsheets with formulas are later (**Tables and charts**) |

Sorting the grid on screen does not change the file or any chart (default 15).

**Links to:** nothing. Notes and chart blocks point to it.

**Life cycle:** created, edited, renamed, moved and deleted like a note. A block showing a deleted table file shows it as missing (default 14).

**Owner and visibility:** none. Always visible. What the table would put in a spreadsheet is not yet known (gap 41).

## Money

Amounts are numbers held together with their currency, so that several currencies can be added later without changing the records (**Currency**). In the first version every amount is in US dollars.

### Account

One of a Character's money accounts: a ledger of dated entries. An account can be lost or transferred independently of the others (**Money**).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Owner | Person | required | now | Creator by default, changeable (default 5) |
| Visibility | Visibility level | required | now | Default everyone |
| Character | Character | required | now | Whose account it is |
| Name | text | required | now | |
| Currency | choice: US dollars | required | now | Other currencies: later |
| Balance | amount | required (derived) | now | The sum of its Ledger entries |
| Status | choice | required | now | Open, and what lost or transferred mean: gap 35 |
| Ledger entries | list of Ledger entry | optional | now | |

**Links to:** Character; Ledger entry; Recurring item; chart blocks; Net-worth snapshot.

**Life cycle:** created by anyone for a Character. Renamed and its level changed at any time. Lost or transferred independently of other accounts (gap 35).

**Owner and visibility:** has both. Its Ledger entries follow its level (default 3).

### Ledger entry

One dated movement of money in an Account (**Money**). A money block and its Ledger entry are one record (rule 5).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Account | Account | required | now | |
| Date | Game date, day | required | now | Defaults to the first day of the current Round (default 7) |
| Amount | amount | required | now | Positive in, negative out |
| Description | text | required | now | |
| Action | Action | optional | now | **Money**. Linking to a Turn or Interterm instead: gap 14 |
| Block | Block | optional | now | The money block that shows it, if any |
| From proposal | Proposal | optional | now | Set when it was made by accepting a Proposal |

**Links to:** Account; Action; Block; Proposal.

**Life cycle:** created directly in the account, by a money block, or by accepting a Proposal. Editing it or its block changes both. Removing its block asks whether to keep or delete it (rule 6).

**Owner and visibility:** no Owner, no level. It follows its Account (default 3).

### Recurring item and Proposal

A **Recurring item** is a regular income or spending a Character lists. On Advance the app turns it into **Proposals**, one per occurrence in the Round, and a Person decides each (**Recurring money**, default 8).

Recurring item:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Character | Character | required | now | |
| Account | Account | required | now | Must be one of the Character's accounts |
| Description | text | (gap 44) | now | Not named in default 8. Whether a Recurring item has one, and how the entries it makes get their description: gap 44 |
| Amount | amount | required | now | Positive for income, negative for spending |
| Cadence | choice: monthly, quarterly, yearly | required | now | |
| Start date | Game date, day | required | now | |
| End date | Game date, day | optional | now | |

**Links to:** Character, Account, Proposal.

**Life cycle:** created, changed and deleted by anyone. What a change does to Proposals already made but not yet decided is gap 45. Ends at its end date or when deleted.

**Owner and visibility:** none of its own. Whether it follows its Account's level: gap 20.

Proposal:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | gap 10 |
| Recurring item | Recurring item | required | now | |
| Round | Round | required | now | The Round being closed |
| Date | Game date, day | required | now | The occurrence date (gap 21) |
| Amount | amount | required | now | The item's amount; can be edited. No part-payments (default 8) |
| Decision | choice: undecided, accepted, edited, skipped | required | now | Starts undecided |
| Ledger entry | Ledger entry | optional | now | Created on accepted or edited |

A Proposal is **unfinished** while undecided. Unlike Turns and the Interterm, it must be decided before the Round closes (rule 17).

**Links to:** Recurring item, Round, Ledger entry.

**Life cycle:** made by Advance, one per occurrence that falls in the Round (default 8). Accepted (makes a Ledger entry as proposed), edited (makes a Ledger entry with the changes) or skipped (makes none). Kept with the Round as a record of the decision.

**Owner and visibility:** none of its own; gap 20.

### Asset

One thing a Character owns, in a free-form list. Debts are assets with a negative value (**Assets**). The kinds of things characters own are not yet given (gap 33).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Character | Character | required | now | Co-ownership: gap 34 |
| Name | text | required | now | |
| Kind | text tag | required | now | Typed in, not chosen from a list |
| Quantity | number | required | now | |
| Value | amount per unit | required (derived) | now | Latest hand-entered value, or the linked price (rule 19). Negative for debts |
| Value history | list of Asset value | optional | now | Hand-entered values |
| Linked price | Economy item (price) | optional | now | Only price items can be linked (default 10) |
| Location | text (a place) | optional | now | gap 27 |
| Linked note | Note | optional | now | A Link held in a field |

Each **Asset value** in the history:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Date | Game date | required | now | Kind of date: gap 7 |
| Value | amount per unit | required | now | Default 9 |

Whether a linked asset also keeps hand-entered values is gap 24.

**Links to:** Character, Economy item, Note.

**Life cycle:** created, changed and deleted by anyone. Value changes add to the history. Deleting it removes it from later net worth; closed Rounds' snapshots are not redrawn (default 11).

**Owner and visibility:** none. Always visible (default 3).

### Net-worth snapshot

A Character's net worth recorded when a Round closes, so net worth can be charted per Round (**Net worth**, default 11).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | gap 10 |
| Character | Character | required | now | |
| Round | Round | required | now | |
| Valued on | Game date, day | required | now | gap 23 |
| Net worth | amount | required (derived) | now | All account balances plus each asset's quantity times value, debts negative (default 9) |
| Parts | per Account and per Asset amounts | optional | now | Whether held, and what is held for hidden accounts: gap 22 |
| Not valued | list of Asset | optional (derived) | now | Linked assets with no reading (default 10) |

**Links to:** Character, Round, the Accounts and Assets counted.

**Life cycle:** taken for every Character when its Round closes. Not changed by later corrections. Retaken only when its Round is reopened and closed again (rule 20).

**Owner and visibility:** no Owner or level of its own. Other viewers' view leaves out what they cannot see (default 4); how, given a stored total: gap 22.

## World

### Event

A dated happening on the campaign's single timeline (**Timeline and divergences**, **Events**). An event block and its Event are one record (rule 5).

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Owner | Person | required | now | Creator by default, changeable (default 5) |
| Visibility | Visibility level | required | now | Default everyone |
| Date | Game date, any precision | required | now | Where a marked event sits: rule 13 |
| Title | text | required | now | |
| Description | text with links | optional | now | |
| Category tags | list of text | optional | now | Free text |
| Place | text (a place) | optional | now | gap 27 |
| Marker | choice: in our world, changed, new here, did not happen | optional | now | Unmarked events do not appear under Divergences (default 1) |
| In our world | text | optional | now | Asked for only when marked changed or did not happen (default 1) |
| Linked notes and characters | list of Note or Character | optional | now | Links held in a field |
| Interterm | Interterm | optional | now | Set when created during an Interterm |
| Action | Action | optional | now | Set when promoted from an Action (gap 26) |
| Block | Block | optional | now | The event block that shows it, if any |
| Shown on the Notes calendar | | | later | Events on the calendar come later (**Notes calendar**) |

**Links to:** Notes and Characters; Interterm or Action; Block. Notes can link to it.

**Life cycle:** created during an Interterm, promoted from an Action, or added directly (**Events**). Edited from the timeline or its block (rule 5). Removing its block asks whether to keep it (rule 6). Deleting it leaves links in place, shown as missing (default 14).

**Owner and visibility:** has both.

The **marker** places an event against real history:

| Marker | Meaning | "In our world" line | Sits at (default 2) |
| --- | --- | --- | --- |
| (none) | Not compared with real history | not asked | its date |
| In our world | Happened as it did in real history | not asked | its date |
| Changed | Happened differently | asked | the date it happened in the game |
| New here | Did not happen in real history | not asked | its date |
| Did not happen | Happened in real history but not in the game | asked | its real-world date |

### Divergence entry

One item in the campaign's separate free-text list of broad divergences that are not single dated events (**Timeline and divergences**). It is a list item, not a Note. The Divergences view shows these entries together with marked Events.

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Text | text | required | now | |
| Position | number | required | now | Order in the list |

**Links to:** Campaign.

**Life cycle:** added, edited, reordered and deleted by anyone.

**Owner and visibility:** none. Always visible.

### Economy item and Reading

An **Economy item** is a number the campaign tracks over time, such as a price or any other figure, with a name, a unit and dated readings, shown as a table and a chart (**Economy**). A **Reading** is one dated value of it. Which items the table will track, and where real historical numbers come from, are not yet given (gaps 37, 38).

A **Commodity** is an Economy item that is a price. "Price item" means the same thing. Only price items can be linked to Assets (default 10). How an item is marked as a price is gap 25.

Economy item:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Name | text | required | now | |
| Unit | text | required | now | |
| Is a price | yes/no | required | now | How it is marked: gap 25 |
| Readings | list of Reading | optional | now | |

**Links to:** Campaign, Reading; Assets that follow it; chart blocks.

**Life cycle:** added, renamed and deleted by anyone. Readings are added when a Person needs a reading of the economy, or during an Interterm; not every Round (rule 11).

**Owner and visibility:** none. Always visible.

Reading:

| Field | Kind of value | Required | When | Notes |
| --- | --- | --- | --- | --- |
| Id | identifier | required | now | |
| Author | Person | required | now | |
| Economy item | Economy item | required | now | |
| Date | Game date, day | required | now | Defaults to the first day of the current Round (default 7) |
| Value | number | required | now | In the item's unit |
| Note | text | optional | now | |

**Links to:** Economy item.

**Life cycle:** entered by hand, possibly pre-filled from real history where the world has not diverged (**Economy**). Can be corrected or deleted. Closed Rounds' snapshots are not redrawn (default 11).

**Owner and visibility:** none. Always visible (default 3).

## Rules that span records

Each rule names its source in the README: a bold label from "Settled so far" or a number from "Defaults adopted".

1. **Round length applies to the whole round.** A Round's length is chosen when it opens, and every Turn and the Interterm in it cover the same period. (**Round length**, **Time**; settled)
2. **One turn per person per round.** When a Round opens, the app creates one Turn and one turn note for each Person in it, and one Interterm with its interterm note. The turn note belongs to the Character that was active when the Round opened. (**Turn notes and people**, **Turn notes**; settled). Who is in the Round: gap 2.
3. **One active character per person.** A Person has at most one active Character at a time. Private things (Notes, Accounts, Events with a level other than everyone) belong to the Person, so they outlive any Character. (**People and characters**, **Character life**; settled)
4. **Every record and change names a Person.** "Viewing as" picks a Person; that Person is the Author of anything created and is recorded against every change. Every record has an Id. (**Multi-user**, **People and characters**, **Who may change what**, **Sync**; settled)
5. **Blocks are shared records.** A money block and its Ledger entry are one record; an event block and its Event are one record. Editing either changes both. (**Blocks are shared records**, **Turn notes**; settled)
6. **Removing a shared block asks.** Removing a money or event block asks whether to keep or delete the Ledger entry or Event. (**Blocks are shared records**; settled)
7. **Copies are not posted.** Copying a note copies its money and event blocks unposted: no Ledger entry or Event exists for them until someone posts them. (**Blocks are shared records**; settled)
8. **Headings are actions.** A heading in a turn note marks an Action, and every block under it, up to the next heading, belongs to that Action. Blocks above the first heading belong to the Turn as a whole. Headings are optional. (**Actions**; settled). Gaps 12, 13, 14.
9. **Rolls live in notes.** A saved Roll is a roll block under the Action it resolved, or under the Turn when there is no heading. There is no separate list of Rolls. Casual rolls are not saved. (**Resolution**, **Dice**, **Actions**; settled)
10. **A roll keeps its modifier.** A saved Roll keeps the stat modifier it was rolled with, even if the Stat value changes later. (default 12)
11. **Prices are updated on demand.** Economy readings are not required every Round. They are added when a Person needs a reading of the economy and may also be added during an Interterm. (**Interterm**, **Economy**; settled)
12. **Event markers are optional.** An unmarked Event does not appear under Divergences. The "in our world" line is asked for only on changed and did-not-happen Events. (default 1; **Timeline and divergences**, settled)
13. **Where a marked event sits.** A changed Event sits at the date it happened in the game. A did-not-happen Event sits at its real-world date. (default 2)
14. **Dates on money and prices.** A Ledger entry or Reading is dated to a day, defaulting to the first day of the current Round. Notes can use the looser dates Events use. A turn note is dated to its Round. (default 7)
15. **Round dates run date to date.** A quarter from 10 February ends 10 May. A month from 31 January ends on the last day of February. The end date belongs to the next Round. (default 6)
16. **Recurring items make proposals.** Each Recurring item names an account, an amount, a cadence, a start date and an optional end date. Advance proposes one entry per occurrence that falls in the Round, with no part-payments. (default 8; **Recurring money**, settled)
17. **Proposals must be decided.** Each undecided Proposal must be accepted, edited or skipped in the Advance step before the Round closes. (**Advancing**, **Recurring money**; settled)
18. **Net worth.** A Character's net worth is all account balances plus each Asset's quantity times its per-unit value, with debts negative. (default 9; **Assets**, settled)
19. **Linked assets follow a price.** An Asset linked to a price item is valued at the latest Reading on or before the date in question. With no such Reading it shows as "not valued", not zero. Only price items can be linked. (default 10; **Net worth**, settled)
20. **Net worth is a snapshot.** A Net-worth snapshot is taken for each Character when each Round closes. Later corrections do not redraw the past unless that Round is reopened. (default 11; **Net worth**, settled)
21. **Only notes, accounts and events are secret.** Note, Account and Event each carry one of three levels, default everyone. Ledger entries follow their Account. Stats, Assets and Readings are always visible, as is every other record. (default 3; **Secrets**, **Sync**, settled). Gaps 17, 20, 22.
22. **"Me" means the owner.** Each private record has an owning Person, the creator by default and changeable; not whoever last edited it. (default 5)
23. **Hidden things stay hidden everywhere.** Link suggestions, "linked from" lists, charts and other people's view of a Character's net worth leave out anything the viewer cannot see. (default 4). Gap 22.
24. **Hidden is not protected yet.** Until the server exists, hidden means not shown, not protected. (**Secrets**; settled)
25. **Renames update links.** Renaming a Note or folder inside the app updates every Link to it. Two notes with the same name are told apart by folder in suggestions. Renames made outside the app show as broken links. (default 13; **Links and tabs**, settled)
26. **Deleting leaves links.** Deleting something that is linked to leaves the Links in place, shown as missing. (default 14)
27. **Chart blocks name their columns.** A chart block names the columns it draws. Blank or non-numeric cells are skipped. Sorting the grid on screen does not change the file or the chart. (default 15; **Tables and charts**, settled)
28. **Advance is a soft checklist.** Advance shows what is unfinished: each Turn that is neither done nor skipped, the Interterm if it is not done, and each undecided Proposal. The table may go ahead with unfinished Turns and an unfinished Interterm; Proposals must be decided (rule 17). Advancing closes the Round, takes snapshots (rule 20) and moves the current game date to the Round's end date. (**Advancing**, **Time**; settled). Gap 8 for opening the next Round.
29. **A closed round can be reopened.** A closed Round can be reopened to correct it. Closing it again retakes its snapshots. (**Advancing**, settled; default 11). Gap 9.
30. **Stat changes are dated and kept.** Each change to a Stat value is dated, kept with a short reason, and can be attached to an Action or an Interterm. (**Stats**; settled). Gaps 7, 14.
31. **Identity changes are dated.** Each change to occupation or position, location or nationality is dated and kept. (**Identity**; settled). Gap 7.
32. **One timeline, one divergence list.** There is one timeline of Events. The Divergences view shows marked Events and the Divergence entries together. (**Timeline and divergences**; settled)
33. **Age from the game date.** A Character's age is shown from its birth date and the current game date. A birth date can be just a year. (**Character life**, settled; default 17). Gap 4 for dead Characters.
34. **Accounts stand alone.** An Account can be lost or transferred independently of the Character's other accounts. (**Money**; settled). Gap 35.
35. **Amounts carry a currency.** Every amount is held with its currency, US dollars for now, so that more currencies can be added later. (**Currency**; settled)
36. **Turn order per round.** The Campaign has a usual turn order. Each Round copies it when it opens; the Round's copy can be changed or shuffled without changing the Campaign's. (**Advancing**; settled)
37. **No restrictions yet.** Everyone can edit everything, whatever their role. Real permissions come later. (**Who may change what**, **Multi-user**; settled)
38. **How events are made.** An Event is created during an Interterm, promoted from an Action, or added directly. Only its date and title are required. (**Events**; settled). Gap 26.
39. **Characters of the world are notes.** Countries, organisations and non-player characters are Notes that Events and Characters link to. No registry for now; registries are later. (**Other world things**, **Identity**; settled)

## Gaps

Questions the README does not settle. Each has one recommended answer. Gaps 27 and 29 to 41 are carried over, not new. Gaps 42 to 46 were added by the orchestrator after review.

1. **How the role is recorded.** Recommendation: a role field on Person with the values player and game master; exactly one Person holds game master at a time; the game master may also play a Character.
2. **Who takes a turn.** Which People get a Turn when a Round opens. Recommendation: every Person in the Round's turn order; the Campaign's order starts with every Person who has an active Character, and People are added to or removed from it by hand.
3. **A Person leaving.** Recommendation: a Person is never deleted, because records name them as Author and Owner; they are marked as having left and drop out of the turn order.
4. **Character status changes.** Whether status changes are dated, and what happens to a Person's active Character when another is made active. Recommendation: each status change records its game date, so a dead Character's age stops at death; making a Character active asks whether the previous one is retired or dead.
5. **The free description.** Whether a Character's free description is a field or a Note. Recommendation: a field on the Character, edited with the note editor and able to hold links, always visible.
6. **Stats added or removed mid-campaign.** Recommendation: when a Stat is added, every Character's value starts as "not set" until entered; a removed Stat is hidden, not deleted, so saved Rolls and change histories keep its name.
7. **Dates on stat, identity and asset value changes.** Default 7 covers only Ledger entries and Readings. Recommendation: the same rule, a day defaulting to the first day of the current Round.
8. **Opening rounds.** How the first Round opens, and whether Advance opens the next Round at once. Recommendation: the first Round opens when the campaign is created, starting on its start date; Advance closes the Round and opens the next at once, asking for its length with the previous length as the default.
9. **Reopened rounds.** What may change in a reopened Round and which Round is current meanwhile. Recommendation: notes, blocks, marks and decided Proposals can be corrected, but not the length or start date while later Rounds exist; the latest Round stays current; closing the reopened Round retakes only its own snapshots.
10. **Author of records the app creates.** Turns, notes, the Interterm, Proposals and snapshots are created by the app. Recommendation: the Author is the Person in "viewing as" who opened or advanced the Round.
11. **Owner and date of app-created notes.** Recommendation: a turn note is owned by its Turn's Person; an interterm note is owned by the game master; an interterm note is dated to its Round, like a turn note.
12. **What identifies an Action when its heading changes.** Recommendation: an Action keeps its Id when its heading is renamed; when the heading is deleted, its blocks join the Action above (or the Turn as a whole), and Ledger entries, Stat changes and Events that pointed at it point at the Turn instead. How the Id is kept with the heading belongs to `06-storage.md`.
13. **Headings in an interterm note.** Recommendation: they are not Actions; every block in an interterm note belongs to the Interterm, matching **Stats**, which attaches changes to "an action or an interterm".
14. **Records with no heading.** Whether a Roll, a Ledger entry and a Stat change attach to an Action or to the Turn or Interterm when there is no heading. Recommendation: they attach to the Turn or Interterm as a whole, the same as blocks above the first heading; Ledger entries and Stat changes may point at a Turn or Interterm as well as an Action.
15. **Rolls in other notes.** Whether a roll block may go into a note that is not a turn or interterm note. Recommendation: yes; it belongs to that note only.
16. **Editing a saved Roll.** Recommendation: the die result, dice, stat and modifiers are fixed once saved; the target number and verdict can be edited.
17. **A block's note and its record at different levels.** For example a money block in an everyone note posting to a game-master-only account. Recommendation: the record keeps its own level; viewers who cannot see the record see the block as hidden in the note.
18. **Deleting a note that holds shared blocks.** Recommendation: ask once, listing the Ledger entries and Events, whether to keep or delete them all.
19. **Chart kind.** Recommendation: a chart block names its kind; the first version offers line and bar.
20. **Visibility of Recurring items and Proposals.** Recommendation: both follow their Account, like Ledger entries.
21. **Occurrence dates of a Recurring item.** Recommendation: occurrences step from the start date by the cadence, date to date as in default 6; each Proposal and its Ledger entry take the occurrence date.
22. **Net-worth snapshots and hidden accounts.** Recommendation: a snapshot stores each Account's balance and each Asset's value as parts, so each viewer's total leaves out what they cannot see (default 4).
23. **The date a snapshot values at.** Recommendation: the Round's last day, the day before its end date.
24. **Hand values on a linked Asset.** Recommendation: while linked, an Asset uses only the price; its hand-entered history is kept and used again if it is unlinked.
25. **How an Economy item is marked as a price.** Recommendation: a yes/no "price" field set when the item is created, with the unit read as an amount per unit.
26. **Promoting an Action to an Event.** Recommendation: promotion inserts an event block under the Action's heading, so the Event and the turn note stay one record.
27. **Does a place become a record of its own.** Carried over from `05-map.md`, gap 1. Recommendation (from there): a named place with an optional point, so that "Chicago" is entered once and reused; until then, text.
28. **Precision of range ends.** Recommendation: each end of a range is a day, month or year on its own.
29. **Stat names.** Carried over from "Still to settle". Recommendation: the Stat list starts empty and the table enters its names.
30. **Stat range.** Carried over. Recommendation: whole numbers with no fixed range until the range is given.
31. **Starting stat values.** Carried over. Recommendation: typed in by hand when the Character is created.
32. **Natural 1s and 100s.** Carried over. Recommendation: no special meaning; the verdict is free text.
33. **The kinds of things characters own.** Carried over. Recommendation: the kind stays a typed-in tag.
34. **Co-owned assets.** Carried over. Recommendation: one Character per Asset until co-ownership is described.
35. **Lost or transferred accounts.** Carried over. Recommendation: an Account status of open, lost or transferred; a lost or transferred Account keeps its history and counts nothing towards net worth from that date.
36. **When the campaign starts.** Carried over. Recommendation: a required start date entered when the campaign is created.
37. **Which economy items the table asks about.** Carried over. Recommendation: the Economy list starts empty.
38. **Where real historical numbers come from.** Carried over. Recommendation: hand entry only until a source is chosen.
39. **"Generated role notes".** Carried over. Recommendation: ask what was meant before adding any record for it.
40. **Recording real-world play sessions.** Carried over. Recommendation: no session record until asked for.
41. **What goes in a spreadsheet.** Carried over. Recommendation: Table files stay plain grids until examples are given.
42. **The record of changes.** **Who may change what** says every change records who made it, but not what is kept. Recommendation: each record keeps who last changed it and when (real-world time) now; a full list of changes that people can look through is later.
43. **Deleting records, and a new Character's status.** The README does not say whether a Campaign, Character, Round, Turn or Interterm can be deleted in the app, or which status a new Character may start with. Recommendation: none of them can be deleted in the app, so history stays whole (a Turn nobody writes is skipped; a campaign ends when its folder is removed outside the app); a new Character may start with any status, so that a past Character can be entered.
44. **A description on a Recurring item.** Default 8 names an account, an amount, a cadence and dates, but every Ledger entry needs a description. Recommendation: a Recurring item has a required description, copied to each Proposal and the Ledger entry it makes, where it can be edited.
45. **Changing a Recurring item while its Proposals are undecided.** Recommendation: undecided Proposals are remade from the changed item; decided ones are left alone.
46. **The Author of a Roll inserted after "viewing as" changed.** A Roll's Author is "who rolled", but a Roll is created when it is inserted into a note, and rule 4 makes the Author the Person picked by "viewing as" at the moment of creation. If one Person rolls and another is being viewed as when the roll is inserted, the two disagree. Recommendation: the Author of a Roll is the Person who rolled; the Person who inserted it is recorded as having made the change (gap 42).

## Coverage

Where each README decision is reflected.

| README item | Reflected in |
| --- | --- |
| **Tabs** | No record concerned. Terms in the README ("Player tab") |
| **Campaign** | Campaign |
| **Time** | Round; rules 1, 28 |
| **Round length** | Round; rule 1 |
| **Turns** | Turn; Action |
| **Resolution** | Roll; Stat value; rule 9 |
| **Interterm** | Interterm; rule 11 |
| **Multi-user** | Person (role); rules 4, 37 |
| **Stats** | Stat; Stat value; rule 30 |
| **Rolls** | Roll |
| **Character life** | Character; rule 33 |
| **Identity** | Identity fields; Character (description); rules 31, 39 |
| **Money** | Account; Ledger entry; rule 34 |
| **Currency** | Money; rule 35 |
| **Recurring money** | Recurring item and Proposal; rules 16, 17 |
| **Assets** | Asset; rule 18 |
| **Net worth** | Asset; Net-worth snapshot; rules 19, 20 |
| **Timeline and divergences** | Event; Divergence entry; rules 12, 32 |
| **Events** | Event; rule 38 |
| **Economy** | Economy item and Reading; rule 11 |
| **Other world things** | Note; rule 39 |
| **Where play happens** | No record concerned. Terms in the README ("whose turn it is") |
| **Turn notes** | Turn note and Interterm note; Block; rules 2, 5 |
| **Editing** | Note (life cycle) |
| **Links and tabs** | Link; Note (linked from); rule 25 |
| **Notes calendar** | Note (game date); Event (later) |
| **Tables and charts** | Table file; Block; rule 27 |
| **Who may change what** | Owner and Author; rules 4, 37 |
| **Secrets** | Visibility level; rules 21, 24 |
| **Existing data** | Introduction; Campaign (life cycle) |
| **Game master** | No record concerned. Terms in the README |
| **Dice** | Roll; rule 9 |
| **Sync** | How to read this file (Id, Author); Visibility level; rule 4 |
| **People and characters** | Person; Character; rule 3 |
| **Turn notes and people** | Turn; rule 2 |
| **Blocks are shared records** | Block; rules 5, 6, 7 |
| **Actions** | Action; rule 8 |
| **Advancing** | Round; Turn; Interterm; Proposal; rules 17, 28, 29, 36 |
| **Calendar** | Game date |
| **Existing app** | No record concerned |
| **Process** | No record concerned |
| Default 1 | Event (marker); rule 12 |
| Default 2 | Event (marker table); rule 13 |
| Default 3 | Visibility level; rule 21 |
| Default 4 | Note (linked from); Link; Net-worth snapshot; rule 23 |
| Default 5 | Owner and Author; rule 22 |
| Default 6 | Round (end date); rule 15 |
| Default 7 | Ledger entry; Reading; Turn note; rule 14 |
| Default 8 | Recurring item and Proposal; rule 16 |
| Default 9 | Asset; Net-worth snapshot; rule 18 |
| Default 10 | Asset; Economy item; rule 19 |
| Default 11 | Net-worth snapshot; Round; rules 20, 29 |
| Default 12 | Roll; rule 10 |
| Default 13 | Link; Note; rule 25 |
| Default 14 | Link; rule 26 |
| Default 15 | Block (chart); Table file; rule 27 |
| Default 16 | Character (name, photo); Image |
| Default 17 | Character (birth date); Game date; rule 33 |
