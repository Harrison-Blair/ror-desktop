// The chat agent's notes tools. They use the same Rust commands as the notes
// menu, so the same path checks keep them inside the notes folder.

import type { Tool, ToolContext, ToolPreview } from "@/lib/chat/registry";
import { lineDiff } from "@/lib/diff";
import {
  createEntry,
  deleteEntry,
  type Entry,
  listNotes,
  moveEntry,
  readNote,
  renameEntry,
  searchNotes,
  writeNote,
} from "@/lib/notesApi";

const PATH = {
  type: "string",
  description:
    'A path relative to the notes folder, with "/" between folders, such as "Places/Keep.md".',
};

const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });

function text(input: Record<string, unknown>, name: string) {
  const value = input[name];
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  return value;
}

function notePath(input: Record<string, unknown>) {
  const path = text(input, "path");
  if (!path.toLowerCase().endsWith(".md")) {
    throw new Error("A note's path must end in .md.");
  }
  return path;
}

const parentOf = (path: string) =>
  path.slice(0, Math.max(0, path.lastIndexOf("/")));
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const join = (parent: string, name: string) =>
  parent ? `${parent}/${name}` : name;

// `path` itself, or an item inside the folder `path`.
const within = (item: string, path: string) =>
  item === path || item.startsWith(`${path}/`);

// Saves the open note's pending edit first when `affects` says the change
// touches it. A note that can't be saved stops the change.
async function saveOpenNote(
  { app }: ToolContext,
  affects: (open: string) => boolean,
  change: string,
) {
  const open = app.openNote();
  if (open === null || !affects(open)) return;
  if (!(await app.flushOpenNote())) {
    throw new Error(
      `The user's unsaved edit to "${open}" couldn't be saved, so ${change}. Tell the user.`,
    );
  }
}

// Moves the read records of a renamed, moved or deleted item.
function moveReads(
  reads: Map<string, string>,
  from: string,
  to: string | null,
) {
  for (const [path, text] of [...reads]) {
    if (!within(path, from)) continue;
    reads.delete(path);
    if (to !== null) reads.set(to + path.slice(from.length), text);
  }
}

// The text after replacing `oldText` with `newText`. Without `all`, the old
// text must appear exactly once.
export function replaceText(
  text: string,
  oldText: string,
  newText: string,
  all: boolean,
  path: string,
) {
  if (oldText === "") throw new Error("old_text must not be empty.");
  const count = text.split(oldText).length - 1;
  if (count === 0) {
    throw new Error(
      `old_text was not found in "${path}". Read the note and copy the text exactly.`,
    );
  }
  if (count > 1 && !all) {
    throw new Error(
      `old_text appears ${count} times in "${path}". Add more of the text around it to pick one, or set replace_all to replace every one.`,
    );
  }
  return text.split(oldText).join(newText);
}

const NOTE_CHANGED =
  "The note changed while waiting for approval. Read it again.";

// Refuses a change when what its preview showed changed while the card
// waited for the user.
function checkApproved(
  seen: string,
  approved: ToolPreview | undefined,
  message = NOTE_CHANGED,
) {
  if (approved?.seen !== undefined && approved.seen !== seen) {
    throw new Error(message);
  }
}

function treeLines(entries: Entry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === "folder"
      ? [`${entry.path}/`, ...treeLines(entry.children ?? [])]
      : [entry.path],
  );
}

export const notesList: Tool = {
  name: "notes_list",
  description:
    'Lists every folder and file in the notes folder, one path per line. Folders end with "/".',
  inputSchema: object({}),
  kind: "read",
  run: async () => {
    const lines = treeLines(await listNotes());
    return lines.length === 0 ? "The notes folder is empty." : lines.join("\n");
  },
};

export const notesRead: Tool = {
  name: "notes_read",
  description:
    "Returns the text of one note. Read a note before you replace it with notes_write.",
  inputSchema: object({ path: PATH }),
  kind: "read",
  run: async (input, { reads }) => {
    const path = text(input, "path");
    const note = await readNote(path);
    reads.set(path, note);
    return note === "" ? "The note is empty." : note;
  },
};

