import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "../src/styles/tokens.css";
import "../src/styles/global.css";
import { createRoot } from "react-dom/client";
import App from "../src/App";
import type {
  Preferences,
  TreeNode,
  Workspace,
  WorkspaceApi,
} from "../src/api/workspace";

const file = (path: string): TreeNode => ({
  kind: "file",
  path,
  name: path.split("/").pop() ?? path,
  isSymlink: false,
  fileKind: /\.(md|markdown)$/i.test(path)
    ? "note"
    : /\.(png|jpe?g|gif|webp)$/i.test(path)
      ? "image"
      : "other",
});
const fixture = {
  preferences: {
    lastFolder: "/fixture/reading-group",
    sidebarWidth: 260,
    sidebarCollapsed: false,
    showHidden: false,
    lineNumbers: false,
  } as Preferences,
  workspace: {
    generation: 1,
    name: "reading-group",
    displayPath: "/fixture/reading-group",
    nodes: [
      {
        kind: "folder",
        path: "images",
        name: "images",
        isSymlink: false,
        children: [file("images/cover.png"), file("images/small.png")],
      },
      {
        kind: "folder",
        path: "notes",
        name: "notes",
        isSymlink: false,
        children: [file("notes/week-3.md")],
      },
      file("README.md"),
      file("week-3.md"),
      file(".hidden.md"),
      file("archive.pdf"),
      file(
        "a-very-long-filename-that-should-never-push-controls-outside-the-window.md",
      ),
    ],
  } as Workspace,
  notes: {
    "README.md":
      "# Notes for the reading group\n\nA quiet place for **ideas**, questions, and images.\n\n![Reading group cover](images/cover.png)\n\n## This week\n\n- Read the third chapter\n- Bring a question to discuss\n\n> What changes when we read together?\n\n`![code stays source](no.png)`\n\n![small](images/small.png) ![missing](missing.png)",
    "week-3.md": "# Week three\n\nNotes for the next discussion.",
    "notes/week-3.md": "![parent-relative](../images/cover.png)",
    ".hidden.md": "A hidden note.",
  } as Record<string, string>,
  writes: [] as { path: string; content: string }[],
  imageReads: [] as { path: string; notePath?: string | null }[],
  failWrites: false,
  holdWrites: false,
  release: () => {},
  trashFails: false,
  closeCount: 0,
  closeRequested: (_event: { preventDefault(): void }) => {},
  closePrevented: false,
  urlCreated: [] as string[],
  urlRevoked: [] as string[],
};
const createUrl = URL.createObjectURL.bind(URL);
const revokeUrl = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  const url = createUrl(blob);
  fixture.urlCreated.push(url);
  return url;
};
URL.revokeObjectURL = (url) => {
  fixture.urlRevoked.push(url);
  revokeUrl(url);
};
const canvas = document.createElement("canvas");
canvas.width = 640;
canvas.height = 400;
const context = canvas.getContext("2d");
if (context) {
  context.fillStyle = "#e8def8";
  context.fillRect(0, 0, 640, 400);
  context.fillStyle = "#8b6fd6";
  context.fillRect(55, 65, 200, 270);
  context.fillStyle = "#5a3fb0";
  context.fillRect(285, 65, 300, 125);
  context.fillStyle = "#b3a0db";
  context.fillRect(285, 210, 300, 125);
}
const png = await new Promise<ArrayBuffer>((resolve) =>
  canvas.toBlob(
    async (blob) =>
      resolve(blob ? await blob.arrayBuffer() : new ArrayBuffer(0)),
    "image/png",
  ),
);
canvas.width = 80;
canvas.height = 60;
const smallPng = await new Promise<ArrayBuffer>((resolve) =>
  canvas.toBlob(
    async (blob) =>
      resolve(blob ? await blob.arrayBuffer() : new ArrayBuffer(0)),
    "image/png",
  ),
);
const walk = (
  nodes: TreeNode[],
  visit: (node: TreeNode) => TreeNode | null,
): TreeNode[] =>
  nodes.flatMap((node) => {
    const next = visit(node);
    return next
      ? [
          {
            ...next,
            ...(next.kind === "folder"
              ? { children: walk(next.children, visit) }
              : {}),
          },
        ]
      : [];
  });
const api: WorkspaceApi = {
  initializeWorkspace: async () => ({
    preferences: fixture.preferences,
    workspace: fixture.workspace,
    restoreError: null,
  }),
  pickWorkspace: async () => null,
  refreshWorkspace: async () => structuredClone(fixture.workspace),
  readNote: async (_generation, path) => fixture.notes[path] ?? "# A new note",
  writeNote: async (_generation, path, content) => {
    fixture.writes.push({ path, content });
    if (fixture.holdWrites)
      await new Promise<void>((resolve) => {
        fixture.release = resolve;
      });
    if (fixture.failWrites) throw new Error("permission denied");
    fixture.notes[path] = content;
  },
  readImage: async (_generation, path, notePath) => {
    fixture.imageReads.push({ path, notePath });
    if (path.includes("missing")) throw new Error("file not found");
    return path.includes("small") ? smallPng : png;
  },
  createEntry: async (_generation, parentPath, name, kind) => {
    const path = parentPath ? `${parentPath}/${name}` : name;
    const node: TreeNode =
      kind === "folder"
        ? { kind: "folder", name, path, isSymlink: false, children: [] }
        : file(path);
    fixture.workspace = {
      ...fixture.workspace,
      nodes: parentPath
        ? walk(fixture.workspace.nodes, (entry) =>
            entry.path === parentPath && entry.kind === "folder"
              ? { ...entry, children: [...entry.children, node] }
              : entry,
          )
        : [...fixture.workspace.nodes, node],
    };
    return structuredClone(fixture.workspace);
  },
  renameEntry: async (_generation, path, name) => {
    const newPath = path.includes("/")
      ? `${path.slice(0, path.lastIndexOf("/"))}/${name}`
      : name;
    fixture.workspace.nodes = walk(fixture.workspace.nodes, (node) => {
      if (node.path !== path && !node.path.startsWith(`${path}/`)) return node;
      const renamed = newPath + node.path.slice(path.length);
      if (fixture.notes[node.path]) {
        fixture.notes[renamed] = fixture.notes[node.path];
        delete fixture.notes[node.path];
      }
      return node.kind === "folder"
        ? { ...node, path: renamed, name: renamed.split("/").pop() ?? name }
        : file(renamed);
    });
    return { workspace: structuredClone(fixture.workspace), path: newPath };
  },
  trashEntry: async (_generation, path) => {
    if (fixture.trashFails) throw new Error("Trash unavailable");
    fixture.workspace.nodes = walk(fixture.workspace.nodes, (node) =>
      node.path === path ? null : node,
    );
    return structuredClone(fixture.workspace);
  },
  updatePreferences: async (patch) => {
    fixture.preferences = { ...fixture.preferences, ...patch };
    return fixture.preferences;
  },
};
const closeHost = {
  onCloseRequested: async (callback: typeof fixture.closeRequested) => {
    fixture.closeRequested = callback;
    return () => {};
  },
  close: async () => {
    fixture.closeCount++;
    fixture.closeRequested({
      preventDefault() {
        fixture.closePrevented = true;
      },
    });
  },
};
Object.assign(window, { fixture });
export type BrowserFixture = typeof fixture;

createRoot(document.getElementById("root") as HTMLElement).render(
  <App api={api} closeHost={closeHost} />,
);
