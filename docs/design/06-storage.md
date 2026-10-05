# 06 Storage

**Parked (2026-10-05).** The user does not accept this design and is working on the interfaces and features first. Nothing here is settled, and it is expected to be redone when storage is taken up. Where another spec cites this file, read the citation as "to be decided with storage".

Status: draft. Every choice of format, layout, name and limit in this file is a proposal to the user, not a settled decision. Each one is numbered under [Decisions for the user](#decisions-for-the-user) with the recommended option and its alternatives, and the body is written to the recommended option. A sentence that rests on one ends with "(decision N)". A sentence that rests on an open question in this file ends with "(gap N)"; one that rests on an open question in `00-ontology.md` names it as "ontology gap N".

The records, their fields and their life cycles are defined in `00-ontology.md` and are not redefined here. The decisions this file follows are in `README.md` in this folder ("Settled so far", "Defaults adopted"). This file owns how those records are written to disk, including how a block is written inside a note.

## Contents

- [Purpose](#purpose)
- [Folder layout](#folder-layout)
- [Where each record lives](#where-each-record-lives)
- [Blocks inside a note](#blocks-inside-a-note)
- [Ids, authors and the change record](#ids-authors-and-the-change-record)
- [Visibility on disk](#visibility-on-disk)
- [Reading rules and limits](#reading-rules-and-limits)
- [Writing rules](#writing-rules)
- [Trust boundaries](#trust-boundaries)
- [Ready for sync](#ready-for-sync)
- [Carried over from the current app](#carried-over-from-the-current-app)
- [Decisions for the user](#decisions-for-the-user)
- [Gaps](#gaps)

## Purpose

A campaign is kept as plain files in one folder (**Campaign**, **Existing app**). This file says:

- which file each kind of record is kept in, and in what format;
- how a note carries its own id, owner and visibility level while staying readable as ordinary Markdown in other programs;
- how roll, money, event, chart and table file blocks are written inside a note, so that a shared record shown in a note and in a ledger or timeline has exactly one copy of each fact on disk (**Blocks are shared records**);
- what the app must not trust when it reads the folder, because people will open it in other programs, edit files by hand and, later, sync it between machines;
- how files are read and written safely;
- which layout choices keep the folder ready for a later sync server, without designing that server (**Sync**).

It does not describe page layouts or behaviour on screen, the sync server or its protocol, or any implementation detail beyond requiring one bounded reader.

## Folder layout

One example campaign, "Harbour 1962", started on 10 February 1962. Two people: Alice, a player, and Ben, the game master, who plays no character. Alice played Tom Reyes in round 1; he died, and she has played Ada Hart since round 2. Three quarterly rounds have opened; rounds 1 and 2 are closed and round 3 is open. Ada has two accounts, one recurring income and one asset. The world has three events, two divergence entries and two economy items.

```
Harbour 1962/
├── .ror/
│   ├── campaign.json
│   ├── stats.json
│   ├── divergences.json
│   ├── people/
│   │   ├── per_01J9ZB6MQK46BGARSPPFH37TJK.json   Alice
│   │   └── per_01J9ZP6Z4EJWT0YAPANKZ7HRVM.json   Ben
│   ├── characters/
│   │   ├── chr_01J9Z67W4WHSXXN8X668K2JZXV.json   Ada Hart (active)
│   │   └── chr_01J9Z0B4J99Y9T337KYA5CXXPP.json   Tom Reyes (dead)
│   ├── accounts/
│   │   ├── acc_01J9ZJP8HDHQFZTSXMVKPTCBCZ.json   First National checking
│   │   └── acc_01J9Z59MMKN4QY7NCNFD6WDJDJ.json   Zurich account
│   ├── recurring/
│   │   └── rec_01J9ZKSG421D62QKK2DQYXDAP4.json   Ada's dock wages
│   ├── assets/
│   │   └── ast_01J9ZDBZYYGXTYSA7YZ5ZJ47S6.json   Warehouse lease, Locust Point
│   ├── rounds/
│   │   ├── rnd_01J9ZX9WWERKV8Z588XCPSH9V6.json   Round 1 (closed)
│   │   ├── rnd_01J9ZBP415E8MHYYWT1SFMGFMY.json   Round 2 (closed)
│   │   └── rnd_01J9ZW76YKR8ERAAS8CPNCPVMR.json   Round 3 (open)
│   ├── turns/
│   │   ├── trn_01J9ZDSS2EX9NVC2AV2KXYGA71.json   Alice, round 1
│   │   ├── trn_01J9ZZC66JP3Q82NJQ8M4J0R68.json   Alice, round 2
│   │   └── trn_01J9ZPFPHGKJC5PFGV9SSJ4C3T.json   Alice, round 3
│   ├── events/
│   │   ├── evt_01J9Z71S282YC34RF50KXZWT9P.json   Dock strike at Locust Point
│   │   ├── evt_01J9ZNPG10BQFZT6DSW6Q1QD2T.json   Cuban missile crisis (changed)
│   │   └── evt_01J9Z5QBKZPBF8V04W61H8070A.json   Warehouse fire
│   ├── economy/
│   │   ├── eco_01J9Z0Z1WB58J49QS5EC3Q0PKK.json   Wheat, Chicago (a price)
│   │   └── eco_01J9ZSANV5CNBH79KY3ETC9QNZ.json   Unemployment rate
│   └── files/
│       ├── fil_01J9Z1MAVBGFCB3E7KNRC5ZMWY.json   Images/Ada Hart.jpg
│       ├── fil_01J9Z0H9MGE2M4G9JAEHKZT6RQ.json   Images/Harbour map.png
│       └── fil_01J9Z5TKGPSZYKTADTXWXAAGBA.json   Tables/Grain shipments.csv
├── Rounds/
│   ├── Round 001/
│   │   ├── Turn - Tom Reyes.md
│   │   └── Interterm.md
│   ├── Round 002/
│   │   ├── Turn - Ada Hart.md
│   │   └── Interterm.md
│   └── Round 003/
│       ├── Turn - Ada Hart.md
│       └── Interterm.md
├── Images/
│   ├── Ada Hart.jpg
│   └── Harbour map.png
├── Tables/
│   └── Grain shipments.csv
├── People/
│   └── Senator Hale.md
├── Places/
│   └── Port of Baltimore.md
└── Campaign notes.md
```

What each entry is:

- `Harbour 1962/`: the campaign folder the person picked. Its name is not stored anywhere and can be anything.
- `.ror/`: the app's data folder. Everything the app keeps that is not a note, an image or a table file lives here (decision 3).
- `.ror/campaign.json`: the Campaign record: name, start date (ontology gap 36, gap 38), currency and the usual turn order. Its presence is what marks the folder as a campaign (decision 4).
- `.ror/stats.json`: the campaign's Stat list, in order.
- `.ror/divergences.json`: the campaign's Divergence list, in order.
- `.ror/people/`: one file per Person, named by its id (decision 5).
- `.ror/characters/`: one file per Character, holding its Stat values with their changes and its Identity fields with their changes (decision 2).
- `.ror/accounts/`: one file per Account, holding its Ledger entries (decision 2).
- `.ror/recurring/`: one file per Recurring item (decision 2).
- `.ror/assets/`: one file per Asset, holding its value history (decision 2).
- `.ror/rounds/`: one file per Round, holding its turn order, its Interterm, its Proposals and its Net-worth snapshots (decision 2), and, only while the Round has not finished opening, its opening plan (decision 27).
- `.ror/turns/`: one file per Turn, holding its done and skipped marks and naming its turn note (decision 2).
- `.ror/events/`: one file per Event (decision 2).
- `.ror/economy/`: one file per Economy item, holding its Readings (decision 2).
- `.ror/files/`: one small file per Image or Table file, holding the id and author that the picture or CSV file cannot hold itself, and its path in the folder (decision 14).
- `.ror/pending/`, not in the example: present only while a rename made in the app has not finished updating links (decision 25).
- `Rounds/Round 001/` to `Round 003/`: the folder the app creates for each Round's notes, numbered with three digits so they sort in order (decision 15).
- `Turn - Tom Reyes.md`, `Turn - Ada Hart.md`: turn notes, one per Turn, named after the Character active when the Round opened (decision 15). Round 1's note keeps Tom's name after his death.
- `Interterm.md`: each Round's interterm note (decision 15).
- `Images/Ada Hart.jpg`: Ada's photo, copied in through the file picker (decision 16).
- `Images/Harbour map.png`: an image shown inside a note, placed in the folder by hand.
- `Tables/Grain shipments.csv`: a Table file.
- `People/Senator Hale.md`: a note about a non-player character (**Other world things**).
- `Places/Port of Baltimore.md`: a note about a place.
- `Campaign notes.md`: an ordinary note at the top of the folder.

`Rounds/`, `Images/`, `Tables/`, `People/` and `Places/` are ordinary folders. Only `Rounds/` and `Images/` are created by the app; the others are the table's own choice. A note, image or table file may sit in any folder outside `.ror/`.

## Where each record lives

One row for every record in `00-ontology.md` from Game date to Economy item and Reading, plus each sub-record defined under them. "One per file" means a file holds one record of that kind; "many per file" means a file holds a list of them.

| Record | Kept in | Format | Per file | Why |
| --- | --- | --- | --- | --- |
| Game date | A field of each record that carries one | Text in a fixed form (decision 8) | n/a | A value, not a record |
| Visibility level | A field of Note (front matter), Account and Event | One of `everyone`, `owner-and-gm`, `gm` | n/a | A value, not a record |
| Owner and Author | Fields of each record: `author` on every record; `owner` on Note, Account and Event | A Person id | n/a | Values naming a Person |
| Place | A field of Event, Asset and Identity change | Text | n/a | Text until ontology gap 27 is answered |
| Campaign | `.ror/campaign.json` | JSON (decision 1) | One per file | One per folder; also marks the folder (decision 4) |
| Turn order | A field of Campaign (`campaign.json`) and of Round (its round file) | Ordered list of Person ids | n/a | Belongs to the Campaign or Round that holds it |
| Person | `.ror/people/<id>.json` | JSON | One per file | Added and renamed independently (decision 2) |
| Role | A field of Person | `player` or `gm` | n/a | Ontology gap 1 |
| Character | `.ror/characters/<id>.json` | JSON | One per file | Each Character changes on its own (decision 2) |
| Stat | `.ror/stats.json` | JSON | Many per file | The list's order is its meaning |
| Stat value | Inside its Character's file | JSON | Many per file | Belongs to one Character |
| Stat change | Inside its Stat value, in the Character's file | JSON | Many per file | History of one value |
| Identity fields | Inside its Character's file | JSON | One per Character file | One per Character |
| Identity change | Inside the Identity fields, in the Character's file | JSON | Many per file | History of one Character |
| Image | The picture file anywhere outside `.ror/`, plus `.ror/files/<id>.json` for its id and author | PNG, JPEG, GIF or WebP; JSON | One per file | A picture cannot hold an id without changing it |
| Round | `.ror/rounds/<id>.json` | JSON | One per file | Opened and closed as a unit |
| Turn | `.ror/turns/<id>.json` | JSON | One per file | Each person marks their own turn without touching anyone else's file |
| Interterm | Inside its Round's file | JSON | One per Round file | Exactly one per Round |
| Turn note and Interterm note | Markdown files under `Rounds/Round NNN/` (decision 15) | Markdown with front matter (decision 7) | One per file | Notes are ordinary Markdown files |
| Action | Inside its turn note: a heading followed by a marker line (decision 12) | Markdown heading and HTML comment | Many per file | Derived from the heading; only the Id and Author are stored |
| Roll | Inside its note, as a roll block | Fenced block holding JSON (decision 10) | Many per file | The roll block is the only copy (rule 9) |
| Note | A Markdown file anywhere outside `.ror/` | Markdown with front matter (decision 7) | One per file | Readable in any Markdown program |
| Block | Inside its note | Fenced block holding JSON (decision 10) | Many per file | Part of the note's text |
| Link | Text links: derived from the note's text, nothing else stored. Field links: a field of Event (`links`) and Asset (`linkedNote`) | Wiki link, Markdown link, or an id in a field (decision 13) | n/a | Gap 1 for the Link's own Id and Author |
| Table file | The CSV file anywhere outside `.ror/`, plus `.ror/files/<id>.json` for its id and author | CSV (settled), JSON | One per file | A CSV file cannot hold an id without becoming a data row |
| Account | `.ror/accounts/<id>.json` | JSON | One per file | Has its own Owner and level; lost or transferred on its own |
| Ledger entry | Inside its Account's file | JSON | Many per file | Follows its Account (default 3); one copy only (decision 11) |
| Recurring item | `.ror/recurring/<id>.json` | JSON | One per file | Changed independently of the Account it names |
| Proposal | Inside the Round's file it was made for | JSON | Many per file | Made and decided together at Advance |
| Asset | `.ror/assets/<id>.json` | JSON | One per file | Each Asset changes on its own |
| Asset value | Inside its Asset's file | JSON | Many per file | History of one Asset |
| Net-worth snapshot | Inside its Round's file | JSON | Many per file | All taken together when the Round closes. The net worth itself is derived from the stored parts; nothing else is stored (ontology gap 22) |
| Event | `.ror/events/<id>.json` | JSON | One per file | Has its own Owner and level; one copy only (decision 11) |
| Divergence entry | `.ror/divergences.json` | JSON | Many per file | The list's order is its meaning |
| Economy item | `.ror/economy/<id>.json` | JSON | One per file | Each item is tracked on its own |
| Reading | Inside its Economy item's file | JSON | Many per file | History of one item |

Values marked "derived" in the ontology are not stored: an Account's balance, an Asset's current value, a Stat value's current value, the current Identity fields, a Character's net worth (worked out from its parts), a Person's Characters and active Character, a Round's number and end date, a Turn's position, a note's Kind and a turn note's Game date, an Action's heading and position, a Block's "belongs to", a Link's state and every "linked from" list. The app works them out when it reads the folder. Two exceptions are stored because they must not change afterwards: a Roll's total (worked out when rolled) and a Net-worth snapshot's parts (ontology gap 22, gap 20).

### Example data files

These show the form of each kind of data file. Every data file is a JSON object, pretty-printed with two-space indents, one field per line, keys in the order shown, LF line endings, UTF-8 without a byte-order mark, and a final newline (decision 22). Optional fields with no value are left out rather than written as `null`.

`.ror/campaign.json`:

```json
{
  "format": "ror-campaign",
  "version": 1,
  "id": "cmp_01J9ZTHS0NGJHNH76MYV7JKJ0Q",
  "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-09-12T18:04:51Z",
  "name": "Harbour 1962",
  "start": "1962-02-10",
  "currency": "USD",
  "turnOrder": ["per_01J9ZB6MQK46BGARSPPFH37TJK"]
}
```

`.ror/stats.json` (the stat names are examples; the real names are not yet given, ontology gap 29):

```json
{
  "format": "ror-stats",
  "version": 1,
  "stats": [
    {
      "id": "sta_01J9ZHW57YK88DHRG9TYT6RFNQ",
      "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedAt": "2026-09-12T18:06:10Z",
      "name": "Science"
    },
    {
      "id": "sta_01J9Z7ETK4CCDV6NDJ6RHE3JSZ",
      "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedAt": "2026-09-12T18:06:22Z",
      "name": "Charm"
    }
  ]
}
```

A Stat's position is its place in the list. A removed Stat stays in the list with `"removed": true` so that saved Rolls and histories keep its name (ontology gap 6, gap 14).

`.ror/divergences.json` has the same shape, with a `divergences` list whose entries hold `id`, `author`, `changedBy`, `changedAt` and `text`.

`.ror/people/per_01J9ZB6MQK46BGARSPPFH37TJK.json`:

```json
{
  "format": "ror-person",
  "version": 1,
  "id": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-09-12T18:05:02Z",
  "name": "Alice",
  "role": "player"
}
```

`.ror/characters/chr_01J9Z67W4WHSXXN8X668K2JZXV.json`:

```json
{
  "format": "ror-character",
  "version": 1,
  "id": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-10-04T20:10:33Z",
  "person": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "name": "Ada Hart",
  "photo": "Images/Ada Hart.jpg",
  "birthDate": "1931",
  "status": "active",
  "description": "Grew up over a chandlery in [[Port of Baltimore]].",
  "stats": [
    {
      "id": "stv_01J9ZZ7212R9WY4ZSH2BTDK9KP",
      "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedAt": "2026-09-19T19:12:00Z",
      "stat": "sta_01J9ZHW57YK88DHRG9TYT6RFNQ",
      "changes": [
        {
          "id": "stc_01J9ZMHEFBMWC8RGPCE7YHA8YM",
          "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
          "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
          "changedAt": "2026-09-19T19:12:00Z",
          "date": "1962-05-10",
          "value": 22,
          "reason": "Starting value"
        }
      ]
    },
    {
      "id": "stv_01J9Z5PVFGB62XQNNVR5YZ5FZ3",
      "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedAt": "2026-10-04T20:10:33Z",
      "stat": "sta_01J9Z7ETK4CCDV6NDJ6RHE3JSZ",
      "changes": [
        {
          "id": "stc_01J9ZBC4RE5WVS8X176TPNAMTB",
          "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
          "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
          "changedAt": "2026-09-19T19:12:00Z",
          "date": "1962-05-10",
          "value": 38,
          "reason": "Starting value"
        },
        {
          "id": "stc_01J9Z4F5P1E3QDMKTVBCZ04E2F",
          "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
          "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
          "changedAt": "2026-10-04T20:10:33Z",
          "date": "1962-08-10",
          "value": 41,
          "reason": "Won over the harbour master",
          "action": "act_01J9ZJTAQRV4QMY3MN24WDJ9X2"
        }
      ]
    }
  ],
  "identity": {
    "id": "idn_01J9Z83M5J1PY54FF37WTJ5XXM",
    "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
    "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
    "changedAt": "2026-09-19T19:14:58Z",
    "changes": [
      {
        "id": "idc_01J9ZFVDNMJGVVF1163C5GCH68",
        "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
        "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
        "changedAt": "2026-09-19T19:14:40Z",
        "field": "occupation",
        "value": "Longshoreman's clerk",
        "date": "1962-05-10"
      },
      {
        "id": "idc_01J9ZHX042C4213CRWVXA9HCG3",
        "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
        "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
        "changedAt": "2026-09-19T19:14:58Z",
        "field": "location",
        "value": "Baltimore",
        "date": "1962-05-10"
      }
    ]
  }
}
```

The description is a field holding Markdown text, as ontology gap 5 recommends (gap 6). It is shown under the same rules as a note's body (see [Trust boundaries](#trust-boundaries)). A Stat change or Ledger entry names what it is attached to with at most one of `action`, `turn` or `interterm` (ontology gap 14, gap 8).

`.ror/accounts/acc_01J9Z59MMKN4QY7NCNFD6WDJDJ.json`, an account visible to its owner and the game master:

```json
{
  "format": "ror-account",
  "version": 1,
  "id": "acc_01J9Z59MMKN4QY7NCNFD6WDJDJ",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "owner": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "visibility": "owner-and-gm",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-10-04T19:40:02Z",
  "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
  "name": "Zurich account",
  "currency": "USD",
  "status": "open",
  "entries": [
    {
      "id": "led_01J9ZYHQKGDT1Y99FGBNGY4N01",
      "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedAt": "2026-09-19T19:30:11Z",
      "date": "1962-05-10",
      "amount": "5000.00 USD",
      "description": "Opening deposit"
    },
    {
      "id": "led_01J9ZGT62KWRM4ZBMZ418HKX0Q",
      "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedAt": "2026-10-04T19:40:02Z",
      "date": "1962-08-10",
      "amount": "-1200.00 USD",
      "description": "Envelope for Kowalski",
      "action": "act_01J9ZJTAQRV4QMY3MN24WDJ9X2",
      "note": "not_01J9ZS3ZP8C1KDFX7Y4HE5HEFG"
    }
  ]
}
```

`note` names the note whose money block shows the entry; it is how a copied block is told apart from the original (see [Blocks inside a note](#blocks-inside-a-note)). An entry made by accepting a Proposal names it with `proposal`.

`.ror/recurring/rec_01J9ZKSG421D62QKK2DQYXDAP4.json`:

```json
{
  "format": "ror-recurring",
  "version": 1,
  "id": "rec_01J9ZKSG421D62QKK2DQYXDAP4",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-09-19T19:33:47Z",
  "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
  "account": "acc_01J9ZJP8HDHQFZTSXMVKPTCBCZ",
  "description": "Dock wages",
  "amount": "310.00 USD",
  "cadence": "monthly",
  "start": "1962-05-10"
}
```

Whether a Recurring item has a description, and how the entries it makes get theirs, is ontology gap 44; `description` is written to its recommendation, which this file copies unchanged at gap 41. Proposals already made from an item that is changed are ontology gap 45 (gap 43).

`.ror/assets/ast_01J9ZDBZYYGXTYSA7YZ5ZJ47S6.json`:

```json
{
  "format": "ror-asset",
  "version": 1,
  "id": "ast_01J9ZDBZYYGXTYSA7YZ5ZJ47S6",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-09-19T19:36:20Z",
  "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
  "name": "Warehouse lease, Locust Point",
  "kind": "lease",
  "quantity": "1",
  "location": "Baltimore",
  "linkedNote": "not_01J9Z10Y5NVRHG9HTG0MT9RS6R",
  "values": [
    {
      "id": "asv_01J9Z57S3GGWXEM8XV0SGWWMBC",
      "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedAt": "2026-09-19T19:36:20Z",
      "date": "1962-05-10",
      "value": "8500.00 USD"
    }
  ]
}
```

An Asset that follows a price names the Economy item with `linkedPrice` (default 10).

`.ror/rounds/rnd_01J9ZBP415E8MHYYWT1SFMGFMY.json`, a closed round:

```json
{
  "format": "ror-round",
  "version": 1,
  "id": "rnd_01J9ZBP415E8MHYYWT1SFMGFMY",
  "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-10-03T21:48:09Z",
  "length": "quarter",
  "start": "1962-05-10",
  "status": "closed",
  "turnOrder": ["per_01J9ZB6MQK46BGARSPPFH37TJK"],
  "interterm": {
    "id": "itm_01J9ZFN4MDKWS9STVY5QE8E4JH",
    "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
    "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
    "changedAt": "2026-10-03T21:40:15Z",
    "note": "not_01J9ZW382XG4AFA96A55E2S71K",
    "done": true
  },
  "proposals": [
    {
      "id": "prp_01J9Z17R1WS5753FDACEFT2GXX",
      "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
      "changedAt": "2026-10-03T21:46:30Z",
      "recurring": "rec_01J9ZKSG421D62QKK2DQYXDAP4",
      "date": "1962-05-10",
      "amount": "310.00 USD",
      "description": "Dock wages",
      "decision": "accepted",
      "entry": "led_01J9Z5Y01CJV63QZP7ED3KX3N0"
    }
  ],
  "snapshots": [
    {
      "id": "nws_01J9Z3JNH7WMRXEAC6W0YTST0M",
      "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedAt": "2026-10-03T21:48:09Z",
      "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
      "valuedOn": "1962-08-09",
      "accounts": [
        { "account": "acc_01J9ZJP8HDHQFZTSXMVKPTCBCZ", "balance": "640.00 USD" },
        { "account": "acc_01J9Z59MMKN4QY7NCNFD6WDJDJ", "balance": "5000.00 USD" }
      ],
      "assets": [
        { "asset": "ast_01J9ZDBZYYGXTYSA7YZ5ZJ47S6", "quantity": "1", "value": "8500.00 USD" }
      ]
    }
  ]
}
```

A linked Asset with no Reading on or before the snapshot's date (default 10) is stored in `assets` with no `value`, which is how "not valued" is kept (gap 20). A Proposal's `description` is copied from its Recurring item (ontology gap 44, gap 41). A round's number is its place when all rounds are sorted by start date, and its end date is worked out from its start and length (default 6).

A Round that has not finished opening also holds `opening`, the plan its opening follows, written in the Round file's first write and removed by the last write of the opening (decision 27, see [Writing rules](#writing-rules)). It names, for each Turn, the Turn's id, Person, Character and note id and the path of its turn note, and the path of the interterm note, whose id is the Interterm's `note`:

```json
  "opening": {
    "turns": [
      {
        "turn": "trn_01J9ZPFPHGKJC5PFGV9SSJ4C3T",
        "person": "per_01J9ZB6MQK46BGARSPPFH37TJK",
        "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
        "note": "not_01J9ZS3ZP8C1KDFX7Y4HE5HEFG",
        "path": "Rounds/Round 004/Turn - Ada Hart.md"
      }
    ],
    "intertermPath": "Rounds/Round 004/Interterm.md"
  }
```

`opening` comes after `interterm`. The Round above finished opening, so it does not hold it.

`.ror/turns/trn_01J9ZPFPHGKJC5PFGV9SSJ4C3T.json`:

```json
{
  "format": "ror-turn",
  "version": 1,
  "id": "trn_01J9ZPFPHGKJC5PFGV9SSJ4C3T",
  "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-10-04T20:15:00Z",
  "round": "rnd_01J9ZW76YKR8ERAAS8CPNCPVMR",
  "person": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
  "note": "not_01J9ZS3ZP8C1KDFX7Y4HE5HEFG",
  "done": false,
  "skipped": false
}
```

`.ror/events/evt_01J9Z71S282YC34RF50KXZWT9P.json`, an event promoted from an action:

```json
{
  "format": "ror-event",
  "version": 1,
  "id": "evt_01J9Z71S282YC34RF50KXZWT9P",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "owner": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "visibility": "everyone",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-10-04T20:21:44Z",
  "date": "1962-09",
  "title": "Dock strike at Locust Point",
  "description": "Longshoremen walk out after the early grain shipment.",
  "tags": ["labour"],
  "place": "Baltimore",
  "marker": "new-here",
  "links": ["chr_01J9Z67W4WHSXXN8X668K2JZXV", "not_01J9Z10Y5NVRHG9HTG0MT9RS6R"],
  "action": "act_01J9ZQ374DHYRCSKHNA5PXKCEK",
  "note": "not_01J9ZS3ZP8C1KDFX7Y4HE5HEFG"
}
```

The marker is one of `in-our-world`, `changed`, `new-here` and `did-not-happen`; a changed or did-not-happen event adds `inOurWorld` text (default 1). An event made in an Interterm names it with `interterm`. The `description` is text with links and is shown under the same rules as a note's body (see [Trust boundaries](#trust-boundaries)).

`.ror/economy/eco_01J9Z0Z1WB58J49QS5EC3Q0PKK.json`, a price item:

```json
{
  "format": "ror-economy-item",
  "version": 1,
  "id": "eco_01J9Z0Z1WB58J49QS5EC3Q0PKK",
  "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-10-03T21:20:05Z",
  "name": "Wheat, Chicago",
  "unit": "bushel",
  "price": true,
  "readings": [
    {
      "id": "rdg_01J9ZGWKDMHXAH6EGMM2W7PES2",
      "author": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
      "changedAt": "2026-10-03T21:20:05Z",
      "date": "1962-05-10",
      "value": "2.05 USD",
      "note": "Board of Trade close"
    }
  ]
}
```

A price item's reading is an amount per unit, written with its currency (decision 9, ontology gap 25, gap 13). Any other item's reading is a plain number in its unit, such as `"5.5"` for an unemployment rate in percent.

`.ror/files/fil_01J9Z5TKGPSZYKTADTXWXAAGBA.json`:

```json
{
  "format": "ror-file",
  "version": 1,
  "id": "fil_01J9Z5TKGPSZYKTADTXWXAAGBA",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-10-01T17:02:12Z",
  "path": "Tables/Grain shipments.csv"
}
```

Numbers that may have a fraction (amounts, quantities, readings) are written as decimal text, so that no value is rounded by a binary number type. Whole numbers that are always whole (stat values, die results, totals, modifiers and targets) are JSON numbers (decision 9, ontology gap 30).

## Blocks inside a note

### Front matter: a note's own fields

A note's Id, Author, Owner, Visibility level, Game date and change record are kept in front matter: lines between two `---` lines at the very top of the file (decision 7). Most Markdown programs either hide front matter or show it as a small table of properties, so the rest of the note stays ordinary Markdown.

```markdown
---
ror: 1
id: not_01J9Z10Y5NVRHG9HTG0MT9RS6R
author: per_01J9ZB6MQK46BGARSPPFH37TJK
owner: per_01J9ZB6MQK46BGARSPPFH37TJK
visibility: everyone
gameDate: 1962-02-10/1962-11
changedBy: per_01J9ZB6MQK46BGARSPPFH37TJK
changedAt: 2026-10-02T09:12:40Z
---
# Port of Baltimore

The deepest harbour on the Chesapeake. See [[Senator Hale]].
```

Rules (decision 7):

- The app reads only these keys: `ror` (the format version, now 1), `id`, `author`, `owner`, `visibility`, `gameDate`, `changedBy` and `changedAt`. Each must be on one line in the form `key: value` with a plain value and no quotes.
- Any other line in the front matter, such as `tags` or `aliases` written by another program, is kept exactly as found and never rewritten.
- When the app changes one of its keys it replaces only that key's line; when it adds a key it adds a line before the closing `---`.
- `gameDate` uses the forms in decision 8. A turn note and an interterm note have no `gameDate` line: their date is their Round's period (default 7, ontology gap 11), worked out from the Round.
- A note's Kind is not stored. A note is a turn note or an interterm note because a Turn or an Interterm names its id.
- A note with no front matter, for example one written in another program, has no id yet (gap 3).

### Actions

A heading in a turn note marks an Action (rule 8). Its Id and Author are kept on a marker line directly under the heading (decision 12):

```markdown
## Bribe the harbour master
<!-- ror-action {"id": "act_01J9ZJTAQRV4QMY3MN24WDJ9X2", "author": "per_01J9ZB6MQK46BGARSPPFH37TJK"} -->
```

The marker is an HTML comment, which ordinary Markdown programs do not show. The app adds a marker the next time it saves a turn note that has a heading without one. Renaming the heading, in the app or anywhere else, leaves the marker and so the Id unchanged, which answers ontology gap 12 as proposed in decision 12. Any heading level marks an Action. Headings in an interterm note get no marker, because they are not Actions (ontology gap 13). An Action's changes are recorded as changes to its note; the marker holds no change record. What happens when the marker is lost or duplicated outside the app is gap 5.

### The general form of a block

Every block is a fenced code block whose info string names its kind, holding one JSON object (decision 10):

````markdown
```ror-money
{"id": "led_01J9ZGT62KWRM4ZBMZ418HKX0Q"}
```
````

The kinds are `ror-roll`, `ror-money`, `ror-event`, `ror-chart` and `ror-table`. Another program shows a block as a small piece of code, so the note still reads sensibly. The app writes the JSON in the same pretty-printed form as data files; it reads it however it is spaced. A block's text is at most 64 KiB (decision 17).

### Roll block

The roll block is the Roll; there is no other copy (rule 9).

````markdown
```ror-roll
{
  "id": "rol_01J9ZDVNEVH021HHN2E9M8KCS0",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-10-04T20:02:40Z",
  "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
  "dice": "1d100",
  "results": [47],
  "stat": "sta_01J9Z7ETK4CCDV6NDJ6RHE3JSZ",
  "statModifier": 41,
  "modifier": -10,
  "total": 78,
  "target": 90,
  "verdict": "Kowalski takes the money but wants a cut next quarter too."
}
```
````

`results` holds one number per die in the order rolled. `statModifier` is the Stat value at the moment of rolling (default 12). `stat`, `character`, `statModifier`, `modifier`, `target` and `verdict` are optional. `total` is stored as rolled; the app does not recompute it on reading, and shows a warning when it does not equal the results plus the modifiers (gap 18).

### Money block

A posted money block holds only the Ledger entry's id. The entry's date, amount, description and links live once, in its Account's file (decision 11):

````markdown
```ror-money
{"id": "led_01J9ZGT62KWRM4ZBMZ418HKX0Q"}
```
````

What the block holds: the id. What the Account file holds: everything else about the entry, plus `note`, the id of the note that shows it. Editing the block on screen changes the Account file only; the note's text does not change. One record shown in two places therefore has one copy of each fact on disk.

An unposted money block, such as one in a note copied inside the app (rule 7), holds a draft instead. The draft is not a Ledger entry yet, so it is not a second copy of anything. Its `id` is the id the entry will take when it is posted:

````markdown
```ror-money
{
  "id": "led_01J9Z4WYSEZDWS0JN25MGT8FMM",
  "draft": {
    "account": "acc_01J9Z59MMKN4QY7NCNFD6WDJDJ",
    "date": "1962-11-10",
    "amount": "-1200.00 USD",
    "description": "Envelope for Kowalski"
  }
}
```
````

Posting it writes the entry to the Account file and rewrites the block to the posted form (see [Writing rules](#writing-rules)); a draft that must take a new id first has the new id written into the note (decision 23). The entry it writes names this note in `note`, which is how a post interrupted between the two writes is told apart from a copy after the app is reopened (decision 23, see [When a block goes wrong](#when-a-block-goes-wrong)).

### Event block

An event block works the same way: a posted block holds only the Event's id, and the Event's data lives once in its file under `.ror/events/`, which also names the note that shows it (decision 11):

````markdown
```ror-event
{"id": "evt_01J9Z71S282YC34RF50KXZWT9P"}
```
````

An unposted event block holds a draft with at least the event's `date` and `title`, and any other Event field:

````markdown
```ror-event
{
  "id": "evt_01J9Z8H7RSCE8HBQDC94EARAS3",
  "draft": {
    "date": "1962-10",
    "title": "Second walkout at Locust Point"
  }
}
```
````

### Chart block

A chart block is display-only. It names its source and the columns it draws (default 15) and its kind (ontology gap 19):

````markdown
```ror-chart
{
  "id": "blk_01J9Z75Q7WJ4J1EHARA05R6ZEM",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-10-04T19:51:07Z",
  "kind": "bar",
  "source": {"file": "Tables/Grain shipments.csv"},
  "x": "Month",
  "y": ["Tons shipped"]
}
```
````

`source` is exactly one of:

- `{"file": "<path>"}`: a Table file, by its path from the campaign folder (decision 14);
- `{"tableAbove": true}`: the nearest Markdown table above the block in the same note (gap 35);
- `{"economy": "<economy item id>"}`, with columns `date` and `value`;
- `{"account": "<account id>"}`, with columns `date` and `balance`;
- `{"netWorth": "<character id>"}`, with columns `round` and `netWorth`.

### Table file block

A table file block shows a Table file inside the note. It names the file by its path from the campaign folder (decision 14):

````markdown
```ror-table
{
  "id": "blk_01J9ZZC8MT2J1VKNH411H501RV",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-10-04T19:49:31Z",
  "file": "Tables/Grain shipments.csv"
}
```
````

The Table file itself is CSV (settled). Its dialect is RFC 4180: comma-separated, fields with commas, quotes or line breaks quoted with double quotes, UTF-8, and a first row of column names (decision 26). `Tables/Grain shipments.csv`:

```csv
Month,Tons shipped,Buyer
1962-08,1200,Continental Grain
1962-09,850,"Bunge, Ltd."
1962-10,,
```

A row shorter than the header is read as if padded with blank cells (decision 26). The app keeps the line ending the file already uses when it saves it; new files use LF (decision 26).

### A whole turn note

Round 3's turn note, `Rounds/Round 003/Turn - Ada Hart.md`, as it appears in its Markdown source:

`````markdown
---
ror: 1
id: not_01J9ZS3ZP8C1KDFX7Y4HE5HEFG
author: per_01J9ZP6Z4EJWT0YAPANKZ7HRVM
owner: per_01J9ZB6MQK46BGARSPPFH37TJK
visibility: everyone
changedBy: per_01J9ZB6MQK46BGARSPPFH37TJK
changedAt: 2026-10-04T20:21:44Z
---
Ada spends the autumn working the docks at Locust Point.

## Bribe the harbour master
<!-- ror-action {"id": "act_01J9ZJTAQRV4QMY3MN24WDJ9X2", "author": "per_01J9ZB6MQK46BGARSPPFH37TJK"} -->

Ada offers Kowalski a cut of the next grain shipment.

```ror-roll
{
  "id": "rol_01J9ZDVNEVH021HHN2E9M8KCS0",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZP6Z4EJWT0YAPANKZ7HRVM",
  "changedAt": "2026-10-04T20:02:40Z",
  "character": "chr_01J9Z67W4WHSXXN8X668K2JZXV",
  "dice": "1d100",
  "results": [47],
  "stat": "sta_01J9Z7ETK4CCDV6NDJ6RHE3JSZ",
  "statModifier": 41,
  "modifier": -10,
  "total": 78,
  "target": 90,
  "verdict": "Kowalski takes the money but wants a cut next quarter too."
}
```

```ror-money
{"id": "led_01J9ZGT62KWRM4ZBMZ418HKX0Q"}
```

## Ship the grain early
<!-- ror-action {"id": "act_01J9ZQ374DHYRCSKHNA5PXKCEK", "author": "per_01J9ZB6MQK46BGARSPPFH37TJK"} -->

![Harbour map](../../Images/Harbour%20map.png)

```ror-event
{"id": "evt_01J9Z71S282YC34RF50KXZWT9P"}
```

```ror-table
{
  "id": "blk_01J9ZZC8MT2J1VKNH411H501RV",
  "author": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedBy": "per_01J9ZB6MQK46BGARSPPFH37TJK",
  "changedAt": "2026-10-04T19:49:31Z",
  "file": "Tables/Grain shipments.csv"
}
```
`````

The note's author is Ben, who opened the round, and its owner is Alice, whose turn it is (ontology gaps 10 and 11, gap 7). The money block is in a note everyone can see, but it names an entry in an account only Alice and the game master can see. The note holds only the entry's id, so no hidden amount sits in the note's text (ontology gap 17, gap 9).

### When a block goes wrong

| Problem | What a person sees | What happens on disk |
| --- | --- | --- |
| The block's text is not valid JSON, is over 64 KiB, lacks `id`, has a field of the wrong kind, has an id that is not well formed (decision 6), or has a key the app does not know (decision 21) | The block shows in place as "This block can't be read", with one line saying why. The rest of the note works. In raw source the text is shown as written | The app never rewrites the block's text. It counts nothing towards a ledger, timeline or chart. The person fixes or removes it in raw source |
| A fence that is never closed | Under the CommonMark rule the block runs to the end of the note, so it shows as a block that can't be read, and the text after it is inside it | Nothing is rewritten |
| An info string starting `ror-` that the app does not know | "This block comes from a newer version of the app or is not recognised" | Kept exactly as found |
| A posted money or event block whose id is in no Account file or event file | The block shows as a missing entry or missing event, in the same way as a link to something deleted (default 14), with a choice to remove the block | Nothing is rewritten until the person chooses |
| A chart or table file block whose file or record is missing | The block shows the source as missing (default 14) | Nothing is rewritten |
| A posted money or event block that names a record whose `note` is a different note, or a second block with the same id further down the same note | The block shows as "a copy, not posted", offering Post or Remove (rule 7). The first block in the note that the record names stays the posted one | Nothing is rewritten until the person chooses. Post makes a new id no record has and writes three times: the note, with the block rewritten as an unposted draft carrying the new id and the original's current fields; the new record, naming this note; the note again, with the block in the posted form naming the new id. After the first write the block is an ordinary unposted draft, so a stop there leaves no record made; after the second it is an interrupted post, read as in the row below on interrupted posts (decision 23) |
| An unposted draft whose `id` already belongs to a record whose `note` is a different note, or names no note, or a draft whose `id` is already named by an earlier block in the same note | Shown as a copy, as above (decision 23) | When posted it takes a new id, in the same three writes: the note with the draft carrying the new id, the record, the note in the posted form (decision 23) |
| An unposted draft whose `id` names no record, while a file that could hold that record cannot be read: the Account file the draft names, or the event file named with the draft's id | The block shows as "can't tell whether this was posted", naming the file. Post is not offered until the file can be read | Nothing is rewritten. Once the file can be read, the block is read by the rows above (decision 23) |
| An unposted draft whose `id` belongs to a record whose `note` is this note, and no earlier block in this note names that id: a post that was interrupted after the record was written and before the note was (see [Writing rules](#writing-rules)) | The block shows as posted, showing the record from its own file, as if the post had finished. Nothing offers to post it again, and the ledger or timeline shows the record once (decision 23) | Nothing is rewritten on reading. The next time the app saves the note, the block is rewritten to the posted form; the draft's fields are dropped, because the record's file holds what was posted (decision 23) |
| Two roll blocks with the same id | Both show; the later one is marked as a duplicate | The later one gets a new id the next time the app saves the note |
| A whole note copied in another program, so two notes carry the same `id` in front matter | Both notes open with a warning that two notes share an id; shared blocks in both can be viewed but not edited until a person picks which one is the copy (gap 32) | The copy is given a new id in its front matter; its money and event blocks then show as copies, not posted |
| A roll block whose `dice` is over the dice limits, whose `results` do not match the notation, or whose `total` does not add up | The roll shows with a warning naming the problem (gap 18) | Nothing is recalculated or rewritten |

## Ids, authors and the change record

**Ids.** Every record has an Id (**Sync**). An Id is a three-letter lower-case prefix naming the kind of record, an underscore, and a ULID: 26 characters of upper-case Crockford base 32, which uses digits and upper-case letters without I, L, O and U, and begins with the time it was made (decision 6). For example `led_01J9ZGT62KWRM4ZBMZ418HKX0Q`. Ids are made on the machine that creates the record, so two people never need to agree on one.

| Prefix | Record | Prefix | Record |
| --- | --- | --- | --- |
| `cmp` | Campaign | `act` | Action |
| `per` | Person | `rol` | Roll |
| `chr` | Character | `blk` | Chart or table file block |
| `sta` | Stat | `not` | Note, turn note, interterm note |
| `stv` | Stat value | `fil` | Image or Table file |
| `stc` | Stat change | `acc` | Account |
| `idn` | Identity fields | `led` | Ledger entry |
| `idc` | Identity change | `rec` | Recurring item |
| `rnd` | Round | `prp` | Proposal |
| `trn` | Turn | `ast` | Asset |
| `itm` | Interterm | `asv` | Asset value |
| `evt` | Event | `nws` | Net-worth snapshot |
| `div` | Divergence entry | `eco` | Economy item |
| `rdg` | Reading | | |

Where the Id is kept: the `id` field of a data file or of each item in its lists; the `id` line in a note's front matter; the marker under an Action's heading; the `id` of a block; and the `id` in `.ror/files/` for an Image or Table file. A data file kept one record per file is named with its record's id and `.json` (decision 5), and the `id` inside must match the name. A text Link has no stored Id (gap 1).

**Authors.** Every record has an `author` naming a Person by id. The Author is whoever was picked in "viewing as" when the record was created (rule 4). It is a claim made by the person at the keyboard and is not proof of who created the record: anyone can pick any Person, and anyone with the folder can edit the field by hand. The same is true of `changedBy`.

**The record of changes.** What the record of changes holds is ontology gap 42, copied unchanged:

> **The record of changes.** **Who may change what** says every change records who made it, but not what is kept. Recommendation: each record keeps who last changed it and when (real-world time) now; a full list of changes that people can look through is later.

This layout is written to that recommendation and rests on it. Every record and every item in a record's lists carries `changedBy` (a Person id) and `changedAt` (the real-world time from the system clock, in UTC, written as `2026-10-04T20:02:40Z`). A note carries them in its front matter for every change to its text. An Action's changes are its note's. Records the app derives store nothing. If a full list of changes is wanted later, it needs a new place on disk and a new format version (gap 4).

## Visibility on disk

Note, Account and Event carry a visibility level: `everyone`, `owner-and-gm` or `gm`, stored with `owner` in the note's front matter or in the account or event file. A missing level is read as `everyone`, the default (**Secrets**). An unknown value is read as `gm`, the most hidden, and shown with a warning; it is not rewritten (gap 37). Everything else has no level of its own:

- Ledger entries live inside their Account's file, so they are always kept at their Account's level (default 3).
- Recurring items and Proposals name their Account and follow its level (ontology gap 20, gap 11).
- A posted money or event block holds only an id, so the amount, description, date and title of a hidden record never appear in a note at another level (decision 11, ontology gap 17).
- Net-worth snapshots store each Account's balance as a part, including hidden Accounts', so each viewer's total can leave out what they cannot see (ontology gap 22, gap 12). Those parts sit in the round file, which has no level.
- File and folder names, front matter and the `.ror/` files are visible to anyone who opens the folder in another program. A game-master-only note's file name shows in any file manager (gap 25).

Visibility levels are not protection while everyone can read the folder. Every file, including every hidden note, account and event, is on each machine that has the campaign, readable by anyone who opens it in another program (**Secrets**, rule 24). The app hides what the person in "viewing as" may not see; it cannot stop anyone reading the files. Real protection needs the server, later.

## Reading rules and limits

### One bounded reader

Every file's contents are read through one bounded reader. It is the only way the app reads a file in the campaign folder, the preferences file or a picked photo. For each file it:

1. checks the path: relative to the campaign folder, `/` separators, no empty, `.` or `..` parts, no drive letter, no backslash, no control characters (except for a picked photo, whose path comes from the picker);
2. checks the entry's type without following a symbolic link, and refuses anything that is not a regular file: a symbolic link (to a file, a missing target, a folder, `/dev/zero`, `/dev/urandom` or another link), a folder, a FIFO, a socket or a device;
3. opens it without following links and without blocking on special files, checks the opened file is still a regular file, and refuses it if not;
4. reads at most the kind's limit plus one byte, and refuses the file if that last byte arrives, so a file that is too large, or is growing while read, fails without being read in full;
5. for text, refuses anything that is not UTF-8 (a leading byte-order mark is accepted and ignored).

Each failure gives one plain line naming the file and the reason ("Tables/Grain shipments.csv is larger than 5 MiB", "Rounds/Round 003/Interterm.md is a symbolic link"), within a bounded time, without crashing and without writing anything. An unreadable file, a folder the app cannot enter and a file locked by another program fail the same way, and are tried again on the next Refresh.

The eventual implementation must be checked by searching the native code for every place that reads file contents, and confirming each one goes through this reader. Today ordinary notes and images are read without a size limit and through symbolic links whose target is inside the folder; those read sites are replaced (see [Carried over from the current app](#carried-over-from-the-current-app)).

### Limits

All limits are proposals (decision 17). "Exactly at the limit" is accepted; one byte over is refused.

| What | Limit |
| --- | --- |
| A data file in `.ror/` | 4 MiB |
| A note | 5 MiB (as descriptions today) |
| A note's front matter | must close within the first 64 KiB of the note |
| A block's text | 64 KiB |
| An Action marker line | 1,000 characters |
| A Table file | 5 MiB, at most 1,000 columns and 100,000 rows |
| An image in the folder | 20 MiB (pixel size: gap 30) |
| A photo picked from the machine | 20 MiB (as today) |
| The preferences file | 64 KiB |
| Names and short text fields in data (names, titles, tags, places, reasons) | 1,000 characters each |
| Amount or decimal text | 40 characters |
| Dice notation in a roll block | 200 characters, 100 dice, 1,000,000 sides per die (as today) |
| Folder listing | 20,000 entries in all, 32 folders deep |
| A file or folder name | 255 bytes |
| A path from the campaign folder | 1,024 bytes |
| Everything read in one open or Refresh | 256 MiB in all |

When a listing or the total read reaches its limit, the app stops there, shows what it has, and says plainly that the campaign is larger than it can open, naming the limit. It never writes because of it.

### Each kind of file

A file marked "read-only" below is shown with a plain message and cannot be edited in the app until it is fixed; the app never overwrites it. A malformed file is never overwritten, by any save, Refresh or Advance.

| File | Missing | Empty | Malformed | A newer version | A symbolic link or other non-regular file |
| --- | --- | --- | --- | --- | --- |
| `.ror/campaign.json` | The folder is not a campaign (decision 4). Nothing else in it is listed or read | Malformed | The campaign does not open; one line says why. Nothing is written | The campaign does not open: "made by a newer version of the app" | The campaign does not open |
| Any other data file in `.ror/` | A record that names it shows it as missing (default 14) | Malformed | That record is shown as "can't be read" with the file's path and is read-only; the rest of the campaign works. Records that name it show it as missing | Read-only, with "made by a newer version" | Skipped and listed as a problem; records that name it show it as missing |
| A data file whose `id` does not match its name, or whose `id` is already used by another file | Not applicable | Not applicable | Read-only, flagged as a copy (gap 32) | Not applicable | Not applicable |
| A note (`.md`, `.markdown`) | A Link to it shows as missing or broken (defaults 13, 14) | A valid empty note with no id (gap 3) | Front matter the app cannot read (a key of its own twice, or a value it does not accept, such as a `ror` value that is not a whole number): the note opens as text, its front matter is kept exactly as found, and the app's own keys are treated as absent. A note that is not UTF-8 does not open | `ror` above 1: the note opens read-only | Listed, not opened |
| A block inside a note | Not applicable | `{}` lacks `id`: malformed | See [When a block goes wrong](#when-a-block-goes-wrong) | Unknown `ror-` kind: kept as found | Not applicable |
| A Table file (`.csv`) | A block naming it shows it as missing | A grid with no columns | An unclosed quote, a cell over the file's limits, or not UTF-8: shown as "can't be read" and read-only | Not applicable | Listed, not opened |
| An image | A note showing it shows it as missing (default 14) | Shown as an image that can't be displayed | Contents that are not the format its extension names: shown as an image that can't be displayed | Not applicable | Listed, not opened |
| A record in `.ror/files/` | The image or table file has no id or author yet (gap 3) | Malformed | Read-only; the file it names still opens | Read-only | Skipped |
| The preferences file | Defaults are used | Defaults are used | Defaults are used and the problem is reported once (gap 28) | Defaults are used | Defaults are used |

Within a data file, a key the app does not know makes the file read-only, naming the key (decision 21). A key given twice in one JSON object makes the file malformed. A required field that is missing, or a field of the wrong kind (a list where text is expected, `null`, a number given as text where a number is required, an object where an id is expected), makes the file malformed. Ids and names from files are never used as keys of plain objects in the app, so names such as `__proto__`, `constructor`, `toString`, `hasOwnProperty` and `prototype` are ordinary text.

### The folder listing

The app lists the campaign folder on open and Refresh; there is no file watcher (settled). The listing:

- does not enter symbolic links to folders, and lists them as such (as today);
- skips `.ror/` from the notes it lists (gap 26), and lists only the files of the kinds named above within `.ror/`, including pending-rename files (decision 25);
- ignores files whose names end `.ror-tmp`, which are left over from a write that did not finish (gap 31);
- flags two entries in one folder whose names differ only by case or by Unicode form, because they become one file on Windows and macOS (gap 34);
- flags names that Windows cannot hold: `CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9` and `LPT1` to `LPT9` with or without an extension, names ending in a dot or a space, and names containing `<`, `>`, `:`, `"`, `\`, `|`, `?`, `*` or control characters. They are listed, and the app refuses to create such names itself;
- stops at the limits above.

## Writing rules

**One step.** Every file the app writes, notes and Table files included, is replaced in one step: the new contents are written to a new file named `.<name>.<random>.ror-tmp` in the same folder, flushed to disk, and then renamed over the old file (decision 18). A crash leaves either the old file or the new one, never half of each. This replaces today's direct overwrite of notes. A new file is created only if nothing with that name exists. The app never writes through a symbolic link: if the target is not a regular file, the write is refused.

**Size.** A write that would make a file larger than its limit is refused before anything is written. The draft is kept, and the person is told which file is too large and by how much. Nothing is truncated.

**Two files in one edit.** Most edits to a shared record touch one file, because a posted block holds only an id: changing an entry's amount rewrites the Account file and not the note (decision 11). Four edits to a shared record touch two files: inserting a new money or event block, posting a copied block, removing a block together with its record, and deleting a note's heading when records point at its Action. The order is chosen so that a failure halfway never loses a record (decision 19):

- When a record is created (a new block, or a copy posted), the record's file is written first, then the note. If the note's write fails, the entry or event exists and names the note, and is shown in its ledger or timeline as not yet shown in the note. A copy that must take a new id has one write before these: the note, with the block as an unposted draft carrying the new id, so the note already holds the id the record will take before the record is written (decision 23).
- When a record is removed with its block, the note is written first, then the record's file. If the second write fails, the record remains, as if the person had chosen to keep it (rule 6).
- When an Action's heading is deleted, the note is written first, then each record that pointed at it is rewritten to point at the Turn (ontology gap 12).

If either write fails, both drafts are kept, the failure is reported with Retry, and moving to another file, renaming, trashing and closing the window wait until the drafts are saved or the person discards them, as today. Retry repeats only the write that failed.

**After the app stops halfway.** If the app is closed, crashes or loses power between the two writes, the drafts held in memory are gone, and reopening the campaign finds the first write on disk without the second. Each case is read so that nothing is done twice (decision 19, decision 23):

- A record created, its note not written. For a new block, the note never held the block: the record names the note and is shown in its ledger or timeline as not yet shown in the note, as above. For a posted copy, the note still holds the draft carrying the record's id, and the record names this note: the post was interrupted, and the block is shown as posted, not as a copy to post again (decision 23, see [When a block goes wrong](#when-a-block-goes-wrong)). This holds for a copy that took a new id too, because the new id was written into the note before the record was written; a stop after that first write leaves an ordinary unposted draft and no record (decision 23).
- A block removed, its record not removed. The record remains, as if the person had chosen to keep it (rule 6), shown as not shown in any note. The person can delete it from its ledger or timeline.
- A heading deleted, its records not yet rewritten. A record whose `action` names an Action no longer in its note is read as belonging to the Turn as a whole, with a notice, and is rewritten when a person accepts, as gap 5 recommends for a lost marker (gap 5).

**Other edits that write several files.** Every edit that writes more than one file follows one rule (decision 24): all new ids are made before anything is written; the first write records the change, and each later write only brings other files into line with it, so it can be worked out again from what the first write left. Records name what they came from (`note`, `proposal`, `round`, `interterm`), so that reading tells a finished change from an unfinished one. Reading never writes: an unfinished change is completed the next time the app saves the file concerned, or when a person chooses Finish. While the app runs, a failed write keeps the drafts and reports the failure with Retry, as above; Retry repeats the failed write and those after it, never one that succeeded. How a failure is shown belongs to `01-app-shell.md` (its rule 49 and its gap 35, the banner's wording).

| Edit | Order of writes | Left on disk if the app stops after an earlier write | What reopening the campaign does |
| --- | --- | --- | --- |
| Inserting a new money or event block, posting a copied block, removing a block with its record, deleting a heading with records under it | As above (decision 19) | As above | As above |
| Promoting an Action to an Event. Ontology gap 26: "**Promoting an Action to an Event.** Recommendation: promotion inserts an event block under the Action's heading, so the Event and the turn note stay one record." | The same as inserting a new event block: the event file, naming the Action in `action` and the note in `note`, then the note | An Event naming the Action and the note, with no block in the note | Shown on the timeline as not yet shown in the note, as for any new block. Promoting again is not needed; inserting a block for it is the person's choice |
| Accepting or editing a Proposal (`03-world.md` rule 21) | 1. The Account file, with the new Ledger entry naming the Proposal in `proposal`. 2. The Round file, with the decision and `entry` (decision 24) | A Ledger entry naming a Proposal the Round file still shows as undecided | The Proposal is shown as decided: accepted when the entry's amount, date and description (gap 41) equal the Proposal's, edited otherwise. Accept and Edit are not offered for it, so no second entry is made. The Round file is brought into line the next time the app saves it, at the latest when the Round closes (decision 24) |
| Skipping a Proposal | The Round file only | Nothing partial | Nothing to do |
| Changing a decision already made, which `03-world.md` gap 44 (Proposals before the Round closes) recommends removes or replaces the entry it made | 1. The Account file, without the old entry and with the new one if the new decision makes one, in one write. 2. The Round file (decision 24) | A Round file whose `entry` names an entry that is gone, or not the entry that now names the Proposal | An entry naming the Proposal in `proposal` wins over the Round file's `entry`. A Proposal marked accepted or edited with no entry naming it is shown as decided with its entry missing (default 14), with a choice to decide it again; nothing is made until the person chooses (decision 24) |
| Changing a Recurring item that has undecided Proposals (ontology gap 45, gap 43) | 1. The Recurring item's file. 2. The Round file, with its undecided Proposals remade from the item (decision 24) | Undecided Proposals that still show the item as it was | When the Advance step opens, undecided Proposals that differ from their item as it now is are remade; decided ones are left alone, as ontology gap 45 recommends (gap 43, decision 24) |
| Opening a Round (owned by `03-world.md`; how the first Round opens and whether Advance opens the next at once is ontology gap 8: "**Opening rounds.** How the first Round opens, and whether Advance opens the next Round at once. Recommendation: the first Round opens when the campaign is created, starting on its start date; Advance closes the Round and opens the next at once, asking for its length with the previous length as the default.") | 1. The Round file, with status open, its Interterm naming the interterm note's id, and `opening`: every Turn's id, Person, Character (the one active now) and note id and path, and the interterm note's path, all made before this write (decision 27). 2. Each Turn's file, as the plan names it. 3. Each turn note and the interterm note, new files at the plan's paths carrying the plan's ids in their front matter, in the Round's folder (decision 15). 4. The Round file again, without `opening` (decisions 24 and 27) | A Round file holding `opening`, with some planned Turn files or notes not yet written, or all written | While the Round file holds `opening`, the Round is shown as not finished opening, naming what is missing, with Finish (how it is shown belongs to `03-world.md`). Finish works only from the plan, never from the Person's current Character or the current turn order: it writes each planned Turn whose file `.ror/turns/<id>.json` does not exist, with the planned Person and Character, and each planned note whose id is in no note, at its planned path, then writes the Round file without `opening`. It never writes over anything: an existing Turn file is left as it is, and a planned note is not made where anything already stands at its path (a note with another id or none, one that can't be read, a symbolic link or a folder); that note is reported and Finish stops short of the last write until a person moves the thing away. Finish is not offered while any note's id can't be read (a note that can't be read, one whose front matter can't be read, one listed but not opened) or while the listing stopped at a limit, because the planned note could be among them; the notice names them. A planned note deleted or moved away outside the app before Finish is made again, empty, because before the last write nothing tells it from a note never written; while the Round file holds `opening`, the app does not offer to delete a note the plan names (gap 44). Once `opening` is gone, opening has finished: a Turn or note missing after that is shown as missing (default 14) and nothing makes it again (decisions 24 and 27) |
| Closing a Round | Every Proposal is decided before the Round can close (**Advancing**), and a decision writes its entry when it is made (`03-world.md` rule 21), so closing writes one file: the Round file, with its snapshots and status closed. If Advance then opens the next Round (ontology gap 8), that is the edit above, begun only after the closed Round file is written. Closing a reopened Round again writes only its own file | A closed Round and no next Round | The World tab offers to open the next Round, as when none has been opened (ontology gap 8). Nothing is closed twice |
| Renaming or moving a note, image, Table file or folder in the app, with every link to update (default 13) | 1. A pending-rename file in `.ror/pending/` naming the old and new paths and what is being renamed (decisions 25 and 28). 2. The rename. 3. Each file that names the old path or name, one at a time: notes whose text links to it, blocks naming it (decision 14), a Character's `photo`, records in `.ror/files/`, and Character and Event descriptions (gap 6). 4. The pending-rename file is removed (decision 25) | A pending-rename file, with the rename done or not, and some files updated | The campaign opens with a notice that a rename did not finish, with Finish. Finish first checks what stands at the old and new paths against what the pending file says was renamed (decision 28). If what is at the new path is it and nothing at the old path is, the rename is done; if what is at the old path is it and nothing stands at the new path, Finish does the rename. Either way it then updates every file that still names the old path; a file already updated no longer names it, so nothing is changed twice. In every other case (the new path empty or holding something else, the old path holding something else, both holding it, or either holding something that can't be read) Finish writes nothing and offers two choices: choose where the renamed thing is now, where the app shows whether what was chosen matches and the person confirms it, after which the pending file is rewritten with the chosen path as `to` and Finish goes on with it as the new path for the files not yet updated, or abandon the rename, which removes the pending file, frees the old name and leaves the files not yet updated naming the old path, shown as broken links while nothing stands there (default 13). Files already updated name the new path, and if what stands there was put there outside the app they behave as after any outside rename (default 13). These outside changes are ordinary ones made while the app is closed, not the swapping of files between two operating-system calls that is out of scope (see [Trust boundaries](#trust-boundaries)). Until the rename is finished or abandoned, the old name cannot be taken by a new note, file or rename, so no link can come to point at a different file under the old name (decisions 25 and 28) |
| Deleting a note that holds shared blocks (ontology gap 18, gap 10) | 1. The note to the Trash. 2. For each record the person chose to delete: its Account file rewritten without the entry, or its event file to the Trash. Kept records are not written | Records chosen for deletion still on disk, naming a note that is gone | They are shown as kept, as if the person had chosen to keep them (rule 6): not shown in any note, and removable from their ledger or timeline. Nothing is deleted without the person |
| Picking a Character's photo (decision 16) | 1. The copy in `Images/`, a new file. 2. Its record in `.ror/files/`. 3. The Character's file, naming the copy in `photo` | A copied picture, with or without its record, that no Character names | It is an ordinary image in the folder. Nothing is redone; picking again makes a new copy under a new name, as today |
| Trashing an image or Table file that has a record in `.ror/files/` | 1. The file to the Trash. 2. Its record to the Trash | A record naming a path where nothing is | The record names a missing file and is shown nowhere; blocks and photos naming the path show it as missing (default 14). Nothing is redone |
| Creating a campaign | The Person and list files in `.ror/` first, `.ror/campaign.json` last, because its presence marks the folder as a campaign (decision 4) | A new folder with a `.ror/` but no `campaign.json` | The folder is not a campaign, and opening it says so. Under `01-app-shell.md` gap 14's recommendation (where a new campaign goes), creating again makes a new folder |

A pending-rename file (decision 25) is a JSON object with `format` (`ror-pending-rename`), `version`, `from`, `to`, `what`, `changedBy` and `changedAt`, named with a new ULID and `.json`. `what` says what is being renamed, read before the first write (decision 28): for a note with an id, `{"note": "<its id>"}`, so that an edited note is still recognised; for any other file, including a note with no id, `{"length": <bytes>, "sha256": "<hash of its bytes>"}`, read through the bounded reader; for a folder, `{"files": [...]}`, one item for each file in it with `path`, its path inside the folder, and the same `note` or `length` and `sha256`. A file the app cannot read when the rename begins is listed with `path` and `"unread": true`, and is taken as present wherever something stands at its path. A folder matches when every listed file is at its path inside it; files added to it since do not matter. A note at a path matches only if its id can be read and is the one recorded; a file that has been edited since the rename began no longer matches its hash, and Finish then waits for the person to confirm it through "choose where the renamed thing is now" (decision 28). It is read through the bounded reader with the data-file limit. A malformed one is listed as a problem and never acted on or overwritten. It is the app's own working file, not a record: when the rename is finished it is removed outright, not moved to the Trash.

**Changes made elsewhere.** When the app reads a file it keeps a fingerprint of the bytes read: their length and a hash of their contents (decision 20). Before it replaces the file, it reads the file again through the bounded reader and compares. If the file has changed or gone since it was read, because of another program, a hand edit, a sync or another person, the app does not write. It keeps the draft and reports the conflict, offering the same choices as today's Refresh with a dirty draft: Cancel, Discard and Reload, or Save over (gap 33). Modification times are not used, because they can be wrong, coarse or set by a sync program.

**Deleting.** Deleting a record kept one per file (an Event, an Account; whether a Person can be deleted at all is ontology gap 3, gap 23) moves its file to the system Trash, never deletes it outright, as with notes today. Deleting a record kept inside another file (a Ledger entry, a Reading) rewrites that file. If the Trash is not available, deletion fails and nothing is removed. Whether a Campaign, Character, Round, Turn or Interterm can be deleted in the app is ontology gap 43 (gap 42); either way the layout needs nothing more.

**Folder and file names the app makes.** The app creates `Rounds/Round NNN/`, turn notes, interterm notes and photo copies under the names in decisions 15 and 16, with characters that Windows cannot hold replaced by `-`, and with ` 2`, ` 3` and so on added if the name is taken, including by a name that differs only in case.

## Trust boundaries

Visibility levels are not protection while everyone can read the folder: anyone with the folder can read and change every file. A hostile process that swaps files or links between two operating-system calls is out of scope, as it is today. Every row below assumes those two limits.

| Input the app does not control | Who can be on the other side | Worst outcome | Rule that prevents it | Out of scope |
| --- | --- | --- | --- | --- |
| The campaign folder path chosen in the picker, or restored from the preferences file | The person, by mistake (a home folder, a whole drive, a network share, a removable disk) or a hand-edited preferences file | The app scans or writes into a folder that is not a campaign, such as a home folder | Only `.ror/campaign.json` is checked at first (decision 4). Without it, nothing else is listed or read, and nothing is written; the app says the folder is not a campaign. A new campaign is created only in a new or empty folder (gap 27). The path is resolved once when opened and every later path is relative to it, with a generation check as today | Network file systems' own behaviour |
| The folder's listing: the number and depth of entries, symbolic link loops, names that differ only by case, names reserved on Windows | Other programs, other people, sync tools, another operating system | A listing that never ends, a link loop that hangs, two files that become one on another system | Listing limits and depth (decision 17); links to folders are not entered; case and Unicode duplicates and Windows-reserved names are flagged; the app never creates them | Fixing names made by other programs |
| File and folder names | Other programs and people, and people typing in the app | A name that escapes the folder (`..`, `/`, a drive letter), a reserved name, a name the next system cannot hold | Names are single path parts, checked as in the listing rules; new names are checked before creating; names are text and never used to build a path without these checks | Only the common exclusions above |
| Every app-written data file in `.ror/`: hand-edited, half-written, synced from another machine, or written by another person | People, other programs, sync tools, an older or newer copy of the app | A crash, a hang, a file overwritten with less than it held, a wrong record shown as the right one | The bounded reader and limits; strict format with `format` and `version`; unknown keys and newer versions make the file read-only (decision 21); malformed files are never overwritten; change detection before every write (decision 20) | Detecting a well-formed but false value, such as a changed amount; the history of who changed it beyond `changedBy` |
| Ids and names inside data files used to look records up or to build file names: path-like ids, duplicate ids made by copying or syncing, an id that names something outside the folder | People editing by hand, copies made in other programs, sync | Reading or writing a file outside `.ror/`, one record silently replacing another | An id must match the id form exactly before any lookup or file name is built from it (decision 6), so it can hold no `/`, `\`, `.` or `..`; a one-per-file record's id must equal its file name; a duplicate id makes both records read-only until resolved (gap 32); ids are never paths | Ids that are well formed but invented |
| Markdown read from a note's body, or from a record's field that holds Markdown or text with links (a Character's description, an Event's description, and any other such field), including raw HTML, links, image references and blocks written by someone else | Any person at the table, other programs, sync | Script or markup running in the app, a request to the network, hidden data shown, a record changed by text the person did not write | Raw HTML is never rendered or run; it is shown as text, apart from the exact Action marker line in a note, which is hidden. Images and links follow the rows below. Blocks in a note are read by the rules in [Blocks inside a note](#blocks-inside-a-note); blocks in a record's field are gap 40. The same rules apply wherever such a field is shown, on any tab. A field shown as plain text is never read as Markdown or HTML | Only the common exclusions above; what a website does once opened is in the destinations row |
| A block naming another person's record, for example a money block in one person's note naming an entry in another person's hidden account | Any person at the table | A person sees or changes a record they should not, or a ledger is changed by text in a note | A posted block shows the record as it is in its own file; hidden records show as hidden in the note (ontology gap 17); a block that names a record whose `note` is another note is a copy and changes nothing until posted. Everyone may edit everything for now (rule 37) | Stopping a person from posting to another person's account: real permissions are later |
| Table files | People and spreadsheet programs | A crash or hang on a huge or broken file; a cell taken as a formula | The bounded reader and table limits; cells are text and are never run as formulas; unclosed quotes make the file read-only | Formulas, which are later |
| Images in the folder | Anyone who puts a file there | A crash or hang decoding a hostile or huge picture | Only PNG, JPEG, GIF and WebP, checked by extension and by the file's opening bytes; 20 MiB (decision 17); pixel size limit (gap 30) | Flaws in the system's own image decoders |
| A photo chosen through the file picker from anywhere on the machine, before it is copied in | The person, choosing any file | Reading a device or huge file; copying something that is not a picture; changing the original | The bounded reader with 20 MiB (as today); the same format checks as images; the copy is made under a new name (decision 16); the original is never changed | Only the common exclusions above |
| Dice notation stored in a roll block and read back | Anyone who edits the note | A hang or huge allocation when the notation is read, displayed or rolled again | The same limits as the Dice panel today: 200 characters, 100 dice, 1,000,000 sides. A saved roll is never re-rolled on reading; results and total are shown as stored, with a warning when they disagree (gap 18) | Only the common exclusions above |
| Link and image destinations in a note or in a record's Markdown field (as in the Markdown row above), decoded once: relative paths, `file:`, `data:` and `http(s):` | Anyone who edits the note or the record | Reading a file outside the folder; a request to the network on opening a note; opening a local program | Destinations are URL-decoded exactly once. Images: only relative paths that stay inside the folder after following links, as today, resolved from the note or, in a record's field, from the campaign folder (gap 39); `file:`, `data:`, `http(s):` and absolute paths are refused. Links to notes and files: the same rule. `ror:` links hold only an id (decision 13). `http:` and `https:` links open in the system browser, never in the app, only when the person clicks one (gap 29). `file:`, `data:`, `javascript:` and every other scheme are not opened | What the website does once opened |
| The preferences file | The person or another program, editing it by hand | Restoring a folder that is not a campaign; a crash on a bad value | The bounded reader with 64 KiB; bad values fall back to defaults (gap 28); a restored folder goes through the same campaign check as a picked one | Only the common exclusions above |
| The system clock, where real-world times are stamped (`changedAt`) | The machine's owner, a wrong or changed clock, a machine in another time zone | Wrong "last changed" times; changes that seem to come before earlier ones | Times are written in UTC; they are shown, never used to order changes, detect conflicts or set game dates | Correcting the clock |
| A source of real historical numbers for economy readings | Not decided; becomes an input when chosen (ontology gap 38, gap 21) | Not decided | Not decided | Until a source is chosen |

## Ready for sync

The server and its protocol are not designed here (**Sync**). These layout choices keep two people's edits from colliding when the folder is later synced:

- **Small files per record.** Each Person, Character, Account, Asset, Recurring item, Round, Turn, Event and Economy item has its own file, so two people editing different records never touch the same file (decision 2).
- **Each person's turn in their own file.** Done and skipped marks are in each Turn's file, not in the Round's, so people marking their own turns do not collide.
- **Notes by person and round.** The app creates one turn note per Person per Round, so two players never write in the same note by default.
- **Ids made on each machine.** A new record's id and file name are made where it is created and never clash (decision 6). Nothing needs a central counter: a Round's number is worked out, not stored.
- **One copy of each fact.** Shared blocks hold only ids (decision 11), and derived values are not stored, so there is nothing that can disagree after a merge except the record itself.
- **Line-per-field files.** Data files are pretty-printed with a fixed key order (decision 22), so a text comparison of two versions shows the changed field.
- **Who and when on every record.** `author`, `changedBy` and `changedAt` give a later merge something to show (ontology gap 42).
- **Nothing machine-specific in the folder.** Paths are relative to the campaign folder; preferences and the last opened folder live on each machine.
- **Visibility per file.** Notes, Accounts and Events each have their own file with their level, so a server can later hold back a whole file from those who may not see it. Snapshot parts in round files are the exception (gap 12).

Files that several people may still change at the same time: `campaign.json` (turn order), `stats.json`, `divergences.json`, a Round's file (Interterm, Proposals, snapshots), a Character's file (stats and identity), and an Account's file when two people post to one account.

What the layout does not attempt: the server; any sync protocol; merging two edited copies of one file; resolving conflicts beyond detecting them and asking (decision 20); real access control or encryption; a full history or undo of changes.

## Carried over from the current app

From `docs/workspace-api.md` and the Workspace section of `README.md`, these rules still apply:

- **Root-relative paths.** Every path the app passes between its parts is relative to the opened folder with `/` separators; the absolute path is used only for display and preferences.
- **Generation checks.** Every file command names the generation of the opened folder and fails if it is stale.
- **Symbolic links.** Links to folders are listed but not entered, and changes through them are refused. New readers refuse symbolic links and non-regular files.
- **Image rules.** PNG, JPG, JPEG, GIF and WebP, case-insensitive; destinations decoded exactly once; resolved relative to the note; must stay inside the folder; absolute paths, `file:`, `data:` and remote URLs refused; decoding failures shown.
- **Trash-only deletion.** Deleting moves to the system Trash after confirmation, with no permanent-delete fallback. The opened folder cannot be renamed or trashed.
- **Reserved names.** Today the profile files at the top of the folder are protected, including names that differ only by case, from ordinary create, rename and Trash. That protection now covers `.ror/` and everything in it.
- **Size bounds.** Metadata 1 MiB, descriptions 5 MiB and picked photos 20 MiB today. Descriptions and photos keep their numbers (as notes and photos); metadata is replaced by the 4 MiB data-file limit (decision 17).
- **Malformed files are not overwritten,** and a new file is created only if nothing with its name exists.
- **Photo copies.** A picked photo is copied in under a new unique name; the original and earlier copies are kept.
- **No file watcher.** Changes made elsewhere appear after Refresh.
- **Saving.** Autosave after 500 ms; a failed save keeps the draft with Retry and blocks navigation and closing; Refresh with a dirty draft offers Cancel, Discard and Reload, or Save and Refresh.
- **Notes** may end `.md` or `.markdown`.
- **Preferences** stay in the operating system's configuration folder, outside the campaign.

Replaced:

- **Direct note writes** that are not crash-atomic are replaced by one-step replacement for every write (decision 18).
- **Unbounded note and image reads**, and reading notes and images through symbolic links whose target is inside the folder, are replaced by the bounded reader, which refuses links.
- **Writing over external changes without warning** on autosave is replaced by change detection before every write (decision 20). Save over stays as a deliberate choice.
- **Renames leave links unchanged** is replaced by renames in the app updating links (default 13), in the order given in [Writing rules](#writing-rules) (decision 25).
- **`player-photo-<id>.<extension>` names** at the top of the folder are replaced by decision 16.
- **`player.json`, `player.md` and `player-notes/`** are not migrated and are not read (**Existing data**). A folder holding them is not a campaign unless it also has `.ror/campaign.json`.

## Decisions for the user

Each is a proposal. The body is written to the recommended option.

1. **Data file format.** Recommended: JSON, because both the native side and the interface already read it, it has one strict form, and it can be edited by hand. Alternatives: TOML, better if people will often edit data files by hand, since it allows comments and reads more easily; YAML, better if the same format should be used for note front matter and data files, at the cost of a much looser format with more ways to be misread.
2. **One file per record or per collection.** Recommended: one file per top-level record (Person, Character, Account, Asset, Recurring item, Round, Turn, Event, Economy item), with its histories and lists inside it, and the two ordered campaign lists (stats, divergences) each in one file. Alternatives: one file per collection (`events.json`, `accounts.json`), better if the campaign stays on one machine for good, since there are far fewer files; one file per every record including each Ledger entry and Reading, better if many people will post to the same account at once, at the cost of thousands of tiny files.
3. **Where the app's data lives.** Recommended: a `.ror/` folder inside the campaign folder, hidden by default in most file managers and in the Notes tab. Alternatives: a visible `Campaign data/` folder, better if people should find and edit data files easily; data files at the top of the campaign folder, better for a very small campaign but cluttered.
4. **What marks a folder as a campaign.** Recommended: the file `.ror/campaign.json`, with `"format": "ror-campaign"`. Alternatives: any `.ror/` folder, simpler but easy to make by accident; a file with a distinctive extension at the top (`Harbour 1962.rorcampaign`), better if people should be able to double-click it to open the campaign.
5. **Names of data files.** Recommended: the record's id and `.json`. Alternatives: a readable name plus the id (`ada-hart.chr_….json`), better for finding files by eye, at the cost of renaming the file whenever the record is renamed, which collides more often in sync.
6. **Id form.** Recommended: a three-letter kind prefix, `_`, and a ULID (26 upper-case Crockford base-32 characters, sortable by creation time). Alternatives: a UUID version 7 (36 characters with hyphens), better if a standard form matters more than length; a short random id (10 characters), better for readability, with a small but real chance of two machines making the same id.
7. **Where a note's id, owner, visibility level and game date are kept.** Recommended: front matter at the top of the note, with only the app's own one-line keys read and every other line kept. Alternatives: an HTML comment at the end of the note, better if front matter is shown badly by a program the table uses, but less standard; a separate file per note in `.ror/`, keeping the note completely plain, at the cost of losing the note's id whenever it is moved or copied outside the app.
8. **How a game date is written.** Recommended: ISO 8601 text: a day `1962-02-10`, a month `1962-02`, a year `1962`, a range as two of those joined by `/` (`1962-02-10/1962-05`), each end with its own precision (ontology gap 28), years from 0001 to 9999. Alternatives: an object with `from` and `to` and a separate precision field, better if later dates need more parts (such as "circa"); a written form ("10 February 1962"), easier to read but harder to check and language-bound.
9. **How an amount and its currency are written.** Recommended: decimal text followed by a space and the ISO 4217 currency code: `"-1200.00 USD"`. Adding a currency later adds codes, not fields. Alternatives: an object `{"value": "-1200.00", "currency": "USD"}`, better if amounts will gain more parts, such as an exchange rate; whole minor units (`-120000` cents), better for arithmetic, but currencies differ in how many minor units they have.
10. **How a block is written in a note.** Recommended: a fenced code block with a `ror-<kind>` info string holding one JSON object. Alternatives: a fenced block holding `key: value` lines, easier to read and edit by hand, at the cost of a second format; an HTML comment holding the block, invisible in other programs, so a reader elsewhere would not know a roll was there.
11. **Where a shared block's data lives.** Recommended: in the record's own file (the Account file for a Ledger entry, the event file for an Event), with a posted block holding only the record's id, and an unposted block holding its draft. Alternatives: the data in the block, with the Account or timeline holding only a pointer, better for reading notes in other programs, but it spreads a hidden account's entries across notes of other levels and makes a balance depend on reading every note; both, with the block's copy marked as a summary, which breaks "one copy of each fact".
12. **How an Action keeps its Id** (ontology gap 12). Recommended: an HTML comment marker on the line under the heading holding its id and author. Alternatives: an attribute at the end of the heading (`## Bribe the harbour master {#act_…}`), shorter, but other programs show it as part of the heading; no stored id, matching by heading text, which loses the Action whenever the heading is renamed outside the app.
13. **How text links to Characters and Events are written.** Recommended: a standard Markdown link with a `ror:` destination holding the id: `[Ada Hart](ror:chr_01J9Z67W4WHSXXN8X668K2JZXV)`. Wiki links name notes only. Alternatives: a wiki link with a marker (`[[@Ada Hart]]`), better for typing by hand, but it breaks if the Character is renamed outside the app; a wiki link that matches notes, Characters and Events by name, which is ambiguous when a note and a Character share a name.
14. **How data and blocks refer to files.** Recommended: a path from the campaign folder with `/` separators (`Tables/Grain shipments.csv`), updated when the file is renamed in the app. Alternatives: a path relative to the note, better for matching image syntax, but harder to update; the file's id from `.ror/files/`, which survives renames outside the app but is unreadable in other programs.
15. **Folder and file names for turn notes and interterm notes.** Recommended: `Rounds/Round 001/Turn - <Character name>.md` and `Rounds/Round 001/Interterm.md`, with three-digit round numbers. Alternatives: folders named by date (`Rounds/1962-02 Round 1/`), better for finding a round by game date; one folder per Character (`Characters/Ada Hart/Round 001.md`), better for reading one Character's story in order.
16. **Where a picked photo is copied and its name.** Recommended: `Images/<Character name>.<extension>`, with a number added if taken. Alternative: today's `player-photo-<id>.<extension>`, which never needs a number but tells a reader nothing.
17. **Size limits.** Recommended: the numbers in [Limits](#limits). Alternatives: larger data-file limits (16 MiB), better for very long campaigns with large accounts; no total read limit, simpler but with no bound on opening a huge folder.
18. **Replacing files in one step.** Recommended: every write, notes included, writes a temporary file and renames it over the old one. Alternative: today's direct overwrite for notes, which keeps the file's identity (some sync tools and hard links prefer that) but can leave half a note after a crash.
19. **Order of writes when one edit changes two files.** Recommended: the record outlives the block: a record's file is written before the note when creating, and after the note when removing. Alternative: always the note first, simpler to explain, but a failed second write can leave a block that names a record which does not exist.
20. **How a change made elsewhere is detected.** Recommended: compare the length and a hash of the bytes with what was read, before every write. Alternatives: compare modification times, cheaper but unreliable across sync tools and coarse clocks; no detection, as today, which can silently overwrite another person's edit.
21. **Unknown keys in a data file.** Recommended: the file is read-only until fixed, naming the key. Alternative: unknown keys are kept and written back unchanged, better for mixing slightly different versions of the app, at the cost of carrying data the app does not understand.
22. **Text layout of data files.** Recommended: two-space indents, one field per line, fixed key order, LF line endings, UTF-8 without a byte-order mark, final newline. Alternative: compact one-line JSON, smaller but impossible to compare by line.
23. **Telling an interrupted post from a copy.** Recommended: an unposted draft whose `id` belongs to a record that names this note in `note`, with no earlier block in the note naming that id, is a post interrupted between its two writes: it is shown as posted, nothing offers to post it again, and the next save of the note rewrites it to the posted form. A draft whose `id` belongs to a record naming another note, or no note, is a copy, shown as "a copy, not posted"; posting it takes a new id, and the new id is written into the note as an unposted draft before the record is written, so every post, after a stop at any write, is either an unposted draft with no record or an interrupted post as above. A draft whose record's file cannot be read is not offered for posting. Alternatives: the record also names the block's place in the note, stricter when a note holds a copy of its own block, but broken whenever blocks are moved; a pending-change file written before each post and removed after, which says exactly what was interrupted, at the cost of an extra write per post; every such draft treated as a copy, simplest, but a person who posts it again after a crash makes a second entry or event.
24. **Order and recovery of edits that write several files.** Recommended: for each edit, the first write records the change and each later write only brings other files into line with it; records name what they came from, so reading can tell a finished change from an unfinished one; reading never writes, and an unfinished change is completed by the next save of the file concerned or when a person chooses Finish. The order for each edit is in [Writing rules](#writing-rules). Alternatives: a pending-change file for every such edit, as decision 25 proposes for renames, which records exactly what was meant, at the cost of an extra write before every such edit and a check on every open; no recovery after the app stops, only Retry while it runs, simplest, but a crash can leave a Proposal decided twice or a Round half opened.
25. **Recording an unfinished rename.** Recommended: before a rename or move in the app, a small file in `.ror/pending/` names the old and new paths (and what is renamed, decision 28); it is removed once every link is updated; while it exists the old name is held, and reopening the campaign offers to finish. Alternative: no record; a rename that stops halfway leaves some links naming the old path, shown as broken (default 13), to be fixed by hand, and a new note taking the old name would silently receive them.
26. **CSV dialect.** Recommended: RFC 4180 with commas and double quotes, UTF-8, a required first row of column names, rows shorter than the header read as padded with blank cells, the file's own line endings kept when it is saved and LF for new files. Alternatives: a header row optional, chosen per file and kept in its `.ror/files/` record, better for files exported without one, at the cost of one more setting; rows of the wrong length make the file read-only, stricter, but refuses files that spreadsheet programs write; always writing CRLF line endings as RFC 4180 describes, matching the standard, but rewriting every line of an LF file on its first save.
27. **Recording how a Round opens.** Recommended: the Round file's first write holds `opening`, the whole plan of the opening (each Turn's id, Person, Character and note id and path, and the interterm note's path), and the last write of the opening removes it; Finish works only from the plan, makes only planned items that are absent, never writes over anything at a planned path, and is offered only while `opening` is there, so that a note missing after opening has finished is a missing target (default 14) and never made again. Alternatives: the plan in a pending-change file in `.ror/pending/`, as decision 25 does for renames, which keeps the Round file free of working state at the cost of a second kind of pending file and one more write; a mark of finished or not with no plan, smaller, but Finish would then have to use each Person's Character at the time of Finish, which may not be the one active when the Round opened; no record, as before, simplest, but an interrupted opening cannot be told from a note deleted later, so Finish can make a deleted note again or give a Turn the wrong Character.
28. **What an unfinished rename records about the thing renamed.** Recommended: the pending-rename file holds `what`: a note's id, or for any other file (and a note with no id) its length and SHA-256 hash, and for a folder the same for each file in it; Finish goes ahead only when exactly the old or the new path holds what was recorded, and otherwise writes nothing and asks the person to choose where it is now or to abandon the rename. Alternatives: no record of the thing, with Finish always asking the person to confirm what stands at the new path before it updates any file, simpler on disk but a question after every interrupted rename; the operating system's own file identity (inode or file id), which survives edits but not a copy made by a sync tool or a move to another disk, and differs between systems.

## Gaps

Questions this file does not settle. Each has one recommendation. Ontology gaps are quoted with their recommendation unchanged.

1. **Text links have no stored Id or Author.** The ontology gives every Link an Id and an Author ("who wrote the link"). A wiki link or Markdown link is only text in a note, so nothing records its Id or who wrote it. Recommendation: a text Link's Id is derived (its note's id and its place in the note) and is not stored; its Author is not kept; the ontology marks both as derived for text links.
2. **Field links survive outside renames; text links do not.** Default 13 says renames made outside the app show as broken links. Field links (an Event's `links`, an Asset's `linkedNote`) hold note ids, so they keep working after an outside rename while text links break. Recommendation: accept the difference.
3. **Notes, images and table files with no id.** A note written in another program has no front matter; an image or CSV file placed by hand has no record in `.ror/files/`. Recommendation: they open normally, with no Author or Owner and the level everyone; the app gives them an id the next time it saves the note or the person changes something about the file in the app; reading never writes.
4. **The record of changes.** Ontology gap 42: "**The record of changes.** **Who may change what** says every change records who made it, but not what is kept. Recommendation: each record keeps who last changed it and when (real-world time) now; a full list of changes that people can look through is later." The layout rests on this. Recommendation: as the ontology.
5. **An Action marker lost or duplicated outside the app.** Recommendation: a heading whose marker was removed is a new Action; records that pointed at the old id show as belonging to the Turn as a whole, with a notice, and are rewritten only when a person accepts. When two markers carry the same id, the first in the note keeps it and later ones get new ids the next time the app saves the note.
6. **A Character's description.** Ontology gap 5: "**The free description.** Whether a Character's free description is a field or a Note. Recommendation: a field on the Character, edited with the note editor and able to hold links, always visible." The layout stores it as Markdown text in the Character's file. Recommendation: as the ontology; renames in the app also update links inside descriptions and event descriptions.
7. **Author and Owner of app-created notes.** Ontology gap 10: "**Author of records the app creates.** Turns, notes, the Interterm, Proposals and snapshots are created by the app. Recommendation: the Author is the Person in "viewing as" who opened or advanced the Round." Ontology gap 11: "**Owner and date of app-created notes.** Recommendation: a turn note is owned by its Turn's Person; an interterm note is owned by the game master; an interterm note is dated to its Round, like a turn note." The examples are written to both. Recommendation: as the ontology.
8. **What a record attaches to.** Ontology gap 13: "**Headings in an interterm note.** Recommendation: they are not Actions; every block in an interterm note belongs to the Interterm, matching **Stats**, which attaches changes to "an action or an interterm"." Ontology gap 14: "**Records with no heading.** Whether a Roll, a Ledger entry and a Stat change attach to an Action or to the Turn or Interterm when there is no heading. Recommendation: they attach to the Turn or Interterm as a whole, the same as blocks above the first heading; Ledger entries and Stat changes may point at a Turn or Interterm as well as an Action." The layout allows one of `action`, `turn` or `interterm`. Recommendation: as the ontology.
9. **A block and its record at different levels.** Ontology gap 17: "**A block's note and its record at different levels.** For example a money block in an everyone note posting to a game-master-only account. Recommendation: the record keeps its own level; viewers who cannot see the record see the block as hidden in the note." Decision 11 keeps the hidden record's data out of the note. Recommendation: as the ontology.
10. **Deleting a note that holds shared blocks.** Ontology gap 18: "**Deleting a note that holds shared blocks.** Recommendation: ask once, listing the Ledger entries and Events, whether to keep or delete them all." On disk, a kept record's `note` then names a note that no longer exists. Recommendation: as the ontology, with kept records shown as not shown in any note; the deleted records' files go to the Trash after the note.
11. **Visibility of Recurring items and Proposals.** Ontology gap 20: "**Visibility of Recurring items and Proposals.** Recommendation: both follow their Account, like Ledger entries." No level is stored on either. Recommendation: as the ontology.
12. **Snapshots and hidden accounts.** Ontology gap 22: "**Net-worth snapshots and hidden accounts.** Recommendation: a snapshot stores each Account's balance and each Asset's value as parts, so each viewer's total leaves out what they cannot see (default 4)." The round file then holds hidden balances in a file with no level. Recommendation: as the ontology; when the server comes, snapshot parts move or are filtered per Account.
13. **Price items and readings as amounts.** Ontology gap 25: "**How an Economy item is marked as a price.** Recommendation: a yes/no "price" field set when the item is created, with the unit read as an amount per unit." The ontology defines a Reading's value as "number, in the item's unit"; this file writes a price item's readings as amounts with a currency, so they can be converted when currencies arrive. Recommendation: price readings are amounts; other readings are plain numbers.
14. **Stats removed mid-campaign.** Ontology gap 6: "**Stats added or removed mid-campaign.** Recommendation: when a Stat is added, every Character's value starts as "not set" until entered; a removed Stat is hidden, not deleted, so saved Rolls and change histories keep its name." The layout adds `"removed": true` to the Stat; a value "not set" is a Stat value with no changes. Recommendation: as the ontology.
15. **Places.** Ontology gap 27: "**Does a place become a record of its own.** Carried over from `05-map.md`, gap 1. Recommendation (from there): a named place with an optional point, so that "Chicago" is entered once and reused; until then, text." Recommendation: as the ontology; a later place record changes the field from text to an id and needs a new format version.
16. **Range ends.** Ontology gap 28: "**Precision of range ends.** Recommendation: each end of a range is a day, month or year on its own." Decision 8 is written to it. Recommendation: as the ontology.
17. **Dates on stat, identity and asset value changes.** Ontology gap 7: "**Dates on stat, identity and asset value changes.** Default 7 covers only Ledger entries and Readings. Recommendation: the same rule, a day defaulting to the first day of the current Round." The examples store a day. Recommendation: as the ontology.
18. **Saved rolls edited by hand.** Ontology gap 16: "**Editing a saved Roll.** Recommendation: the die result, dice, stat and modifiers are fixed once saved; the target number and verdict can be edited." The app can enforce this only in its own editing; anyone can change a roll block's text in another program. Recommendation: as the ontology, with a warning when a roll's total does not match its parts; no attempt to detect other hand changes.
19. **Stat range.** Ontology gap 30: "**Stat range.** Carried over. Recommendation: whole numbers with no fixed range until the range is given." Stat values are written as JSON whole numbers. Recommendation: as the ontology, with values limited to what a 64-bit float holds exactly.
20. **Not-valued assets and derived fields in snapshots.** The ontology marks a snapshot's "Not valued" as derived; because a snapshot must not change afterwards, it is stored (as an asset part with no value). Recommendation: store it, and the ontology notes that snapshot parts are stored when taken.
21. **Real historical numbers.** Ontology gap 38: "**Where real historical numbers come from.** Carried over. Recommendation: hand entry only until a source is chosen." Recommendation: as the ontology; any source chosen later becomes a trust boundary with its own row.
22. **Formulas in tables.** Ontology gap 41: "**What goes in a spreadsheet.** Carried over. Recommendation: Table files stay plain grids until examples are given." CSV cannot hold formulas without making them look like data. Recommendation: as the ontology; formulas, when they come, need a format decision of their own.
23. **Roles and people leaving.** Ontology gap 1: "**How the role is recorded.** Recommendation: a role field on Person with the values player and game master; exactly one Person holds game master at a time; the game master may also play a Character." Ontology gap 3: "**A Person leaving.** Recommendation: a Person is never deleted, because records name them as Author and Owner; they are marked as having left and drop out of the turn order." The layout stores `role` on the Person; leaving would add a field. Recommendation: as the ontology.
24. **Records not yet described.** Ontology gap 39 ("generated role notes": "Recommendation: ask what was meant before adding any record for it.") and gap 40 (recording real-world play sessions: "Recommendation: no session record until asked for."), carried from "Still to settle". Recommendation: no place on disk until they are described.
25. **Hidden notes' names on disk.** A game-master-only note's file name and folder show in any file manager, and its front matter can be read by anyone. Whether the app's own Notes tree hides such files from other viewers belongs to `04-notes.md` (default 4). Recommendation: the Notes tree hides them; people who need a secret title choose a plain file name.
26. **The `.ror/` folder in the Notes tab.** Recommendation: never listed in the Notes tab, even with hidden files shown, because its files are edited through the app's pages.
27. **Creating a campaign in a folder that is not empty.** **Existing data** says a new campaign folder is created. Recommendation: a campaign is created only in a new or empty folder; copying old material in by hand comes after.
28. **A malformed preferences file.** The rule that a malformed file is never overwritten would leave the person unable to save preferences. Recommendation: use defaults, report once, and replace the file the first time the person changes a preference, keeping the old one beside it as `preferences.json.bad`.
29. **Opening external links.** Recommendation: an `http:` or `https:` link opens in the system browser after a short confirmation showing the full address, because a note may have been written by someone else; no other scheme is ever opened.
30. **Image pixel size.** A 20 MiB file can describe a picture far too large to decode. Recommendation: refuse images over 100 million pixels, read from the file's header before it is shown.
31. **Temporary files left by a crash.** Recommendation: ignore `.ror-tmp` files when listing, and offer to move them to the Trash from the campaign's settings; never delete them on their own.
32. **Resolving duplicate ids.** Copying or syncing can give two notes or two data files the same id. Recommendation: both are shown read-only with a warning until a person picks which is the copy; the copy then gets a new id, and its shared blocks become unposted copies.
33. **A conflict found during autosave.** Today autosave writes over changes made elsewhere. With change detection (decision 20), an autosave can find a conflict with no person at hand. How it is shown belongs to `01-app-shell.md`. Recommendation: autosave stops for that file, the draft is kept, and the same Cancel, Discard and Reload, or Save over choices appear.
34. **Names that differ only by case or Unicode form.** Recommendation: compare names case-insensitively after Unicode normalisation (NFC) when creating, renaming and resolving links, and flag existing pairs; never pick one silently.
35. **Charts drawn from a Markdown table.** Settled: a chart can draw from a Markdown table. Which table is not. Recommendation: the nearest Markdown table above the chart block in the same note; tables in other notes are later.
36. **Long campaigns outgrowing a data file.** An account with many years of monthly entries, or a busy economy item, could near 4 MiB (around 8,000 entries). Recommendation: keep one file per record for now; if a file nears its limit, split its history by year in a later format version.
37. **An unknown visibility value.** A hand-edited note, account or event may carry a level the app does not know, such as `secret`. Recommendation: treat it as game master only, show a warning, and leave the file unchanged until a person picks a level.
38. **When the campaign starts.** Ontology gap 36: "**When the campaign starts.** Carried over. Recommendation: a required start date entered when the campaign is created." `campaign.json` holds it as `start`. Recommendation: as the ontology.
39. **Relative paths in a record's Markdown field.** A Character's or Event's description has no folder of its own, so a relative link or image path in it has nothing to be resolved from. Recommendation: resolve it from the campaign folder, under the same rules as a note's destinations.
40. **Blocks in a record's Markdown field.** Whether a description may hold roll, money, event, chart or table file blocks is not decided. Recommendation: no; a fenced `ror-` block in a field is shown as ordinary code and counts towards nothing.
41. **A description on a Recurring item.** Ontology gap 44: "**A description on a Recurring item.** Default 8 names an account, an amount, a cadence and dates, but every Ledger entry needs a description. Recommendation: a Recurring item has a required description, copied to each Proposal and the Ledger entry it makes, where it can be edited." The example writes `description` on the Recurring item and copies it to each Proposal. Recommendation: as the ontology.
42. **Deleting records, and a new Character's status.** Ontology gap 43: "**Deleting records, and a new Character's status.** The README does not say whether a Campaign, Character, Round, Turn or Interterm can be deleted in the app, or which status a new Character may start with. Recommendation: none of them can be deleted in the app, so history stays whole (a Turn nobody writes is skipped; a campaign ends when its folder is removed outside the app); a new Character may start with any status, so that a past Character can be entered." The layout holds either answer: `status` takes any of its values when a Character is created, and a deleted one-per-file record would go to the Trash like any other. Recommendation: as the ontology.
43. **Changing a Recurring item while its Proposals are undecided.** Ontology gap 45: "**Changing a Recurring item while its Proposals are undecided.** Recommendation: undecided Proposals are remade from the changed item; decided ones are left alone." On disk this writes the Recurring item's file and the Round's file, in the order in [Writing rules](#writing-rules). Recommendation: as the ontology.
44. **Deleting a turn note before its Round has finished opening.** The README lets notes be deleted (default 14 says what links do then) but does not say what happens while a Round's opening is unfinished. Before the opening's last write, a planned note that is absent cannot be told from one never written, so Finish makes it again (decision 27). Recommendation: while the Round file holds `opening`, the app does not offer to delete a note the plan names; it can be deleted once Finish is done. A note deleted outside the app in that time is made again, empty, by Finish.
