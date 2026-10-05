import { vi } from "vitest";
import type {
  Bootstrap,
  PlayerProfile,
  Preferences,
  TreeNode,
  Workspace,
  WorkspaceApi,
} from "../api/workspace";
export const preferences: Preferences = {
  lastFolder: "/notes",
  sidebarWidth: 260,
  sidebarCollapsed: false,
  showHidden: false,
  lineNumbers: false,
};
export const file = (
  path: string,
  fileKind: "note" | "image" | "other" = "note",
): TreeNode => ({
  kind: "file",
  path,
  name: path.split("/").pop() ?? path,
  isSymlink: false,
  fileKind,
});
export const workspace: Workspace = {
  generation: 1,
  name: "notes",
  displayPath: "/notes",
  nodes: [
    file("one.md"),
    file("two.md"),
    file(".hidden.md"),
    file("photo.png", "image"),
    file("file.pdf", "other"),
  ],
};
export function fixture() {
  let prefs = { ...preferences };
  let profile: PlayerProfile = {
    version: 1,
    name: "",
    photoPath: null,
    stats: [],
  };
  let description = "";
  let metadataExists = false;
  let descriptionExists = false;
  const api = {
    readPlayer: vi.fn(async () => ({
      profile,
      description,
      metadataExists,
      descriptionExists,
    })),
    writePlayer: vi.fn(
      async (_generation: number, value: PlayerProfile, create: boolean) => {
        if (create === metadataExists) throw new Error("File presence changed");
        profile = value;
        metadataExists = true;
      },
    ),
    writePlayerDescription: vi.fn(
      async (_generation: number, content: string, create: boolean) => {
        if (create === descriptionExists)
          throw new Error("File presence changed");
        description = content;
        descriptionExists = true;
      },
    ),
    importPlayerPhoto: vi.fn(async (): Promise<string | null> => null),
    initializeWorkspace: vi.fn(
      async (): Promise<Bootstrap> => ({
        preferences: prefs,
        workspace,
        restoreError: null,
      }),
    ),
    pickWorkspace: vi.fn(async (): Promise<Workspace | null> => null),
    refreshWorkspace: vi.fn(async () => workspace),
    readNote: vi.fn(
      async (_generation: number, path: string) => `content of ${path}`,
    ),
    writeNote: vi.fn(async () => {}),
    readImage: vi.fn(async () => new ArrayBuffer(8)),
    createEntry: vi.fn(async () => workspace),
    renameEntry: vi.fn(async () => ({ workspace, path: "renamed.md" })),
    trashEntry: vi.fn(async () => workspace),
    updatePreferences: vi.fn(async (patch) => {
      prefs = { ...prefs, ...patch };
      return prefs;
    }),
  } satisfies WorkspaceApi;
  return api;
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
