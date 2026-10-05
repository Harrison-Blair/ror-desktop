# Reform or Revolution: design specs

These files respecify the app around the game it serves. They are written to be iterated on: each spec ends with its own list of gaps. Nothing here authorises production implementation.

Status: first drafts, under gap review. The decisions below were settled with the user over eight question rounds, and the specs were drafted from them. Each spec ends with its own numbered gaps. The current focus is the interfaces and the feature list. `06-storage.md` is parked: the user does not accept its design, and its gaps and proposals are not part of the review.

## Specs

| File | Covers | Status |
| --- | --- | --- |
| `00-ontology.md` | The things in the game and how they relate: campaign, person, character, round, turn, interterm, event, divergence, economy item, asset, note | First draft |
| `01-app-shell.md` | Tabs, campaign folder, roles, saving | First draft |
| `02-player.md` | Player tab | First draft |
| `03-world.md` | World tab | First draft |
| `04-notes.md` | Notes tab | First draft |
| `05-map.md` | Map tab (stub: goals and open questions only) | Stub |
| `06-storage.md` | File layout inside a campaign folder | Parked: not accepted, to be redone when storage is taken up |
| `archive/HANDOFF.md` | The earlier interface design. Superseded where a spec above says so | Archived |

## How the specs are written

- `00-ontology.md` owns the vocabulary and the definition of every kind of record: what it is, its fields, what it links to, and its life cycle. The other specs use its terms and do not redefine fields.
- `06-storage.md` owns how records are written to disk, including how a block is written inside a Markdown file. The page specs describe what a block looks like and does, not its file syntax.
- Each page spec has these sections in this order: Purpose, Features (a table marking each as now or later), Layout (rough wireframes in fenced code blocks), Behaviour, States (empty, loading, error, hidden), Changes from `archive/HANDOFF.md`, Gaps.
- A spec states only what is settled or adopted below. Anything it needs that is not decided goes in its Gaps section as a question with a recommendation. It is never filled in silently.
- Plain language. Define a term once, in the ontology, and use the same word everywhere.

## Settled so far

- **Tabs:** Player, World, Notes, Map. Player, World and Notes come first; Map comes later.
- **Campaign:** the app is headed towards several players and a game master using it at the same time, with synced notes. One opened folder is a campaign: one world, many players.
- **Time:** play runs in rounds. Each player takes a turn, the game master then runs an interterm covering overlaps and world events the turns did not, and the date advances once the interterm is complete. An advance covers a month, a quarter or a year, as the table decides.
- **Round length:** chosen when the round opens. Every turn and the interterm in that round cover the same period.
- **Turns:** no rules limit what a player may attempt. A turn is a list of free-form actions. An action can carry several dice rolls and can affect money, the world and later events.
- **Resolution:** usually d100 plus the relevant stat as a flat modifier (Science 63 adds 63 to science rolls). The game master judges the result, mostly by narration. Rolls are saved with the action they resolved.
- **Interterm:** events and narration. Prices are not updated every round; they are updated when a player needs a reading of the economy, and may also be updated during an interterm.
- **Multi-user:** the specs describe the full model (roles, whose turn it is, who may edit what). The first version runs on one machine with a "viewing as" switch for acting as any player or as game master; sync is added underneath later.
- **Stats:** one list per campaign; every character has a number for each. Changes are dated and kept, with a short reason, and can be attached to an action or an interterm.
- **Rolls:** die result, plus an optional stat, plus an optional one-off modifier, giving a total and a free-text verdict. A target number is optional. Any dice notation is allowed; d100 is the default.
- **Character life:** a birth date is stored and the age is shown from the game date. A character is active, retired or dead. A person can have more than one character over time.
- **Identity:** occupation or position, location and nationality, plus the free description. Changes are dated. Non-player characters are notes, not sheets.
- **Money:** a character has several accounts, each a ledger of dated entries (date, amount, description, optional link to an action). An account can be lost or transferred independently of the others.
- **Currency:** US dollars only for now. Several currencies with exchange rates are wanted later, so amounts should not be modelled in a way that rules this out.
- **Recurring money:** characters list recurring income and spending. On advance the app proposes the entries for the period and a person confirms them.
- **Assets:** a free-form list. Each asset has a name, a typed-in kind tag, a quantity, an estimated value with a dated history, an optional location and an optional linked note. Debts are assets with a negative value.
- **Net worth:** an asset can be linked to a tracked commodity and follow its price; everything else is valued by hand. Net worth is charted per round.
- **Timeline and divergences:** one timeline. Each event is marked as in our world, changed, new here or did not happen; changed and did-not-happen events carry an "in our world" line. There is also a separate free-text list for broad divergences that are not single dated events. The Divergences view shows both.
- **Events:** a date that can be a day, a month, a year or a range; a title; a description; optional category tags; an optional place; links to notes and characters. Only the date and title are required. Events are created during an interterm, promoted from a player's action, or added directly.
- **Economy:** a list defined per campaign. Each item has a name, a unit and dated readings with an optional note; any number can be tracked, not only prices; shown as a table and a chart. Readings are entered by hand, and may be pre-filled from real history where the world has not diverged.
- **Other world things:** countries, organisations and people are notes that events and characters link to. No registry for now.
- **Where play happens:** inside the four tabs. A character's turns are a section of the Player tab; the World tab shows the date, the round, whose turn it is, the interterm and the Advance step. Turns are written as notes today, so the structured turn format is exploratory and must stay close to note-writing.
- **Turn notes:** a turn is a note. Each player gets one note per round, created for them, and writes prose as today. Roll, money and event blocks can be inserted where structure is wanted; a block shows inside the note and also updates the ledger or timeline. The game master's interterm note works the same way.
- **Editing:** live preview in one pane, with a switch to raw source.
- **Links and tabs:** wiki links with name suggestions, and standard Markdown links also work. Open notes are tabs. Renaming a note updates links to it. Links can also point to characters and events. Each note has a "linked from" list.
- **Notes calendar:** each note can have a game date. The calendar shows notes only for now; events and rounds on the calendar are later.
- **Tables and charts:** table files (CSV) open as an editable grid with sorting and column totals and can be shown inside a note. Chart blocks draw from a table file, a Markdown table, or app data such as an economy item, an account or net worth. Full spreadsheets with formulas are the eventual goal, not the first version.
- **Who may change what:** no restrictions to start. Everyone can edit everything, and every change records who made it. Separate roles with real permissions come later.
- **Secrets:** notes, accounts and events each have one of three levels: everyone, me and the game master, game master only. The default is everyone. Until the server exists, hidden means not shown, not protected.
- **Existing data:** fresh start. A new campaign folder is created and old material is copied in by hand. The old `player.json` format is not migrated.
- **Game master:** the same four tabs. The game master can open any character, and the World tab's Round section lists every player's turn note for the round beside the interterm note. A dedicated dashboard comes later.
- **Dice:** a panel opened from the rail on any tab, sitting beside the current page. A roll can pick a stat from the character and be inserted into the open note as a roll block. Casual rolls still work and are not saved. The standalone Dice page goes away.
- **Sync:** the specs make the data ready for sync (every record has an id and an author; notes, accounts and events also have a visibility level) but do not design the server.
- **People and characters:** a person at the table and the character they play are separate. A person has one active character at a time. "Viewing as" picks a person. Private things belong to the person, so they outlive a character.
- **Turn notes and people:** each round has one turn per person. The turn note belongs to the character that was active when the round opened.
- **Blocks are shared records:** a money or event block in a note and its ledger entry or timeline event are one record shown in two places. Editing either changes both. Removing the block asks whether to keep or delete the entry. Copying a note makes copies that are not posted until someone says so.
- **Actions:** a heading in a turn note marks an action, and every block under it belongs to that action. Blocks above the first heading belong to the turn as a whole. Headings are optional.
- **Advancing:** a soft checklist. The campaign has a turn order that can be changed per round, with a button to shuffle it. Each turn and the interterm get a "done" mark, and a turn can be skipped. Advance shows what is unfinished and lets the table go ahead anyway. Each undecided recurring-money proposal must be accepted, edited or skipped in that step. A closed round can be reopened to correct it.
- **Calendar:** the real Gregorian calendar, since the setting is alternate history.
- **Existing app:** the foundation stays (Tauri and React, plain files in a folder, autosave and file-safety behaviour). Navigation, page layouts, the editor's look and where Dice lives are open to redesign.
- **Process:** written specs with rough wireframes first, then a visual mockup pass per page.

