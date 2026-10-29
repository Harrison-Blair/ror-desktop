import { EditorView } from "@codemirror/view";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { Entry } from "@/lib/notesApi";
import * as notesApi from "@/lib/notesApi";

// The notes folder lives on disk behind Tauri; these tests need an empty one.
vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => notesList,
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
  readNote: async (path: string) => disk[path] ?? `# ${path}`,
  writeNote: async (path: string, text: string) => {
    if (diskFull) throw { code: "io", message: "Disk full." };
    if (!(path in disk)) throw { code: "not_found", message: "Not found." };
    disk[path] = text;
  },
  renameEntry: vi.fn(async (path: string, newName: string) =>
    moveOnDisk(path, path.replace(/[^/]*$/, newName)),
  ),
  moveEntry: vi.fn(async (path: string, newParent: string) =>
    moveOnDisk(path, `${newParent}/${path.slice(path.lastIndexOf("/") + 1)}`),
  ),
  // Switches to the other folder, as the backend does before the app hears
  // of the new folder.
  chooseNotesFolder: vi.fn(async () => {
    [disk, otherDisk] = [otherDisk, disk];
    return "/other";
  }),
}));

const api = vi.mocked(notesApi);

let notesList: Entry[] = [];
// Note texts by path, for the tests that edit notes.
let disk: Record<string, string> = {};
// The texts in the folder that the picker switches to.
let otherDisk: Record<string, string> = {};
let diskFull = false;
beforeEach(() => {
  vi.clearAllMocks();
  notesList = [];
  disk = {};
  otherDisk = {};
  diskFull = false;
});

const moveOnDisk = (from: string, to: string) => {
  disk[to] = disk[from];
  delete disk[from];
  return to;
};

function renderApp() {
  render(<App />);
  return userEvent.setup();
}

