# App

These documents describe the Ror Desktop app. [The gameplay folder](../gameplay/README.md) describes the game that the app supports. The world, sessions, economy, and knowledge folders match the gameplay domains with the same names. [The glossary](../glossary.md) defines each term.

## Feature catalogue

Each domain has one `features.md` file. Each file lists the features that exist and the features that the group plans.

| Catalogue | IDs | Contents |
| --- | --- | --- |
| [World](world/features.md) | W-01 to W-17 | People, character sheets, stats, the game date, mentions, backlinks, governments, companies, international organizations, relationships, the campaign map |
| [Sessions](sessions/features.md) | S-01 to S-15, without S-11 | Sessions, turn order, turns, the turn timer, rounds, turn notes, dice, timelines, transcription |
| [Economy](economy/features.md) | E-01 to E-09 | Ledgers, trades, payment schedules, currencies, the economy system, calculations |
| [Knowledge](knowledge/features.md) | K-01 to K-13 | Notes, the editor, search, the chat agent, research, projects, visibility, open tasks and standing orders |
| [Platform](platform/features.md) | P-01 to P-12 | The app frame, storage, providers, the server, sync, users |

### Catalogue entries

An ID is never used again. S-11 Standing orders is now part of K-13.

Each entry has a heading with an ID and a name, for example `W-09 Mention a person in a note`. Cite an entry by its ID. Each entry has these fields:

| Field | Contents |
| --- | --- |
| Kind | `feature`: the feature exists. `planned`: the group decided to build it, with its build order. `idea`: a possible later feature. |
| Need | The need in [Group needs](product/needs.md) that the feature serves, or "none". |
| Gameplay link | The gameplay rule that the feature supports, or "none". |
| Behavior | What the user does and what the app does. |
| Data | Local (on one computer) or shared (on the server), and the file or store. |
| Dependencies | The IDs of the entries that this entry needs. |
| Status | done, partial, not started, or not checked, with a `path:line` citation in the source code. Also the chat tools of the feature, with the `read` or `write` flag. |
| Open questions | Choices that the group makes when it builds the feature. A recommendation can follow each question. |
| Not handled | Edge cases that have no evidence yet. |

## Build order

The group builds the easiest work first. Features with shared data wait for the sync foundation, so that the app does not store their data two times.

1. S-05 Timer chimes and a default turn length of 20:00. Git also tracks `docs/`.
2. W-09 Mention a person in a note and W-10 Backlinks on a person.
3. K-09 Project summaries.
4. P-06 Server, P-07 Sync, P-08 Users and roles, and K-10 Note visibility.
5. E-01 Ledgers.
6. K-11 Research findings and K-12 Campaign prices.
7. E-06 Economy system.

Ideas have no place in the build order yet.

## Product

| Document | Contents |
| --- | --- |
| [App overview](product/overview.md) | The purpose of the app and how the group works today |
| [Group needs](product/needs.md) | Where play loses time, what the game master keeps track of, and what players look at during a turn |
| [Current features](product/feature-inventory.md) | A short list of the six sidebar destinations |

## Platform background

| Document | Contents |
| --- | --- |
| [Server and sync](platform/server-and-sync.md) | The home server, live collaboration, and offline snapshots |
| [Shared chat models](platform/chat-models.md) | Sharing one model of a user with the group |
