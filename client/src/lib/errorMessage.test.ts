import { describe, expect, it } from "vitest";
import { errorMessage } from "@/lib/errorMessage";

describe("errorMessage", () => {
  it.each([
    [new Error("failed"), "failed"],
    [{ code: "denied", message: "Access denied" }, "Access denied"],
    ["plain failure", "plain failure"],
    [null, "null"],
    [{ message: 42 }, "42"],
  ])("converts an error to display text", (error, expected) => {
    expect(errorMessage(error)).toBe(expected);
  });
});
