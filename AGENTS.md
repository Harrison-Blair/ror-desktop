# Repository layout

- `client/` contains the Tauri desktop app, including Rust, React, TypeScript and Vite files.
- Run desktop development and build commands from `client/`.
- `server/` will contain the server code, configuration and related resources.

# Chat agent tools

The chat panel agent uses app features only through the tool registry (`client/src/lib/chat/registry.ts`).

- When you add or change a feature, check whether the chat agent can use it.
- If a tool is useful, propose it to the user before you add it. Give the tool name, the inputs, the `read` or `write` flag, and the reason.
- Register each approved tool next to its feature, and add it to the feature's `tools` in `client/src/lib/chat/features.ts`. Add one line about the feature to the agent's system prompt: the feature's `summary` in the same file.
- Flag a tool `write` if it changes user data. Flag all other tools `read`.
- Add tests for each new tool. Test the permission gate (`client/src/lib/chat/gate.ts`) for `write` tools.
