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
  ViewPlugin,
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
  Autolink: styles.link,
};

const LINKS = ["Link", "Autolink"];

const mac = /Mac|iPhone|iPad/.test(navigator.platform);

// Shown over a link.
export const OPEN_LINK_TITLE = `${mac ? "Cmd" : "Ctrl"}+click to open`;

// Markers hidden off the cursor's line, and the nodes they must sit in.
const HIDDEN_MARKS: Record<string, string[]> = {
  EmphasisMark: ["Emphasis", "StrongEmphasis"],
  StrikethroughMark: ["Strikethrough"],
  CodeMark: ["InlineCode"],
};

const hide = Decoration.replace({});

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

// A link label as CommonMark matches it: without brackets, case and runs of
// whitespace ignored.
const normalLabel = (label: string) =>
  label.slice(1, -1).trim().replace(/\s+/g, " ").toLowerCase();

// A target may be written in angle brackets.
const urlText = (state: EditorState, url: SyntaxNode) =>
  state.sliceDoc(url.from, url.to).replace(/^<(.*)>$/, "$1");

// The targets of the link reference definitions, by normal label. The first
// definition of a label wins.
function definitions(state: EditorState) {
  const targets = new Map<string, string>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Paragraph") return false;
      if (node.name !== "LinkReference") return;
      const label = node.node.getChild("LinkLabel");
      const url = node.node.getChild("URL");
      if (label && url) {
        const key = normalLabel(state.sliceDoc(label.from, label.to));
        if (!targets.has(key)) targets.set(key, urlText(state, url));
      }
      return false;
    },
  });
  return targets;
}

// The target of a Link or Autolink node. A reference link ([text][label],
// [label][] or [label]) takes its definition's target, and is null without
// one.
function linkTarget(
  state: EditorState,
  link: SyntaxNode,
  targets: Map<string, string>,
) {
  const url = link.getChild("URL");
  if (url) return urlText(state, url);
  const marks = link.getChildren("LinkMark");
  // An inline link with no destination, such as [text]().
  if (link.name !== "Link" || marks.length !== 2) return null;
  const label = link.getChild("LinkLabel");
  const text =
    label && label.to - label.from > 2
      ? state.sliceDoc(label.from, label.to)
      : state.sliceDoc(marks[0].from, marks[1].to);
  return targets.get(normalLabel(text)) ?? null;
}

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

// The cells of a table row. A pipe between two delimiters is an empty
// cell, and an escaped pipe stays in its cell.
function cells(doc: Text, row: SyntaxNode) {
  const out: string[] = [];
  // The cell since the last delimiter, and whether one came before it.
  let cell: string | undefined;
  let afterDelimiter = false;
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") {
      cell = doc.sliceString(child.from, child.to).replace(/\\\|/g, "|");
    } else if (child.name === "TableDelimiter") {
      if (cell !== undefined || afterDelimiter) out.push(cell ?? "");
      cell = undefined;
      afterDelimiter = true;
    }
  }
  if (cell !== undefined) out.push(cell);
  return out;
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

