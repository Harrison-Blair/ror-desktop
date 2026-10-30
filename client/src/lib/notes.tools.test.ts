import { beforeEach, describe, expect, it, vi } from "vitest";
import { toolRegistry } from "@/lib/chat/features";
import { runToolCall } from "@/lib/chat/gate";
import type { AppBridge, ToolContext } from "@/lib/chat/registry";
import * as notesApi from "@/lib/notesApi";

// The notes commands, on a fake disk of note texts by path.
let disk: Map<string, string>;
vi.mock("@/lib/notesApi", () => {
  const missing = (path: string) => ({
    code: "not_found",
    message: `“${path}” no longer exists.`,
  });
  return {
    listNotes: vi.fn(async () => []),
    readNote: vi.fn(async (path: string) => {
      const text = disk.get(path);
      if (text === undefined) throw missing(path);
      return text;
    }),
    writeNote: vi.fn(async (path: string, text: string) => {
      if (!disk.has(path)) throw missing(path);
      disk.set(path, text);
    }),
    createEntry: vi.fn(async (parent: string, kind: string, name: string) => {
      const path = parent ? `${parent}/${name}` : name;
      if (kind === "folder") return path;
      if (disk.has(path)) {
        throw {
          code: "name_taken",
          message: `A file named “${name}” already exists in this folder.`,
        };
      }
      disk.set(path, "");
      return path;
    }),
    renameEntry: vi.fn(async (path: string, newName: string) => {
      const to = path.replace(/[^/]*$/, newName);
      disk.set(to, disk.get(path) ?? "");
      disk.delete(path);
      return to;
    }),
    moveEntry: vi.fn(),
    deleteEntry: vi.fn(async (path: string) => {
      disk.delete(path);
    }),
    searchNotes: vi.fn(),
  };
});

const api = vi.mocked(notesApi);

let app: AppBridge;
let context: ToolContext;

beforeEach(() => {
  vi.clearAllMocks();
  disk = new Map([
    ["Ogres.md", "Ogres live in the hills.\nOgres eat goats.\nThe end."],
    ["Keep.md", "A keep."],
  ]);
  app = {
    notesFolder: () => "/notes",
    openNote: () => null,
    flushOpenNote: vi.fn(async () => true),
    showNote: vi.fn(),
    pathChanged: vi.fn(),
    addRoll: vi.fn(),
  };
  context = { app, reads: new Map(), notifyOnce: vi.fn() };
});

// Runs a tool call as the chat does, in Auto mode.
const call = (name: string, args: Record<string, unknown>) =>
  runToolCall(
    toolRegistry,
    { id: "call_1", name, arguments: JSON.stringify(args) },
    { mode: "auto", approve: async () => true, context },
  );

// Runs a tool call in Manual mode. `whileShown` runs while its card is shown.
const callManually = (
  name: string,
  args: Record<string, unknown>,
  whileShown: () => void = () => {},
) =>
  runToolCall(
    toolRegistry,
    { id: "call_1", name, arguments: JSON.stringify(args) },
    {
      mode: "manual",
      approve: async () => {
        whileShown();
        return true;
      },
      context,
    },
  );

const preview = (name: string, args: Record<string, unknown>) => {
  const tool = toolRegistry.get(name);
  if (!tool?.preview) throw new Error(`${name} has no preview`);
  return tool.preview(args, context);
};

describe("notes_edit", () => {
  it("fails when old_text is not in the note, and writes nothing", async () => {
    const output = await call("notes_edit", {
      path: "Ogres.md",
      old_text: "Giants",
      new_text: "Trolls",
    });
    expect(output).toEqual({
      content:
        'old_text was not found in "Ogres.md". Read the note and copy the text exactly.',
      isError: true,
    });
    expect(api.writeNote).not.toHaveBeenCalled();
  });

  it("fails when old_text matches twice without replace_all", async () => {
    const output = await call("notes_edit", {
      path: "Ogres.md",
      old_text: "Ogres",
      new_text: "Trolls",
    });
    expect(output.isError).toBe(true);
    expect(output.content).toContain("old_text appears 2 times");
    expect(disk.get("Ogres.md")).toBe(
      "Ogres live in the hills.\nOgres eat goats.\nThe end.",
    );
  });

  it("replaces every match with replace_all", async () => {
    const output = await call("notes_edit", {
      path: "Ogres.md",
      old_text: "Ogres",
      new_text: "Trolls",
      replace_all: true,
    });
    expect(output).toEqual({ content: 'Edited "Ogres.md".', isError: false });
    expect(disk.get("Ogres.md")).toBe(
      "Trolls live in the hills.\nTrolls eat goats.\nThe end.",
    );
  });

  it("replaces a single match and shows the change in its preview", async () => {
    const args = {
      path: "Ogres.md",
      old_text: "eat goats",
      new_text: "eat sheep",
    };
    expect(await preview("notes_edit", args)).toEqual({
      target: "Ogres.md",
      diff: " Ogres live in the hills.\n-Ogres eat goats.\n+Ogres eat sheep.\n The end.",
      seen: "Ogres live in the hills.\nOgres eat goats.\nThe end.",
    });
    expect((await call("notes_edit", args)).isError).toBe(false);
    expect(disk.get("Ogres.md")).toBe(
      "Ogres live in the hills.\nOgres eat sheep.\nThe end.",
    );
  });
});

