# Ror Desktop interface: design handoff

Repository note: the approved design is preserved below verbatim from the design session. The user subsequently authorized production implementation; the historical design-only statement describes the earlier phase. Full approved palettes and dimensions are extracted into `src/styles/tokens.css`, with the current monochrome palette. Canvas-only experiments and behavior code are not copied into production.

Updated 2026-10-04. This is design exploration only. Nothing here authorizes production implementation.

## Where things are

- **Canvas** (private, owner only): https://claude.ai/artifact/69BmEnJvPhMJia7Ec7Yfkj
  - Pages: Editor (approved), Sidebar & files, Viewer, saving & dialogs, Empty, loading & errors.
  - Each page except the first carries a green "Approved by user" sticky listing that page's decisions.
- **Canvas source:** `/tmp/claude-1000/-home-penguin-source-ror-desktop/b4f4903b-df20-466a-92ef-00950d97699e/scratchpad/ror-canvas/project/`. All values live in these files:
  - `Main.dc.html`: the editor.
  - `Sidebar.dc.html`: the tree, toolbar, naming, menus, and empty state.
  - `Window.dc.html`: the viewer, save banner, dialogs, and empty/loading/error panes.
  - `SaveStates.dc.html`: the save chips.
  - `Collapse.dc.html`: the rail.
  - The other `*.dc.html` files are thin variants that import these.
- **Earlier mockup rounds and screenshots:** `/tmp/ror-editor-design-session/.design/editor-presentation/` (`renders/shots/language-1`, `language-2`).
- **Earlier handoff (task 808eadeb):** superseded by this file. Its decisions are carried over below.

## Approved by the user

Every item below was chosen or confirmed by the user directly, either in the Claude Code pane or in their own canvas answers.

### Editor (task 808eadeb)

- Option C: minimal monospace in a centred column. Proportional (A) was rejected.
- Airy density: JetBrains Mono 16px, max column 760px, line-height 1.9, padding 36px top and 32px sides.
- Line numbers:
  - Off by default, with a toggle.
  - The preference is remembered across launches and shared by all notes (relayed by the orchestrator as an explicit user decision).
  - The toggle is a Lucide `list-ordered` icon button, 30×30 with a 10px radius, between the filename and the save chip.
  - Numbers sit in the left margin, so content doesn't shift. Image previews and error rows aren't numbered.
- Inline image preview:
  - Sits under its source line, max 340px wide, 1px border, square corners.
  - Spacing is 8px above and 14px below.
- **Revision (this session):** the light-theme Markdown mark colour changed from `#8e8e8e` to `#888888`, raising contrast from 4.34:1 to 4.69:1.

### Sidebar and file actions

- **Toolbar A**
  - A header row holds the folder-name button and the collapse button.
  - Below it is an icon row: New note and New folder on the left, Refresh and the hidden-files eye toggle on the right.
  - Icon buttons are 30×30 with a 10px radius.
  - Tree rows are compact: 28px high, 16px indent per level, no indent guides.
  - The selected row uses accentSoft with bold text, and folders show a neutral icon.
- **Inline naming**
  - The full name is editable.
  - A new note starts as `untitled.md` with only "untitled" selected.
  - The editable row sits on accentSoft with an accent-bordered box.
- **Name collision**
  - The box border turns red, with the message "pamphlet.md already exists here. Pick another name."
  - The collision state was drawn with the fixed-suffix style. With full-name editing, the same red border and message apply.
- **Rename warning:** inline under the box, in amber: "Links to this note in other notes won't be updated."
- **Context menus**
  - Folder menu: New note, New folder, a divider, Rename, Move to Trash.
  - File menu: Rename, Move to Trash.
  - Move to Trash is shown in the error colour.
  - Menus are 184px wide with a 12px radius, a shadow, and 32px items.
