import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import * as notesApi from "@/lib/notesApi";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: vi.fn(),
  chooseNotesFolder: vi.fn(),
}));

const api = vi.mocked(notesApi);

// Resolves the startup folder only when the test says so.
let answer: (folder: notesApi.NotesFolder) => void;

beforeEach(() => {
  vi.resetAllMocks();
  api.getNotesFolder.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
});

const choose = () =>
  screen.getByRole("button", { name: "Choose notes folder" });

// Closing and reopening the rail panel unmounts and remounts the notes menu.
async function remountNotes(user: ReturnType<typeof userEvent.setup>) {
  const notes = screen.getByRole("button", { name: "Notes" });
  await user.click(notes);
  expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  await user.click(notes);
  await screen.findByRole("tree", { name: "Notes" });
}

describe("Notes folder at startup", () => {
  it("shows the startup folder in the Choose notes folder title", async () => {
    render(<App />);
    await act(async () => answer({ path: "/home/x/Notes", missing: null }));

    expect(choose()).toHaveAttribute(
      "title",
      "Choose notes folder (/home/x/Notes)",
    );
  });

  it("raises one toast for a missing folder that arrives after a remount", async () => {
    const user = userEvent.setup();
    render(<App />);
    await remountNotes(user);

    await act(async () =>
      answer({ path: "/data/notes", missing: "/home/x/Gone" }),
    );

    expect(api.getNotesFolder).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't find /home/x/Gone. Showing the default notes folder.",
    );
    expect(choose()).toHaveAttribute(
      "title",
      "Choose notes folder (/data/notes)",
    );
  });

  it("keeps a folder picked after a remount when the startup folder arrives late", async () => {
    api.chooseNotesFolder.mockResolvedValue("/home/x/Other");
    const user = userEvent.setup();
    render(<App />);
    await remountNotes(user);
    await user.click(choose());
    expect(choose()).toHaveAttribute(
      "title",
      "Choose notes folder (/home/x/Other)",
    );

    await act(async () =>
      answer({ path: "/data/notes", missing: "/home/x/Gone" }),
    );

    expect(choose()).toHaveAttribute(
      "title",
      "Choose notes folder (/home/x/Other)",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
