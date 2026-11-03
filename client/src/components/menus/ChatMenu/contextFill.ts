import type { Context } from "@/lib/chat/chatApi";

// How full the context is, as the footer shows it.
export type Fill =
  // No reply yet.
  | { kind: "new" }
  // The context size is not known.
  | { kind: "unknown"; used: number }
  | { kind: "known"; used: number; window: number; percent: number };

export const contextFill = (context: Context | null): Fill => {
  if (context === null) return { kind: "new" };
  const used = context.promptTokens;
  if (!context.window) return { kind: "unknown", used };
  return {
    kind: "known",
    used,
    window: context.window,
    percent: Math.round((used / context.window) * 100),
  };
};

// The colour of the fill: warn from 75%, danger from 90%.
export const fillLevel = (percent: number) =>
  percent >= 90 ? "danger" : percent >= 75 ? "warn" : "normal";

export const formatTokens = (n: number) => {
  const short = (value: number, unit: string) =>
    `${value < 10 ? Number(value.toFixed(1)) : Math.round(value)}${unit}`;
  if (n < 1000) return String(n);
  if (n < 999_500) return short(n / 1000, "k");
  return short(n / 1_000_000, "M");
};

// Text holds about this many characters per token.
const CHARS_PER_TOKEN = 4;

export type Breakdown = {
  system: number;
  tools: number;
  conversation: number;
  toolActivity: number;
  // What the provider counted beyond the parts above.
  other: number;
  // null when the context size is not known.
  free: number | null;
};

// Estimates the tokens of each part of the prompt from its characters. When
// the estimates add up to more than the prompt the provider counted, they
// are scaled down to it.
export const breakdown = (context: Context): Breakdown => {
  const total = context.promptTokens;
  const raw = [
    context.systemChars,
    context.toolsChars,
    context.conversationChars,
    context.toolActivityChars,
  ].map((chars) => chars / CHARS_PER_TOKEN);
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = sum > total ? total / sum : 1;
  const [system, tools, conversation, toolActivity] = raw.map((tokens) =>
    Math.round(tokens * scale),
  );
  const counted = system + tools + conversation + toolActivity;
  return {
    system,
    tools,
    conversation,
    toolActivity,
    other: Math.max(0, total - counted),
    free: context.window ? Math.max(0, context.window - total) : null,
  };
};