## Defaults adopted

These were proposed to the user as defaults after a gap review and were not objected to. They are open to change.

1. **Event marker is optional.** An unmarked event does not appear under Divergences. The "in our world" line is asked for only on changed and did-not-happen events.
2. **Event dates.** A changed event sits at the date it happened in the game. A did-not-happen event sits at its real-world date.
3. **Secrecy applies to notes, accounts and events only.** Ledger entries follow their account. Stats, assets and economy readings are always visible.
4. **Hidden things stay hidden everywhere.** Link suggestions, "linked from" lists, charts and other people's view of a character's net worth leave out anything the viewer cannot see.
5. **"Me" means an owner.** Each private thing has an owning person, the creator by default and changeable. It is not whoever last edited it.
6. **Round dates run date-to-date.** A quarter from 10 February ends 10 May. A month from 31 January ends on the last day of February. The end date belongs to the next round.
7. **Dates on money and prices.** A ledger entry or economy reading is stored as a day, defaulting to the first day of the current round. Notes can use the looser dates events use (day, month, year, range). A turn note is dated to its round.
8. **Recurring items** each name an account, an amount, a cadence (monthly, quarterly, yearly), a start date and an optional end date. Advance proposes one entry per occurrence that falls in the round, with no part-payments.
9. **Asset value is per unit.** Net worth is all account balances plus each asset's quantity times its value, with debts negative.
10. **Linked assets** use the latest reading on or before the date in question. With no reading, the asset shows as "not valued" rather than zero. Only price items can be linked.
11. **Net worth history is a snapshot** taken when each round closes. Later corrections do not redraw the past unless that round is reopened.
12. **A saved roll keeps the modifier it was rolled with**, even if the stat changes later.
13. **Renames.** Renaming a note or folder inside the app updates every link. Two notes with the same name are told apart by folder in suggestions. Renames made outside the app show as broken links.
14. **Deleting something that is linked to** leaves the links in place, shown as missing.
15. **Chart blocks name their columns.** Blank or non-numeric cells are skipped. Sorting the grid on screen does not change the file or the chart.
16. **Carried over from the current app:** every character keeps a name and photo. Images render inside notes and open in the viewer.
17. **Birth date can be just a year.**

## Still to settle

- Character details not yet given: the actual stat names, their range, how starting values are set, and whether natural 1s or 100s mean anything.
- Money details not yet given: the kinds of things characters own, whether assets are ever co-owned, and what exactly happens to an account that is lost or transferred.
- World details not yet given: when the campaign starts, which economy items the table actually asks about, and where real historical numbers would come from.
- Notes details not yet given: what "generated role notes" in the original request meant, whether real-world play sessions are recorded, and what the table would actually put in a spreadsheet.