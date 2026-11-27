# Server and sync

All copies of the app connect to one server. The server is the single source of truth for notes and campaign data.

- The server runs on the home network of one group member. That member exposes it through a domain name that they own, routed through their DNS provider.
- During play, players connect to the server to get the latest notes and to work together live.
- For offline work, a player keeps a snapshot copy from the server. The player edits it offline, and the app syncs the changes when the player is online again.
- The goal is collaborative note taking, similar to Obsidian or Google Docs. Users can edit together, store their notes, and plan.

[Who can read notes](../../gameplay/knowledge/notes.md#who-can-read-notes) gives the visibility rules that the server must apply. [K-10 Note visibility](../knowledge/features.md#k-10-note-visibility) lists them for the app.

Status: not done. The repository has no `server/` folder yet. The app keeps notes in a local folder.
