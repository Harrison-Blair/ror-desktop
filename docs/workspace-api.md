# Workspace IPC contract

`src/api/workspace.ts` exports `api`, `WorkspaceApi = typeof api`, and the shared types below. The adapter invokes Tauri commands with camelCase arguments and returns their promises unchanged. Errors remain readable backend strings; the UI renders them in the appropriate approved error state.

```ts
type FileKind = "note" | "image" | "other";
type TreeNode =
  | { kind: "folder"; name: string; path: string; isSymlink: boolean; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; isSymlink: boolean; fileKind: FileKind };
type Preferences = {
  lastFolder: string | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  showHidden: boolean;
  lineNumbers: boolean;
};
type PreferencesPatch = Partial<Omit<Preferences, "lastFolder">>;
type Workspace = { generation: number; name: string; displayPath: string; nodes: TreeNode[] };
type Bootstrap = { preferences: Preferences; workspace: Workspace | null; restoreError: string | null };
type RenameResult = { workspace: Workspace; path: string };
```

Preference defaults are `lastFolder: null`, `sidebarWidth: 260`, `sidebarCollapsed: false`, `showHidden: false`, and `lineNumbers: false`. The approved sidebar range is 180–480px. Only the native host updates `lastFolder`; frontend preference patches exclude it.

| Frontend method | Tauri command | Invoke arguments | Result |
| --- | --- | --- | --- |
| `initializeWorkspace()` | `initialize_workspace` | none | `Bootstrap` |
| `pickWorkspace()` | `pick_workspace` | none | `Workspace \| null` |
| `refreshWorkspace(generation)` | `refresh_workspace` | `{ generation }` | `Workspace` |
| `readNote(generation, path)` | `read_note` | `{ generation, path }` | `string` |
| `writeNote(generation, path, content)` | `write_note` | `{ generation, path, content }` | `void` |
| `readImage(generation, path, notePath?)` | `read_image` | `{ generation, path, notePath }` | `ArrayBuffer` |
| `createEntry(generation, parentPath, name, kind)` | `create_entry` | `{ generation, parentPath, name, kind }` | `Workspace` |
| `renameEntry(generation, path, name)` | `rename_entry` | `{ generation, path, name }` | `RenameResult` |
| `trashEntry(generation, path)` | `trash_entry` | `{ generation, path }` | `Workspace` |
| `updatePreferences(patch)` | `update_preferences` | `{ patch }` | `Preferences` |

Every result is returned as a `Promise`. `createEntry` accepts only `kind: "note" | "folder"`; `parentPath: ""` means the workspace root. `renameEntry` returns the new root-relative path. A cancelled native folder picker returns `null` without changing the workspace.

## Paths and generations

Tree and file-command paths are root-relative with `/` separators. The native root's absolute path is used only for display metadata and preferences. Symlink directories appear with `isSymlink: true` and empty `children`; they are not descended.

The native host controls filesystem access. Every workspace file command validates `generation`; a stale generation fails. Generation increments when a root is replaced or restored. Refresh, create, rename and trash retain the current generation. The frontend separately advances a content/image revision on refresh or CRUD to invalidate Blob URLs.

## Images

`readImage` returns binary bytes via `tauri::ipc::Response`, received as an `ArrayBuffer`. Allowed extensions are PNG, JPG, JPEG, GIF and WebP, case insensitive.

When `notePath` is supplied, `path` is a Markdown destination that the frontend must decode exactly once before calling the adapter. The backend resolves it relative to the note's parent directory. When `notePath` is omitted or `null`, `path` is a tree-relative path. The adapter itself performs no URI decoding or MIME inference. Decoding failures must be visible in the UI.

External and absolute references, including `file:`, `data:` and HTTP URLs, are rejected. The frontend can infer MIME type from the decoded path extension, create a Blob URL for rendering and revoke it when invalidated or no longer used.

## Verification boundaries

The frontend foundation provides types and direct IPC wrappers only. Native command validation is covered by the native implementation; later frontend tests can inject a `WorkspaceApi` mock to exercise user-visible behavior. No speculative error taxonomy or feature state is introduced here.
