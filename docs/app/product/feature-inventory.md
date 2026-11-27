# Current app features

The sidebar has six destinations. Each opens a screen or a panel in the current source code. The group wants to retain all of these capabilities. Their form can change.

| Destination | What it does |
| --- | --- |
| Session | Set the turn order and time player turns. Use Overview to run play, Rounds to review turns and notes, and Sessions to record sessions and recaps. |
| World | Open People of interest to manage character sheets with dates, places, stats, descriptions, and job histories. Open World Settings to change stat names. |
| Notes | Choose a folder, organize Markdown files, edit notes, and follow links between notes. Open your character sheet from the sidebar. |
| Chat | Choose a model, start a conversation, or reopen a previous conversation. The agent can work with notes and people, roll dice, read rounds, write recaps, and research the web. |
| Dice | Roll dice with an expression such as `2d6 + 3`. Review recent results or clear the history. |
| Settings | Open API Keys to manage OpenCode Go and Tavily keys. Check whether Codex is signed in on this computer. Tavily supplies web search for Chat. |

The Session screen labels the game master's turn `GM · Interterm`. The [turn guide](../../gameplay/sessions/turn-order.md) describes this part of play.

Sources include the [sidebar](../../../client/src/AppShell.tsx), [page components](../../../client/src/pages), [provider settings](../../../client/src/components/menus/SettingsMenu/ProvidersSettings.tsx), and [chat tools](../../../client/src/lib/chat/features.ts).
