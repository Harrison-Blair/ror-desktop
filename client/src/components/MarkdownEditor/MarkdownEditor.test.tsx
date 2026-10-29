import { act, fireEvent, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "@/components/MarkdownEditor/MarkdownEditor";
import styles from "@/components/MarkdownEditor/MarkdownEditor.module.css";

const text = "see [site](https://x.y) and <https://a.b>\n";

// A click that the editor handles itself measures text, which jsdom can't.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

function renderEditor(raw = false, value = text) {
  const onOpenLink = vi.fn();
  const view = render(
    <MarkdownEditor
      value={value}
      onChange={() => {}}
      raw={raw}
      label="Note"
      onOpenLink={onOpenLink}
    />,
  );
  const links = () => [...view.container.querySelectorAll(`.${styles.link}`)];
  return { ...view, onOpenLink, links };
}

describe("MarkdownEditor links", () => {
  it("opens a link and an autolink on Ctrl+click", () => {
    const { onOpenLink, links } = renderEditor();
    const [link, autolink] = links();
    expect(link).toHaveTextContent("site");
    expect(link).toHaveAttribute("title", "Ctrl+click to open");

    fireEvent.mouseDown(link, { button: 0, ctrlKey: true });
    expect(onOpenLink).toHaveBeenLastCalledWith("https://x.y");
    fireEvent.mouseDown(autolink, { button: 0, ctrlKey: true });
    expect(onOpenLink).toHaveBeenLastCalledWith("https://a.b");
    expect(onOpenLink).toHaveBeenCalledTimes(2);
  });

  it("opens a reference link through its definition", () => {
    const { onOpenLink, links } = renderEditor(
      false,
      [
        "[site][ref] [x][] [Two  Words] [none][missing]",
        "",
        "[REF]: https://example.com",
        "[x]: <a b.md>",
        "[two\n words]: two.md",
      ].join("\n"),
    );
    const [full, collapsed, shortcut, missing] = links();
    for (const [link, href] of [
      [full, "https://example.com"],
      [collapsed, "a b.md"],
      [shortcut, "two.md"],
    ] as const) {
      expect(link).toHaveAttribute("title", "Ctrl+click to open");
      fireEvent.mouseDown(link, { button: 0, ctrlKey: true });
      expect(onOpenLink).toHaveBeenLastCalledWith(href);
    }

    expect(missing).toHaveTextContent("none");
    expect(missing).not.toHaveAttribute("title");
    fireEvent.mouseDown(missing, { button: 0, ctrlKey: true });
    expect(onOpenLink).toHaveBeenCalledTimes(3);
  });

  it("does not open a link on a plain click", () => {
    const { onOpenLink, links } = renderEditor();
    fireEvent.mouseDown(links()[0], { button: 0 });
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("shows links as plain text that doesn't open in raw source", () => {
    const { onOpenLink, links, getByRole } = renderEditor(true);
    expect(links()).toHaveLength(0);
    fireEvent.mouseDown(getByRole("textbox").firstElementChild as Element, {
      button: 0,
      ctrlKey: true,
    });
    expect(onOpenLink).not.toHaveBeenCalled();
  });

  it("shows the pointer over a link only while Ctrl is held", () => {
    const { container, links } = renderEditor();
    const root = container.firstElementChild?.firstElementChild as Element;
    const link = links()[0];
    const held = () => root.classList.contains(styles.modifierHeld);
    expect(held()).toBe(false);
    expect(getComputedStyle(link).cursor).not.toBe("pointer");

    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    expect(held()).toBe(true);
    expect(getComputedStyle(link).cursor).toBe("pointer");
    // WebKitGTK still reports Ctrl as held on Control's own keyup.
    fireEvent.keyUp(window, { key: "Control", ctrlKey: true });
    expect(held()).toBe(false);
    expect(getComputedStyle(link).cursor).not.toBe("pointer");

    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    act(() => window.dispatchEvent(new Event("blur")));
    expect(held()).toBe(false);
  });

  it("corrects the held state when the mouse moves over the editor", () => {
    const { container } = renderEditor();
    const root = container.firstElementChild?.firstElementChild as Element;
    const held = () => root.classList.contains(styles.modifierHeld);

    fireEvent.mouseMove(root, { ctrlKey: true });
    expect(held()).toBe(true);
    // A keyup that never arrived is corrected by the next move.
    fireEvent.mouseMove(root, { ctrlKey: false });
    expect(held()).toBe(false);
  });
});