// Body rows are cut or padded to the header's width.
function tableWidget(doc: Text, table: SyntaxNode) {
  const head = cells(doc, table.getChild("TableHeader") ?? table);
  return new TableWidget(
    head,
    table.getChildren("TableRow").map((node) => {
      const row = cells(doc, node);
      return head.map((_, i) => row[i] ?? "");
    }),
  );
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
// their Markdown. Without focus every line renders. A table counts as active
// when any of its lines is.
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
  // Styles each line from `from` to `to` that isn't active.
  const eachLine = (from: number, to: number, className: string) => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      if (active.has(n)) continue;
      decorations.push(
        Decoration.line({ class: className }).range(doc.line(n).from),
      );
    }
  };
  // Marks the part of each line from `from` to `to` that isn't active.
  const markLines = (from: number, to: number, className: string) => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      if (active.has(n)) continue;
      const line = doc.line(n);
      const start = Math.max(from, line.from);
      const end = Math.min(to, line.to);
      if (start < end) {
        decorations.push(
          Decoration.mark({ class: className }).range(start, end),
        );
      }
    }
  };
  // Hides a marker and the space after it.
  const hideMarker = (from: number, to: number) => {
    const end = doc.sliceString(to, to + 1) === " " ? to + 1 : to;
    decorations.push(hide.range(from, end));
  };

  const decorations: Range<Decoration>[] = [];
  // Found on the first link, since most text has none.
  let targets: Map<string, string> | undefined;
  syntaxTree(state).iterate({
    enter: (node) => {
      const { name, from, to } = node;
      if (name === "Table") {
        if (isActive(from, to)) return false;
        const start = doc.lineAt(from).from;
        const end = doc.lineAt(to).to;
        decorations.push(
          Decoration.replace({
            widget: tableWidget(doc, node.node),
            block: true,
          }).range(start, end),
        );
        return false;
      }
      if (name === "FencedCode") {
        eachLine(from, to, styles.codeBlock);
        for (
          let child = node.node.firstChild;
          child;
          child = child.nextSibling
        ) {
          if (
            (child.name === "CodeMark" || child.name === "CodeInfo") &&
            !isActive(child.from, child.to)
          ) {
            decorations.push(hide.range(child.from, child.to));
          }
        }
        return false;
      }
      if (name === "Blockquote") {
        eachLine(from, to, styles.quote);
        return;
      }
      // Inline styling can span lines, and keeps its inactive ones styled.
      if (name in MARK_CLASSES && !LINKS.includes(name)) {
        markLines(from, to, MARK_CLASSES[name]);
        return;
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
      } else if (name === "QuoteMark") {
        hideMarker(from, to);
      } else if (name === "ListMark" && parent === "ListItem") {
        // A bullet becomes a dot, and a number keeps its text.
        decorations.push(
          node.node.parent?.parent?.name === "BulletList"
            ? Decoration.replace({
                widget: new MarkerWidget(styles.bullet, "•"),
              }).range(from, to)
            : Decoration.mark({ class: styles.bullet }).range(from, to),
        );
      } else if (name === "HorizontalRule") {
        decorations.push(
          Decoration.replace({
            widget: new MarkerWidget(styles.rule, ""),
          }).range(from, to),
        );
      } else if (LINKS.includes(name)) {
        targets ??= definitions(state);
        const opens = linkTarget(state, node.node, targets) !== null;
        decorations.push(
          Decoration.mark({
            class: MARK_CLASSES[name],
            attributes: opens ? { title: OPEN_LINK_TITLE } : undefined,
          }).range(from, to),
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

// The target of the link that `element` draws, or null when it has none.
function linkAt(view: EditorView, element: Element) {
  const tree = syntaxTree(view.state);
  let node: SyntaxNode | null = tree.resolveInner(view.posAtDOM(element), 1);
  for (; node; node = node.parent) {
    if (LINKS.includes(node.name)) {
      return linkTarget(view.state, node, definitions(view.state));
    }
  }
  return null;
}

// Marks the editor while Ctrl (Cmd on macOS) is held, so a link shows the
// pointer. A blur clears it, so a key released elsewhere can't leave it set,
// and a mouse move over the editor corrects a missed key event.
const modifierHeld = ViewPlugin.define((view) => {
  const key = mac ? "Meta" : "Control";
  const set = (held: boolean) =>
    view.dom.classList.toggle(styles.modifierHeld, held);
  const fromEvent = (event: KeyboardEvent | MouseEvent) =>
    set(mac ? event.metaKey : event.ctrlKey);
  // WebKitGTK still reports the key as held on its own keyup.
  const onKeyUp = (event: KeyboardEvent) =>
    event.key === key ? set(false) : fromEvent(event);
  const onBlur = () => set(false);
  window.addEventListener("keydown", fromEvent);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  view.dom.addEventListener("mousemove", fromEvent);
  return {
    destroy: () => {
      window.removeEventListener("keydown", fromEvent);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      view.dom.removeEventListener("mousemove", fromEvent);
      set(false);
    },
  };
});

// Ctrl+click (Cmd+click on macOS) on a link calls `onOpenLink` with its
// target. A plain click places the cursor, as on any text.
export const livePreview = (onOpenLink?: (href: string) => void) => [
  focusedField,
  livePreviewField,
  EditorView.focusChangeEffect.of((_state, focusing) =>
    setFocused.of(focusing),
  ),
  onOpenLink ? modifierHeld : [],
  EditorView.domEventHandlers({
    mousedown: (event, view) => {
      if (!onOpenLink || event.button !== 0) return false;
      if (!(mac ? event.metaKey : event.ctrlKey)) return false;
      const link =
        event.target instanceof Element &&
        event.target.closest(`.${styles.link}`);
      const href = link ? linkAt(view, link) : null;
      if (href === null) return false;
      event.preventDefault();
      onOpenLink(href);
      return true;
    },
  }),
];
