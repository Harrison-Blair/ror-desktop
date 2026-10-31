import { EditorView } from "@codemirror/view";
import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { ChatEvent, Send } from "@/lib/chat/chatApi";
import * as chatApi from "@/lib/chat/chatApi";
import type { ToolCall } from "@/lib/chat/gate";
import * as notesApi from "@/lib/notesApi";
import * as webApi from "@/lib/webApi";
import { character, resetPeople, store } from "@/test/fakePeople";

// The real tools run against a fake disk of note texts by path.
let disk: Map<string, string>;
vi.mock("@/lib/notesApi", () => ({
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
  listNotes: vi.fn(async () =>
    [...disk.keys()].map((path) => ({ kind: "file", name: path, path })),
  ),
  onNotesChanged: async () => () => {},
  readNote: vi.fn(async (path: string) => {
    const text = disk.get(path);
    if (text === undefined) throw { message: `“${path}” no longer exists.` };
    return text;
  }),
  writeNote: vi.fn(async (path: string, text: string) => {
    disk.set(path, text);
  }),
  renameEntry: vi.fn(async (path: string, newName: string) => {
    disk.set(newName, disk.get(path) ?? "");
    disk.delete(path);
    return newName;
  }),
}));

vi.mock("@/lib/peopleApi", async () =>
  (await import("@/test/fakePeople")).mockModule(),
);

vi.mock("@/lib/webApi", () => ({ webSearch: vi.fn(), webFetch: vi.fn() }));

// Rust is not there in tests: each turn waits until the test ends it.
let turn: { send: Send; end: () => void } | null = null;
vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    backend: "opencode-go",
    permissionMode: "auto",
  })),
  latestChat: vi.fn(async () => null),
  savePermissionMode: vi.fn(async () => {}),
  sendMessage: vi.fn(
    (send: Send) =>
      new Promise((resolve) => {
        turn = { send, end: () => resolve({ chatId: "chat-1", end: "done" }) };
      }),
  ),
  sendToolResult: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
}));

const chat = vi.mocked(chatApi);
const notes = vi.mocked(notesApi);
const web = vi.mocked(webApi);

