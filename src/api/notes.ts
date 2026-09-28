import { invoke } from "@tauri-apps/api/core";

/** Mirrors `TreeNode` in src-tauri/src/notes.rs. Paths are relative to the notes folder. */
export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string };

/** Opens the native folder picker. Resolves to the folder's name, or null if cancelled. */
export function pickFolder(): Promise<string | null> {
  return invoke("pick_folder");
}

export function listTree(): Promise<TreeNode[]> {
  return invoke("list_tree");
}
