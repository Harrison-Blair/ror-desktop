import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotesMenu,
  NotesMenuActions,
  type NotesMenuHandle,
} from "@/components/menus/NotesMenu/NotesMenu";
import { ToastProvider } from "@/components/Toast/Toast";
import type { Entry } from "@/lib/notesApi";
import * as notesApi from "@/lib/notesApi";

vi.mock("@/lib/notesApi", () => ({
  listNotes: vi.fn(),
  createEntry: vi.fn(),
  renameEntry: vi.fn(),
  moveEntry: vi.fn(),
  deleteEntry: vi.fn(),
  onNotesChanged: vi.fn(),
  chooseNotesFolder: vi.fn(),
}));

const api = vi.mocked(notesApi);

const sample = (): Entry[] => [
  {
    kind: "folder",
    name: "People",
    path: "People",
    children: [
      {
        kind: "folder",
        name: "Villains",
        path: "People/Villains",
        children: [
          { kind: "file", name: "Boss.md", path: "People/Villains/Boss.md" },
        ],
      },
      { kind: "file", name: "Ada.md", path: "People/Ada.md" },
      { kind: "file", name: "Ben.md", path: "People/Ben.md" },
    ],
  },
  { kind: "folder", name: "Places", path: "Places", children: [] },
  { kind: "file", name: "Chicago.md", path: "Chicago.md" },
];

let notesChanged: () => void;

function Harness() {
  const tree = useRef<NotesMenuHandle>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [folder, setFolder] = useState("/home/x/Notes");
  return (
    <ToastProvider>
      <NotesMenuActions
        folder={folder}
        onChooseFolder={() => tree.current?.chooseFolder()}
        onCreate={(kind) => tree.current?.startCreate(kind)}
      />
      <NotesMenu
        ref={tree}
        setFolder={setFolder}
        expanded={expanded}
        setExpanded={setExpanded}
        selected={selected}
        setSelected={setSelected}
      />
    </ToastProvider>
  );
}

async function renderTree() {
  const user = userEvent.setup();
  const view = render(<Harness />);
  await screen.findByRole("tree", { name: "Notes" });
  return { user, ...view };
}

async function renderLoaded() {
  const result = await renderTree();
  await screen.findByRole("treeitem", { name: "People" });
  return result;
}

const item = (name: string) => screen.getByRole("treeitem", { name });
const row = (name: string) => item(name).firstElementChild as HTMLElement;
const itemNames = (container: HTMLElement) =>
  within(container)
    .getAllByRole("treeitem")
    .filter((el) => el.parentElement === container)
    .map((el) => el.getAttribute("aria-label") ?? "(new)");
const focusItem = (name: string) => act(() => item(name).focus());

beforeEach(() => {
  vi.resetAllMocks();
  api.listNotes.mockImplementation(async () => sample());
  api.onNotesChanged.mockImplementation(async (handler) => {
    notesChanged = handler;
    return () => {};
  });
});

