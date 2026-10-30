import { GFM, parser } from "@lezer/markdown";
import type { ReactNode } from "react";
import styles from "./Markdown.module.css";

// Renders Markdown as React elements. Text only reaches the page as text, so
// raw HTML in the source shows as written and never runs. Images show their
// alt text, so nothing loads from the web.

const markdown = parser.configure(GFM);

type Node = ReturnType<typeof markdown.parse>["topNode"];

const MARKS = new Set([
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "StrikethroughMark",
  "QuoteMark",
  "HeaderMark",
  "ListMark",
]);

const WEB_LINK = /^(https?:|mailto:)/i;

function children(node: Node) {
  const list: Node[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    list.push(child);
  }
  return list;
}

type Props = {
  text: string;
  onOpenLink: (url: string) => void;
};

export function Markdown({ text, onOpenLink }: Props) {
  const source = (node: Node) => text.slice(node.from, node.to);

  const link = (url: string, label: ReactNode, key: number) =>
    WEB_LINK.test(url) ? (
      <a
        key={key}
        href={url}
        onClick={(event) => {
          event.preventDefault();
          onOpenLink(url);
        }}
      >
        {label}
      </a>
    ) : (
      label
    );

  // The text of `node` from `from` to `to`, with its children rendered.
  const inline = (node: Node, from = node.from, to = node.to): ReactNode[] => {
    const out: ReactNode[] = [];
    let at = from;
    for (const child of children(node)) {
      if (child.from < from || child.to > to) continue;
      if (child.from > at) out.push(text.slice(at, child.from));
      out.push(renderInline(child, out.length));
      at = child.to;
    }
    if (at < to) out.push(text.slice(at, to));
    return out;
  };

  const renderInline = (node: Node, key: number): ReactNode => {
    if (MARKS.has(node.name)) return null;
    switch (node.name) {
      case "Emphasis":
        return <em key={key}>{inline(node)}</em>;
      case "StrongEmphasis":
        return <strong key={key}>{inline(node)}</strong>;
      case "Strikethrough":
        return <s key={key}>{inline(node)}</s>;
      case "InlineCode":
        return <code key={key}>{inline(node)}</code>;
      case "Escape":
        return source(node).slice(1);
      case "HardBreak":
        return <br key={key} />;
      case "URL":
        return link(source(node), source(node), key);
      case "Autolink": {
        const url = node.getChild("URL");
        return url ? link(source(url), source(url), key) : source(node);
      }
      case "Link": {
        const marks = node.getChildren("LinkMark");
        const url = node.getChild("URL");
        const label =
          marks.length >= 2 ? inline(node, marks[0].to, marks[1].from) : [];
        return url ? link(source(url), label, key) : label;
      }
      case "Image": {
        const marks = node.getChildren("LinkMark");
        return marks.length >= 2 ? text.slice(marks[0].to, marks[1].from) : "";
      }
      default:
        return inline(node);
    }
  };

  const blocks = (node: Node) =>
    children(node).map((child, i) => renderBlock(child, i));

  const renderBlock = (node: Node, key: number): ReactNode => {
    const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
    if (heading) {
      const level = Math.min(Number(heading[1]) + 2, 6);
      const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{inline(node)}</Tag>;
    }
    if (MARKS.has(node.name)) return null;
    switch (node.name) {
      case "Paragraph":
        return <p key={key}>{inline(node)}</p>;
      case "BulletList":
        return <ul key={key}>{blocks(node)}</ul>;
      case "OrderedList": {
        const mark = node.firstChild?.getChild("ListMark");
        const start = mark ? Number.parseInt(source(mark), 10) : 1;
        return (
          <ol key={key} start={start}>
            {blocks(node)}
          </ol>
        );
      }
      case "ListItem":
        return <li key={key}>{blocks(node)}</li>;
      case "Task":
        return <p key={key}>{inline(node)}</p>;
      case "Blockquote":
        return <blockquote key={key}>{blocks(node)}</blockquote>;
      case "FencedCode":
        return (
          <pre key={key}>
            <code>{node.getChildren("CodeText").map(source).join("")}</code>
          </pre>
        );
      case "CodeBlock":
        return (
          <pre key={key}>
            <code>{source(node).replace(/\n {1,4}/g, "\n")}</code>
          </pre>
        );
      case "HorizontalRule":
        return <hr key={key} />;
      case "Table": {
        const [head, ...rows] = [
          ...node.getChildren("TableHeader"),
          ...node.getChildren("TableRow"),
        ];
        const cells = (row: Node, Cell: "th" | "td") =>
          row
            .getChildren("TableCell")
            .map((cell) => <Cell key={cell.from}>{inline(cell)}</Cell>);
        return (
          <table key={key}>
            {head && (
              <thead>
                <tr>{cells(head, "th")}</tr>
              </thead>
            )}
            <tbody>
              {rows.map((row) => (
                <tr key={row.from}>{cells(row, "td")}</tr>
              ))}
            </tbody>
          </table>
        );
      }
      case "LinkReference":
        return null;
      default:
        return <p key={key}>{source(node)}</p>;
    }
  };

  return (
    <div className={styles.markdown}>
      {blocks(markdown.parse(text).topNode)}
    </div>
  );
}
