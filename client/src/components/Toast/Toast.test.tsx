import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/components/Toast/Toast";

function Notifier() {
  const notify = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => notify({ kind: "info", message: "Session saved." })}
      >
        Info
      </button>
      <button
        type="button"
        onClick={() =>
          notify({ kind: "error", message: "Could not save the session." })
        }
      >
        Error
      </button>
    </>
  );
}

function setup() {
  render(
    <ToastProvider>
      <Notifier />
    </ToastProvider>,
  );
}

const region = () => screen.getByRole("region", { name: "Notifications" });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides an info toast after 5 seconds", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    advance(4900);
    expect(within(region()).getByRole("status")).toBeInTheDocument();

    advance(100);
    expect(within(region()).queryByRole("status")).not.toBeInTheDocument();
  });

  it("pauses the info countdown while hovered", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    advance(2000);
    fireEvent.mouseEnter(screen.getByRole("status"));
    advance(6000);
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("status"));
    advance(2900);
    expect(screen.getByRole("status")).toBeInTheDocument();
    advance(100);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pauses the info countdown while it holds focus", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    advance(2000);
    act(() =>
      screen.getByRole("button", { name: "Dismiss notification" }).focus(),
    );
    advance(6000);
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() =>
      screen.getByRole("button", { name: "Dismiss notification" }).blur(),
    );
    advance(2900);
    expect(screen.getByRole("status")).toBeInTheDocument();
    advance(100);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps an error toast until it is dismissed", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    advance(6000);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Error: Could not save the session.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces a duplicate toast with a new element", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    const first = screen.getByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Error" }));

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).not.toBe(first);
  });

  it("gives errors role alert and info role status inside the region", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    fireEvent.click(screen.getByRole("button", { name: "Info" }));

    expect(within(region()).getByRole("alert")).toHaveTextContent(
      "Could not save the session.",
    );
    expect(within(region()).getByRole("status")).toHaveTextContent(
      "Session saved.",
    );
  });
});
