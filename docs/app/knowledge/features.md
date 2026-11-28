# Knowledge features

This catalogue lists each knowledge feature of the app: notes, the chat agent, research, and projects. Each entry uses the same fields. [The app index](../README.md#catalogue-entries) defines the fields and the kinds.

## K-01 Notes folder and file tree

- **Kind:** feature
- **Need:** [Note taking](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Notes](../../gameplay/knowledge/notes.md)
- **Behavior:** The user picks a notes folder. If the saved folder is missing, the app uses the default folder and shows an error. The tree shows folders and notes. The user creates, renames, moves by drag and drop, and deletes notes and folders. Delete moves the item to the system trash after a question. The app watches the folder and loads changes from the disk.
- **Data:** Local. The notes folder on disk. Its path is in `config.json` in the app config folder.
- **Dependencies:** none
- **Status:** done. `client/src/components/FileTree/FileTree.tsx:360`, `client/src-tauri/src/config.rs:99`, `client/src-tauri/src/lib.rs:199`. Chat tools `notes_list` (read), `notes_create`, `notes_rename`, `notes_move`, `notes_delete` (write).
- **Open questions:** none
- **Not handled:** none

## K-02 Markdown editor

- **Kind:** feature
- **Need:** [Note taking](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Notes](../../gameplay/knowledge/notes.md)
- **Behavior:** The editor shows a live preview. It hides Markdown symbols away from the line of the cursor. A "Raw source" switch shows plain Markdown. The editor saves 500 ms after the last key. If a save fails, the editor keeps the text and tries again at the next edit.
- **Data:** Local. The note file in the notes folder.
- **Dependencies:** K-01
- **Status:** done. `client/src/components/MarkdownEditor/MarkdownEditor.tsx:73`, `client/src/components/menus/EditorMenu/EditorMenu.tsx:130`. Chat tools `notes_read` (read), `notes_edit`, `notes_write` (write).
- **Open questions:** none
- **Not handled:** none

## K-03 Note links

- **Kind:** feature
- **Need:** [Searching notes takes time](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [How players keep project notes](../../gameplay/knowledge/projects.md#how-players-keep-project-notes)
- **Behavior:** Ctrl+click (Cmd+click on macOS) opens a link. A relative link opens the note that it names. A web or mail link opens outside the app. The app refuses all other links.
- **Data:** Local. The notes folder.
- **Dependencies:** K-02
- **Status:** done. `client/src/components/menus/EditorMenu/EditorMenu.tsx:95`, `client/src/lib/linksApi.ts:4`. Chat tool `notes_open` (read).
- **Open questions:** none
- **Not handled:** none

## K-04 Note search

- **Kind:** feature
- **Need:** [Searching notes takes time](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Research](../../gameplay/knowledge/research.md)
- **Behavior:** Search finds text in the notes without regard to case. It returns at most 50 lines as `path:line: text`. Only the chat agent can search. The Notes screen has no search box.
- **Data:** Local. The notes folder.
- **Dependencies:** K-01
- **Status:** partial. Only the chat agent can search. `client/src-tauri/src/notes.rs:355`, `client/src/lib/notes.tools.ts:156`. Chat tool `notes_search` (read).
- **Open questions:** Must the Notes screen have its own search box?
- **Not handled:** none

## K-05 Character button in Notes

- **Kind:** feature
- **Need:** [What players look at during a turn](../product/needs.md#what-players-look-at-during-a-turn)
- **Gameplay link:** [Characters](../../gameplay/world/characters.md)
- **Behavior:** Above the notes tree, a button shows the photo, the name, and the current occupation of the claimed character. A click opens the character sheet.
- **Data:** Local. `characters.json` and `meId` in `config.json`.
- **Dependencies:** W-02, W-06
- **Status:** done. `client/src/components/menus/NotesMenu/CharacterButton.tsx:9`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## K-06 Chat conversations

- **Kind:** feature
- **Need:** none
- **Gameplay link:** none
- **Behavior:** The user sends a message, and the reply streams as Markdown. The user can stop a reply. The model menu lists the models of each provider, with a reasoning effort choice when the model has one. The history lists saved chats by date, searches them, and renames, archives, and deletes them. A ring shows how full the context of the model is.
- **Data:** Local. One file for each chat in the `chats/` folder of the app config folder.
- **Dependencies:** P-04
- **Status:** done. `client/src/components/menus/ChatMenu/ChatMenu.tsx:282`, `client/src/components/menus/ChatMenu/ChatHistory.tsx:88`, `client/src/components/menus/ChatMenu/ContextMeter.tsx:44`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## K-07 Chat tools and the permission gate

- **Kind:** feature
- **Need:** none
- **Gameplay link:** none
- **Behavior:** The chat agent uses app features only through the tool registry. In Manual mode, each `write` tool and `web_fetch` wait for the user to approve a card that shows the change. In Auto mode, all tools run without approval. A turn can make at most 25 tool calls.
- **Data:** Local. The mode is in `config.json`.
- **Dependencies:** K-06
- **Status:** done. `client/src/lib/chat/gate.ts:60`, `client/src/lib/chat/features.ts:71`, `client/src-tauri/src/chat/agent.rs:14`.
- **Open questions:** none
- **Not handled:** none

## K-08 Web research

- **Kind:** feature
- **Need:** [Research](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Research](../../gameplay/knowledge/research.md)
- **Behavior:** The chat agent searches the web through Tavily and reads a web page as text, at most 100 KB. The app refuses pages at private network addresses. In Manual mode, `web_fetch` asks for approval, because a URL can carry note text out of the app. In Auto mode, it does not ask.
- **Data:** none stored. The Tavily key is in `keys.json`.
- **Dependencies:** K-07, P-04
- **Status:** done. `client/src/lib/web.tools.ts:14`, `client/src-tauri/src/web.rs:19`. Chat tools `web_search` (read), `web_fetch` (read, asks in Manual mode).
- **Open questions:** none
- **Not handled:** none

## K-09 Project summaries

- **Kind:** planned. Build order 3.
- **Need:** [Searching notes takes time](../product/needs.md#where-play-loses-time), [Returning after a gap](../product/needs.md#where-play-loses-time), [What the game master keeps track of](../product/needs.md#what-the-game-master-keeps-track-of)
- **Gameplay link:** [Projects](../../gameplay/knowledge/projects.md)
- **Behavior:**
  1. A player or the game master asks the chat agent about a project.
  2. The agent finds the related passages in one or more notes. For the game master, it reads the notes of the game master on the topic and the notes of the players. The game master then sees the full state of the project.
  3. The agent summarizes the passages and links to each one.
  4. If notes conflict, the agent uses the later dated update as the current state.
  5. The agent keeps plans apart from completed actions.
  6. If an older passage conflicts with a later update, the agent offers to correct the older passage. It changes the passage only after the user approves.
- **Data:** Local. The agent reads notes. It stores nothing new. After K-10, it also reads shared notes of other users.
- **Dependencies:** K-04, K-07. K-10 for the notes of other users.
- **Status:** partial. The agent can search and read notes. A link in a chat message opens only as a web link (`client/src/components/menus/ChatMenu/ChatMenu.tsx:209`). The system prompt has no project rules. The part for the game master that reads the notes of players arrives with K-10, at build order 4.
- **Open questions:**
  - Chat links to notes. The recommendation is a link such as `note:Campaign.md#L42` that opens the note at that line.
  - Rules in the system prompt only, or a separate tool? The recommendation is the prompt only. A correction uses `notes_edit`, which the permission gate already holds for approval.
- **Not handled:** none

## K-10 Note visibility

- **Kind:** planned. Build order 4, with the server.
- **Need:** [Candidate areas](../product/needs.md#candidate-areas)
- **Gameplay link:** [Who can read notes](../../gameplay/knowledge/notes.md#who-can-read-notes)
- **Behavior:**
  - The group can read the note of a player by default.
  - A player can make a note private. Other players cannot read a private note.
  - The game master can read and edit every player note, including private notes.
  - A note of the game master is hidden until the game master shares it. Sharing shows the whole note to the whole group.
  - A user who can read a note can also edit it.
- **Data:** Shared.
- **Dependencies:** P-06, P-07, P-08
- **Status:** not started. Notes are in a local folder.
- **Open questions:** Can a user who can read a note also rename, move, or delete it?
- **Not handled:** none

## K-11 Research findings

- **Kind:** planned. Build order 6.
- **Need:** [Research](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Research](../../gameplay/knowledge/research.md)
- **Behavior:** A user or a research agent sends a finding for review. Any user can approve a finding. The app then saves the finding in the research collection of the group. Users read the collection in later turns.
- **Data:** Shared.
- **Dependencies:** P-07. K-08 for findings from the agent.
- **Status:** not started. The chat agent can search the web, but it does not save findings.
- **Open questions:**
  - Is the research agent the chat agent with new tools, or a separate agent?
  - Does a finding from a user need review, or only a finding from the agent?
- **Not handled:** none

## K-12 Campaign prices

- **Kind:** planned. Build order 6.
- **Need:** [Research](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Campaign prices](../../gameplay/knowledge/research.md#campaign-prices)
- **Behavior:** For each item, the app keeps the historical source and the last price that the group used. The game master decides which price applies in the campaign.
- **Data:** Shared.
- **Dependencies:** K-11
- **Status:** not started. The app stores no prices.
- **Open questions:** none
- **Not handled:** none

## K-13 Open tasks, plans, and standing orders

- **Kind:** idea
- **Need:** [What players look at during a turn](../product/needs.md#what-players-look-at-during-a-turn)
- **Gameplay link:** [Projects](../../gameplay/knowledge/projects.md), [Standing orders](../../gameplay/sessions/turn-order.md#standing-orders)
- **Behavior:** A player keeps a list of open tasks, goals, future plans, and standing orders for their character. A standing order stays on the list until the player changes or ends it. The app shows the list during the turn of that player.
- **Data:** Shared, with the same visibility as notes.
- **Dependencies:** S-02, S-03, W-06. K-10 to share it.
- **Status:** not started. Today a player keeps the list in a note.
- **Open questions:**
  - Is the list a note with a fixed name, Markdown task items in any note, or a separate record?
  - Does the game master see all standing orders in the interterm?
- **Not handled:** none
