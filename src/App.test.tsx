import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import type { Bootstrap } from "./api/workspace";
import {
  deferred,
  file,
  fixture,
  preferences,
  workspace,
} from "./test/workspace-fixture";

vi.mock("./editor/NoteEditor", () => ({
  NoteEditor: ({
    content,
    onChange,
    readOnly,
  }: {
    content: string;
    onChange(value: string): void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label="Note source"
      defaultValue={content}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
describe("workspace UI", () => {
  it("shows first launch and opens a folder without automatically selecting a note", async () => {
    const api = fixture();
    api.initializeWorkspace.mockResolvedValue({
      preferences: { ...preferences, lastFolder: null },
      workspace: null,
      restoreError: null,
    });
    api.pickWorkspace.mockResolvedValue(workspace);
    render(<App api={api} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Open folder" }),
    );
    expect(
      await screen.findByRole("button", { name: "Player" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(await screen.findByText("No file open")).toBeInTheDocument();
    expect(api.readNote).not.toHaveBeenCalled();
  });
  it("shows every supported and unsupported row and keeps a hidden note open when hidden again", async () => {
    render(<App api={fixture()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await screen.findByRole("treeitem", { name: "one.md" });
    expect(
      screen.getByRole("treeitem", { name: "file.pdf" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("treeitem", { name: ".hidden.md" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Show hidden files" }),
    );
    await userEvent.click(screen.getByRole("treeitem", { name: ".hidden.md" }));
    expect(
      await screen.findByRole("textbox", { name: "Note source" }),
    ).toHaveValue("content of .hidden.md");
    await userEvent.click(
      screen.getByRole("button", { name: "Show hidden files" }),
    );
    expect(
      screen.queryByRole("treeitem", { name: ".hidden.md" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note source" })).toHaveValue(
      "content of .hidden.md",
    );
    await userEvent.click(screen.getByRole("treeitem", { name: "file.pdf" }));
    expect(await screen.findByText("Can't open this file")).toBeInTheDocument();
  });
  it("tree keyboard opens a note; naming Escape cancels and invalid blur blocks navigation", async () => {
    const api = fixture();
    render(<App api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    const row = await screen.findByRole("treeitem", { name: "one.md" });
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    await screen.findByRole("textbox", { name: "Note source" });
    fireEvent.keyDown(row, { key: "F2" });
    const rename = await screen.findByRole("textbox", { name: "Entry name" });
    expect(rename).toHaveValue("one.md");
    fireEvent.keyDown(rename, { key: "Escape" });
    expect(api.renameEntry).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "New note" }));
    const input = await screen.findByRole("textbox", { name: "Entry name" });
    expect(input).toHaveValue("untitled.md");
    expect((input as HTMLInputElement).selectionEnd).toBe(8);
    fireEvent.change(input, { target: { value: "bad/name" } });
    await userEvent.click(screen.getByRole("treeitem", { name: "two.md" }));
    expect(screen.getByText(/Names can't contain/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note source" })).toHaveValue(
      "content of one.md",
    );
    expect(api.createEntry).not.toHaveBeenCalled();
  });
  it("toolbar creation targets root while folder menu creation targets that folder", async () => {
    const api = fixture();
    const folder = {
      kind: "folder" as const,
      path: "sub",
      name: "sub",
      isSymlink: false,
      children: [file("sub/a.md")],
    };
    api.initializeWorkspace.mockResolvedValue({
      preferences,
      workspace: { ...workspace, nodes: [folder] },
      restoreError: null,
    });
    render(<App api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    const row = await screen.findByRole("treeitem", { name: "sub" });
    await userEvent.click(row);
    await userEvent.click(screen.getByRole("button", { name: "New note" }));
    fireEvent.keyDown(
      await screen.findByRole("textbox", { name: "Entry name" }),
      { key: "Enter" },
    );
    await waitFor(() =>
      expect(api.createEntry).toHaveBeenCalledWith(
        1,
        "",
        "untitled.md",
        "note",
      ),
    );
    api.createEntry.mockClear();
    // Restore the folder returned by the fake mutation.
    api.refreshWorkspace.mockResolvedValue({ ...workspace, nodes: [folder] });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.contextMenu(await screen.findByRole("treeitem", { name: "sub" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "New note" }),
    );
    fireEvent.keyDown(
      await screen.findByRole("textbox", { name: "Entry name" }),
      { key: "Enter" },
    );
    await waitFor(() =>
      expect(api.createEntry).toHaveBeenCalledWith(
        1,
        "sub",
        "untitled.md",
        "note",
      ),
    );
  });
});

it("shows an immediate opening spinner and a missing remembered folder recovery action", async () => {
  const api = fixture();
  const result = deferred<Bootstrap>();
  api.initializeWorkspace.mockReturnValue(result.promise);
  render(<App api={api} />);
  expect(screen.getByText("Opening folder…")).toBeInTheDocument();
  await act(async () =>
    result.resolve({
      preferences: { ...preferences, lastFolder: "/lost/reading-group" },
      workspace: null,
      restoreError: "folder unavailable",
    }),
  );
  expect(screen.getByText("Can't find reading-group")).toBeInTheDocument();
  expect(screen.getByText("/lost/reading-group")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Open another folder" }),
  ).toBeInTheDocument();
});