describe("notes_write", () => {
  const replace = () =>
    call("notes_write", { path: "Ogres.md", text: "All new." });

  it("fails when the agent has not read the note in this chat", async () => {
    expect(await replace()).toEqual({
      content: 'Read "Ogres.md" with notes_read before you replace it.',
      isError: true,
    });
    expect(api.writeNote).not.toHaveBeenCalled();
  });

  it("fails when the note changed after the read", async () => {
    await call("notes_read", { path: "Ogres.md" });
    disk.set("Ogres.md", "The user changed this.");

    const output = await replace();
    expect(output.isError).toBe(true);
    expect(output.content).toBe(
      '"Ogres.md" changed since you read it. Read it again with notes_read before you replace it.',
    );
    expect(disk.get("Ogres.md")).toBe("The user changed this.");
  });

  it("replaces a note the agent read, and may replace it again", async () => {
    await call("notes_read", { path: "Ogres.md" });
    expect(
      await preview("notes_write", { path: "Ogres.md", text: "All new." }),
    ).toEqual({
      target: "Ogres.md",
      diff: "-Ogres live in the hills.\n-Ogres eat goats.\n-The end.\n+All new.",
      seen: "Ogres live in the hills.\nOgres eat goats.\nThe end.",
    });

    expect(await replace()).toEqual({
      content: 'Replaced the text of "Ogres.md".',
      isError: false,
    });
    expect(disk.get("Ogres.md")).toBe("All new.");
    // Its own write doesn't count as a change by someone else.
    expect(
      (await call("notes_write", { path: "Ogres.md", text: "Again." })).isError,
    ).toBe(false);
  });

  it("fails after an edit to a note that changed since the read", async () => {
    await call("notes_read", { path: "Ogres.md" });
    disk.set("Ogres.md", "The user changed this.\nThe end.");
    const edit = await call("notes_edit", {
      path: "Ogres.md",
      old_text: "The end.",
      new_text: "Fin.",
    });
    expect(edit.isError).toBe(false);

    expect((await replace()).isError).toBe(true);
    expect(disk.get("Ogres.md")).toBe("The user changed this.\nFin.");
  });

  it("may follow an edit to a note that is as the agent read it", async () => {
    await call("notes_read", { path: "Ogres.md" });
    await call("notes_edit", {
      path: "Ogres.md",
      old_text: "The end.",
      new_text: "Fin.",
    });
    expect((await replace()).isError).toBe(false);
  });

  it("fails after notes_create, which is not a read", async () => {
    await call("notes_create", { path: "Lair.md", text: "Dark." });
    expect(
      await call("notes_write", { path: "Lair.md", text: "Light." }),
    ).toEqual({
      content: 'Read "Lair.md" with notes_read before you replace it.',
      isError: true,
    });
    expect(disk.get("Lair.md")).toBe("Dark.");
  });

  it("forgets reads when the chat's record is new", async () => {
    await call("notes_read", { path: "Ogres.md" });
    context = { ...context, reads: new Map() };
    expect((await replace()).isError).toBe(true);
  });
});