describe("NotesTree", () => {
  it("renders top-level folders and notes with tree roles and levels", async () => {
    const { user } = await renderLoaded();
    const tree = screen.getByRole("tree", { name: "Notes" });

    expect(itemNames(tree)).toEqual(["People", "Places", "Chicago.md"]);
    expect(item("People")).toHaveAttribute("aria-level", "1");
    expect(item("People")).toHaveAttribute("aria-expanded", "false");
    expect(item("Chicago.md")).not.toHaveAttribute("aria-expanded");
    expect(item("Chicago.md")).toHaveAttribute("aria-selected", "false");
    expect(row("Chicago.md")).toHaveTextContent("Chicago.md");
    expect(screen.getByTitle("Chicago.md")).toBeInTheDocument();

    await user.click(row("People"));

    const group = within(item("People")).getByRole("group");
    expect(itemNames(group)).toEqual(["Villains", "Ada.md", "Ben.md"]);
    expect(item("Villains")).toHaveAttribute("aria-level", "2");
    expect(item("Ada.md")).toHaveAttribute("aria-level", "2");
  });

  it("gives the tree a single tab stop", async () => {
    await renderLoaded();

    expect(item("People")).toHaveAttribute("tabindex", "0");
    expect(item("Places")).toHaveAttribute("tabindex", "-1");
    expect(item("Chicago.md")).toHaveAttribute("tabindex", "-1");
  });

  it("clicking a folder selects it and toggles it open and closed", async () => {
    const { user } = await renderLoaded();

    await user.click(row("People"));
    expect(item("People")).toHaveAttribute("aria-expanded", "true");
    expect(item("People")).toHaveAttribute("aria-selected", "true");

    await user.click(row("People"));
    expect(item("People")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: "Ada.md" })).toBeNull();
  });

  it("moves focus with the arrow keys, Home and End, and selects with Enter and Space", async () => {
    const { user } = await renderLoaded();
    focusItem("People");

    await user.keyboard("{ArrowRight}");
    expect(item("People")).toHaveAttribute("aria-expanded", "true");
    expect(item("People")).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(item("Villains")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(item("Ada.md")).toHaveFocus();
    expect(item("Ada.md")).toHaveAttribute("tabindex", "0");
    await user.keyboard("{ArrowUp}");
    expect(item("Villains")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(item("People")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(item("People")).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{End}");
    expect(item("Chicago.md")).toHaveFocus();
    await user.keyboard(" ");
    expect(item("Chicago.md")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(item("People")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(item("Places")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(item("Places")).toHaveAttribute("aria-selected", "true");
    expect(item("Places")).toHaveAttribute("aria-expanded", "true");
    expect(item("Chicago.md")).toHaveAttribute("aria-selected", "false");
  });

  it("shows every file with its full name", async () => {
    api.listNotes.mockResolvedValue([
      { kind: "folder", name: "Maps", path: "Maps", children: [] },
      { kind: "file", name: "foo", path: "foo" },
      { kind: "file", name: "foo.md", path: "foo.md" },
      { kind: "file", name: "Ideas.MD", path: "Ideas.MD" },
      { kind: "file", name: "region.png", path: "region.png" },
      { kind: "file", name: "todo.txt", path: "todo.txt" },
    ]);
    await renderTree();
    await screen.findByRole("treeitem", { name: "todo.txt" });

    expect(itemNames(screen.getByRole("tree", { name: "Notes" }))).toEqual([
      "Maps",
      "foo",
      "foo.md",
      "Ideas.MD",
      "region.png",
      "todo.txt",
    ]);
    expect(row("region.png")).toHaveTextContent(/^region\.png$/);
    expect(item("todo.txt")).not.toHaveAttribute("aria-expanded");
  });

  it("New note adds a name box after the folders of the selected folder and saves it on Enter", async () => {
    api.createEntry.mockResolvedValue("People/Ideas.md");
    const { user } = await renderLoaded();
    await user.click(row("People"));

    await user.click(screen.getByRole("button", { name: "New note" }));

    const box = screen.getByRole<HTMLInputElement>("textbox", {
      name: "File name",
    });
    expect(box).toHaveValue("Untitled.md");
    expect(box).toHaveFocus();
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 8]);
    expect(itemNames(within(item("People")).getByRole("group"))).toEqual([
      "Villains",
      "(new)",
      "Ada.md",
      "Ben.md",
    ]);
    expect(api.createEntry).not.toHaveBeenCalled();

    await user.keyboard("Ideas{Enter}");

    expect(api.createEntry).toHaveBeenCalledTimes(1);
    expect(api.createEntry).toHaveBeenCalledWith("People", "file", "Ideas.md");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("New note with a note selected creates in that note's folder", async () => {
    api.createEntry.mockResolvedValue("People/Untitled.md");
    const { user } = await renderLoaded();
    await user.click(row("People"));
    await user.click(row("Ada.md"));

    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.keyboard("{Enter}");

    expect(api.createEntry).toHaveBeenCalledWith(
      "People",
      "file",
      "Untitled.md",
    );
  });

  it("New note creates a file with exactly the name typed over it", async () => {
    api.createEntry.mockResolvedValue("todo.txt");
    const { user } = await renderLoaded();

    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.clear(screen.getByRole("textbox", { name: "File name" }));
    await user.keyboard("todo.txt{Enter}");

    expect(api.createEntry).toHaveBeenCalledWith("", "file", "todo.txt");
  });

  it("the folder menu's New note opens Untitled.md in that folder", async () => {
    api.createEntry.mockResolvedValue("Places/Untitled.md");
    const { user } = await renderLoaded();

    await user.pointer({ keys: "[MouseRight]", target: row("Places") });
    await user.click(screen.getByRole("menuitem", { name: /New note/ }));
    const box = screen.getByRole<HTMLInputElement>("textbox", {
      name: "File name",
    });
    expect(box).toHaveValue("Untitled.md");
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 8]);
    await user.keyboard("{Enter}");

    expect(api.createEntry).toHaveBeenCalledWith(
      "Places",
      "file",
      "Untitled.md",
    );
  });

  it("Esc cancels a new folder without creating anything", async () => {
    const { user } = await renderLoaded();

    await user.click(screen.getByRole("button", { name: "New folder" }));
    const tree = screen.getByRole("tree", { name: "Notes" });
    expect(itemNames(tree)).toEqual([
      "(new)",
      "People",
      "Places",
      "Chicago.md",
    ]);
    const box = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Folder name",
    });
    expect(box).toHaveFocus();
    expect(box).toHaveValue("Untitled");
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 8]);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.createEntry).not.toHaveBeenCalled();
  });

  it("keeps the name box open with an inline error when the name is rejected", async () => {
    api.createEntry.mockRejectedValue({
      code: "invalid_name",
      message: "Names can't start or end with a space or a dot.",
    });
    const { user } = await renderLoaded();
    await user.click(screen.getByRole("button", { name: "New note" }));
    const box = screen.getByRole("textbox", { name: "File name" });

    await user.keyboard(".hidden{Enter}");

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(
      "Names can't start or end with a space or a dot.",
    );
    expect(box).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(
      "Names can't start or end with a space or a dot.",
    );

    await user.keyboard("{Enter}");
    expect(api.createEntry).toHaveBeenCalledTimes(1);

    await user.keyboard("x");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(box).toHaveAttribute("aria-invalid", "false");
  });

  it.each([
    ["Esc", "{Escape}"],
    ["tabbing away", "{Tab}"],
  ])("with a name error showing, %s cancels the new note", async (_, keys) => {
    api.createEntry.mockRejectedValue({
      code: "name_taken",
      message: "“Untitled.md” already exists here.",
    });
    const { user } = await renderLoaded();
    focusItem("Places");
    await user.click(screen.getByRole("button", { name: "New note" }));
    await user.keyboard("{Enter}");
    await screen.findByRole("alert");

    await user.keyboard(keys);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(api.createEntry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toHaveAttribute("role", "treeitem");
  });

  it("keeps the rename box open with an inline error when the name is taken", async () => {
    api.renameEntry.mockRejectedValue({
      code: "name_taken",
      message: "“Places” already exists here.",
    });
    const { user } = await renderLoaded();
    focusItem("Chicago.md");
    await user.keyboard("{F2}");
    const box = screen.getByRole("textbox", { name: "File name" });

    await user.clear(box);
    await user.keyboard("Places{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“Places” already exists here.",
    );
    expect(box).toHaveValue("Places");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(api.renameEntry).toHaveBeenCalledWith("Chicago.md", "Places");
  });

  it("a reload without the row being renamed closes the name box and frees dragging", async () => {
    api.moveEntry.mockResolvedValue("People/Places");
    const { user } = await renderLoaded();
    focusItem("Chicago.md");
    await user.keyboard("{F2}");
    api.listNotes.mockResolvedValue(sample().slice(0, 2));

    await act(async () => notesChanged());

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("treeitem", { name: "Chicago.md" })).toBeNull();
    expect(item("People")).toHaveFocus();
    document.elementFromPoint = () => row("People");
    fireEvent.pointerDown(row("Places"), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 20, clientY: 20 });
    fireEvent.pointerUp(window, { clientX: 20, clientY: 20 });
    expect(api.moveEntry).toHaveBeenCalledWith("Places", "People");
  });

  it("a rename that resolves late leaves a newer name box open", async () => {
    let finishRename: (path: string) => void = () => {};
    api.renameEntry.mockReturnValue(
      new Promise((resolve) => {
        finishRename = resolve;
      }),
    );
    const { user } = await renderLoaded();
    focusItem("Chicago.md");
    await user.keyboard("{F2}Detroit{Enter}");

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await act(async () => finishRename("Detroit.md"));

    const box = screen.getByRole("textbox", { name: "Folder name" });
    expect(box).toHaveValue("Untitled");
    expect(box).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a rename that fails late with a name error leaves a newer name box clean", async () => {
    let failRename: (error: unknown) => void = () => {};
    api.renameEntry.mockReturnValue(
      new Promise((_, reject) => {
        failRename = reject;
      }),
    );
    const { user } = await renderLoaded();
    focusItem("Chicago.md");
    await user.keyboard("{F2}Places{Enter}");

    await user.click(screen.getByRole("button", { name: "New folder" }));
    await act(async () =>
      failRename({
        code: "name_taken",
        message: "“Places” already exists here.",
      }),
    );

    const box = screen.getByRole("textbox", { name: "Folder name" });
    expect(box).toHaveValue("Untitled");
    expect(box).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes the name box and raises a toast when creation fails for another reason", async () => {
    api.createEntry.mockRejectedValue({ code: "io", message: "Disk full." });
    const { user } = await renderLoaded();
    await user.click(screen.getByRole("button", { name: "New note" }));

    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error: Disk full.",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.listNotes).toHaveBeenCalledTimes(2);
  });

  it("F2 renames the focused note", async () => {
    api.renameEntry.mockResolvedValue("Detroit.md");
    const { user } = await renderLoaded();
    focusItem("Chicago.md");

    await user.keyboard("{F2}");
    const box = screen.getByRole<HTMLInputElement>("textbox", {
      name: "File name",
    });
    expect(box).toHaveValue("Chicago.md");
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 7]);

    await user.keyboard("Detroit{Enter}");

    expect(api.renameEntry).toHaveBeenCalledWith("Chicago.md", "Detroit.md");
  });

  it.each([
    [
      "People",
      "Move “People” and the 3 files and 1 folder inside it to the trash?",
    ],
    ["Places", "Move “Places” to the trash?"],
    ["Chicago.md", "Move “Chicago.md” to the trash?"],
  ])("Delete on %s asks: %s", async (name, question) => {
    const { user } = await renderLoaded();
    focusItem(name);

    await user.keyboard("{Delete}");

    const dialog = screen.getByRole("alertdialog", { name: question });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "You can restore it from the system trash.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
  });

  it("uses singular counts for a folder holding one file", async () => {
    const { user } = await renderLoaded();
    await user.click(row("People"));
    focusItem("Villains");

    await user.keyboard("{Delete}");

    expect(
      screen.getByRole("alertdialog", {
        name: "Move “Villains” and the 1 file inside it to the trash?",
      }),
    ).toBeInTheDocument();
  });

  it("Cancel deletes nothing and returns focus; Move to trash deletes", async () => {
    api.deleteEntry.mockResolvedValue();
    const { user } = await renderLoaded();
    focusItem("Chicago.md");

    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(item("Chicago.md")).toHaveFocus();
    expect(api.deleteEntry).not.toHaveBeenCalled();

    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Move to trash" }));

    expect(api.deleteEntry).toHaveBeenCalledWith("Chicago.md");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Esc cancels the delete dialog and Tab stays inside it", async () => {
    const { user } = await renderLoaded();
    focusItem("Chicago.md");
    await user.keyboard("{Delete}");

    await user.tab();
    expect(screen.getByRole("button", { name: "Move to trash" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.deleteEntry).not.toHaveBeenCalled();
  });

  it("raises a toast when the delete fails", async () => {
    api.deleteEntry.mockRejectedValue({
      code: "io",
      message:
        "Couldn't move “Chicago.md” to the trash: the trash is not available.",
    });
    const { user } = await renderLoaded();
    focusItem("Chicago.md");
    await user.keyboard("{Delete}");

    await user.click(screen.getByRole("button", { name: "Move to trash" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error: Couldn't move “Chicago.md” to the trash: the trash is not available.",
    );
  });

  it("Shift+F10 opens the folder menu, and Esc closes it and returns focus", async () => {
    const { user } = await renderLoaded();
    focusItem("People");

    await user.keyboard("{Shift>}{F10}{/Shift}");

    const menu = screen.getByRole("menu", { name: "People" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((el) => el.textContent),
    ).toEqual(["New note", "New folder", "RenameF2", "DeleteDel"]);
    expect(
      within(menu).getByRole("menuitem", { name: /New note/ }),
    ).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      within(menu).getByRole("menuitem", { name: /New folder/ }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(item("People")).toHaveFocus();
  });

  it("the note menu has only Rename and Delete, and Delete opens the dialog", async () => {
    const { user } = await renderLoaded();
    focusItem("Chicago.md");

    await user.keyboard("{ContextMenu}");

    const menu = screen.getByRole("menu", { name: "Chicago.md" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((el) => el.textContent),
    ).toEqual(["RenameF2", "DeleteDel"]);

    await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));
    expect(
      screen.getByRole("alertdialog", {
        name: "Move “Chicago.md” to the trash?",
      }),
    ).toBeInTheDocument();
  });

  it("the folder menu's New folder creates inside that folder", async () => {
    api.createEntry.mockResolvedValue("Places/Untitled");
    const { user } = await renderLoaded();

    await user.pointer({ keys: "[MouseRight]", target: row("Places") });
    await user.click(screen.getByRole("menuitem", { name: /New folder/ }));
    await user.keyboard("{Enter}");

    expect(api.createEntry).toHaveBeenCalledWith(
      "Places",
      "folder",
      "Untitled",
    );
  });

  it("a notes-changed event reloads the tree and keeps open folders", async () => {
    const { user } = await renderLoaded();
    await user.click(row("People"));
    const updated = sample();
    updated[0].children?.push({
      kind: "file",
      name: "Cleo.md",
      path: "People/Cleo.md",
    });
    api.listNotes.mockResolvedValue(updated);

    await act(async () => notesChanged());

    expect(item("Cleo.md")).toHaveAttribute("aria-level", "2");
    expect(item("People")).toHaveAttribute("aria-expanded", "true");
    expect(item("People")).toHaveAttribute("aria-selected", "true");
  });

  it("an empty notes folder shows no text", async () => {
    api.listNotes.mockResolvedValue([]);
    await renderTree();

    const tree = screen.getByRole("tree", { name: "Notes" });
    expect(tree.parentElement).toHaveTextContent(/^$/);
    expect(screen.queryByRole("treeitem")).toBeNull();
  });

  it("a rename rejected as taken shows the error inline without reloading", async () => {
    api.renameEntry.mockRejectedValue({
      code: "name_taken",
      message: "“Places” already exists here.",
    });
    const { user } = await renderLoaded();
    focusItem("Chicago.md");
    await user.keyboard("{F2}");
    await user.clear(screen.getByRole("textbox", { name: "File name" }));
    await user.keyboard("Places{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^“Places” already exists here\.$/,
    );
    expect(api.listNotes).toHaveBeenCalledTimes(1);
  });

  it("renaming the selected note keeps it selected and focused", async () => {
    api.renameEntry.mockResolvedValue("Detroit.md");
    const { user } = await renderLoaded();
    await user.click(row("Chicago.md"));
    const renamed = sample();
    renamed[2] = { kind: "file", name: "Detroit.md", path: "Detroit.md" };
    api.listNotes.mockResolvedValue(renamed);

    await user.keyboard("{F2}Detroit{Enter}");

    await waitFor(() => expect(item("Detroit.md")).toBeInTheDocument());
    expect(item("Detroit.md")).toHaveAttribute("aria-selected", "true");
    expect(item("Detroit.md")).toHaveFocus();
  });

  describe("drag to move", () => {
    const dragTo = (from: HTMLElement, over: Element | null) => {
      document.elementFromPoint = () => over;
      fireEvent.pointerDown(from, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 30, clientY: 40 });
      fireEvent.pointerUp(window, { clientX: 30, clientY: 40 });
    };
    const topLevel = (container: HTMLElement) =>
      container.querySelector('[data-drop=""]');

    it("dropping a note on a folder moves it there", async () => {
      api.moveEntry.mockResolvedValue("Places/Chicago.md");
      await renderLoaded();

      dragTo(row("Chicago.md"), row("Places"));

      expect(api.moveEntry).toHaveBeenCalledWith("Chicago.md", "Places");
    });

    it("dropping on the empty area below the rows moves to the top level", async () => {
      api.moveEntry.mockResolvedValue("Ada.md");
      const { user, container } = await renderLoaded();
      await user.click(row("People"));

      dragTo(row("Ada.md"), topLevel(container));

      expect(api.moveEntry).toHaveBeenCalledWith("People/Ada.md", "");
    });

    it("refuses a folder into its own descendant and ignores its current parent", async () => {
      const { user } = await renderLoaded();
      await user.click(row("People"));

      dragTo(row("People"), row("Villains"));
      dragTo(row("People"), row("People"));
      dragTo(row("Ada.md"), row("People"));

      expect(api.moveEntry).not.toHaveBeenCalled();
    });

    it("a small pointer movement is a click, not a drag", async () => {
      await renderLoaded();
      document.elementFromPoint = () => row("Places");

      fireEvent.pointerDown(row("Chicago.md"), {
        button: 0,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(window, { clientX: 12, clientY: 11 });
      fireEvent.pointerUp(window, { clientX: 12, clientY: 11 });

      expect(api.moveEntry).not.toHaveBeenCalled();
    });

    it("keyboard focus follows the moved row into its new folder", async () => {
      api.moveEntry.mockResolvedValue("Places/Chicago.md");
      await renderLoaded();
      focusItem("Chicago.md");
      const moved = sample();
      moved.pop();
      moved[1].children = [
        { kind: "file", name: "Chicago.md", path: "Places/Chicago.md" },
      ];
      api.listNotes.mockResolvedValue(moved);

      dragTo(row("Chicago.md"), row("Places"));

      await waitFor(() =>
        expect(item("Chicago.md")).toHaveAttribute("aria-level", "2"),
      );
      expect(item("Chicago.md")).toHaveFocus();
      expect(item("Places")).toHaveAttribute("aria-expanded", "true");
    });

    it("raises a toast and reloads when the move fails", async () => {
      api.moveEntry.mockRejectedValue({
        code: "name_taken",
        message: "“Chicago.md” is already in “Places”.",
      });
      await renderLoaded();

      dragTo(row("Chicago.md"), row("Places"));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Error: “Chicago.md” is already in “Places”.",
      );
      expect(api.listNotes).toHaveBeenCalledTimes(2);
    });
  });
});

describe("Notes folder", () => {
  const otherFolder = (): Entry[] => [
    { kind: "folder", name: "Quests", path: "Quests", children: [] },
    { kind: "folder", name: "Places", path: "Places", children: [] },
    { kind: "file", name: "Chicago.md", path: "Chicago.md" },
  ];

  it("puts Choose notes folder before New note and shows the folder in its title", async () => {
    await renderLoaded();
    const buttons = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(buttons.slice(0, 3)).toEqual([
      "Choose notes folder",
      "New note",
      "New folder",
    ]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Choose notes folder" }),
      ).toHaveAttribute("title", "Choose notes folder (/home/x/Notes)"),
    );
  });

  it("changes nothing when the picker is cancelled", async () => {
    const { user } = await renderLoaded();
    await user.click(row("People"));
    await user.click(row("Chicago.md"));
    api.chooseNotesFolder.mockResolvedValue(null);
    api.listNotes.mockImplementation(async () => otherFolder());
    const choose = screen.getByRole("button", { name: "Choose notes folder" });
    await waitFor(() =>
      expect(choose).toHaveAttribute(
        "title",
        "Choose notes folder (/home/x/Notes)",
      ),
    );

    await user.click(choose);

    expect(api.chooseNotesFolder).toHaveBeenCalledTimes(1);
    expect(item("People")).toHaveAttribute("aria-expanded", "true");
    expect(item("Chicago.md")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("treeitem", { name: "Quests" })).toBeNull();
    expect(choose).toHaveAttribute(
      "title",
      "Choose notes folder (/home/x/Notes)",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reloads the tree from a picked folder and clears the selection and open folders", async () => {
    const { user } = await renderLoaded();
    await user.click(row("Places"));
    await user.click(row("Chicago.md"));
    expect(item("Places")).toHaveAttribute("aria-expanded", "true");
    expect(item("Chicago.md")).toHaveAttribute("aria-selected", "true");
    api.chooseNotesFolder.mockResolvedValue("/home/x/Other");
    api.listNotes.mockImplementation(async () => otherFolder());

    await user.click(
      screen.getByRole("button", { name: "Choose notes folder" }),
    );

    await screen.findByRole("treeitem", { name: "Quests" });
    expect(screen.queryByRole("treeitem", { name: "People" })).toBeNull();
    // Places and Chicago.md exist in both folders, yet they are reset.
    expect(item("Places")).toHaveAttribute("aria-expanded", "false");
    expect(item("Chicago.md")).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByRole("button", { name: "Choose notes folder" }),
    ).toHaveAttribute("title", "Choose notes folder (/home/x/Other)");
  });

  it("keeps the tree when the picked folder can't be saved", async () => {
    const { user } = await renderLoaded();
    await user.click(row("Chicago.md"));
    api.chooseNotesFolder.mockRejectedValue(
      "Couldn't save the notes folder: Permission denied.",
    );
    api.listNotes.mockImplementation(async () => otherFolder());

    await user.click(
      screen.getByRole("button", { name: "Choose notes folder" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save the notes folder: Permission denied.",
    );
    expect(item("Chicago.md")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("treeitem", { name: "Quests" })).toBeNull();
  });

  it("ignores clicks while the picker is open, and allows them after it closes", async () => {
    const answers: ((path: string | null) => void)[] = [];
    let fail!: (e: unknown) => void;
    api.chooseNotesFolder.mockImplementation(
      () => new Promise((resolve) => answers.push(resolve)),
    );
    const { user } = await renderLoaded();
    api.listNotes.mockImplementation(async () => otherFolder());
    const choose = screen.getByRole("button", { name: "Choose notes folder" });

    await user.click(choose);
    await user.click(choose);
    expect(api.chooseNotesFolder).toHaveBeenCalledTimes(1);

    // Cancel ends the pick.
    await act(async () => answers[0](null));
    await user.click(choose);
    await user.click(choose);
    expect(api.chooseNotesFolder).toHaveBeenCalledTimes(2);

    // A pick ends the pick.
    await act(async () => answers[1]("/home/x/Other"));
    await screen.findByRole("treeitem", { name: "Quests" });
    api.chooseNotesFolder.mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    await user.click(choose);
    await user.click(choose);
    expect(api.chooseNotesFolder).toHaveBeenCalledTimes(3);

    // An error ends the pick.
    await act(async () => fail("Couldn't save the notes folder."));
    api.chooseNotesFolder.mockResolvedValue(null);
    await user.click(choose);
    expect(api.chooseNotesFolder).toHaveBeenCalledTimes(4);
  });
});