export const notesSearch: Tool = {
  name: "notes_search",
  description:
    "Finds text in the notes, ignoring case. Returns each matching line as path:line: text, at most 50.",
  inputSchema: object({
    query: { type: "string", description: "The text to find." },
  }),
  kind: "read",
  run: async (input) => {
    const { matches, truncated } = await searchNotes(text(input, "query"));
    if (matches.length === 0) return "No matches.";
    const lines = matches.map((m) => `${m.path}:${m.line}: ${m.snippet}`);
    if (truncated) {
      lines.push(
        `Only the first ${matches.length} matches are shown. Search for something narrower to see others.`,
      );
    }
    return lines.join("\n");
  },
};

// The folders above `path` that don't exist yet, outermost first.
async function missingFolders(path: string) {
  const folders = new Set(
    treeLines(await listNotes())
      .filter((line) => line.endsWith("/"))
      .map((line) => line.slice(0, -1)),
  );
  const names = parentOf(path).split("/").filter(Boolean);
  return names
    .map((_, i) => names.slice(0, i + 1).join("/"))
    .filter((folder) => !folders.has(folder));
}

export const notesCreate: Tool = {
  name: "notes_create",
  description:
    "Creates a new note with the given text, and any missing folders above it. Fails if the path exists.",
  inputSchema: object({
    path: PATH,
    text: { type: "string", description: "The note's Markdown text." },
  }),
  kind: "write",
  preview: async (input) => {
    const path = notePath(input);
    const folders = await missingFolders(path);
    return {
      target:
        folders.length === 0
          ? path
          : `${path} (new folders: ${folders.join(", ")})`,
      diff: lineDiff("", text(input, "text")),
      seen: folders.join("\n"),
    };
  },
  run: async (input, _context, approved) => {
    const path = notePath(input);
    const body = text(input, "text");
    // Creates only the folders the user approved.
    const folders = await missingFolders(path);
    checkApproved(
      folders.join("\n"),
      approved,
      "The folders changed while waiting for approval. Try again.",
    );
    for (const folder of folders) {
      await createEntry(parentOf(folder), "folder", nameOf(folder));
    }
    await createEntry(parentOf(path), "file", nameOf(path));
    await writeNote(path, body);
    return `Created "${path}".`;
  },
};

// The note's text after the edit, read after the open note is saved. A note
// that changed since the approved preview is refused first.
async function editedText(
  input: Record<string, unknown>,
  context: ToolContext,
  approved?: ToolPreview,
) {
  const path = text(input, "path");
  const replaceAll = input.replace_all ?? false;
  if (typeof replaceAll !== "boolean") {
    throw new Error("replace_all must be true or false.");
  }
  await saveOpenNote(
    context,
    (open) => open === path,
    "the note wasn't edited",
  );
  const before = await readNote(path);
  checkApproved(before, approved);
  const after = replaceText(
    before,
    text(input, "old_text"),
    text(input, "new_text"),
    replaceAll,
    path,
  );
  return { path, before, after };
}

export const notesEdit: Tool = {
  name: "notes_edit",
  description:
    "Replaces old_text with new_text in a note. old_text must match the note exactly and appear once, unless replace_all is true.",
  inputSchema: object(
    {
      path: PATH,
      old_text: { type: "string", description: "The exact text to replace." },
      new_text: {
        type: "string",
        description: "The text to put in its place.",
      },
      replace_all: {
        type: "boolean",
        description: "Replace every match of old_text. Default false.",
      },
    },
    ["path", "old_text", "new_text"],
  ),
  kind: "write",
  preview: async (input, context) => {
    const { path, before, after } = await editedText(input, context);
    return { target: path, diff: lineDiff(before, after), seen: before };
  },
  run: async (input, context, approved) => {
    const { path, before, after } = await editedText(input, context, approved);
    await writeNote(path, after);
    // The agent knows the note only if it read the text the edit started
    // from. Otherwise someone else changed it, and notes_write needs a read.
    if (context.reads.get(path) === before) context.reads.set(path, after);
    else context.reads.delete(path);
    return `Edited "${path}".`;
  },
};

// The note's text now, when the agent read it and it hasn't changed since.
async function unchangedSinceRead(
  path: string,
  context: ToolContext,
  approved?: ToolPreview,
) {
  const read = context.reads.get(path);
  if (read === undefined) {
    throw new Error(`Read "${path}" with notes_read before you replace it.`);
  }
  await saveOpenNote(
    context,
    (open) => open === path,
    "the note wasn't replaced",
  );
  const now = await readNote(path);
  checkApproved(now, approved);
  if (now !== read) {
    throw new Error(
      `"${path}" changed since you read it. Read it again with notes_read before you replace it.`,
    );
  }
  return now;
}