describe("a note that changes while its card is shown", () => {
  const changed = {
    content: "The note changed while waiting for approval. Read it again.",
    isError: true,
  };

  it("is not edited", async () => {
    const output = await callManually(
      "notes_edit",
      { path: "Ogres.md", old_text: "The end.", new_text: "Fin." },
      () => disk.set("Ogres.md", "Ogres eat goats.\nThe end."),
    );
    expect(output).toEqual(changed);
    expect(api.writeNote).not.toHaveBeenCalled();
    expect(disk.get("Ogres.md")).toBe("Ogres eat goats.\nThe end.");
  });

  it("is not replaced", async () => {
    await call("notes_read", { path: "Ogres.md" });
    const output = await callManually(
      "notes_write",
      { path: "Ogres.md", text: "All new." },
      () => disk.set("Ogres.md", "The user changed this."),
    );
    expect(output).toEqual(changed);
    expect(disk.get("Ogres.md")).toBe("The user changed this.");
  });

  it("is not edited, with the same error, when old_text no longer matches", async () => {
    const output = await callManually(
      "notes_edit",
      { path: "Ogres.md", old_text: "The end.", new_text: "Fin." },
      () => disk.set("Ogres.md", "The user rewrote all of it."),
    );
    expect(output).toEqual(changed);
    expect(api.writeNote).not.toHaveBeenCalled();
  });

  it("that stays the same is edited as approved", async () => {
    const output = await callManually("notes_edit", {
      path: "Ogres.md",
      old_text: "The end.",
      new_text: "Fin.",
    });
    expect(output.isError).toBe(false);
    expect(disk.get("Ogres.md")).toBe(
      "Ogres live in the hills.\nOgres eat goats.\nFin.",
    );
  });
});

describe("the open note", () => {
  beforeEach(() => {
    app.openNote = () => "Ogres.md";
  });

  it("is saved before an edit to it", async () => {
    const order: string[] = [];
    app.flushOpenNote = async () => {
      order.push("flush");
      return true;
    };
    api.readNote.mockImplementationOnce(async (path) => {
      order.push("read");
      return disk.get(path) ?? "";
    });
    await call("notes_edit", {
      path: "Ogres.md",
      old_text: "The end.",
      new_text: "Fin.",
    });
    expect(order).toEqual(["flush", "read"]);
  });

  it("is not changed when its edit can't be saved", async () => {
    app.flushOpenNote = async () => false;
    for (const [name, args] of [
      [
        "notes_edit",
        { path: "Ogres.md", old_text: "The end.", new_text: "Fin." },
      ],
      ["notes_rename", { path: "Ogres.md", new_name: "Trolls.md" }],
    ] as const) {
      const output = await call(name, args);
      expect(output.isError).toBe(true);
      expect(output.content).toContain(
        `The user's unsaved edit to "Ogres.md" couldn't be saved`,
      );
    }
    expect(api.writeNote).not.toHaveBeenCalled();
    expect(api.renameEntry).not.toHaveBeenCalled();
    expect(disk.get("Ogres.md")).toContain("The end.");
  });

  it("is saved before it, or its folder, is deleted", async () => {
    for (const [open, path] of [
      ["Ogres.md", "Ogres.md"],
      ["Lore/Ogres.md", "Lore"],
    ]) {
      vi.clearAllMocks();
      app.openNote = () => open;
      const order: string[] = [];
      app.flushOpenNote = async () => {
        order.push("flush");
        return true;
      };
      api.deleteEntry.mockImplementationOnce(async () => {
        order.push("delete");
      });
      expect((await call("notes_delete", { path })).isError).toBe(false);
      expect(order).toEqual(["flush", "delete"]);
      expect(app.pathChanged).toHaveBeenCalledWith(path, null);
    }
  });

  it("stops the delete of it, or its folder, when it can't be saved", async () => {
    app.flushOpenNote = async () => false;
    for (const [open, path] of [
      ["Ogres.md", "Ogres.md"],
      ["Lore/Ogres.md", "Lore"],
    ]) {
      app.openNote = () => open;
      expect(await call("notes_delete", { path })).toEqual({
        content: `The user's unsaved edit to "${open}" couldn't be saved, so it wasn't deleted. Tell the user.`,
        isError: true,
      });
    }
    expect(api.deleteEntry).not.toHaveBeenCalled();
    expect(app.pathChanged).not.toHaveBeenCalled();
  });

  it("is not saved when another note is deleted", async () => {
    await call("notes_delete", { path: "Keep.md" });
    expect(app.flushOpenNote).not.toHaveBeenCalled();
    expect(api.deleteEntry).toHaveBeenCalledWith("Keep.md");
  });

  it("is not saved for an edit to another note", async () => {
    await call("notes_edit", {
      path: "Keep.md",
      old_text: "keep",
      new_text: "fort",
    });
    expect(app.flushOpenNote).not.toHaveBeenCalled();
    expect(disk.get("Keep.md")).toBe("A fort.");
  });
});

