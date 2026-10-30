import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

const show = (text: string, onOpenLink = vi.fn()) =>
  render(<Markdown text={text} onOpenLink={onOpenLink} />).container;

describe("Markdown", () => {
  it("renders headings, emphasis, code, lists, quotes and tables", () => {
    const view = show(
      [
        "# Ogres",
        "",
        "Some *soft* and **loud** and ~~old~~ `d20` text.",
        "",
        "3. three",
        "4. four",
        "",
        "- item",
        "",
        "> quoted",
        "",
        "```",
        "x < y",
        "```",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
      ].join("\n"),
    );

    expect(screen.getByRole("heading", { name: "Ogres" })).toBeInTheDocument();
    expect(view.querySelector("em")).toHaveTextContent("soft");
    expect(view.querySelector("strong")).toHaveTextContent("loud");
    expect(view.querySelector("s")).toHaveTextContent("old");
    expect(view.querySelector("p code")).toHaveTextContent("d20");
    expect(view.querySelector("ol")).toHaveAttribute("start", "3");
    expect(view.querySelectorAll("li")).toHaveLength(3);
    expect(view.querySelector("blockquote")).toHaveTextContent("quoted");
    expect(view.querySelector("pre")).toHaveTextContent("x < y");
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("shows raw HTML as text and loads no images", () => {
    const view = show(
      '<img src="x" onerror="alert(1)"> and <b>bold</b>\n\n![a map](https://x.y/map.png)',
    );

    expect(view.querySelector("img")).toBeNull();
    expect(view.querySelector("b")).toBeNull();
    expect(view).toHaveTextContent('<img src="x" onerror="alert(1)">');
    expect(view).toHaveTextContent("a map");
  });

  it("opens web links through the app and drops other links", async () => {
    const onOpenLink = vi.fn();
    const view = show(
      "[site](https://x.y/a) and [bad](javascript:alert(1)) and https://b.c",
      onOpenLink,
    );

    await userEvent.click(screen.getByRole("link", { name: "site" }));
    expect(onOpenLink).toHaveBeenCalledWith("https://x.y/a");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(view).toHaveTextContent("site and bad and https://b.c");
    expect(
      screen.getByRole("link", { name: "https://b.c" }),
    ).toBeInTheDocument();
  });
});