export const notesWrite: Tool = {
  name: "notes_write",
  description:
    "Replaces the whole text of a note. Read the note with notes_read first; this fails if the note changed since. Prefer notes_edit for small changes.",
  inputSchema: object({
    path: PATH,
    text: { type: "string", description: "The note's new Markdown text." },
  }),
  kind: "write",
  preview: async (input, context) => {
    const path = text(input, "path");
    const before = await unchangedSinceRead(path, context);
    return {
      target: path,
      diff: lineDiff(before, text(input, "text")),
      seen: before,
    };
  },
  run: async (input, context, approved) => {
    const path = text(input, "path");
    const body = text(input, "text");
    await unchangedSinceRead(path, context, approved);
    await writeNote(path, body);
    context.reads.set(path, body);
    return `Replaced the text of "${path}".`;
  },
};

// Rename and move save the open note first, as the notes menu does.
async function relocate(
  context: ToolContext,
  path: string,
  change: string,
  act: () => Promise<string>,
) {
  await saveOpenNote(context, () => true, change);
  const to = await act();
  moveReads(context.reads, path, to);
  context.app.pathChanged(path, to);
  return to;
}

export const notesRename: Tool = {
  name: "notes_rename",
  description:
    "Renames a note or folder in place. new_name is the full new name, with the extension for a file.",
  inputSchema: object({
    path: PATH,
    new_name: {
      type: "string",
      description: 'The new name, such as "Keep.md".',
    },
  }),
  kind: "write",
  preview: (input) => {
    const path = text(input, "path");
    return {
      target: `${path} → ${join(parentOf(path), text(input, "new_name"))}`,
    };
  },
  run: async (input, context) => {
    const path = text(input, "path");
    const to = await relocate(context, path, "it wasn't renamed", () =>
      renameEntry(path, text(input, "new_name")),
    );
    return `Renamed "${path}" to "${to}".`;
  },
};

export const notesMove: Tool = {
  name: "notes_move",
  description:
    'Moves a note or folder into another folder. new_parent "" is the top of the notes folder.',
  inputSchema: object({
    path: PATH,
    new_parent: {
      type: "string",
      description:
        'The folder to move into, such as "Places", or "" for the top.',
    },
  }),
  kind: "write",
  preview: (input) => {
    const path = text(input, "path");
    return {
      target: `${path} → ${join(text(input, "new_parent"), nameOf(path))}`,
    };
  },
  run: async (input, context) => {
    const path = text(input, "path");
    const to = await relocate(context, path, "it wasn't moved", () =>
      moveEntry(path, text(input, "new_parent")),
    );
    return `Moved "${path}" to "${to}".`;
  },
};

export const notesDelete: Tool = {
  name: "notes_delete",
  description:
    "Moves a note or folder to the system trash, where the user can restore it.",
  inputSchema: object({ path: PATH }),
  kind: "write",
  preview: (input) => ({ target: `${text(input, "path")} → Trash` }),
  run: async (input, context) => {
    const path = text(input, "path");
    // The open note's edit goes to the trash with it, so it is saved first.
    await saveOpenNote(
      context,
      (open) => within(open, path),
      "it wasn't deleted",
    );
    await deleteEntry(path);
    moveReads(context.reads, path, null);
    context.app.pathChanged(path, null);
    return `Moved "${path}" to the trash.`;
  },
};

export const notesOpen: Tool = {
  name: "notes_open",
  description: "Opens a note in the editor, so the user sees it.",
  inputSchema: object({ path: PATH }),
  kind: "read",
  run: async (input, context) => {
    const path = text(input, "path");
    // Fails for a missing note or a folder.
    await readNote(path);
    // Opening another note closes this one, so its edit is saved first.
    await saveOpenNote(
      context,
      (open) => open !== path,
      "the note wasn't opened",
    );
    context.app.showNote(path);
    return `Opened "${path}".`;
  },
};

export const notesTools = [
  notesList,
  notesRead,
  notesSearch,
  notesCreate,
  notesEdit,
  notesWrite,
  notesRename,
  notesMove,
  notesDelete,
  notesOpen,
];