describe("App frame", () => {
  it("shows the Session, World and Notes tabs in order, then Dice and Settings at the bottom", () => {
    renderApp();
    const rail = screen.getByRole("navigation", { name: "Main" });
    const railButtons = within(rail)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));

    expect(railButtons).toEqual([
      "Hide rail panel",
      "Session",
      "World",
      "Notes",
      "Dice",
      "Settings",
    ]);
  });

  it("Settings is not a tab and clicking it shows a not-implemented error", async () => {
    const user = renderApp();
    const settings = screen.getByRole("button", { name: "Settings" });
    expect(settings).not.toHaveAttribute("aria-pressed");

    await user.click(settings);

    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByRole(
        "alert",
      ),
    ).toHaveTextContent("Settings is not implemented yet.");
    expect(
      screen.getByRole("button", { name: "Notes", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Notes rail panel" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Dice" }),
    ).not.toBeInTheDocument();
    expect(settings).not.toHaveAttribute("aria-pressed");
  });

  it("the Dice panel starts closed, and Dice opens and closes it", async () => {
    const user = renderApp();
    const dice = screen.getByRole("button", { name: "Dice", pressed: false });
    expect(
      screen.queryByRole("complementary", { name: "Dice" }),
    ).not.toBeInTheDocument();

    await user.click(dice);
    expect(
      screen.getByRole("complementary", { name: "Dice" }),
    ).toBeInTheDocument();
    expect(dice).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Notes", pressed: true }),
    ).toBeInTheDocument();

    await user.click(dice);
    expect(
      screen.queryByRole("complementary", { name: "Dice" }),
    ).not.toBeInTheDocument();
    expect(dice).toHaveAttribute("aria-pressed", "false");
  });

  it("closing the Dice panel with its X removes it and unpresses Dice", async () => {
    const user = renderApp();
    await user.click(screen.getByRole("button", { name: "Dice" }));

    await user.click(screen.getByRole("button", { name: "Close Dice" }));

    expect(
      screen.queryByRole("complementary", { name: "Dice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dice", pressed: false }),
    ).toBeInTheDocument();
  });

  it("keeps the dice history after the Dice panel closes and reopens", async () => {
    const user = renderApp();
    const dice = screen.getByRole("button", { name: "Dice" });
    await user.click(dice);
    await user.click(screen.getByRole("button", { name: /Roll d100/ }));
    const history = () =>
      within(screen.getByRole("region", { name: "Last 10 rolls" }));
    expect(history().getAllByRole("listitem")).toHaveLength(1);

    await user.click(dice);
    await user.click(dice);

    expect(history().getAllByRole("listitem")).toHaveLength(1);
  });

  it.each(["Session", "World"])(
    "%s is not implemented: clicking it shows an error and leaves Notes active",
    async (name) => {
      const user = renderApp();

      await user.click(screen.getByRole("button", { name }));

      expect(
        within(screen.getByRole("region", { name: "Notifications" })).getByRole(
          "alert",
        ),
      ).toHaveTextContent(`${name} is not implemented yet.`);
      expect(
        screen.getByRole("button", { name, pressed: false }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Notes", pressed: true }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: "Notes rail panel" }),
      ).toBeInTheDocument();
    },
  );

  it("selecting the active rail item hides and then shows the rail panel", async () => {
    const user = renderApp();
    const active = screen.getByRole("button", { name: "Notes" });

    await user.click(active);
    expect(
      screen.queryByRole("region", { name: "Notes rail panel" }),
    ).not.toBeInTheDocument();

    await user.click(active);
    expect(
      screen.getByRole("region", { name: "Notes rail panel" }),
    ).toBeInTheDocument();
  });

  it("toggle button hides and shows the rail panel and updates its label", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "Hide rail panel", expanded: true }),
    );
    expect(
      screen.queryByRole("region", { name: "Notes rail panel" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show rail panel", expanded: false }),
    );
    expect(
      screen.getByRole("region", { name: "Notes rail panel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide rail panel" }),
    ).toBeInTheDocument();
  });

  it("opens the selected note in the main panel", async () => {
    notesList = [{ kind: "file", name: "Ada.md", path: "Ada.md" }];
    const user = renderApp();
    expect(screen.getByRole("main")).toHaveTextContent("No note open");

    await user.click(
      (await screen.findByRole("treeitem", { name: "Ada.md" }))
        .firstElementChild as HTMLElement,
    );

    expect(
      await within(screen.getByRole("main")).findByRole("textbox", {
        name: "Ada.md",
      }),
    ).toHaveTextContent(/^Ada\.md$/);
  });

  it("keeps open folders and the selection after the rail panel closes and reopens", async () => {
    notesList = [
      {
        kind: "folder",
        name: "People",
        path: "People",
        children: [{ kind: "file", name: "Ada.md", path: "People/Ada.md" }],
      },
    ];
    const user = renderApp();
    await user.click(
      (await screen.findByRole("treeitem", { name: "People" }))
        .firstElementChild as HTMLElement,
    );
    await user.click(
      screen.getByRole("treeitem", { name: "Ada.md" })
        .firstElementChild as HTMLElement,
    );
    const notes = screen.getByRole("button", { name: "Notes" });

    await user.click(notes);
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    await user.click(notes);

    expect(
      await screen.findByRole("treeitem", { name: "People", expanded: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: "Ada.md", selected: true }),
    ).toBeInTheDocument();
  });

  it("the Notes rail panel shows the notes tree and its New note and New folder buttons", async () => {
    renderApp();
    const railPanel = screen.getByRole("region", { name: "Notes rail panel" });

    expect(
      await within(railPanel).findByRole("tree", { name: "Notes" }),
    ).toBeInTheDocument();
    expect(
      within(railPanel).getByRole("button", { name: "New note" }),
    ).toBeInTheDocument();
    expect(
      within(railPanel).getByRole("button", { name: "New folder" }),
    ).toBeInTheDocument();
  });

  describe("an edit saved before its note is renamed or moved", () => {
    beforeEach(() => {
      disk = { "Ada.md": "Hello" };
    });

    // Opens Ada.md and types into it, leaving the save pending.
    async function editAda() {
      const user = renderApp();
      await user.click(
        (await screen.findByRole("treeitem", { name: "Ada.md" }))
          .firstElementChild as HTMLElement,
      );
      const content = await within(screen.getByRole("main")).findByRole(
        "textbox",
        { name: "Ada.md" },
      );
      await waitFor(() => expect(content).toHaveTextContent("Hello"));
      act(() => {
        EditorView.findFromDOM(content)?.dispatch({
          changes: { from: 5, insert: "!" },
        });
      });
      return user;
    }

    const shownText = async (name: string) =>
      EditorView.findFromDOM(
        await within(screen.getByRole("main")).findByRole("textbox", { name }),
      )?.state.doc.toString();

    it("keeps an edit made just before a rename", async () => {
      notesList = [{ kind: "file", name: "Ada.md", path: "Ada.md" }];
      const user = await editAda();
      notesList = [{ kind: "file", name: "Bea.md", path: "Bea.md" }];

      await user.keyboard("{F2}{Control>}a{/Control}Bea.md{Enter}");

      expect(await shownText("Bea.md")).toBe("Hello!");
      expect(disk).toEqual({ "Bea.md": "Hello!" });
    });

    it("keeps an edit made just before a move", async () => {
      notesList = [
        { kind: "folder", name: "Lore", path: "Lore", children: [] },
        { kind: "file", name: "Ada.md", path: "Ada.md" },
      ];
      await editAda();
      notesList = [
        {
          kind: "folder",
          name: "Lore",
          path: "Lore",
          children: [{ kind: "file", name: "Ada.md", path: "Lore/Ada.md" }],
        },
      ];

      const row = (name: string) =>
        screen.getByRole("treeitem", { name }).firstElementChild as Element;
      document.elementFromPoint = () => row("Lore");
      fireEvent.pointerDown(row("Ada.md"), {
        button: 0,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, { clientX: 30, clientY: 40 });
      fireEvent.pointerUp(window, { clientX: 30, clientY: 40 });

      await waitFor(() => expect(disk).toEqual({ "Lore/Ada.md": "Hello!" }));
      expect(await shownText("Ada.md")).toBe("Hello!");
    });

    const toast = () =>
      within(screen.getByRole("region", { name: "Notifications" }));

    it("cancels a rename when the edit can't be saved", async () => {
      notesList = [{ kind: "file", name: "Ada.md", path: "Ada.md" }];
      const user = await editAda();
      diskFull = true;

      await user.keyboard("{F2}{Control>}a{/Control}Bea.md{Enter}");

      expect(
        await toast().findByText(
          "Couldn't save “Ada.md”, so it wasn't renamed.",
        ),
      ).toBeInTheDocument();
      expect(api.renameEntry).not.toHaveBeenCalled();
      expect(disk).toEqual({ "Ada.md": "Hello" });
      expect(await shownText("Ada.md")).toBe("Hello!");
      // The rename box closes.
      expect(
        within(screen.getByRole("tree")).queryByRole("textbox"),
      ).toBeNull();
    });

    it("cancels a move when the edit can't be saved", async () => {
      notesList = [
        { kind: "folder", name: "Lore", path: "Lore", children: [] },
        { kind: "file", name: "Ada.md", path: "Ada.md" },
      ];
      await editAda();
      diskFull = true;

      const row = (name: string) =>
        screen.getByRole("treeitem", { name }).firstElementChild as Element;
      document.elementFromPoint = () => row("Lore");
      fireEvent.pointerDown(row("Ada.md"), {
        button: 0,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, { clientX: 30, clientY: 40 });
      fireEvent.pointerUp(window, { clientX: 30, clientY: 40 });

      expect(
        await toast().findByText("Couldn't save “Ada.md”, so it wasn't moved."),
      ).toBeInTheDocument();
      expect(api.moveEntry).not.toHaveBeenCalled();
      expect(disk).toEqual({ "Ada.md": "Hello" });
      expect(await shownText("Ada.md")).toBe("Hello!");
    });

    it("saves an edit to the old folder before switching folders", async () => {
      notesList = [{ kind: "file", name: "Ada.md", path: "Ada.md" }];
      otherDisk = { "Ada.md": "Other" };
      const user = await editAda();
      const oldDisk = disk;

      await user.click(
        screen.getByRole("button", { name: "Choose notes folder" }),
      );

      await waitFor(() =>
        expect(screen.getByRole("main")).toHaveTextContent("No note open"),
      );
      expect(oldDisk).toEqual({ "Ada.md": "Hello!" });
      expect(disk).toEqual({ "Ada.md": "Other" });
    });

    it("keeps the folder when the edit can't be saved", async () => {
      notesList = [{ kind: "file", name: "Ada.md", path: "Ada.md" }];
      const user = await editAda();
      diskFull = true;

      await user.click(
        screen.getByRole("button", { name: "Choose notes folder" }),
      );

      expect(
        await toast().findByText(
          "Couldn't save “Ada.md”, so the notes folder wasn't changed.",
        ),
      ).toBeInTheDocument();
      expect(api.chooseNotesFolder).not.toHaveBeenCalled();
      expect(await shownText("Ada.md")).toBe("Hello!");
    });
  });
});
