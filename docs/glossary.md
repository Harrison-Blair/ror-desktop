# Glossary

This glossary fixes one meaning for each game and app term in these documents. Agents and people use each term only with this meaning. The third column lists words that must not replace the term. A name in the app interface or in code is a literal name. Put a literal name in inline code, for example `GM · Interterm`.

The STE linter uses this file with the base glossary:

```
ste-lint.py --glossary <skill>/references/base-glossary.md --glossary docs/glossary.md FILE
```

## People

| Term | Meaning | Do not use |
| --- | --- | --- |
| group | The players and the game master of one campaign. | party |
| player | A person in the group who plays one character. | |
| game master | The person who runs the world, plays all characters that are not player characters, and makes rulings. | GM, DM, referee |
| user | A person who uses the app. A user is a player or the game master. | customer |
| client | The desktop app in the `client/` folder of the repository. | |
| character | A real historical person in the game world. | NPC, avatar |
| player character | A character that a player plays. | PC |
| game master character | A character that the game master plays. | non-player character |
| person | An app record of a character in World. A person has dates, places, stats, a description, and a job history. | |
| character sheet | The view of the stats, picture, and name of one character. | |
| heir | A character who can receive the assets of a dead character under the law of that society. | |

## Time and play

| Term | Meaning | Do not use |
| --- | --- | --- |
| campaign | One continuous game from its start date onward. A campaign is a sandbox: it has no end condition. The group plays its third campaign today. | |
| divergence | A change from real history at the start of a campaign. | |
| session | One meeting of the group to play. | play night, game night |
| round | One cycle of player turns and one interterm. The group uses rounds of one quarter of game time today. | cycle |
| quarter | Three months of game time. | |
| turn | The part of a round in which one player acts. | |
| interterm | The part of a round, after the last player turn, in which the game master describes the events of the quarter. | interturn |
| turn order | The order of player turns in a session. | initiative |
| turn limit | The soft time limit on a turn, about 20 minutes. | |
| turn timer | The clock on screen that counts down the turn limit. | |
| action | One thing that a character does in a turn. | |
| major action | An action that counts toward the soft limit of about 3 actions in a turn. | |
| standing order | An order that continues every round until the player changes it. | |
| campaign map | The Google Earth map of the campaign that the group shares. | |
| mark | One area, line, or point on the campaign map, with a name. | placemark |

## Rules

| Term | Meaning | Do not use |
| --- | --- | --- |
| stat pair | Two opposed stats, for example Scientific and Religious. A character has 8 stat pairs. | axis |
| stat side | One stat of a stat pair. A stat side has a value from 1 to 100. | |
| skill check | A d100 roll plus one stat side, compared with a target or judged by the game master. | skill roll, test |
| total | The d100 result plus the stat side value. A total is from 2 to 200. | |
| target | The total that a skill check must equal or exceed. A target is from 1 to 200. | difficulty class, DC |
| contest | A competition between players, in which each acting player makes a skill check against a target. | opposed roll |
| ruling | A decision of the game master on a case that has no fixed rule. | |

## Economy

| Term | Meaning | Do not use |
| --- | --- | --- |
| ledger | The record of one character's money, accounts, income, debts, and inventory. | spreadsheet, books |
| account | One balance in a ledger, for example personal funds or one company. | wallet |
| asset | Something of value that a character or company owns, for example cash, goods, land, or a company. | holding |
| inventory | The goods that a character or company owns, with their quantities and locations. | stock |
| trade | An exchange of money or assets between two characters. | deal |
| historical price | A real price from the period of the campaign. The group uses it as a starting point. | |
| campaign price | The price that the group uses for an item in the campaign. | |

## Knowledge

| Term | Meaning | Do not use |
| --- | --- | --- |
| note | A Markdown document that a user writes. | |
| notes folder | The folder that holds the notes of a user. | vault |
| private note | A note that other players cannot read. The game master can read it. | secret note |
| shared note | A note of the game master that the game master made visible to the group. | |
| government | The organization that rules a country. | |
| international organization | An organization that countries join, for example the United Nations. | |
| project | Work of a character that continues across turns. | programme |
| estimate | A statement of the game master about how long a project will take. | |
| research | Work to find a historical fact or price, during play or between sessions. | |
| finding | One result of research that the group can keep and use again. | |
| mention | A link from a note to a person. | tag |
| backlink | A link from a person to a note that mentions that person. | |

## App

| Term | Meaning | Do not use |
| --- | --- | --- |
| chat agent | The model in the Chat panel that uses app features through the tool registry. | assistant, bot |
| tool | One function that the chat agent can call. A tool is `read` or `write`. | |
| server | The one program that holds the data of the group and is the single source of truth. | backend |
| sync | Copy changes between the app on one computer and the server. | |
| snapshot | A copy of server data on one computer for offline work. | |
| feature | One behavior of the app that a catalogue entry describes. | |
| catalogue entry | One section in a `features.md` file that describes one feature or idea. | |
| status | The state of a feature in the current source code: done, partial, not started, or not checked. | |
