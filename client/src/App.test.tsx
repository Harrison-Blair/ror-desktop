import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/App";

function renderApp() {
  render(<App />);
  return userEvent.setup();
}

describe("App frame", () => {
  it("labels each rail item by its name", () => {
    renderApp();
    const rail = screen.getByRole("navigation", { name: "Main" });

    for (const name of [
      "Nav item 1",
      "Nav item 2",
      "Nav item 3",
      "Nav item 4",
      "Nav item 5",
      "Bottom item 1",
      "Bottom item 2",
    ]) {
      expect(rail).toContainElement(screen.getByRole("button", { name }));
    }
  });

  it("selecting another rail item activates it and opens its menu", async () => {
    const user = renderApp();
    await user.click(screen.getByRole("button", { name: "Menu item 4" }));
    await user.click(screen.getByRole("button", { name: "Hide menu" }));

    await user.click(screen.getByRole("button", { name: "Nav item 3" }));

    expect(
      screen.getByRole("button", { name: "Nav item 3", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nav item 1", pressed: false }),
    ).toBeInTheDocument();
    const menu = screen.getByRole("region", { name: "Nav item 3 menu" });
    expect(menu).toHaveTextContent("Nav item 3");
    expect(
      screen.getByRole("button", { name: "Menu item 1", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Menu item 4", pressed: false }),
    ).toBeInTheDocument();
  });

  it("selecting the active rail item hides and then shows the menu", async () => {
    const user = renderApp();
    const active = screen.getByRole("button", { name: "Nav item 1" });

    await user.click(active);
    expect(
      screen.queryByRole("region", { name: "Nav item 1 menu" }),
    ).not.toBeInTheDocument();

    await user.click(active);
    expect(
      screen.getByRole("region", { name: "Nav item 1 menu" }),
    ).toBeInTheDocument();
  });

  it("toggle button hides and shows the menu and updates its label", async () => {
    const user = renderApp();

    await user.click(
      screen.getByRole("button", { name: "Hide menu", expanded: true }),
    );
    expect(
      screen.queryByRole("region", { name: "Nav item 1 menu" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show menu", expanded: false }),
    );
    expect(
      screen.getByRole("region", { name: "Nav item 1 menu" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide menu" }),
    ).toBeInTheDocument();
  });

  it("selecting a menu item marks it pressed", async () => {
    const user = renderApp();

    await user.click(screen.getByRole("button", { name: "Menu item 4" }));

    expect(
      screen.getByRole("button", { name: "Menu item 4", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Menu item 1", pressed: false }),
    ).toBeInTheDocument();
  });

  it("closing the side panel removes it", async () => {
    const user = renderApp();
    expect(
      screen.getByRole("complementary", { name: "Side panel" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Side panel" }));

    expect(
      screen.queryByRole("complementary", { name: "Side panel" }),
    ).not.toBeInTheDocument();
  });
});
