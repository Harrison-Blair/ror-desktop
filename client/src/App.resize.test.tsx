import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "@/App";

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

const handle = (name: string) => screen.getByRole("separator", { name });

function drag(handleName: string, fromX: number, toX: number) {
  fireEvent.pointerDown(handle(handleName), { clientX: fromX });
  fireEvent.pointerMove(window, { clientX: toX });
  fireEvent.pointerUp(window, { clientX: toX });
}

const menu = () => screen.getByRole("region", { name: "Nav item 1 menu" });
const sidePanel = () =>
  screen.getByRole("complementary", { name: "Side panel" });
const toggleMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: /(Hide|Show) menu/ }));

// 1252px window: 1200px beside the rail, so one share is 400px with all
// three areas open and 600px with one panel closed.
describe("resizing panels", () => {
  beforeEach(() => {
    setWindowWidth(1252);
    render(<App />);
  });

  it("marks both handles as vertical separators", () => {
    expect(handle("Resize menu")).toHaveAttribute(
      "aria-orientation",
      "vertical",
    );
    expect(handle("Resize side panel")).toHaveAttribute(
      "aria-orientation",
      "vertical",
    );
  });

  it("dragging the menu handle right widens the menu", () => {
    expect(menu()).toHaveStyle({ width: "220px" });

    drag("Resize menu", 300, 380);

    expect(menu()).toHaveStyle({ width: "300px" });
  });

  it("dragging the side panel handle left widens the panel", () => {
    expect(sidePanel()).toHaveStyle({ width: "360px" });

    drag("Resize side panel", 900, 870);

    expect(sidePanel()).toHaveStyle({ width: "390px" });
  });

  it("stops following the pointer after release", () => {
    drag("Resize menu", 300, 340);
    fireEvent.pointerMove(window, { clientX: 500 });

    expect(menu()).toHaveStyle({ width: "260px" });
  });

  it("limits the menu to one share", () => {
    drag("Resize menu", 300, 900);
    expect(menu()).toHaveStyle({ width: "400px" });

    fireEvent.click(screen.getByRole("button", { name: "Close Side panel" }));
    drag("Resize menu", 300, 900);
    expect(menu()).toHaveStyle({ width: "600px" });
  });

  it("limits the side panel to one share", () => {
    drag("Resize side panel", 900, 300);
    expect(sidePanel()).toHaveStyle({ width: "400px" });

    toggleMenu();
    drag("Resize side panel", 900, 300);
    expect(sidePanel()).toHaveStyle({ width: "600px" });
  });

  it("keeps the limited width after a drag past the share", () => {
    drag("Resize side panel", 900, 660);
    expect(sidePanel()).toHaveStyle({ width: "400px" });

    toggleMenu();
    expect(sidePanel()).toHaveStyle({ width: "400px" });
  });

  it("keeps each panel at its minimum width", () => {
    drag("Resize menu", 300, 0);
    expect(menu()).toHaveStyle({ width: "180px" });

    drag("Resize side panel", 900, 1250);
    expect(sidePanel()).toHaveStyle({ width: "280px" });
  });

  it("redraws the panel at the new share when the menu reopens", () => {
    toggleMenu();
    drag("Resize side panel", 900, 710);
    expect(sidePanel()).toHaveStyle({ width: "550px" });

    toggleMenu();
    expect(sidePanel()).toHaveStyle({ width: "400px" });

    toggleMenu();
    expect(sidePanel()).toHaveStyle({ width: "550px" });
  });

  it("re-clamps the drawn width when the window resizes", () => {
    drag("Resize menu", 300, 460);
    expect(menu()).toHaveStyle({ width: "380px" });

    setWindowWidth(1102);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(menu()).toHaveStyle({ width: "350px" });

    setWindowWidth(1252);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(menu()).toHaveStyle({ width: "380px" });
  });

  it("starts a drag from the drawn width of a squeezed panel", () => {
    toggleMenu();
    drag("Resize side panel", 900, 710);
    toggleMenu();
    expect(sidePanel()).toHaveStyle({ width: "400px" });

    drag("Resize side panel", 900, 950);

    expect(sidePanel()).toHaveStyle({ width: "350px" });
  });

  it("double-clicking a handle resets that panel's width", () => {
    drag("Resize menu", 300, 400);
    drag("Resize side panel", 900, 880);

    fireEvent.doubleClick(handle("Resize menu"));
    expect(menu()).toHaveStyle({ width: "220px" });
    expect(sidePanel()).toHaveStyle({ width: "380px" });

    fireEvent.doubleClick(handle("Resize side panel"));
    expect(sidePanel()).toHaveStyle({ width: "360px" });
  });

  it("restores text selection when a drag ends or is cancelled", () => {
    fireEvent.pointerDown(handle("Resize menu"), { clientX: 300 });
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.pointerUp(window);
    expect(document.body.style.userSelect).toBe("");

    fireEvent.pointerDown(handle("Resize menu"), { clientX: 300 });
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.pointerCancel(window);
    expect(document.body.style.userSelect).toBe("");
  });

  it("ignores a drag with a non-primary button", () => {
    fireEvent.pointerDown(handle("Resize menu"), { clientX: 300, button: 2 });
    fireEvent.pointerMove(window, { clientX: 380 });

    expect(menu()).toHaveStyle({ width: "220px" });
    expect(document.body.style.userSelect).toBe("");
  });
});
