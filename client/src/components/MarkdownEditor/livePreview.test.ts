import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  livePreview,
  livePreviewDecorations,
  setFocused,
  TableWidget,
} from "@/components/MarkdownEditor/livePreview";
import styles from "@/components/MarkdownEditor/MarkdownEditor.module.css";

// The cursor goes where `‸` is, and `‸` is removed from the text. The
// editor has focus unless `focused` is false.
function stateOf(marked: string, focused = true) {
  const cursor = marked.indexOf("‸");
  const state = EditorState.create({
    doc: marked.replace("‸", ""),
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ extensions: GFM }), livePreview()],
  });
  return state.update({ effects: setFocused.of(focused) }).state;
}

// The text as live preview shows it: each replaced range becomes its
// widget's text, "[table]" for a table, and nothing when there is no widget.
function shown(marked: string, focused = true) {
  const state = stateOf(marked, focused);
  const parts: string[] = [];
  let pos = 0;
  livePreviewDecorations(state).between(0, state.doc.length, (from, to, d) => {
    if (!d.point) return;
    parts.push(state.sliceDoc(pos, from));
    const widget = d.spec.widget;
    if (widget instanceof TableWidget) parts.push("[table]");
    else if (widget)
      parts.push((widget.toDOM() as HTMLElement).textContent ?? "");
    pos = to;
  });
  parts.push(state.sliceDoc(pos));
  return parts.join("");
}

// The classes styling each range of text.
function marks(marked: string) {
  const state = stateOf(marked);
  const out: [string, string][] = [];
  livePreviewDecorations(state).between(0, state.doc.length, (from, to, d) => {
    if (!d.point && d.spec.class && from < to) {
      out.push([state.sliceDoc(from, to), d.spec.class]);
    }
  });
  return out;
}

// The class of each line's line decoration, or "" for a line with none.
function lineClasses(marked: string) {
  const state = stateOf(marked);
  const out: string[] = Array(state.doc.lines).fill("");
  livePreviewDecorations(state).between(0, state.doc.length, (from, to, d) => {
    if (from === to && d.spec.class) {
      out[state.doc.lineAt(from).number - 1] = d.spec.class;
    }
  });
  return out;
}

const table =
  "| Name | Role |\n| --- | --- |\n| Ada | GM \\| host |\n| Ben |  |";