describe("the other notes tools", () => {
  it("notes_create makes a note with text and refuses an existing path", async () => {
    expect(
      await preview("notes_create", { path: "Lair.md", text: "Dark.\nDamp." }),
    ).toEqual({
      target: "Lair.md",
      diff: "+Dark.\n+Damp.",
      seen: "",
    });
    expect(
      await call("notes_create", { path: "Lair.md", text: "Dark." }),
    ).toEqual({
      content: 'Created "Lair.md".',
      isError: false,
    });
    expect(disk.get("Lair.md")).toBe("Dark.");

    const again = await call("notes_create", { path: "Keep.md", text: "x" });
    expect(again).toEqual({
      content: "A file named “Keep.md” already exists in this folder.",
      isError: true,
    });
    expect(disk.get("Keep.md")).toBe("A keep.");
    expect(
      (await call("notes_create", { path: "Lair", text: "x" })).content,
    ).toBe("A note's path must end in .md.");
  });

  it("notes_create makes the missing folders above the note, and lists them first", async () => {
    api.listNotes.mockResolvedValue([
      { kind: "folder", name: "Lore", path: "Lore", children: [] },
    ] as never);
    const args = { path: "Lore/Ogres/Hill/Lair.md", text: "Dark." };
    expect((await preview("notes_create", args)).target).toBe(
      "Lore/Ogres/Hill/Lair.md (new folders: Lore/Ogres, Lore/Ogres/Hill)",
    );

    expect((await call("notes_create", args)).isError).toBe(false);
    expect(api.createEntry.mock.calls).toEqual([
      ["Lore", "folder", "Ogres"],
      ["Lore/Ogres", "folder", "Hill"],
      ["Lore/Ogres/Hill", "file", "Lair.md"],
    ]);
    expect(disk.get("Lore/Ogres/Hill/Lair.md")).toBe("Dark.");

    // A folder the card didn't list is not made.
    api.createEntry.mockClear();
    const output = await callManually(
      "notes_create",
      { path: "Lore/Lair.md", text: "Dark." },
      () => api.listNotes.mockResolvedValue([]),
    );
    expect(output).toEqual({
      content: "The folders changed while waiting for approval. Try again.",
      isError: true,
    });
    expect(api.createEntry).not.toHaveBeenCalled();
    expect(disk.has("Lore/Lair.md")).toBe(false);
    api.listNotes.mockResolvedValue([
      { kind: "folder", name: "Lore", path: "Lore", children: [] },
    ] as never);

    // A note in a folder that exists makes none.
    expect(
      (await preview("notes_create", { path: "Lore/A.md", text: "" })).target,
    ).toBe("Lore/A.md");
  });

  it("notes_rename, notes_move and notes_delete preview the source and target", async () => {
    expect(
      await preview("notes_rename", {
        path: "Lore/Ogres.md",
        new_name: "Trolls.md",
      }),
    ).toEqual({
      target: "Lore/Ogres.md → Lore/Trolls.md",
    });
    expect(
      await preview("notes_move", { path: "Lore/Ogres.md", new_parent: "" }),
    ).toEqual({
      target: "Lore/Ogres.md → Ogres.md",
    });
    expect(await preview("notes_delete", { path: "Lore" })).toEqual({
      target: "Lore → Trash",
    });
  });

  it("notes_rename moves the selection and the read record", async () => {
    await call("notes_read", { path: "Ogres.md" });
    await call("notes_rename", { path: "Ogres.md", new_name: "Trolls.md" });
    expect(app.pathChanged).toHaveBeenCalledWith("Ogres.md", "Trolls.md");
    // The read moves with the note, so the agent can still replace it.
    expect(
      (await call("notes_write", { path: "Trolls.md", text: "x" })).isError,
    ).toBe(false);
  });

  it("notes_search lists matches and says when it cut them", async () => {
    api.searchNotes.mockResolvedValueOnce({
      matches: [{ path: "Ogres.md", line: 2, snippet: "Ogres eat goats." }],
      truncated: true,
    });
    expect((await call("notes_search", { query: "ogres" })).content).toBe(
      "Ogres.md:2: Ogres eat goats.\nOnly the first 1 matches are shown. Search for something narrower to see others.",
    );
    api.searchNotes.mockResolvedValueOnce({ matches: [], truncated: false });
    expect((await call("notes_search", { query: "x" })).content).toBe(
      "No matches.",
    );
  });

  it("notes_open saves the open note, then opens the other one", async () => {
    app.openNote = () => "Keep.md";
    expect(await call("notes_open", { path: "Ogres.md" })).toEqual({
      content: 'Opened "Ogres.md".',
      isError: false,
    });
    expect(app.flushOpenNote).toHaveBeenCalled();
    expect(app.showNote).toHaveBeenCalledWith("Ogres.md");

    expect((await call("notes_open", { path: "Gone.md" })).isError).toBe(true);
    expect(app.showNote).toHaveBeenCalledTimes(1);
  });
});
