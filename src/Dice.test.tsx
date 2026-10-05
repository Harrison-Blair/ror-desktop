import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import type { Bootstrap } from "./api/workspace";
import { deferred, fixture, preferences } from "./test/workspace-fixture";

const motion = () =>
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addListener() {},
    removeListener() {},
  }));
afterEach(() => vi.unstubAllGlobals());
it("exposes disabled startup rail then standalone Dice and direct bottom picker", async () => {
  motion();
  const api = fixture();
  const pending = deferred<Bootstrap>();
  api.initializeWorkspace.mockReturnValue(pending.promise);
  render(<App api={api} />);
  for (const name of ["Player", "Notes", "Dice", "Workspace folder"])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  await act(async () =>
    pending.resolve({ preferences, workspace: null, restoreError: null }),
  );
  expect(screen.getByText("Open a folder to start")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Dice" }));
  expect(screen.getByText("Temporary session")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Roll expression" })).toHaveValue(
    "1d100",
  );
  expect(screen.getByText("Your rolls will appear here.")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Workspace folder" }),
  );
  expect(api.pickWorkspace).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { name: "Dice" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Notes" }));
  expect(screen.getByText("Open a folder to start")).toBeInTheDocument();
});
it("quick rolls preserve expression, Enter submits, reroll ignores edited invalid input and clear retains result", async () => {
  motion();
  render(<App api={fixture()} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Dice" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Dice" }));
  const input = screen.getByRole("textbox", { name: "Roll expression" });
  fireEvent.change(input, { target: { value: "2d1+3" } });
  await userEvent.click(screen.getByRole("button", { name: "Roll d4" }));
  expect(input).toHaveValue("2d1+3");
  input.focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("status")).toHaveTextContent("2d1 (1, 1) + 3 = 5");
  fireEvent.change(input, { target: { value: "d6+-2" } });
  await userEvent.click(screen.getByRole("button", { name: "Roll" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Use notation");
  await userEvent.click(screen.getByRole("button", { name: "Roll again" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getAllByRole("row")).toHaveLength(4);
  await userEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(screen.getByText("Your rolls will appear here.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Roll again" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Line numbers" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Player" }));
  await userEvent.click(screen.getByRole("button", { name: "Dice" }));
  expect(screen.getByRole("textbox", { name: "Roll expression" })).toHaveValue(
    "d6+-2",
  );
  expect(screen.getByRole("status")).toHaveTextContent("= 5");
});
it("missing remembered folder keeps recovery after visiting Dice", async () => {
  const api = fixture();
  api.initializeWorkspace.mockResolvedValue({
    preferences: { ...preferences, lastFolder: "/lost/campaign" },
    workspace: null,
    restoreError: "Missing folder",
  });
  render(<App api={api} />);
  await screen.findByText("Can't find campaign");
  await userEvent.click(screen.getByRole("button", { name: "Dice" }));
  expect(screen.getByText("Temporary session")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Player" }));
  expect(screen.getByText("Can't find campaign")).toBeInTheDocument();
});

it("keeps a live region before first roll and updates it once for identical outcomes", async () => {
  motion();
  render(<App api={fixture()} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Dice" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Dice" }));
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("");
  expect(status).toHaveAttribute("aria-live", "polite");
  fireEvent.change(screen.getByRole("textbox", { name: "Roll expression" }), {
    target: { value: "d1" },
  });
  await userEvent.click(screen.getByRole("button", { name: /^Roll$/ }));
  expect(screen.getByRole("status")).toBe(status);
  expect(status).toHaveTextContent("Roll 1: 1d1 (1) = 1");
  await userEvent.click(screen.getByRole("button", { name: "Roll again" }));
  expect(status).toHaveTextContent("Roll 2: 1d1 (1) = 1");
  await userEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(status).toHaveTextContent("Roll 2: 1d1 (1) = 1");
});

it("announces a successful roll only once across the cosmetic animation", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  }));
  render(<App api={fixture()} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Dice" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Dice" }));
  const status = screen.getByRole("status");
  const announcements: string[] = [];
  const observer = new MutationObserver(() =>
    announcements.push(status.textContent ?? ""),
  );
  observer.observe(status, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByRole("textbox", { name: "Roll expression" }), {
      target: { value: "d1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Roll$/ }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(announcements).toEqual(["Roll 1: 1d1 (1) = 1"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(announcements).toEqual(["Roll 1: 1d1 (1) = 1"]);
  } finally {
    observer.disconnect();
    vi.useRealTimers();
  }
});
