import { describe, expect, it } from "vitest";
import { lineDiff } from "@/lib/diff";

describe("lineDiff", () => {
  it("keeps two unchanged lines around each change and marks the rest", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n");
    const after = before.replace("2", "two").replace("8", "eight");
    expect(lineDiff(before, after)).toBe(
      " 1\n-2\n+two\n 3\n 4\n…\n 6\n 7\n-8\n+eight\n 9",
    );
  });

  it("shows a new note as added lines only", () => {
    expect(lineDiff("", "a\nb")).toBe("+a\n+b");
  });

  it("shows removed content and trailing newline changes", () => {
    expect(lineDiff("a\nb", "")).toBe("-a\n-b");
    expect(lineDiff("a", "a\n")).toBe(" a\n+");
    expect(lineDiff("a\n", "a")).toBe(" a\n-");
  });

  it("preserves common lines between separate edits", () => {
    expect(lineDiff("a\nb\nc\nd", "a\nx\nc\ny")).toBe(" a\n-b\n+x\n c\n-d\n+y");
  });

  it("marks unchanged content without presenting it as an edit", () => {
    expect(lineDiff("a\nb", "a\nb")).toBe("…");
    expect(lineDiff("", "")).toBe("");
  });
});
