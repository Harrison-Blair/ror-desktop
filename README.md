# Ror Desktop

A desktop application starter built with Tauri 2, Rust, and a React + TypeScript + Vite frontend. The same project can be developed and built on Windows and Linux.

The Reform & Revolution image used in the app and its desktop icon comes from the [organization's GitHub avatar](https://avatars.githubusercontent.com/u/238364263). Its local source file is `public/reform-or-revolution.png`.

## Prerequisites

Install Node.js (LTS) and Rust on either platform.

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
