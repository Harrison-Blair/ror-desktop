import { markdownLanguage } from "@codemirror/lang-markdown";
import { WidgetType } from "@codemirror/view";
import type { TableSource } from "./markdown";

type Node = ReturnType<typeof markdownLanguage.parser.parse>["topNode"];
function appendInline(parent: HTMLElement, raw: string, node: Node) {
  const tag =
    node.name === "StrongEmphasis"
      ? "strong"
      : node.name === "Emphasis"
        ? "em"
        : node.name === "InlineCode"
          ? "code"
          : null;
  const target = tag ? document.createElement(tag) : parent;
  const appendText = (from: number, to: number) => {
    const text = raw.slice(from, to);
    target.append(
      document.createTextNode(
        tag === "code" ? text.replace(/\\\|/g, "|") : text,
      ),
    );
  };
  let cursor = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    appendText(cursor, child.from);
    if (child.name === "Escape")
      target.append(
        document.createTextNode(raw.slice(child.from + 1, child.to)),
      );
    else if (!/^(EmphasisMark|CodeMark)$/.test(child.name))
      appendInline(target, raw, child);
    cursor = child.to;
  }
  appendText(cursor, node.to);
  if (tag) parent.append(target);
}
export class TableWidget extends WidgetType {
  constructor(readonly source: TableSource) {
    super();
  }
  eq(other: TableWidget) {
    return JSON.stringify(this.source) === JSON.stringify(other.source);
  }
  toDOM() {
    const container = document.createElement("div");
    container.className = "markdown-table-preview";
    container.setAttribute("aria-label", "Table preview");
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const body = document.createElement("tbody");
    this.source.rows.forEach((values, index) => {
      const row = document.createElement("tr");
      values.forEach((raw, column) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        cell.style.textAlign = this.source.alignments[column];
        if (index === 0) cell.setAttribute("scope", "col");
        appendInline(cell, raw, markdownLanguage.parser.parse(raw).topNode);
        row.append(cell);
      });
      (index === 0 ? head : body).append(row);
    });
    table.append(head, body);
    container.append(table);
    return container;
  }
  ignoreEvent() {
    return true;
  }
}
