import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import confirmStyles from "@/components/ConfirmDialog/ConfirmDialog.module.css";
import {
  FileTree,
  type FileTreeHandle,
  type FileTreeProps,
  type TreeEntry,
} from "@/components/FileTree/FileTree";
import { ToastProvider } from "@/components/Toast/Toast";

const entries: TreeEntry[] = [
  {
    kind: "folder",
    name: "Drafts",
    path: "Drafts",
    children: [{ kind: "file", name: "Intro", path: "Drafts/Intro.txt" }],
  },
  { kind: "file", name: "Outline", path: "Outline.txt" },
];

const onCreate = vi.fn<FileTreeProps["onCreate"]>();
const onRename = vi.fn<FileTreeProps["onRename"]>();
const onMove = vi.fn<FileTreeProps["onMove"]>();
const onDelete = vi.fn<FileTreeProps["onDelete"]>();
const confirmDelete = vi.fn<FileTreeProps["confirmDelete"]>();
let handle: FileTreeHandle | null;

function Harness({ items }: { items: TreeEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ToastProvider>
      <FileTree
        ref={(value) => {
          handle = value;
        }}
        label="Pages"
        labels={{ file: "page" }}
        entries={items}
        expanded={expanded}
        setExpanded={setExpanded}
        selected={selected}
        setSelected={setSelected}
        onCreate={onCreate}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
        confirmDelete={confirmDelete}
      />
    </ToastProvider>
  );
}

function renderTree(items = entries) {
  const user = userEvent.setup();
  const view = render(<Harness items={items} />);
  return { user, ...view };
}

const item = (name: string) => screen.getByRole("treeitem", { name });
const row = (name: string) => item(name).firstElementChild as HTMLElement;
const focusItem = (name: string) => act(() => item(name).focus());

beforeEach(() => {
  vi.resetAllMocks();
  confirmDelete.mockImplementation((entry) => ({
    title: `Remove ${entry.name}?`,
    message: "It goes away for good.",
    confirmLabel: "Remove",
  }));
});

describe("FileTree", () => {
  it("renders the entries under the tree label", () => {
    renderTree();

    const tree = screen.getByRole("tree", { name: "Pages" });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(2);
    expect(item("Drafts")).toHaveAttribute("aria-expanded", "false");
  });

  it("F2 and Enter call onRename with the new name", async () => {
    onRename.mockResolvedValue("Plan.txt");
    const { user } = renderTree();
    focusItem("Outline");

    await user.keyboard("{F2}");
    const box = screen.getByRole("textbox", { name: "Page name" });
    expect(box).toHaveValue("Outline");
    await user.keyboard("Plan{Enter}");

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("Outline.txt", "Plan");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([
    ["Ideas.md", "file", 5],
    ["archive.tar.gz", "file", 11],
    ["README", "file", 6],
    ["v1.2", "folder", 4],
  ] as const)(
    "rename of %s (a %s) selects its first %i characters",
    async (name, kind, end) => {
      const { user } = renderTree([
        kind === "folder"
          ? { kind, name, path: name, children: [] }
          : { kind, name, path: name },
      ]);
      focusItem(name);

      await user.keyboard("{F2}");

      const box = screen.getByRole<HTMLInputElement>("textbox", {
        name: kind === "folder" ? "Folder name" : "Page name",
      });
      expect(box).toHaveValue(name);
      expect([box.selectionStart, box.selectionEnd]).toEqual([0, end]);
    },
  );

  it("the folder menu's New page calls onCreate in that folder", async () => {
    onCreate.mockResolvedValue("Drafts/Untitled.txt");
    const { user } = renderTree();

    await user.pointer({ keys: "[MouseRight]", target: row("Drafts") });
    await user.click(screen.getByRole("menuitem", { name: /New page/ }));
    await user.keyboard("Ending{Enter}");

    expect(onCreate).toHaveBeenCalledWith("Drafts", "file", "Ending");
  });

  it("startCreate from the handle calls onCreate at the top level", async () => {
    onCreate.mockResolvedValue("Untitled");
    const { user } = renderTree();

    act(() => handle?.startCreate("folder"));
    expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onCreate).toHaveBeenCalledWith("", "folder", "Untitled");
  });

  it("dropping a file on a folder calls onMove", () => {
    onMove.mockResolvedValue("Drafts/Outline.txt");
    renderTree();
    document.elementFromPoint = () => row("Drafts");

    fireEvent.pointerDown(row("Outline"), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, { clientX: 30, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 30, clientY: 40 });

    expect(onMove).toHaveBeenCalledWith("Outline.txt", "Drafts");
  });

  it("Delete shows the confirmDelete text and calls onDelete only on confirm", async () => {
    onDelete.mockResolvedValue();
    const { user } = renderTree();
    focusItem("Outline");

    await user.keyboard("{Delete}");
    const dialog = screen.getByRole("alertdialog", {
      name: "Remove Outline?",
    });
    expect(dialog).toHaveAccessibleDescription("It goes away for good.");
    expect(confirmDelete).toHaveBeenCalledWith(entries[1]);
    expect(within(dialog).getByRole("button", { name: "Remove" })).toHaveClass(
      confirmStyles.danger,
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("Outline.txt");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a name_taken rejection shows inline and keeps the name box open", async () => {
    onRename.mockRejectedValue({
      code: "name_taken",
      message: "“Drafts” already exists here.",
    });
    const { user } = renderTree();
    focusItem("Outline");

    await user.keyboard("{F2}");
    const box = screen.getByRole("textbox", { name: "Page name" });
    await user.clear(box);
    await user.keyboard("Drafts{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^“Drafts” already exists here\.$/);
    expect(box).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("“Drafts” already exists here.");
  });

  it("another rejection closes the name box and raises a toast", async () => {
    onRename.mockRejectedValue({ code: "io", message: "Disk full." });
    const { user } = renderTree();
    focusItem("Outline");

    await user.keyboard("{F2}Plan{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error: Disk full.",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("new entries without the row being renamed close the name box and move focus", async () => {
    const { user, rerender } = renderTree();
    await user.click(row("Drafts"));
    focusItem("Intro");
    await user.keyboard("{F2}");
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    rerender(
      <Harness
        items={[{ kind: "folder", name: "Drafts", path: "Drafts" }, entries[1]]}
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(item("Drafts")).toHaveFocus();
  });
});
