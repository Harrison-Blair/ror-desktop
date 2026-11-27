# World features

This catalogue lists each world feature of the app: features that exist and features that the group plans. Each entry uses the same fields. [The app index](../README.md#catalogue-entries) defines the fields and the kinds.

## W-01 People list

- **Kind:** feature
- **Need:** [Searching notes takes time](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Characters](../../gameplay/world/characters.md)
- **Behavior:** World › People of interest shows each person as a card or a row. The user filters by `All`, `Players`, or `NPCs` and searches by name. Cards sort by name or age. Rows also sort by occupation or birthplace. Until sync exists, `Players` shows only the claimed character of this computer (W-06). `NPCs` shows every other person, also the characters of other players in Session. The character of the user is always first.
- **Data:** Local. `characters.json` in the app data folder.
- **Dependencies:** W-06, W-08
- **Status:** done. `client/src/components/menus/PeopleMenu/PeopleList.tsx:103`. Chat tool `people_list` (read).
- **Open questions:** none
- **Not handled:** none

## W-02 Character sheet

- **Kind:** feature
- **Need:** [What players look at during a turn](../product/needs.md#what-players-look-at-during-a-turn)
- **Gameplay link:** [Characters](../../gameplay/world/characters.md), [Stats](../../gameplay/world/stats.md)
- **Behavior:** A click on a person opens the character sheet. The sheet shows the name, the age, and the dates and places of birth and death. It also shows the current occupation, the photo, the 8 stat pairs, the description, and the job history. The age is at the death date for a dead person, else at the game date. A person with no birth date shows no age.
- **Data:** Local. `characters.json`, `world.json`, and the `photos/` folder in the app data folder.
- **Dependencies:** W-08 for the age and the occupation.
- **Status:** done. `client/src/components/menus/PeopleMenu/PersonSheet.tsx:105`. Chat tool `people_read` (read).
- **Open questions:** Today the game master makes a character sheet graphic for each character. Must the app sheet replace that graphic?
- **Not handled:** none

## W-03 Add, edit, and delete a person

- **Kind:** feature
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [Starting a character](../../gameplay/world/characters.md#starting-a-character)
- **Behavior:** "Add person" opens a form with all fields. The user edits an existing person one section at a time. The app refuses an empty name and a date that does not exist. It also refuses a death date before the birth date and a stat that is not a whole number. Date fields accept several forms, for example "21 Jan 1904" and "1904-01-21". Delete asks for approval. The user cannot delete their own character.
- **Data:** Local. `characters.json` in the app data folder.
- **Dependencies:** none
- **Status:** done. `client/src/components/forms/PersonForm/PersonForm.tsx:23`, `client/src/lib/people.ts:486`, `client/src-tauri/src/world.rs:398`. Chat tools `people_create`, `people_edit`, `people_delete` (write).
- **Open questions:** none
- **Not handled:** none

## W-04 Job history

- **Kind:** feature
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [Characters](../../gameplay/world/characters.md)
- **Behavior:** The sheet lists jobs with the newest start first. The user adds, edits, and removes jobs in the form. The current occupation is each job whose period includes the game date, or the death date for a dead person.
- **Data:** Local. The `resume` list of each person in `characters.json`.
- **Dependencies:** W-08
- **Status:** done. `client/src/lib/people.ts:297`, `client/src/lib/people.ts:310`. Chat tools `people_add_job`, `people_edit_job`, `people_remove_job` (write).
- **Open questions:** none
- **Not handled:** none

## W-05 Person photo

- **Kind:** feature
- **Need:** [What players look at during a turn](../product/needs.md#what-players-look-at-during-a-turn)
- **Gameplay link:** none
- **Behavior:** The user picks a PNG, JPEG, GIF, or WebP image and sees a preview before Save. The app copies the image to the app data folder and removes the old photo. A person without a photo shows the initials of the name.
- **Data:** Local. The `photos/` folder in the app data folder.
- **Dependencies:** W-03
- **Status:** done. `client/src-tauri/src/world.rs:620`, `client/src/components/menus/PeopleMenu/PersonPhoto.tsx:33`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## W-06 Claim your character

- **Kind:** feature
- **Need:** [What players look at during a turn](../product/needs.md#what-players-look-at-during-a-turn)
- **Gameplay link:** [Characters](../../gameplay/world/characters.md)
- **Behavior:** A star button on a sheet claims the person as the character of this computer. The user can remove the claim. The user cannot claim a dead character. The claimed character shows a gold star and appears as a button above the notes tree.
- **Data:** Local. `meId` in `config.json` in the app config folder.
- **Dependencies:** none
- **Status:** done. `client/src/components/menus/PeopleMenu/PeopleMenu.tsx:262`, `client/src-tauri/src/world.rs:598`. No chat tool.
- **Open questions:** With the server, a claim must belong to a user, not to a computer. See P-08.
- **Not handled:** none

## W-07 Stat pairs and World Settings

- **Kind:** feature
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [Stats](../../gameplay/world/stats.md)
- **Behavior:** World › Settings edits the names of the 8 stat pairs. Each stat side of a person has its own whole number. The group uses values from 1 to 100. The app accepts any whole number, and the group decided to keep that.
- **Data:** Local. `world.json` in the app data folder.
- **Dependencies:** none
- **Status:** done. `client/src/pages/WorldPage/WorldSettings.tsx:71`, `client/src-tauri/src/world.rs:107`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## W-08 Game date

- **Kind:** feature
- **Need:** [Returning after a gap](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Start of the campaign](../../gameplay/world/setting.md#start-of-the-campaign), [The next round](../../gameplay/sessions/turn-order.md#the-next-round)
- **Behavior:** Session › Overview shows and edits the game date. The default game date is 10 February 1962. "Next round" moves the game date to the end of the round. The game date sets the age and the occupation of each living person.
- **Data:** Local. `gameDate` in `world.json` in the app data folder.
- **Dependencies:** none. S-07 uses the game date.
- **Status:** done. `client/src/components/menus/SessionMenu/Overview.tsx:846`, `client/src-tauri/src/world.rs:827`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## W-09 Mention a person in a note

- **Kind:** planned. Build order 2.
- **Need:** [Searching notes takes time](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Notes](../../gameplay/knowledge/notes.md)
- **Behavior:** While writing a note, the user types `@` and chooses a person from a menu. The chosen name becomes a link to that person. If the person does not exist, the user creates the person from the menu with only a name.
- **Data:** Local. The link is text in the note file.
- **Dependencies:** K-02, W-03
- **Status:** not started. A search for "mention" in `client/src` found no code.
- **Open questions:**
  - Link format. The recommendation is a Markdown link with the person ID, for example `[Pyotr Smirnov](person:3f2a…)`. This form survives a rename and keeps two people with one name apart.
  - The docs say that a user can link a person to an event. Is a mention in the note of the event enough, or does an event need its own record with a date and a type? The recommendation is that a mention is enough.
  - Must the chat agent write mentions? It can already do this with `notes_edit` if the prompt tells it the link format.
- **Not handled:** none

## W-10 Backlinks on a person

- **Kind:** planned. Build order 2.
- **Need:** [Searching notes takes time](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Notes](../../gameplay/knowledge/notes.md)
- **Behavior:** The character sheet shows a "Mentioned in" list. Each row shows the note, the line, and a short text. A click opens the note at that line.
- **Data:** Local. The app reads the notes folder. It stores nothing new.
- **Dependencies:** W-09, W-02, K-01
- **Status:** not started. No code lists the notes that link to a person.
- **Open questions:**
  - Find mentions by a scan of the notes folder when the sheet opens, or keep an index? The recommendation is a scan.
  - A chat tool `people_mentions` (read). Input: the person ID. Output: each note line that mentions the person. The user must approve the tool before a developer adds it.
- **Not handled:** A notes folder so large that a scan is slow. No evidence yet.

## W-11 Game master character records

- **Kind:** idea
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [What the game master decides](../../gameplay/world/setting.md#what-the-game-master-decides)
- **Behavior:** For each game master character, the game master records what the character does, what the character wants, and where the character is. The game master also records where the character enters or leaves the story. W-16 adds relationships and affiliations for all people.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** W-02. P-08 to hide records from players.
- **Status:** partial. World › People of interest already lists game master characters with a description and a job history (W-01, W-02). People records have no fields for ambitions or whereabouts. The group wants to expand them.
- **Open questions:**
  - The group wants to expand the people page. Are these records new fields on the person, or game master notes that mention the person? The recommendation is new fields.
  - Which parts of a game master character can players see?
- **Not handled:** none

## W-12 Inheritance

- **Kind:** idea
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [Death and the next character](../../gameplay/world/characters.md#death-and-the-next-character)
- **Behavior:** When a character dies, the app helps the group move the assets of that character to an heir.
- **Data:** Shared.
- **Dependencies:** W-03, E-01. E-07 when the heir is a game master character.
- **Status:** not started. The app has no record of assets.
- **Open questions:** Does the app move assets, or does it only record the death and let the players change the ledgers?
- **Not handled:** none

## W-13 Government registry

- **Kind:** idea
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [The interterm](../../gameplay/sessions/turn-order.md#the-interterm)
- **Behavior:** The app keeps a record of each government. A government is the organization that rules a country, so the record follows the government, not only the country. Players use the record in place of notes on that country.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** none
- **Status:** not started. The app has records only for people.
- **Open questions:** Which fields does a government record need, for example the head of state, the ministers, laws, and treaties?
- **Not handled:** none

## W-14 Company registry

- **Kind:** idea
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [Ledgers](../../gameplay/economy/ledgers.md)
- **Behavior:** The app keeps a record of each company in the world, also companies that no player owns.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** none. E-01 links company accounts to the record.
- **Status:** not started. The app has records only for people.
- **Open questions:** Which fields does a company record need?
- **Not handled:** none

## W-15 International organizations

- **Kind:** idea
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [The interterm](../../gameplay/sessions/turn-order.md#the-interterm)
- **Behavior:** The app keeps a record of each international organization, for example the United Nations, and the governments that are members.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** W-13
- **Status:** not started. The app has records only for people.
- **Open questions:** Is this a kind of record in W-13, or a separate registry?
- **Not handled:** none

## W-16 Relationships and affiliations

- **Kind:** idea
- **Need:** [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [Characters](../../gameplay/world/characters.md)
- **Behavior:** The character sheet shows the relationships of the person with other people. An "Affiliated with" section lists governments, companies, and international organizations. The sheet also lists the places that the notes mention and a history of events.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** W-02. W-13, W-14, and W-15 for affiliations. W-10 and S-13 for the history of events.
- **Status:** not started. The sheet shows the job history only (W-04).
- **Open questions:** Are places records, like people, or only names that the notes mention?
- **Not handled:** none
