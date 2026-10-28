import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/App";

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

  it("Settings is not a tab and clicking it changes nothing", async () => {
    const user = renderApp();
    const settings = screen.getByRole("button", { name: "Settings" });
    expect(settings).not.toHaveAttribute("aria-pressed");

    await user.click(settings);

    expect(
      screen.getByRole("button", { name: "Session", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Session rail panel" }),
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
      screen.getByRole("button", { name: "Session", pressed: true }),
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

  it("selecting another rail item activates it and opens its rail panel", async () => {
    const user = renderApp();
    await user.click(screen.getByRole("button", { name: "Panel item 4" }));
    await user.click(screen.getByRole("button", { name: "Hide rail panel" }));

    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(
      screen.getByRole("button", { name: "Notes", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Session", pressed: false }),
    ).toBeInTheDocument();
    const railPanel = screen.getByRole("region", {
      name: "Notes rail panel",
    });
    expect(railPanel).toHaveTextContent("Notes");
    expect(
      screen.getByRole("button", { name: "Panel item 1", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Panel item 4", pressed: false }),
    ).toBeInTheDocument();
  });

  it("selecting the active rail item hides and then shows the rail panel", async () => {
    const user = renderApp();
    const active = screen.getByRole("button", { name: "Session" });

    await user.click(active);
    expect(
      screen.queryByRole("region", { name: "Session rail panel" }),
    ).not.toBeInTheDocument();

    await user.click(active);
    expect(
      screen.getByRole("region", { name: "Session rail panel" }),
    ).toBeInTheDocument();
  });

  it("toggle button hides and shows the rail panel and updates its label", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "Hide rail panel", expanded: true }),
    );
    expect(
      screen.queryByRole("region", { name: "Session rail panel" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show rail panel", expanded: false }),
    );
    expect(
      screen.getByRole("region", { name: "Session rail panel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide rail panel" }),
    ).toBeInTheDocument();
  });

  it("selecting a rail panel item marks it pressed", async () => {
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "Panel item 4" }));

    expect(
      screen.getByRole("button", { name: "Panel item 4", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Panel item 1", pressed: false }),
    ).toBeInTheDocument();
  });
});