beforeEach(() => {
  vi.clearAllMocks();
  turn = null;
  disk = new Map([["Ogres.md", "Ogres eat goats."]]);
  resetPeople();
  store.characters = [character("Otto Brandt", { birthDate: "1904-01-21" })];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function startTurn(before?: (user: UserEvent) => Promise<void>) {
  const user = userEvent.setup();
  render(<App />);
  await before?.(user);
  await user.click(screen.getByRole("button", { name: "Chat" }));
  await screen.findByRole("button", { name: "Model: glm-5.3" });
  await user.type(
    screen.getByRole("textbox", { name: "Message" }),
    "Go{Enter}",
  );
  return user;
}

let calls = 0;
// Runs a tool call from the model and waits for its result.
async function runTool(name: string, args: Record<string, unknown>) {
  const call: ToolCall = {
    id: `call_${++calls}`,
    name,
    arguments: JSON.stringify(args),
  };
  const token = `token-${calls}`;
  const event: ChatEvent = { type: "toolCall", call, token };
  act(() => turn?.send.onEvent(event));
  await vi.waitFor(() =>
    expect(chat.sendToolResult).toHaveBeenCalledWith(token, expect.anything()),
  );
  const result = chat.sendToolResult.mock.calls.find(([t]) => t === token);
  return result?.[1];
}

// Types at the end of the open note, as a person would.
const typeInNote = (name: string, text: string) =>
  act(() => {
    const view = EditorView.findFromDOM(screen.getByRole("textbox", { name }));
    if (!view) throw new Error(`No editor for ${name}`);
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  });

describe("chat tools in the app", () => {
  it("an edit to the open note saves the user's typing first", async () => {
    await startTurn();
    expect(await runTool("notes_open", { path: "Ogres.md" })).toEqual({
      content: 'Opened "Ogres.md".',
      isError: false,
    });
    await screen.findByRole("textbox", { name: "Ogres.md" });

    // The editor saves 500 ms after typing stops: the tool comes sooner.
    typeInNote("Ogres.md", " And sheep.");
    const output = await runTool("notes_edit", {
      path: "Ogres.md",
      old_text: "goats",
      new_text: "cabbages",
    });

    expect(output).toEqual({ content: 'Edited "Ogres.md".', isError: false });
    expect(notes.writeNote.mock.calls).toEqual([
      ["Ogres.md", "Ogres eat goats. And sheep."],
      ["Ogres.md", "Ogres eat cabbages. And sheep."],
    ]);
    expect(disk.get("Ogres.md")).toBe("Ogres eat cabbages. And sheep.");
  });

  it("an edit to the open note fails when the typing can't be saved", async () => {
    await startTurn();
    await runTool("notes_open", { path: "Ogres.md" });
    await screen.findByRole("textbox", { name: "Ogres.md" });
    notes.writeNote.mockRejectedValue({ message: "Disk full." });

    typeInNote("Ogres.md", " And sheep.");
    const output = await runTool("notes_edit", {
      path: "Ogres.md",
      old_text: "goats",
      new_text: "cabbages",
    });

    expect(output?.isError).toBe(true);
    expect(output?.content).toContain(
      `The user's unsaved edit to "Ogres.md" couldn't be saved, so the note wasn't edited.`,
    );
    // Only the editor tried to save. The note is as it was.
    expect(notes.writeNote.mock.calls).toEqual([
      ["Ogres.md", "Ogres eat goats. And sheep."],
    ]);
    expect(disk.get("Ogres.md")).toBe("Ogres eat goats.");
  });

  it("renaming the open note keeps it open under its new name", async () => {
    await startTurn();
    await runTool("notes_open", { path: "Ogres.md" });
    await screen.findByRole("textbox", { name: "Ogres.md" });

    await runTool("notes_rename", { path: "Ogres.md", new_name: "Trolls.md" });
    expect(
      await screen.findByRole("textbox", { name: "Trolls.md" }),
    ).toBeInTheDocument();
  });

  it("dice_roll adds the roll to the Dice history", async () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
      (values) => {
        (values as Uint32Array).fill(0);
        return values;
      },
    );
    const user = await startTurn();

    expect(await runTool("dice_roll", { notation: "2d6 + 3" })).toEqual({
      content: "2d6 + 3: 2d6 (1, 1) + 3 = 5",
      isError: false,
    });

    await user.click(screen.getByRole("button", { name: "Dice" }));
    const history = screen.getByRole("region", { name: "Last 10 rolls" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("2d6 (1, 1) + 3 = 5");
  });

  it("web_search without a Tavily key fails and raises one toast per turn", async () => {
    web.webSearch.mockRejectedValue({
      code: "missingKey",
      message: "No Tavily key is saved. The user must add a Tavily key.",
    });
    const user = await startTurn();
    const missing = {
      content: "No Tavily key is saved. The user must add a Tavily key.",
      isError: true,
    };
    const toast = () =>
      screen.queryByText(
        "Add a Tavily key in Settings to let the chat search the web.",
      );

    expect(await runTool("web_search", { query: "ogres" })).toEqual(missing);
    expect(toast()).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    // A second search in the same turn raises no toast.
    expect(await runTool("web_search", { query: "trolls" })).toEqual(missing);
    expect(toast()).not.toBeInTheDocument();

    // The next turn raises it again.
    act(() => turn?.end());
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Again{Enter}",
    );
    await runTool("web_search", { query: "giants" });
    expect(toast()).toBeInTheDocument();
  });

  it("web_search lists title, URL and snippet", async () => {
    web.webSearch.mockResolvedValue([
      { title: "Ogre", url: "https://x.y/ogre", snippet: "Big." },
      { title: "Troll", url: "https://x.y/troll", snippet: "Green." },
    ]);
    await startTurn();
    expect((await runTool("web_search", { query: "ogres" }))?.content).toBe(
      "1. Ogre\n   https://x.y/ogre\n   Big.\n\n2. Troll\n   https://x.y/troll\n   Green.",
    );
  });
});

describe("people tools in the app", () => {
  const main = () => within(screen.getByRole("main"));
  const openWorld = async (user: UserEvent) => {
    await user.click(screen.getByRole("button", { name: "World" }));
    await main().findByRole("heading", { name: "People of interest" });
  };

  // Spec acceptance check 22.
  it("lists the people, then adds one after approval, and the list shows them", async () => {
    chat.getChatSettings.mockResolvedValueOnce({
      model: "glm-5.3",
      backend: "opencode-go",
      permissionMode: "manual",
    });
    await startTurn(openWorld);

    expect(await runTool("people_list", {})).toEqual({
      content:
        "id: otto-brandt | Otto Brandt | January 21, 1904 | places unknown | age 58",
      isError: false,
    });

    const added = runTool("people_create", {
      name: "Ada Lee",
      birth_date: "3 May 1920",
    });
    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(store.characters).toHaveLength(1);
    expect(
      main().queryByRole("button", { name: /^Ada Lee/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(approve);
    expect(await added).toEqual({
      content: "Created Ada Lee (person-1).",
      isError: false,
    });
    expect(
      await main().findByRole("button", { name: /^Ada Lee/ }),
    ).toBeInTheDocument();
  });

  it("people_open opens the sheet from the Notes tab", async () => {
    await startTurn();

    expect(await runTool("people_open", { id: "otto-brandt" })).toEqual({
      content: "Opened Otto Brandt (otto-brandt).",
      isError: false,
    });
    expect(
      await main().findByRole("heading", { name: /^Otto Brandt/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "World", pressed: true }),
    ).toBeInTheDocument();
  });

  it("people_open asks before it leaves a person form with changes", async () => {
    const user = await startTurn(async (user) => {
      await openWorld(user);
      await user.click(
        main().getAllByRole("button", { name: "Add person" })[0],
      );
      await user.type(main().getByLabelText("Name"), "Ada");
    });
    const discard = async () =>
      within(
        await screen.findByRole("alertdialog", { name: "Discard changes?" }),
      );

    const kept = runTool("people_open", { id: "otto-brandt" });
    await user.click((await discard()).getByRole("button", { name: "Cancel" }));
    expect(await kept).toEqual({
      content:
        "Otto Brandt's sheet wasn't opened: the user kept unsaved changes in a person form, or the open note couldn't be saved. Tell the user.",
      isError: true,
    });
    expect(main().getByLabelText("Name")).toHaveValue("Ada");

    const opened = runTool("people_open", { id: "otto-brandt" });
    await user.click(
      (await discard()).getByRole("button", { name: "Discard" }),
    );
    expect((await opened)?.isError).toBe(false);
    expect(
      await main().findByRole("heading", { name: /^Otto Brandt/ }),
    ).toBeInTheDocument();
  });
});
