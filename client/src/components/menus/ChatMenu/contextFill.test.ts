import { describe, expect, it } from "vitest";
import type { Context } from "@/lib/chat/chatApi";
import { modelLabel } from "@/lib/chat/modelLabel";
import { breakdown, contextFill, fillLevel, formatTokens } from "./contextFill";

const context = (over: Partial<Context>): Context => ({
  promptTokens: 0,
  window: null,
  systemChars: 0,
  toolsChars: 0,
  conversationChars: 0,
  toolActivityChars: 0,
  ...over,
});

describe("contextFill", () => {
  it("is new before the first reply", () => {
    expect(contextFill(null)).toEqual({ kind: "new" });
  });

  it("is the prompt over the context size, rounded", () => {
    expect(
      contextFill(context({ promptTokens: 168_000, window: 400_000 })),
    ).toEqual({ kind: "known", used: 168_000, window: 400_000, percent: 42 });
    // 74.6% rounds up to 75%.
    expect(
      contextFill(context({ promptTokens: 2984, window: 4000 })),
    ).toMatchObject({ percent: 75 });
    expect(
      contextFill(context({ promptTokens: 2981, window: 4000 })),
    ).toMatchObject({ percent: 75 });
    expect(
      contextFill(context({ promptTokens: 2979, window: 4000 })),
    ).toMatchObject({ percent: 74 });
  });

  it("is unknown without a context size", () => {
    expect(contextFill(context({ promptTokens: 9, window: null }))).toEqual({
      kind: "unknown",
      used: 9,
    });
  });
});

describe("fillLevel", () => {
  it("warns from 75% and is in danger from 90%", () => {
    expect([0, 74, 75, 89, 90, 100].map(fillLevel)).toEqual([
      "normal",
      "normal",
      "warn",
      "warn",
      "danger",
      "danger",
    ]);
  });
});

describe("breakdown", () => {
  it("leaves what the characters don't explain to Other", () => {
    // 4 characters a token: 1000 + 2000 + 3000 + 500 = 6500 tokens of 10000.
    expect(
      breakdown(
        context({
          promptTokens: 10_000,
          window: 400_000,
          systemChars: 4000,
          toolsChars: 8000,
          conversationChars: 12_000,
          toolActivityChars: 2000,
        }),
      ),
    ).toEqual({
      system: 1000,
      tools: 2000,
      conversation: 3000,
      toolActivity: 500,
      other: 3500,
      free: 390_000,
    });
  });

  it("scales estimates that exceed the provider's total down to it", () => {
    // 2000 + 6000 estimated tokens, but the provider counted 4000.
    expect(
      breakdown(
        context({
          promptTokens: 4000,
          systemChars: 8000,
          conversationChars: 24_000,
        }),
      ),
    ).toEqual({
      system: 1000,
      tools: 0,
      conversation: 3000,
      toolActivity: 0,
      other: 0,
      free: null,
    });
  });
});

describe("formatTokens", () => {
  it("shortens to k and M", () => {
    expect(
      [
        0, 999, 1500, 3000, 168_000, 999_499, 1_000_000, 1_048_576, 1_200_000,
      ].map(formatTokens),
    ).toEqual(["0", "999", "1.5k", "3k", "168k", "999k", "1M", "1M", "1.2M"]);
  });
});

describe("modelLabel", () => {
  it("drops gpt- from Codex models only", () => {
    expect(modelLabel("codex", "gpt-6.1-terra")).toBe("6.1-terra");
    expect(modelLabel("codex", "o9-gpt-x")).toBe("o9-gpt-x");
    expect(modelLabel("opencode-go", "gpt-5.6-luna")).toBe("gpt-5.6-luna");
  });
});
