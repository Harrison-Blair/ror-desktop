# Ror Desktop

A desktop application starter built with Tauri 2, Rust, and a React + TypeScript + Vite frontend. The same project can be developed and built on Windows and Linux.

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

## First app screen

The React frontend lives in `src/`. Replace the placeholder component in `src/App.tsx` with the app's first screen. The Rust host entry point is `src-tauri/src/lib.rs`; add native commands there as the app needs them.

## Frontend foundation

The approved interface decisions are preserved in [docs/design/HANDOFF.md](docs/design/HANDOFF.md). The light and dark palettes and approved dimensions live in `src/styles/tokens.css`. The baseline follows the system colour scheme. JetBrains Mono (400, 600, 700 plus 400 italic) and Nunito (500, 600, 700) are bundled locally through Fontsource; runtime font loading needs no external service.

CodeMirror 6 state, view, language, Markdown, commands and Lezer highlighting packages provide the editor foundation. Lucide React provides interface icons. No workspace feature UI is implemented by this foundation.

The typed Tauri adapter and mockable `WorkspaceApi` type are exported from `src/api/workspace.ts`. See [docs/workspace-api.md](docs/workspace-api.md) for command arguments, generation semantics and image handling.

## Checks and tests

```sh
npm ci
npm run build
npm run lint:frontend
npm test
npm run lint
```

`npm run lint` checks both the frontend and Rust host. `npm test` runs Vitest in jsdom, with React Testing Library cleanup and jest-dom matchers configured in `src/test/setup.ts`. Tests belong in `src/**/*.test.ts` or `src/**/*.test.tsx`; import test functions from `vitest`. `npm run test:watch` runs the same suite in watch mode. Until feature tests are added, the empty suite succeeds through `passWithNoTests`.

Write feature tests against observable behavior. Confirm each new test fails with absent or deliberately broken behavior before confirming it passes. The foundation adds no tests that only mirror IPC wrappers.

Playwright tooling is installed for later rendered browser verification:

```sh
npx playwright install chromium
npm run test:e2e
```

Browser binaries require a separate installation on each development/CI machine. No browser feature suite is included yet; the UI implementation will add its browser configuration and tests. Keep browser specs outside `src` so Vitest does not collect them. Browser-only verification will need a mock `WorkspaceApi`; native IPC behavior must also be verified in Tauri.
