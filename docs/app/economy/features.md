# Economy features

This catalogue lists each economy feature of the app. No economy feature exists today. A search of `client/` found no code for money, ledgers, currency, or inventory. Each entry uses the same fields. [The app index](../README.md#catalogue-entries) defines the fields and the kinds.

Shared economy data waits for the sync foundation (P-07). The group decided this so that the app does not store ledgers two times.

## E-01 Ledgers

- **Kind:** planned. Build order 5.
- **Need:** [Where play loses time](../product/needs.md#where-play-loses-time), [Candidate areas](../product/needs.md#candidate-areas)
- **Gameplay link:** [Ledgers](../../gameplay/economy/ledgers.md)
- **Behavior:** Each player character has a ledger with accounts for personal funds and for each company. An entry has an amount and a description. The ledger also lists income, debts, and inventory lines. An inventory line has a quantity and one optional location as text. The app calculates each balance. The player calculates each income amount. Quantities at several locations are E-04.
- **Data:** Shared.
- **Dependencies:** P-07, W-03, P-08
- **Status:** not started. See the search at the top of this file.
- **Open questions:**
  - Who can read and edit a ledger: the group, like notes, or only the player and the game master?
  - Which other fields does an inventory line need?
- **Not handled:** none

## E-02 Record a trade

- **Kind:** idea
- **Need:** [Bookkeeping and calculations](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Trade](../../gameplay/economy/trade.md)
- **Behavior:** A player records a trade in their ledger. The app changes the balance and the inventory in one step. Each player records only their own half of the trade. Payment can be immediate, on credit, in instalments, or on delivery. For an agreement that continues, the app tracks the delivery progress: how much is delivered and by when.
- **Data:** Shared.
- **Dependencies:** E-01
- **Status:** not started. See the search at the top of this file.
- **Open questions:**
  - Must the app offer the other player a matching entry, or does each player always record their own half?
  - Does a trade on credit or in instalments make a debt (E-01) or a payment schedule (E-03)?
- **Not handled:** none

## E-03 Payment schedules

- **Kind:** idea
- **Need:** [Bookkeeping and calculations](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [The next round](../../gameplay/sessions/turn-order.md#the-next-round)
- **Behavior:** Each income and each debt payment has a schedule, for example monthly or yearly. When the group starts the next round, the app settles each payment that falls due in the period of the round. In a quarter round, a monthly payment settles 3 times. The same step applies the amount of each project for the round and the expenses from the interterm.
- **Data:** Shared.
- **Dependencies:** E-01, S-07
- **Status:** not started. See the search at the top of this file.
- **Open questions:**
  - Does the app settle payments by itself, or show the payments that fall due for the player to approve?
  - No entry stores a project cost or an interterm expense. Is each one a payment line with a schedule?
- **Not handled:** none

## E-04 Item locations

- **Kind:** idea
- **Need:** [Bookkeeping and calculations](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Assets in several places](../../gameplay/economy/ledgers.md#assets-in-several-places)
- **Behavior:** The app records the quantity of an asset at each location. A loss at one location does not change the other locations.
- **Data:** Shared.
- **Dependencies:** E-01
- **Status:** not started. The group prefers small changes, so this is a later feature.
- **Open questions:** none
- **Not handled:** none

## E-05 Currencies

- **Kind:** idea
- **Need:** none
- **Gameplay link:** [Ledgers](../../gameplay/economy/ledgers.md)
- **Behavior:** Each country has its own currency, with exchange rates. Today all money is in dollars.
- **Data:** Shared.
- **Dependencies:** E-01
- **Status:** not started. See the search at the top of this file.
- **Open questions:** none
- **Not handled:** none

## E-06 Economy system

- **Kind:** planned. Build order 7.
- **Need:** [Candidate areas](../product/needs.md#candidate-areas)
- **Gameplay link:** [Campaign prices](../../gameplay/knowledge/research.md#campaign-prices)
- **Behavior:** The app keeps reference data and an economy that changes as play advances. The group wants this with little bookkeeping for players.
- **Data:** Shared.
- **Dependencies:** E-01, K-12
- **Status:** not started. See the search at the top of this file.
- **Open questions:** How the system works is an open question.
- **Not handled:** none

## E-07 Ledgers for game master characters

- **Kind:** idea
- **Need:** [Bookkeeping and calculations](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Trades with game master characters](../../gameplay/economy/trade.md#trades-with-game-master-characters)
- **Behavior:** The game master can make a ledger for a game master character. A trade with that character can then change both ledgers.
- **Data:** Shared.
- **Dependencies:** E-01, E-02, P-08
- **Status:** not started. See the search at the top of this file.
- **Open questions:** Can players read the ledger of a game master character?
- **Not handled:** none

## E-08 Income and cost calculations

- **Kind:** idea
- **Need:** [Bookkeeping and calculations](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Ledgers](../../gameplay/economy/ledgers.md)
- **Behavior:** The app helps a player calculate an income or a cost. Today, finding a price, doing the calculation, tracking amounts over rounds, and agreeing the result with the game master all take time.
- **Data:** Shared.
- **Dependencies:** E-01, K-12
- **Status:** not started. See the search at the top of this file.
- **Open questions:** How does the app help? Candidates: the player enters quantities and rates, the app uses campaign prices, and the app shows each step for the game master to check. The chat agent or a form in the ledger can do the calculation.
- **Not handled:** none

## E-09 Company assets

- **Kind:** idea
- **Need:** [Bookkeeping and calculations](../product/needs.md#where-play-loses-time)
- **Gameplay link:** [Assets in several places](../../gameplay/economy/ledgers.md#assets-in-several-places)
- **Behavior:** For each company, the app records what an owner of a large company tracks apart from money: its assets and their locations. The example from the group is the owner of Gazprom.
- **Data:** Shared.
- **Dependencies:** E-01, E-04, W-14
- **Status:** not started. See the search at the top of this file.
- **Open questions:** Which assets? Candidates: production sites such as oil and gas fields, plants, pipelines, transport, subsidiaries, shares that other owners hold, staff, and output for each round.
- **Not handled:** none
