import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

// The notes folder lives on disk behind Tauri; these tests need an empty one.
vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
}));

// Every random word is 48, so each die shows (48 % sides) + 1.
const RANDOM_WORD = 48;

async function openDice() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Dice" }));
  return user;
}

const latest = () => screen.getByRole("region", { name: "Latest roll" });
const historyRows = () =>
  within(screen.getByRole("region", { name: "Last 10 rolls" })).queryAllByRole(
    "listitem",
  );

describe("Dice panel", () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
      (values) => {
        (values as Uint32Array).fill(RANDOM_WORD);
        return values;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no rolls", async () => {
    await openDice();

    expect(latest()).toHaveTextContent("No rolls yet");
    expect(historyRows()).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Clear history" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("Roll d100 rolls one d100 and adds a timed history row", async () => {
    const user = await openDice();

    await user.click(screen.getByRole("button", { name: /Roll d100/ }));

    expect(latest()).toHaveTextContent("49");
    expect(latest()).toHaveTextContent("1d100 (49) = 49");
    const [row] = historyRows();
    expect(row).toHaveTextContent("1d100 (49) = 49");
    expect(within(row).getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it.each([
    [2, 1],
    [3, 1],
    [4, 1],
    [6, 1],
    [8, 1],
    [10, 9],
    [12, 1],
    [20, 9],
  ])("the d%i quick button rolls one d%i", async (sides, value) => {
    const user = await openDice();

    await user.click(screen.getByRole("button", { name: `Roll d${sides}` }));

    expect(latest()).toHaveTextContent(`1d${sides} (${value}) = ${value}`);
  });

  it("rolls typed notation with mixed dice and a modifier", async () => {
    const user = await openDice();

    await user.type(
      screen.getByRole("textbox", { name: "Custom roll" }),
      "2d6 + 1d30 + 3{Enter}",
    );

    expect(latest()).toHaveTextContent("2d6 (1, 1) + 1d30 (19) + 3 = 24");
    expect(screen.getByRole("textbox", { name: "Custom roll" })).toHaveValue(
      "2d6 + 1d30 + 3",
    );
  });

  it("shows an error for bad notation and adds no history row", async () => {
    const user = await openDice();
    const field = screen.getByRole("textbox", { name: "Custom roll" });

    await user.type(field, "abc");
    await user.click(screen.getByRole("button", { name: "Roll" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use notation like 2d6 + 1d8 - 3.",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(historyRows()).toHaveLength(0);

    await user.clear(field);
    await user.type(field, "d6{Enter}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(historyRows()).toHaveLength(1);
  });

  it("keeps only the last 10 rolls, newest first", async () => {
    const user = await openDice();

    await user.click(screen.getByRole("button", { name: "Roll d2" }));
    for (let i = 0; i < 9; i++) {
      await user.click(screen.getByRole("button", { name: /Roll d100/ }));
    }
    await user.click(screen.getByRole("button", { name: "Roll d6" }));

    const rows = historyRows();
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent("1d6");
    expect(rows[9]).toHaveTextContent("1d100");
    for (const row of rows) expect(row).not.toHaveTextContent("1d2 ");
  });

  it("Clear history empties the list", async () => {
    const user = await openDice();
    await user.click(screen.getByRole("button", { name: /Roll d100/ }));
    await user.click(screen.getByRole("button", { name: "Roll d6" }));

    await user.click(screen.getByRole("button", { name: "Clear history" }));

    expect(historyRows()).toHaveLength(0);
    expect(screen.getByText("Rolls will appear here.")).toBeInTheDocument();
  });

  it("Clear history keeps keyboard focus after emptying the list", async () => {
    const user = await openDice();
    await user.click(screen.getByRole("button", { name: /Roll d100/ }));
    const clear = screen.getByRole("button", { name: "Clear history" });

    act(() => clear.focus());
    await user.keyboard("{Enter}");

    expect(historyRows()).toHaveLength(0);
    expect(clear).not.toBeDisabled();
    expect(clear).toHaveAttribute("aria-disabled", "true");
    expect(clear).toHaveFocus();
  });

  it("Clear history keeps the latest roll", async () => {
    const user = await openDice();
    await user.click(screen.getByRole("button", { name: /Roll d100/ }));

    await user.click(screen.getByRole("button", { name: "Clear history" }));

    expect(latest()).toHaveTextContent("1d100 (49) = 49");
    expect(historyRows()).toHaveLength(0);
  });

  it("a failed quick roll shows a toast and leaves the custom field valid", async () => {
    vi.mocked(globalThis.crypto.getRandomValues).mockImplementation(() => {
      throw new Error("no entropy");
    });
    const user = await openDice();
    const field = screen.getByRole("textbox", { name: "Custom roll" });

    await user.click(screen.getByRole("button", { name: "Roll d20" }));

    expect(field).not.toHaveAttribute("aria-invalid", "true");
    expect(
      within(field.closest("form") as HTMLFormElement).queryByRole("alert"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByRole(
        "alert",
      ),
    ).toHaveTextContent("Error: Couldn't generate a secure roll");
  });

  it("a successful quick roll keeps the notation error until the field changes", async () => {
    const user = await openDice();
    const field = screen.getByRole("textbox", { name: "Custom roll" });

    await user.type(field, "abc{Enter}");
    await user.click(screen.getByRole("button", { name: "Roll d6" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use notation like 2d6 + 1d8 - 3.",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");

    await user.type(field, "d");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "false");
  });

  it("announces a repeated notation error with a new alert", async () => {
    const user = await openDice();
    const field = screen.getByRole("textbox", { name: "Custom roll" });

    await user.type(field, "abc{Enter}");
    const first = screen.getByRole("alert");
    await user.type(field, "{Enter}");

    const second = screen.getByRole("alert");
    expect(second).toHaveTextContent("Use notation like 2d6 + 1d8 - 3.");
    expect(second).not.toBe(first);
  });
});
