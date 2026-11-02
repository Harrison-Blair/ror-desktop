# Ror Desktop

Ror Desktop is a desktop companion for tabletop roleplaying campaigns, with
campaign notes, people, dice, and an optional chat assistant. It is built with
[Tauri](https://v2.tauri.app/), React, TypeScript, and Rust.

## Quick start: Linux

Install these dependencies first:

- [Git](https://git-scm.com/downloads) to download the source.
- [Node.js LTS](https://nodejs.org/en/download), version 22.12 or newer, and npm.
- [Rust stable and Cargo](https://www.rust-lang.org/tools/install).
- The [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

In a terminal, run:

```sh
git clone https://github.com/Harrison-Blair/ror-desktop.git
cd ror-desktop/client
npm ci
npm run tauri dev
```

The first launch compiles the application and opens Ror Desktop. Leave the
terminal running while you use it.

## Quick start: Windows

Install these dependencies first:

- [Git for Windows](https://git-scm.com/download/win) to download the source.
- [Node.js LTS](https://nodejs.org/en/download), version 22.12 or newer, and npm.
- [Rust stable and Cargo](https://www.rust-lang.org/tools/install), using MSVC.
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  with the **Desktop development with C++** workload.
- [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/).

In PowerShell, run:

```powershell
git clone https://github.com/Harrison-Blair/ror-desktop.git
cd ror-desktop\client
npm ci
npm run tauri dev
```

The first launch compiles the application and opens Ror Desktop. Leave
PowerShell running while you use it.

## Detailed setup: Linux (Ubuntu 24.04)

1. Open Terminal and install Git and Tauri's native build dependencies:

   ```sh
   sudo apt update
   sudo apt install -y build-essential pkg-config curl wget file git \
     libwebkit2gtk-4.1-dev libxdo-dev libssl-dev \
     libayatana-appindicator3-dev librsvg2-dev
   ```

2. Install [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) using
   the installer command on its page. Close and reopen Terminal, then install
   Node.js LTS (which includes npm):

   ```sh
   nvm install --lts
   nvm use --lts
   ```

3. Install Rust stable and make Cargo available in this terminal. Follow the
   installer prompts and choose the default installation:

   ```sh
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```

4. Check that the tools are available. Node must be version 22.12 or newer:

   ```sh
   git --version
   node --version
   npm --version
   rustc --version
   cargo --version
   ```

5. Download the source and start the app:

   ```sh
   git clone https://github.com/Harrison-Blair/ror-desktop.git
   cd ror-desktop/client
   npm ci
   npm run tauri dev
   ```

## Detailed setup: Windows

1. Install [Git for Windows](https://git-scm.com/download/win) and
   [Node.js LTS](https://nodejs.org/en/download). Accept the default options;
   Node includes npm.

2. Download and run [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
   Select **Desktop development with C++** in the installer and install it.

3. Windows 10 version 1803 and later normally includes WebView2. If it is
   missing, install the Evergreen Bootstrapper from the
   [WebView2 download page](https://developer.microsoft.com/microsoft-edge/webview2/).

4. Download and run [rustup-init.exe](https://rustup.rs/). Follow the prompts
   and keep the default stable MSVC toolchain.

5. Close and reopen PowerShell so it can find the installed tools. Confirm
   the commands below work; Node must be version 22.12 or newer:

   ```powershell
   git --version
   node --version
   npm --version
   rustc --version
   cargo --version
   ```

6. Download the source and start the app:

   ```powershell
   git clone https://github.com/Harrison-Blair/ror-desktop.git
   cd ror-desktop\client
   npm ci
   npm run tauri dev
   ```

## Useful commands

Run these from `client/` on the target operating system:

```sh
npm run dev             # Frontend in a browser
npm run tauri build     # Native packages
npm run check:frontend  # Frontend formatting and lint
npm run check:rust      # Rust formatting and lint
npm test                # Frontend tests
npm run test:rust       # Rust tests
```

Native packages are written to `src-tauri/target/release/bundle/`. Building
an MSI on Windows may require the optional VBSCRIPT Windows feature; see the
[Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).
