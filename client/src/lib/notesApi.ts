import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Paths are relative to the notes folder, "/"-separated, and "" is the top
// level. A name is the full file or folder name, as on disk.
export type EntryKind = "folder" | "file";

export type Entry = {
  kind: EntryKind;
  name: string;
  path: string;
  children?: Entry[];
};

// `missing` is the saved folder when it was missing at startup and the
// default folder is in use instead.
export type NotesFolder = { path: string; missing: string | null };

export const getNotesFolder = () => invoke<NotesFolder>("notes_folder");

// Opens the folder picker. Resolves to the new folder, or null on Cancel.
export const chooseNotesFolder = () =>
  invoke<string | null>("notes_choose_folder");

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
