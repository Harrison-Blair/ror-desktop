import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { headingLines, tableSources } from "./markdown";
import { TableWidget } from "./tables";

const parse = (doc: string) =>
  EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
describe("Markdown formatting", () => {
  it("recognizes all heading levels and Setext but ignores fenced syntax", () => {
    const state = parse(
      "# one\n## two\n### three\n#### four\n##### five\n###### six\n\nTitle\n=====\n\nSubtitle\n-----\n\n```md\n# ignored\n```",
    );
    expect(headingLines(state).map((line) => line.level)).toEqual([
      1, 2, 3, 4, 5, 6, 1, 2,
    ]);
  });
  it("preserves empty columns, escaped pipes and header width", () => {
    const state = parse(
      "| | Mid | |\n| :- | :-: | -: |\n| | x \\| y | |\n| a | | b |\n| only |\n| 1 | 2 | 3 | ignored |\n\n```\n| no | table |\n| - | - |\n```",
    );
    const tables = tableSources(state);
    expect(tables).toHaveLength(1);
    expect(tables[0].alignments).toEqual(["left", "center", "right"]);
    expect(tables[0].rows).toEqual([
      ["", "Mid", ""],
      ["", "x \\| y", ""],
      ["a", "", "b"],
      ["only", "", ""],
      ["1", "2", "3"],
    ]);
    expect(tableSources(parse("A | B\n--- | ---\nx | y"))[0].rows).toEqual([
      ["A", "B"],
      ["x", "y"],
    ]);
  });
  it("renders semantic inline formatting and inert HTML as text", () => {
    const table = tableSources(
      parse(
        "| A | B |\n| - | - |\n| **bold** and *em* `code` | <img src=x onerror=alert(1)> \\| x |",
      ),
    )[0];
    const dom = new TableWidget(table).toDOM();
    expect(dom.querySelector("th")?.getAttribute("scope")).toBe("col");
    expect(dom.querySelector("strong")?.textContent).toBe("bold");
    expect(dom.querySelector("em")?.textContent).toBe("em");
    expect(dom.querySelector("code")?.textContent).toBe("code");
    expect(dom.querySelector("img")).toBeNull();
    expect(dom.textContent).toContain("<img src=x onerror=alert(1)> | x");
  });
});
