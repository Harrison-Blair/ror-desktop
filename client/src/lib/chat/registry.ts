// The tools the chat agent can call. Each feature defines its tools next to
// its own code and lists them in features.ts.

export type ToolKind = "read" | "write";

export type JsonSchema = Record<string, unknown>;

// What the approval card shows before a write tool runs.
export type ToolPreview = {
  // What the call changes, such as a note path.
  target: string;
  // A unified diff: lines that start with "+" or "-" are added or removed.
  diff?: string;
};

export type Tool<Input = Record<string, unknown>> = {
  // Letters, digits, "_" and "-", as the model APIs require.
  name: string;
  description: string;
  inputSchema: JsonSchema;
  // "write" when the tool changes user data, so Manual mode asks first.
  kind: ToolKind;
  // Returns the text the model reads. Throwing returns a tool error.
  run(input: Input): Promise<string> | string;
  preview?(input: Input): Promise<ToolPreview> | ToolPreview;
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
