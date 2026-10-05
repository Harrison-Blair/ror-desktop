# Ror Desktop

A folder-based Markdown and image workspace built with Tauri 2, Rust, and a React + TypeScript + Vite frontend. The same project can be developed and built on Windows and Linux.

The Reform & Revolution image used in the app and its desktop icon comes from the [organization's GitHub avatar](https://avatars.githubusercontent.com/u/238364263). Its local source file is `public/reform-or-revolution.png`.

## Prerequisites

Install Node.js 24 LTS (24.15 or newer) and Rust on either platform.

### Linux

On Debian or Ubuntu, install Tauri's system dependencies:

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Other Linux distributions need their equivalent WebKitGTK 4.1, GTK, and build packages. See the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux) for distro-specific commands.

### Windows

Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload, and ensure the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) is installed. Install Rust with the MSVC toolchain.

## Run in development

```sh
npm install
npm run tauri dev
```

## Build installers

The starter icon set is checked in under `src-tauri/icons`. If you replace the organization image, regenerate the platform icons before building:

```sh
npm run tauri -- icon public/reform-or-revolution.png --output src-tauri/icons
npm run tauri build
```

The generated installers are under `src-tauri/target/release/bundle`. Build on Windows for Windows packages and on Linux for Linux packages; each platform uses its native compiler and webview.

## Workspace

Open a folder using the native picker. The folder reopens on the next launch; no file is selected automatically. The tree lists all files, with dot entries hidden until the eye toggle is enabled. The sidebar can be resized (180–480px), collapsed, and navigated with arrow keys. Enter opens a file, F2 renames, Delete asks to move it to Trash, and Shift+F10 opens its menu.

Markdown notes use a source editor with optional line numbers and local PNG/JPEG/GIF/WebP previews beneath inline image syntax. Image files open in a fitted viewer. Toolbar creation targets the workspace root; folder menu creation targets that folder. Names are editable inline with Enter/blur to commit and Escape to cancel. Rename warnings explain that links are not rewritten.

Edits autosave after 500ms. Switching files/folders, renaming or trashing the open note or an ancestor, and closing the native window wait for the latest draft. A failed save retains the draft with Retry. Refreshing a dirty note offers Cancel, Discard and Reload, or Save and Refresh. The sidebar and line-number preferences persist through native preference patches.

There is no filesystem watcher: use Refresh after changes in another program. Refresh reloads the tree, selected file and image previews, including images replaced at the same path. Save and Refresh writes your draft over external note changes; Discard and Reload drops your draft after any active save finishes. A failed save blocks navigation and window closing until the draft can be saved. Note writes replace file contents directly; they are not crash-atomic saves.

Both `.md` and `.markdown` notes are supported. Inline images keep their Markdown source editable:

```md
![Cover](images/cover.png)
![Shared photo](../images/photo.JPG)
![Name with spaces](images/cover%20photo.webp)
```

Paths resolve relative to the note and must stay within the opened folder, including after following symlinks. PNG, JPG, JPEG, GIF and WebP extensions are case insensitive. Destinations are URL-decoded once. Absolute paths, remote URLs, `file:` and `data:` URLs are rejected. The editor displays Markdown source and inline image previews. Reference-style images, Obsidian embeds and full Markdown previews are outside its scope.

Move to Trash asks for confirmation and uses the system Trash only, without permanent deletion fallback. The opened root cannot be renamed or trashed. Symlink folders are listed without traversal, and mutations through them are rejected. Renaming allows full filename and extension changes, including case-only changes, and leaves Markdown links unchanged.

## Frontend foundation

The approved interface decisions are preserved in [docs/design/HANDOFF.md](docs/design/HANDOFF.md). The light and dark palettes and approved dimensions live in `src/styles/tokens.css`. The baseline follows the system colour scheme. JetBrains Mono (400, 600, 700 plus 400 italic) and Nunito (500, 600, 700) are bundled locally through Fontsource; runtime font loading needs no external service.

CodeMirror 6 state, view, language, Markdown, commands and Lezer highlighting packages provide the editor foundation. Lucide React provides interface icons. The React workspace controller coordinates those components with the native API. `App` accepts an optional `api` prop for isolated frontend tests; production defaults to the native adapter.

