// The permission gate: every tool call from the model runs through here.
// Read tools always run. In Manual mode a write tool waits for the user to
// approve it. In Auto mode every tool runs.

import type { Tool, ToolPreview, ToolRegistry } from "@/lib/chat/registry";

export type PermissionMode = "manual" | "auto";

export type ToolCall = { id: string; name: string; arguments: string };

export type ToolOutput = { content: string; isError: boolean };

export type ApprovalRequest = {
  call: ToolCall;
  tool: Tool;
  preview: ToolPreview;
};

export type GateOptions = {
  mode: PermissionMode;
  // Resolves to true when the user approves the call.
  approve: (request: ApprovalRequest) => Promise<boolean>;
  // Aborted when the turn stops. A stopped call never runs.
  signal?: AbortSignal;
};

export const REJECTED = "The user rejected this call.";
export const STOPPED = "Not run: the user stopped the turn.";

const failure = (content: string): ToolOutput => ({ content, isError: true });

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runToolCall(
  registry: ToolRegistry,
  call: ToolCall,
  { mode, approve, signal }: GateOptions,
): Promise<ToolOutput> {
  const tool = registry.get(call.name);
  if (!tool) return failure(`There is no tool named ${call.name}.`);
  let input: unknown;
  try {
    input = JSON.parse(call.arguments);
  } catch {
    return failure("The arguments are not valid JSON.");
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failure("The arguments must be a JSON object.");
  }
  const args = input as Record<string, unknown>;
  const stopped = () => signal?.aborted === true;
  try {
    if (tool.kind === "write" && mode === "manual") {
      if (stopped()) return failure(STOPPED);
      const preview = (await tool.preview?.(args)) ?? { target: call.name };
      // The preview may take a while: Stop during it shows no card.
      if (stopped()) return failure(STOPPED);
      if (!(await approve({ call, tool, preview }))) return failure(REJECTED);
    }
    if (stopped()) return failure(STOPPED);
    return { content: await tool.run(args), isError: false };
  } catch (e) {
    return failure(errorText(e));
  }
}
