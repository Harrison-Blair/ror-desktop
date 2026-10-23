# Ror Desktop

A blank desktop app built with Tauri 2, React, TypeScript and Vite.

Run all commands below from the `client/` directory.

## Requirements

- Node.js 22.12 or newer and npm.
- Rust stable and Cargo.
- The [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for Windows, Linux or macOS.

## Development

```sh
npm install
npm run tauri dev
```

The app opens an empty 1000 × 700 window with standard operating-system controls.
For frontend development in a browser, run `npm run dev`.

## Build

```sh
npm run tauri build
```

Run this command on each target operating system to produce its native packages.
Packages are written to `src-tauri/target/release/bundle/`.
To build only the native executable, use `npm run tauri build -- --no-bundle`.
To check and build only the frontend, use `npm run build`.

## Checks

```sh
npm run check:frontend
npm run check:rust
```

These commands check formatting and lint with Biome, Rustfmt and Clippy.
Formatting differences and lint warnings fail the checks.
To apply formatting, run:

```sh
npm run format:frontend
npm run format:rust
```

## Desktop CI

[Desktop CI](../.github/workflows/desktop-ci.yml) runs on pull requests to any branch and pushes to `main` or `dev`.
Only changes under `client/` or to that workflow file trigger it.
Draft pull requests skip the jobs until marked ready for review.
Returning a pull request to draft cancels an older run.
Newer runs cancel older runs for the same pull request or branch.

Each job checks formatting and lint, then builds the release executable on Ubuntu 24.04 or Windows 2025.
The Tauri build also checks TypeScript and builds the frontend.
CI uses Node.js 24, Rust stable and the committed npm and Cargo lockfiles.
It does not create installers, upload build artifacts or publish releases.