describe("live preview", () => {
  it("hides heading markers off the cursor's line and shows them on it", () => {
    expect(shown("# Title\n\n## Sub ##\n\nbody‸")).toBe("Title\n\nSub\n\nbody");
    expect(shown("# Ti‸tle\n\n## Sub\n\nbody")).toBe("# Title\n\nSub\n\nbody");
  });

  it("renders the cursor's line only while the editor has focus", () => {
    expect(shown("# Ti‸tle\nbody", false)).toBe("Title\nbody");
    expect(shown("# Ti‸tle\nbody", true)).toBe("# Title\nbody");
  });

  it("hides bold, italic, strike-through and code markers off the cursor's line", () => {
    expect(shown("a **b** _c_ ~~d~~ `e`\n‸")).toBe("a b c d e\n");
    expect(shown("a **b** _c_‸ ~~d~~ `e`\n")).toBe("a **b** _c_ ~~d~~ `e`\n");
    expect(marks("a **b** _c_ ~~d~~ `e`\n‸")).toEqual(
      expect.arrayContaining([
        ["**b**", styles.strong],
        ["_c_", styles.em],
        ["~~d~~", styles.strike],
        ["`e`", styles.code],
      ]),
    );
  });

  it("shows a link's text off the cursor's line and its Markdown on it", () => {
    expect(shown('see [site](https://x.y "T") now\n‸')).toBe("see site now\n");
    expect(shown('see [si‸te](https://x.y "T") now\n')).toBe(
      'see [site](https://x.y "T") now\n',
    );
    expect(marks("[site](https://x.y)\n‸")).toEqual([
      ["[site](https://x.y)", styles.link],
    ]);
  });

  it("shows bullets, quotes, rules and fenced code without their markers", () => {
    expect(shown("- one\n2. two\n> said\n\n---\n\n```js\nx\n```\n‸")).toBe(
      "• one\n2. two\nsaid\n\n\n\n\nx\n\n",
    );
  });

  it("keeps styling the other lines of a quote on the cursor's line", () => {
    expect(shown("> first‸\n> second")).toBe("> first\nsecond");
    expect(lineClasses("> first‸\n> second")).toEqual(["", styles.quote]);
  });

  it("keeps styling the other lines of a fenced code block on the cursor's line", () => {
    expect(shown("```js\nx‸\n```")).toBe("\nx\n");
    expect(lineClasses("```js\nx‸\n```")).toEqual([
      styles.codeBlock,
      "",
      styles.codeBlock,
    ]);
    expect(shown("```js‸\nx\n```")).toBe("```js\nx\n");
    expect(lineClasses("```js‸\nx\n```")).toEqual([
      "",
      styles.codeBlock,
      styles.codeBlock,
    ]);
  });

  it("keeps a list number and styles it as a marker", () => {
    expect(shown("2. two\n‸")).toBe("2. two\n");
    expect(marks("2. two\n‸")).toEqual([["2.", styles.bullet]]);
  });

  it("cuts or pads table rows to the header's width", () => {
    const state = stateOf("| a | b |\n| - | - |\n| x |\n| 1 | 2 | 3 |\n\n‸");
    const widgets: TableWidget[] = [];
    livePreviewDecorations(state).between(0, state.doc.length, (_f, _t, d) => {
      if (d.spec.widget instanceof TableWidget) widgets.push(d.spec.widget);
    });
    expect(widgets).toHaveLength(1);
    expect(widgets[0].rows).toEqual([
      ["x", ""],
      ["1", "2"],
    ]);
  });

  it("draws a table as a grid off the cursor's lines and as text on them", () => {
    const state = stateOf(`${table}\n\n‸`);
    const widgets: unknown[] = [];
    livePreviewDecorations(state).between(0, state.doc.length, (_f, _t, d) => {
      widgets.push(d.spec.widget);
    });
    expect(widgets).toHaveLength(1);
    const grid = widgets[0] as TableWidget;
    expect(grid.head).toEqual(["Name", "Role"]);
    expect(grid.rows).toEqual([
      ["Ada", "GM | host"],
      ["Ben", ""],
    ]);
    const dom = grid.toDOM();
    expect(dom.tagName).toBe("TABLE");
    expect(dom.querySelectorAll("th")).toHaveLength(2);
    expect(dom.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(shown(`${table}\n\n‸`)).toBe("[table]\n\n");

    const onTable = table.replace("Ada", "A‸da");
    expect(shown(`${onTable}\n\n`)).toBe(`${table}\n\n`);
  });

  it("shows the cursor's line as Markdown when the editor gains focus", async () => {
    const view = new EditorView({
      doc: "# Title\nbody",
      extensions: [markdown({ extensions: GFM }), livePreview()],
      parent: document.body,
    });
    expect(view.contentDOM.textContent).toBe("Titlebody");
    view.focus();
    await waitFor(() =>
      expect(view.contentDOM.textContent).toBe("# Titlebody"),
    );
    view.contentDOM.blur();
    await waitFor(() => expect(view.contentDOM.textContent).toBe("Titlebody"));
    view.destroy();
  });

  it("never changes the document text", () => {
    const text = `# Title\n**b** [l](u)\n${table}\n`;
    const view = new EditorView({
      doc: text,
      extensions: [markdown({ extensions: GFM }), livePreview()],
    });
    for (let pos = 0; pos <= text.length; pos += 3) {
      view.dispatch({ selection: { anchor: pos } });
    }
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.state.doc.toString()).toBe(text);
    expect(view.contentDOM.querySelector("table")).not.toBeNull();
    view.destroy();
  });
});