- **Hidden files:** dot entries are hidden by default. When shown, they use the muted text colour and the eye button shows as pressed.
- **Resize:** a 3px accent edge appears on the sidebar's right border on hover.
- **Collapse:** a 48px thin rail containing only an expand button (`panel-left-open`).
- **Opening another folder:** the folder-name button at the top of the sidebar, which shows the folder icon, the name and a `chevrons-up-down` icon.
- **Files that can't be opened:** they look the same as other files in the tree, with a generic file icon.

### Viewer, saving and dialogs

- **Image viewer**
  - Uses a tinted panel background: `#f1f1f1` in light, `#161616` in dark.
  - The header shows an image icon and the filename.
  - Images fit the pane and are never enlarged.
- **Unsupported file selected:** a centred icon tile and the single line "Can't open this file".
- **Save chips**
  - Unsaved: an outlined chip with a muted dot.
  - Saving…: a spinner on accentSoft.
  - Saved: a check on accentSoft.
  - Save failed: a red chip plus an outlined Retry pill.
- **Failed save blocking navigation:** a red banner under the header (option A), not a dialog. It reads "Couldn't save week-3.md, so you're staying on this note. Your changes are still here." and has a Retry button.
- **Dirty-refresh dialog**
  - Title: "week-3.md has unsaved changes".
  - Body: "Refreshing reloads the folder and this note from disk."
  - Note: "Save and Refresh writes your version over any changes made to week-3.md in other apps."
  - Buttons: Cancel, Discard and Reload (outlined red), Save and Refresh (primary).
- **Trash confirmation**
  - Title: "Move "images" to Trash?"
  - Body: "The folder and everything inside it will go to your system Trash. You can restore it from there."
  - Buttons: Cancel, Move to Trash (filled red).
- **Trash failed**
  - Title: "Couldn't move "images" to Trash"
  - Body: "Nothing was deleted. The folder is still where it was."
  - Button: OK.
- **Dialog shape:** 440px wide, 18px radius, 24px padding, a 38px icon tile, 36px pill buttons, and a scrim behind.

### Empty, loading and errors

- **First launch:** "Open a folder to start", "Pick a folder of notes and images. It will reopen next time.", and an Open folder primary button. There's no sidebar on this screen.
- **Remembered folder missing:** "Can't find reading-group" with the folder path in a code chip and an "Open another folder" button.
- **Opening a folder:** a spinner only, with "Opening reading-group…". The sidebar tree is blank; there are no placeholder rows.
- **Empty folder:** the sidebar shows "This folder is empty" and "Use the new note or new folder buttons above to start."
- **Folder open, nothing selected:** "No file open" and "Pick a note or image from the sidebar."
- **Viewer image fails to load:** a red icon, "Couldn't load this image", and "The file may be damaged or no longer there. Try Refresh."
- **Copy rule:** messages never name Ror and never speak as the app in the first person. Every current string was updated to follow this.

## Proposals shown but never separately discussed

These were visible in approved boards, so they count as accepted by default, but they can be revisited:

- Primary button colours: `#6e6e6e` with white text in light, `#c3c3c3` with `#202020` text in dark.
- Dark-theme error-button text is `#202020` on `#c7c7c7`.
- The rename-warning gray: `#444444` light, `#b6b6b6` dark.
- The selection highlight inside naming boxes: `#e0e0e0` light, `#5c5c5c` dark.
- Menu item highlight for the keyboard-focused or first item.
- The scrim opacity.

## Settled behaviours (approved by the user)

The user answered each of these directly in the Claude Code pane. The new boards are in row 5 of the Sidebar page and in the Viewer page's save row.

- **Name validation (portable rules)**
  - Rejected: empty or whitespace-only names, `/ \ : * ? " < > |`, and names ending in a dot or space.
  - Names starting with a dot are allowed.
  - Message: "Names can't contain / \ : * ? " < > | or end with a dot or space." It's shown in red under the box, which stays open.
- **Changing the extension on rename**
  - Allowed.
  - A second amber line appears under the link warning: "Changing the extension may stop this file opening here."
