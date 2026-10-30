// A line diff for the chat's approval card: changed lines start with "+" or
// "-", unchanged lines with a space, and "…" marks unchanged lines left out.

const CONTEXT = 2;
// Longer middles skip the line matching and show all lines as changed.
const MAX_CELLS = 4_000_000;

const lines = (text: string) => (text === "" ? [] : text.split("\n"));

export function lineDiff(before: string, after: string): string {
  const a = lines(before);
  const b = lines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const rows: string[] = a.slice(0, start).map((line) => ` ${line}`);
  rows.push(...middle(a.slice(start, endA), b.slice(start, endB)));
  rows.push(...a.slice(endA).map((line) => ` ${line}`));
  return trimContext(rows).join("\n");
}

// The changed lines between `a` and `b`, by their longest common subsequence.
function middle(a: string[], b: string[]): string[] {
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((l) => `-${l}`), ...b.map((l) => `+${l}`)];
  }
  // common[i][j]: the longest common subsequence of a[i..] and b[j..].
  const common = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] =
        a[i] === b[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(` ${a[i++]}`);
      j++;
    } else if (
      i < a.length &&
      (j === b.length || common[i + 1][j] >= common[i][j + 1])
    ) {
      // Removed lines come before the lines that replace them.
      out.push(`-${a[i++]}`);
    } else {
      out.push(`+${b[j++]}`);
    }
  }
  return out;
}

// Keeps CONTEXT unchanged lines around each change.
function trimContext(rows: string[]): string[] {
  const near = rows.map(() => false);
  rows.forEach((row, i) => {
    if (row[0] === " ") return;
    for (let k = i - CONTEXT; k <= i + CONTEXT; k++) {
      if (k >= 0 && k < rows.length) near[k] = true;
    }
  });
  const out: string[] = [];
  rows.forEach((row, i) => {
    if (near[i]) out.push(row);
    else if (i === 0 || near[i - 1]) out.push("…");
  });
  return out;
}