The typed Tauri adapter and mockable `WorkspaceApi` type are exported from `src/api/workspace.ts`. See [docs/workspace-api.md](docs/workspace-api.md) for command arguments, generation semantics and image handling.

## Checks and tests

GitHub Actions runs six blocking jobs on pushes to `main` and `dev` and on all pull requests: frontend build, Biome and Vitest; Chromium browser tests; and Rust formatting, Clippy, Rust tests and a debug Tauri build without bundling. Each group runs on both Ubuntu 24.04 and Windows 2022 with Node.js 24 and Rust stable. Pull requests test the merge commit. CI builds the native host but does not exercise its GUI or produce installers or releases.

Find failed commands in the run's job logs. Failed browser jobs upload `.fledge/tmp/`, including screenshots and Playwright results, as `browser-diagnostics-<platform>` artifacts retained for seven days. Superseded runs are cancelled. The workflow also supports manual dispatch; GitHub's **Run workflow** button becomes available after the workflow reaches the default branch, `main`.

```sh
npm ci
npm run build
npm run lint:frontend
npm test
npm run lint
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug --no-bundle
```

`npm run lint` checks both the frontend and Rust host. `npm test` runs Vitest in jsdom, with React Testing Library cleanup and jest-dom matchers configured in `src/test/setup.ts`. Tests belong in `src/**/*.test.ts` or `src/**/*.test.tsx`; import test functions from `vitest`. `npm run test:watch` runs the same suite in watch mode.

Write feature tests against observable behavior. Confirm each new test fails with absent or deliberately broken behavior before confirming it passes. The suite covers save serialization, dirty refresh, stale reads, file actions, preferences, image parsing/lifetimes, and native close-event ordering.

Run the rendered browser suite with:

```sh
npx playwright install chromium
npm run test:e2e
```

Browser binaries require a separate installation on each development/CI machine. The suite serves `e2e/fixture.html` with an injected in-memory `WorkspaceApi`, exercises the real CodeMirror editor, and checks both themes, narrow layouts, image cleanup and save/close flows. It writes screenshots and results to `.fledge/tmp/`. This fixture is separate from the production entry point and does not exercise native filesystem access; native IPC must also be verified in Tauri.

Browser tests start their own server on port 1428 and fail if that port is occupied, so another checkout's development server cannot silently supply the tested code.

The debug host is `src-tauri/target/debug/ror-desktop` (`ror-desktop.exe` on Windows). Native preferences are stored as `preferences.json` in the OS app configuration directory; on Linux this is `$XDG_CONFIG_HOME/com.ror.desktop` (normally `~/.config/com.ror.desktop`). For isolated native testing, set `XDG_CONFIG_HOME` and `XDG_DATA_HOME` to disposable directories and use a disposable workspace on the same filesystem so system Trash operations stay isolated. Never use personal notes or preferences as test fixtures.

Native runtime verification on this development host uses Linux WebKitGTK with tauri-driver and WebKitWebDriver. Windows/macOS execution and native case-insensitive filesystem behavior require verification on those platforms. Rust tests cover case-only rename rollback and Trash failure preservation through injected operation boundaries. Canonical path checks do not defend against a hostile external process swapping filesystem entries between OS calls.

The left rail opens **Player** by default and switches to **Notes**. The folder picker remains at the bottom of that rail. A folder holds one player's name, photo, custom stats, Markdown description, and notes under `player-notes/`. Player edits autosave after 500ms; failed writes retain drafts and block navigation until Retry succeeds. Player and Notes share the same description draft. Refresh offers Cancel, Discard and Reload, or Save and Refresh when anything is dirty.

The interface follows system light/dark mode using black, white, and neutral grays; imported photos retain their colors.

Dice is available from the function rail with or without a folder. Quick rolls
leave the notation field unchanged; Roll again repeats the latest successful
roll. Notation accepts signed dice and modifiers, such as `2d6 + 1d8 - 3` or
`d20 - d4`, with at most 100 dice, 1,000,000 sides per die, and 200 characters.
Rolls use secure, unbiased browser randomness. The latest result and up to 50
recent rolls belong to the current folder's session (or a temporary session
without a folder). Switching folders and refreshing preserve those sessions;
closing the app clears them. Dice never writes files or preferences.
