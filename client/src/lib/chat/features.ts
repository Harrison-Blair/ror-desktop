// The app's features, as the chat agent knows them: one line for the system
// prompt and the tools the feature offers. A feature defines its tools next
// to its own code and adds them here.

import { type Tool, ToolRegistry } from "@/lib/chat/registry";
import { diceRoll } from "@/lib/dice.tools";
import { notesTools } from "@/lib/notes.tools";
import { webFetchTool, webSearchTool } from "@/lib/web.tools";

export type ChatFeature = {
  name: string;
  // One line for the system prompt.
  summary: string;
  tools: Tool[];
};

// The app as a whole: what is open and which features exist.
export const appContext: Tool = {
  name: "app_context",
  description:
    "Returns the open note, the notes folder on disk, and the app's features.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  run: (_input, { app }) =>
    [
      `Open note: ${app.openNote() ?? "none"}`,
      `Notes folder: ${app.notesFolder() ?? "not loaded yet"}`,
      "Features:",
      ...features.map((feature) => `- ${feature.name}: ${feature.summary}`),
    ].join("\n"),
};

export const features: ChatFeature[] = [
  {
    name: "Notes",
    summary:
      "Notes is a folder of Markdown files that the user writes and links together. The notes tools list, read, search, create, edit, rename, move, delete and open them.",
    tools: [...notesTools, appContext],
  },
  {
    name: "Dice",
    summary:
      "Dice rolls dice from notation such as 2d6 + 3 and keeps a history of rolls.",
    tools: [diceRoll],
  },
  {
    name: "Web",
    summary: "Web searches the internet and reads web pages.",
    tools: [webSearchTool, webFetchTool],
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
