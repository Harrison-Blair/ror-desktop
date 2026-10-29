import { syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  type Range,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import styles from "./MarkdownEditor.module.css";

const HEADING_CLASSES: Record<string, string> = {
  ATXHeading1: styles.h1,
  ATXHeading2: styles.h2,
  ATXHeading3: styles.h3,
  ATXHeading4: styles.h4,
  ATXHeading5: styles.h5,
  ATXHeading6: styles.h6,
};

const MARK_CLASSES: Record<string, string> = {
  Emphasis: styles.em,
  StrongEmphasis: styles.strong,
  Strikethrough: styles.strike,
  InlineCode: styles.code,
  Link: styles.link,
};

// Markers hidden off the cursor's line, and the nodes they must sit in.
const HIDDEN_MARKS: Record<string, string[]> = {
  EmphasisMark: ["Emphasis", "StrongEmphasis"],
  StrikethroughMark: ["Strikethrough"],
  CodeMark: ["InlineCode"],
};

const hide = Decoration.replace({});

// Text shown in place of a marker, such as a bullet or a rule.
class MarkerWidget extends WidgetType {
  constructor(
    readonly className: string,
    readonly text: string,
  ) {
    super();
  }

  eq(other: MarkerWidget) {
    return other.className === this.className && other.text === this.text;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    return span;
  }
}

// Splits a table line into its cells, keeping escaped pipes in the cell.
function cells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export class TableWidget extends WidgetType {
  constructor(
    readonly head: string[],
    readonly rows: string[][],
  ) {
    super();
  }

  eq(other: TableWidget) {
    return JSON.stringify(other) === JSON.stringify(this);
  }

  toDOM() {
    const table = document.createElement("table");
    table.className = styles.table;
    const row = (values: string[], tag: "th" | "td") => {
      const tr = document.createElement("tr");
      for (const value of values) {
        const cell = document.createElement(tag);
        cell.textContent = value;
        tr.append(cell);
      }
      return tr;
    };
    table.createTHead().append(row(this.head, "th"));
    const body = table.createTBody();
    for (const values of this.rows) body.append(row(values, "td"));
    return table;
  }

  // Lets a click on the table place the cursor there, which shows its text.
  ignoreEvent() {
    return false;
  }
}

function tableWidget(doc: Text, from: number, to: number) {
  const lines: string[] = [];
  for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
    lines.push(doc.line(n).text);
  }
  // The second line is the delimiter row.
  const [head, , ...rows] = lines.map(cells);
  return new TableWidget(head, rows);
}

// Sets whether the editor has focus.
export const setFocused = StateEffect.define<boolean>();

const focusedField = StateField.define<boolean>({
  create: () => false,
  update: (focused, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setFocused)) focused = effect.value;
    }
    return focused;
  },
});

// The decorations that live preview draws for `state`. While the editor has
// focus, lines that hold the cursor or the selection get none, so they show
// their Markdown. Without focus every line renders. A fenced code block or a
// table counts as active when any of its lines is.
export function livePreviewDecorations(state: EditorState): DecorationSet {
  const { doc } = state;
  const active = new Set<number>();
  const ranges = state.field(focusedField, false) ? state.selection.ranges : [];
  for (const range of ranges) {
    const last = doc.lineAt(range.to).number;
    for (let n = doc.lineAt(range.from).number; n <= last; n++) active.add(n);
  }
  const isActive = (from: number, to: number) => {
    const last = doc.lineAt(to).number;
    for (let n = doc.lineAt(from).number; n <= last; n++) {
      if (active.has(n)) return true;
    }
    return false;
  };
  const eachLine = (from: number, to: number, className: string) => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      decorations.push(
        Decoration.line({ class: className }).range(doc.line(n).from),
      );
    }
  };
  // Hides a marker and the space after it.
  const hideMarker = (from: number, to: number) => {
    const end = doc.sliceString(to, to + 1) === " " ? to + 1 : to;
    decorations.push(hide.range(from, end));
  };

  const decorations: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      const { name, from, to } = node;
      if (name === "Table") {
        if (isActive(from, to)) return false;
        const start = doc.lineAt(from).from;
        const end = doc.lineAt(to).to;
        decorations.push(
          Decoration.replace({
            widget: tableWidget(doc, start, end),
            block: true,
          }).range(start, end),
        );
        return false;
      }
      if (name === "FencedCode") {
        if (isActive(from, to)) return false;
        eachLine(from, to, styles.codeBlock);
        for (
          let child = node.node.firstChild;
          child;
          child = child.nextSibling
        ) {
          if (child.name === "CodeMark" || child.name === "CodeInfo") {
            decorations.push(hide.range(child.from, child.to));
          }
        }
        return false;
      }
      if (isActive(from, to)) return;
      const parent = node.node.parent?.name ?? "";
      if (name in HEADING_CLASSES) {
        eachLine(from, to, HEADING_CLASSES[name]);
      } else if (name === "HeaderMark" && parent.startsWith("ATXHeading")) {
        if (from === doc.lineAt(from).from) {
          hideMarker(from, to);
        } else {
          // A closing run of #s, with the spaces before it.
          let start = from;
          while (doc.sliceString(start - 1, start) === " ") start--;
          decorations.push(hide.range(start, to));
        }
      } else if (name === "Blockquote") {
        eachLine(from, to, styles.quote);
      } else if (name === "QuoteMark") {
        hideMarker(from, to);
      } else if (name === "ListMark") {
        if (
          parent === "ListItem" &&
          node.node.parent?.parent?.name === "BulletList"
        ) {
          decorations.push(
            Decoration.replace({
              widget: new MarkerWidget(styles.bullet, "•"),
            }).range(from, to),
          );
        }
      } else if (name === "HorizontalRule") {
        decorations.push(
          Decoration.replace({
            widget: new MarkerWidget(styles.rule, ""),
          }).range(from, to),
        );
      } else if (name in MARK_CLASSES) {
        decorations.push(
          Decoration.mark({ class: MARK_CLASSES[name] }).range(from, to),
        );
        if (name === "Link") {
          // Leaves only the text between the brackets.
          const [open, close] = node.node.getChildren("LinkMark");
          if (close) {
            decorations.push(hide.range(open.from, open.to));
            decorations.push(hide.range(close.from, to));
          }
        }
      } else if (HIDDEN_MARKS[name]?.includes(parent)) {
        decorations.push(hide.range(from, to));
      }
    },
  });
  return Decoration.set(decorations, true);
}

const livePreviewField = StateField.define<DecorationSet>({
  create: livePreviewDecorations,
  update: (decorations, tr) =>
    tr.docChanged ||
    tr.selection ||
    tr.startState.field(focusedField, false) !== tr.state.field(focusedField) ||
    syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? livePreviewDecorations(tr.state)
      : decorations,
  // Given as a value, since a table widget replaces whole lines.
  provide: (field) => EditorView.decorations.from(field),
});

export const livePreview = () => [
  focusedField,
  livePreviewField,
  EditorView.focusChangeEffect.of((_state, focusing) =>
    setFocused.of(focusing),
  ),
];