- **New folder name:** starts as `untitled`, fully selected.
- **Folder-name button:** opens a small menu with a single "Open folder…" item. The chevron icon stays.
- **Inline naming keys**
  - Enter saves and Escape cancels.
  - Clicking away also saves.
  - An invalid name or a taken name keeps the box open with its message.
- **Keyboard support for the tree**
  - Up and Down move between rows.
  - Right and Left expand and collapse folders.
  - Enter opens, F2 renames, and Delete asks to trash.
  - Shift+F10 or the Menu key opens the context menu.
  - Focus shows as a 2px inset accent ring on the row.
- **Remembered across launches:** sidebar width (already settled), collapsed or expanded state, and whether hidden files are shown.
- **Sidebar width:** 180–480px, default 260px.
- **Rename warning for images:** shows too, with the same amber link warning.
- **Create or rename failure**
  - A red message under the naming box, for example "Couldn't rename week-3.md: permission denied."
  - The box stays open, so you can retry or press Escape.
- **Close after a failed save**
  - The window stays open.
  - The same red banner appears, reading "Couldn't save week-3.md, so the window stays open. Your changes are still here." with Retry.
- **Opening spinner:** appears immediately, with no delay.

- **Case-only rename** (for example `Week-3.md` to `week-3.md`): allowed as a normal rename on every filesystem, never reported as a collision with itself.
- **Hover**
  - Tree rows get a faint neutral tint with no bold: `#f2f2f2` light, `#2a2a2a` dark. Boards: `SbHover`, `SbHoverDark`.
  - Menu items use the same tint on hover. This was described to the user but not drawn.
  - Text on the hover tint is 12.49:1 light and 12.86:1 dark.
  - In light, hover is nearly the same colour as the selected row (1.04:1). Selection stays distinguishable by its bold text, and hover is transient.

## Notes for implementation (no decision needed)

- The Delete key reuses the approved Trash dialog.
- The folder-name menu contains only "Open folder…". Don't add other items without asking.

## Unresolved

Nothing. Every item raised during the design sessions has a user decision.

## Verification evidence and limits

- **Contrast:** calculated with the WCAG 2 formula from the colour values, not measured on rendered pixels.
  - All text pairs used pass 4.5:1. Examples (light / dark):

    | Pair | Light | Dark |
    |---|---|---|
    | Text on background | 14.07 | 14.06 |
    | Muted on sidebar | 5.71 | 7.02 |
    | Mark on background | 4.69 | 5.67 |
    | Error on error-soft | 5.01 | 7.32 |
    | Primary button | 7.57 | 7.38 |
    | Danger button | 5.92 | 8.74 |
    | Muted on viewer panel | 5.45 | (not computed) |

  - Folder icon accent on the sidebar is 3.49:1 in light, which passes the 3:1 non-text minimum.
  - The border colour (1.17 light, 1.42 dark) is decorative. No state is conveyed by border alone except the pressed toggle, which also changes background and text colour.
- **Rendering:** I have not visually inspected any canvas board since the switch from mockup. The Design type's own instructions forbid self-rendering checks unless the user asks. Layout, overflow, font loading, context-menu positioning (computed offsets) and dark-theme boards are unverified.
- **Earlier screenshots:** only the mockup rounds (`language-1`, `language-2`) were actually viewed as screenshots.
- **Interactivity:** in Play mode, only the line-number toggle on the editor boards actually works. Everything else is static.

## Player/Notes revision

Replace the former purple palette with neutral grayscale tokens in both system themes. Keep existing fonts and spacing. A 56px left rail places Player before Notes and the workspace folder picker at the bottom. Player is the startup/folder-opening default; it uses the full content area. Notes keeps its tree and editor. Profile fields are name, photo, ordered custom label/value stats, Markdown description, and recursively listed Markdown notes inside `player-notes/`. Clicking a related note reveals and focuses it in Notes. The description owns one shared save session across both functions. Distinct sessions flush metadata, description, then ordinary selected note before navigation and close. Root player.json/player.md are reserved; player.md remains editable in Notes. Photos retain color.
