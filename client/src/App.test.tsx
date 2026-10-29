import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { Entry } from "@/lib/notesApi";

// The notes folder lives on disk behind Tauri; these tests need an empty one.
vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => notesList,
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
}));

let notesList: Entry[] = [];
beforeEach(() => {
  notesList = [];
});

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

  it("keeps open folders and the selection after the rail panel closes and reopens", async () => {
    notesList = [
      {
        kind: "folder",
        name: "People",
        path: "People",
        children: [{ kind: "note", name: "Ada", path: "People/Ada.md" }],
      },
    ];
    const user = renderApp();
    await user.click(
      (await screen.findByRole("treeitem", { name: "People" }))
        .firstElementChild as HTMLElement,
    );
    await user.click(
      screen.getByRole("treeitem", { name: "Ada" })
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
      screen.getByRole("treeitem", { name: "Ada", selected: true }),
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
});
