import { invoke } from "@tauri-apps/api/core";

export type FileKind = "note" | "image" | "other";

export type TreeNode =
  | {
      kind: "folder";
      name: string;
      path: string;
      isSymlink: boolean;
      children: TreeNode[];
    }
  | {
      kind: "file";
      name: string;
      path: string;
      isSymlink: boolean;
      fileKind: FileKind;
    };

export type Preferences = {
  lastFolder: string | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  showHidden: boolean;
  lineNumbers: boolean;
};

export type PreferencesPatch = Partial<Omit<Preferences, "lastFolder">>;

export type Workspace = {
  generation: number;
  name: string;
  displayPath: string;
  nodes: TreeNode[];
};

export type Bootstrap = {
  preferences: Preferences;
  workspace: Workspace | null;
  restoreError: string | null;
};

export type RenameResult = {
  workspace: Workspace;
  path: string;
};

export const api = {
  initializeWorkspace: () => invoke<Bootstrap>("initialize_workspace"),
  pickWorkspace: () => invoke<Workspace | null>("pick_workspace"),
  refreshWorkspace: (generation: number) =>
    invoke<Workspace>("refresh_workspace", { generation }),
  readNote: (generation: number, path: string) =>
    invoke<string>("read_note", { generation, path }),
  writeNote: (generation: number, path: string, content: string) =>
    invoke<void>("write_note", { generation, path, content }),
  readImage: (generation: number, path: string, notePath?: string | null) =>
    invoke<ArrayBuffer>("read_image", { generation, path, notePath }),
  createEntry: (
    generation: number,
    parentPath: string,
    name: string,
    kind: "note" | "folder",
  ) =>
    invoke<Workspace>("create_entry", { generation, parentPath, name, kind }),
  renameEntry: (generation: number, path: string, name: string) =>
    invoke<RenameResult>("rename_entry", { generation, path, name }),
  trashEntry: (generation: number, path: string) =>
    invoke<Workspace>("trash_entry", { generation, path }),
  updatePreferences: (patch: PreferencesPatch) =>
    invoke<Preferences>("update_preferences", { patch }),
};

export type WorkspaceApi = typeof api;
