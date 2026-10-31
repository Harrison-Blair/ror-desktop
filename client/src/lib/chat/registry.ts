// The tools the chat agent can call. Each feature defines its tools next to
// its own code and lists them in features.ts.

import type { DiceResult } from "@/lib/dice";

export type ToolKind = "read" | "write";

export type JsonSchema = Record<string, unknown>;

// What the approval card shows before a write tool runs.
export type ToolPreview = {
  // What the call changes, such as a note path.
  target: string;
  // A unified diff: lines that start with "+" or "-" are added or removed.
  diff?: string;
  // What the preview was made from, such as the note's text. run refuses
  // when it has changed, so the user approves the change that is made.
  seen?: string;
};

// What the app lends the tools. Paths are relative to the notes folder.
export type AppBridge = {
  notesFolder: () => string | null;
  // The note open in the editor, if any.
  openNote: () => string | null;
  // Saves the open note's pending edit. Resolves false when it couldn't be
  // saved, which then stays in the editor.
  flushOpenNote: () => Promise<boolean>;
  // Opens a note in the editor.
  showNote: (path: string) => void;
  // An item was renamed or moved to `to`, or deleted when `to` is null.
  pathChanged: (from: string, to: string | null) => void;
  // Adds a roll to the Dice history.
  addRoll: (result: DiceResult) => void;
  // Opens a person's sheet in World. Resolves false when it didn't open:
  // the user kept an unsaved person form, or the open note couldn't be saved.
  showPerson: (id: string) => Promise<boolean>;
  // The people changed, so the People screens load them again.
  peopleChanged: () => void;
};

export type ToolContext = {
  app: AppBridge;
  // The text of each note the agent read with notes_read in this chat, by
  // path. notes_write replaces only a note whose text still matches.
  reads: Map<string, string>;
  // Raises a toast at most once per turn for each message.
  notifyOnce: (message: string) => void;
};

export type Tool<Input = Record<string, unknown>> = {
  // Letters, digits, "_" and "-", as the model APIs require.
  name: string;
  description: string;
  inputSchema: JsonSchema;
  // "write" when the tool changes user data, so Manual mode asks first.
  kind: ToolKind;
  // Manual mode also asks before this read tool runs.
  ask?: boolean;
  // Returns the text the model reads. Throwing returns a tool error.
  // `approved` is the preview the user approved, in Manual mode.
  run(
    input: Input,
    context: ToolContext,
    approved?: ToolPreview,
  ): Promise<string> | string;
  preview?(
    input: Input,
    context: ToolContext,
  ): Promise<ToolPreview> | ToolPreview;
};

// What Rust sends to the model for each tool.
export type ToolSpec = Pick<Tool, "name" | "description" | "inputSchema">;

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor(tools: Tool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: Tool) {
    if (!TOOL_NAME.test(tool.name)) {
      throw new Error(`Tool name ${JSON.stringify(tool.name)} is not valid.`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string) {
    return this.tools.get(name);
  }

  specs(): ToolSpec[] {
    return [...this.tools.values()].map(
      ({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }),
    );
  }
}
