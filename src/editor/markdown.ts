import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

type Node = ReturnType<typeof syntaxTree>["topNode"];
export type TableSource = {
  end: number;
  alignments: ("left" | "center" | "right")[];
  rows: string[][];
};

function cells(state: EditorState, row: Node): string[] {
  const pipes = row.getChildren("TableDelimiter");
  const cuts = [
    row.from,
    ...pipes.flatMap((pipe) => [pipe.from, pipe.to]),
    row.to,
  ];
  const result: string[] = [];
  for (let i = 0; i < cuts.length - 1; i += 2)
    result.push(state.sliceDoc(cuts[i], cuts[i + 1]).trim());
  if (pipes.length && !result[0]) result.shift();
  if (pipes.length && !result[result.length - 1]) result.pop();
  return result;
}

export function tableSources(state: EditorState): TableSource[] {
  const tables: TableSource[] = [];
  syntaxTree(state).iterate({
    enter(ref) {
      if (ref.name !== "Table") return;
      const header = ref.node.getChild("TableHeader");
      const separator = ref.node.getChild("TableDelimiter");
      if (!header || !separator) return false;
      const first = cells(state, header);
      const alignment = state
        .sliceDoc(separator.from, separator.to)
        .replace(/^\s*\||\|\s*$/g, "")
        .split("|");
      tables.push({
        end: state.doc.lineAt(ref.to).to,
        alignments: first.map((_, i) => {
          const raw = alignment[i]?.trim() ?? "";
          return raw.endsWith(":")
            ? raw.startsWith(":")
              ? "center"
              : "right"
            : "left";
        }),
        rows: [
          first,
          ...ref.node.getChildren("TableRow").map((row) => {
            const values = cells(state, row);
            return first.map((_, i) => values[i] ?? "");
          }),
        ],
      });
      return false;
    },
  });
  return tables;
}

export function headingLines(
  state: EditorState,
): { from: number; level: number }[] {
  const result: { from: number; level: number }[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      const match = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      if (match)
        result.push({
          from: state.doc.lineAt(node.from).from,
          level: Number(match[1]),
        });
    },
  });
  return result;
}
