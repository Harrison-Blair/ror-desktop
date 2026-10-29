import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Paths are relative to the notes folder, "/"-separated, and "" is the top
// level. A note path ends in ".md"; a name never does.
export type EntryKind = "folder" | "note";

export type Entry = {
  kind: EntryKind;
  name: string;
  path: string;
  children?: Entry[];
};

export const listNotes = () => invoke<Entry[]>("notes_list");

export const createEntry = (parent: string, kind: EntryKind, name: string) =>
  invoke<string>("notes_create", { parent, kind, name });

export const renameEntry = (path: string, newName: string) =>
  invoke<string>("notes_rename", { path, newName });

export const moveEntry = (path: string, newParent: string) =>
  invoke<string>("notes_move", { path, newParent });

export const deleteEntry = (path: string) =>
  invoke<void>("notes_delete", { path });

// Fires shortly after any change on disk, including the app's own.
export const onNotesChanged = (handler: () => void) =>
  listen("notes-changed", () => handler());
