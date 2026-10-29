// The app's features, as the chat agent knows them: one line for the system
// prompt and the tools the feature offers. A feature defines its tools next
// to its own code and adds them here.

import { type Tool, ToolRegistry } from "@/lib/chat/registry";

export type ChatFeature = {
  name: string;
  // One line for the system prompt.
  summary: string;
  tools: Tool[];
};

export const features: ChatFeature[] = [
  {
    name: "Notes",
    summary:
      "Notes is a folder of Markdown files that the user writes and links together.",
    tools: [],
  },
  {
    name: "Dice",
    summary: "Dice rolls dice from notation such as 2d6 + 3.",
    tools: [],
  },
  {
    name: "Session",
    summary: "Session is not built yet.",
    tools: [],
  },
  {
    name: "World",
    summary: "World is not built yet.",
    tools: [],
  },
];

export const toolRegistry = new ToolRegistry(
  features.flatMap((feature) => feature.tools),
);

export function systemPrompt(openNote: string | null, list = features) {
  const lines = [
    "You are the assistant in Ror Desktop, a companion app for a tabletop roleplaying campaign.",
    "Help the user run and prepare their campaign. Use the tools to act in the app. Answer in Markdown.",
    "",
    "The app's features:",
    ...list.map((feature) => `- ${feature.name}: ${feature.summary}`),
    "",
    openNote === null
      ? "No note is open."
      : `The open note is ${JSON.stringify(openNote)}.`,
  ];
  return lines.join("\n");
}
