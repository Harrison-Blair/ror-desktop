import { describe, expect, it } from "vitest";
import { lineDiff } from "@/lib/diff";

describe("lineDiff", () => {
  it("keeps two unchanged lines around each change and marks the rest", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n");
    const after = before.replace("2", "two").replace("8", "eight");
    expect(lineDiff(before, after)).toBe(
      ["1", "-2", "+two", "3", "4", "…", "6", "7", "-8", "+eight", "9"]
        .map((line) => (/^[-+…]/.test(line) ? line : ` ${line}`))
        .join("\n"),
    );
  });

  it("shows a new note as added lines only", () => {
    expect(lineDiff("", "a\nb")).toBe("+a\n+b");
  });
});
