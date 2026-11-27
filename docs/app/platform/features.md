# Platform features

This catalogue lists each platform feature of the app: the app frame, storage, providers, and the server. Each entry uses the same fields. [The app index](../README.md#catalogue-entries) defines the fields and the kinds. [Server and sync](server-and-sync.md) and [Shared chat models](chat-models.md) give the background of P-06 to P-09.

## P-01 App frame and navigation

- **Kind:** feature
- **Need:** none
- **Gameplay link:** none
- **Behavior:** A left rail opens Session, World, and Notes. A second click on the open tab closes or opens the rail panel. Bottom buttons open Chat and Dice in a side panel, and Settings. The user can resize the rail panel and the side panel. A double click resets the size. Each page keeps its state when the user changes tabs.
- **Data:** none. The state is in memory.
- **Dependencies:** none
- **Status:** done. `client/src/AppShell.tsx:50`, `client/src/AppShell.tsx:237`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## P-02 Unsaved changes, messages, and approvals

- **Kind:** feature
- **Need:** none
- **Gameplay link:** none
- **Behavior:** If the user leaves a form with unsaved changes, the app asks "Discard changes?". Errors stay on screen until the user closes them. Other messages close after 5 seconds. The count stops while the pointer or the keyboard focus is on the message. Delete of a person, a note, a folder, or a saved chat asks for approval first. Remove of an API key and Clear history in Dice do not ask.
- **Data:** none
- **Dependencies:** none
- **Status:** done. `client/src/AppShell.tsx:85`, `client/src/components/Toast/Toast.tsx:21`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## P-03 Local storage

- **Kind:** feature
- **Need:** none
- **Gameplay link:** none
- **Behavior:** The app keeps all data on this computer. The app config folder holds `config.json`, `keys.json`, and the `chats/` folder. The app data folder holds the default `notes/` folder, `characters.json`, `world.json`, `table.json`, `photos/`, `round-notes/`, and a model cache. Each save of user data writes a temporary file and then renames it, so a failed save keeps the old data. The app writes the model cache directly, because it can download the cache again. Session records have IDs and change times. People and jobs have IDs but no change times. The world settings have no ID and no change time.
- **Data:** Local.
- **Dependencies:** none
- **Status:** done. `client/src-tauri/src/lib.rs:47`, `client/src-tauri/src/world.rs:152`, `client/src-tauri/src/table.rs:8`, `client/src-tauri/src/table.rs:303`.
- **Open questions:** none
- **Not handled:** none

## P-04 API keys and providers

- **Kind:** feature
- **Need:** none
- **Gameplay link:** none
- **Behavior:** Settings › API Keys saves, replaces, and removes the OpenCode Go key and the Tavily key. The interface shows only whether a saved key exists. Settings also checks whether this computer has the Codex command line tool and whether the user signed in to it. Chat on Codex runs a Codex server that the app starts. The app turns off the shell, file, and web tools of Codex.
- **Data:** Local. `keys.json` in the app config folder, readable only by its owner.
- **Dependencies:** none
- **Status:** done. `client/src/components/menus/SettingsMenu/ProvidersSettings.tsx:73`, `client/src-tauri/src/secrets.rs:45`, `client/src-tauri/src/chat/codex.rs:36`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## P-05 External links

- **Kind:** feature
- **Need:** none
- **Gameplay link:** none
- **Behavior:** The app opens web and mail links in the system browser or mail app. It refuses all other link types with "Can't open this link.".
- **Data:** none
- **Dependencies:** none
- **Status:** done. `client/src-tauri/src/lib.rs:180`, `client/src/lib/linksApi.ts:4`. No chat tool.
- **Open questions:** none
- **Not handled:** none

## P-06 Server

- **Kind:** planned. Build order 4.
- **Need:** [Candidate areas](../product/needs.md#candidate-areas)
- **Gameplay link:** [Who can read notes](../../gameplay/knowledge/notes.md#who-can-read-notes)
- **Behavior:** One server holds the data of the group and is the single source of truth. It runs on the home network of one group member, at a domain name that the member owns. During development, the server runs on the same computer as the app.
- **Data:** Shared.
- **Dependencies:** none
- **Status:** not started. The repository has no `server/` folder.
- **Open questions:**
  - Server language and framework. The newest releases must be checked before a choice.
  - How does the server get a TLS certificate for the domain?
- **Not handled:** none

## P-07 Sync

- **Kind:** planned. Build order 4.
- **Need:** [Candidate areas](../product/needs.md#candidate-areas), [Note taking](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Notes](../../gameplay/knowledge/notes.md)
- **Behavior:** During play, the app gets the latest data from the server, and users edit notes together live. For offline work, a user keeps a snapshot. The app syncs the changes of the user when the user is online again. The goal is shared note taking, like Obsidian or Google Docs.
- **Data:** Shared, with a local snapshot.
- **Dependencies:** P-06
- **Status:** not started. Session records already have IDs and change times. People and jobs have only IDs (P-03).
- **Open questions:**
  - Which sync engine? A data type that merges offline edits without conflict is the usual choice. The newest releases must be checked before a choice.
  - Which data moves to the server: notes, people, sessions, and turn notes?
  - Do all computers show the same turn timer? See S-05.
- **Not handled:** none

## P-08 Users and roles

- **Kind:** planned. Build order 4.
- **Need:** none
- **Gameplay link:** [Who can read notes](../../gameplay/knowledge/notes.md#who-can-read-notes)
- **Behavior:** The server knows each user and whether the user is a player or the game master. Note visibility depends on this role. The role controls only who can read notes. Each user can edit people, stats, the game date, and the session. The claim of a character belongs to the user.
- **Data:** Shared.
- **Dependencies:** P-06. K-10 needs this entry.
- **Status:** not started. Today the claim of a character belongs to one computer (W-06).
- **Open questions:** How does a user sign in to the server?
- **Not handled:** none

## P-09 Shared chat models

- **Kind:** idea
- **Need:** none
- **Gameplay link:** none
- **Behavior:** A user connects a provider account or a local model on their own computer. Other users in the group then use that model during play. This gives users without a paid subscription the same chat features.
- **Data:** Shared.
- **Dependencies:** P-06, P-08
- **Status:** not started. Today each user saves their own keys (P-04).
- **Open questions:** none
- **Not handled:** none

## P-10 Several campaigns

- **Kind:** idea
- **Need:** none
- **Gameplay link:** [Start of the campaign](../../gameplay/world/setting.md#start-of-the-campaign)
- **Behavior:** The app keeps the data of each campaign apart: people, the game date, sessions, rounds, and notes. The user chooses the campaign. The app holds campaign 3 and later campaigns only.
- **Data:** Local today. Shared after P-07.
- **Dependencies:** none
- **Status:** not started. The app has one game date, one people list, and one list of rounds (P-03).
- **Open questions:** When a new campaign starts, does anything carry over, for example research findings, campaign prices, people, or stat names?
- **Not handled:** none

## P-11 Import existing notes

- **Kind:** idea
- **Need:** none
- **Gameplay link:** [Notes](../../gameplay/knowledge/notes.md)
- **Behavior:** A new user brings their existing campaign notes into the app at the start.
- **Data:** Local. The notes folder.
- **Dependencies:** K-01
- **Status:** not started. A user can pick an existing folder of Markdown files as the notes folder (K-01). The app imports no other format.
- **Open questions:** Which formats and sources do the other players use?
- **Not handled:** none

## P-12 Other devices

- **Kind:** idea
- **Need:** none
- **Gameplay link:** none
- **Behavior:** A user can use the app on a device other than a desktop computer, or with no install.
- **Data:** Shared, through P-07.
- **Dependencies:** P-06, P-07
- **Status:** not started. The app is a desktop app only.
- **Open questions:** Which devices: a phone, a tablet, or a web browser?
- **Not handled:** none
