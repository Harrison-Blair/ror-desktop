import { describe, expect, it, vi } from "vitest";
import {
  type ApprovalRequest,
  type GateOptions,
  REJECTED,
  runToolCall,
  STOPPED,
} from "@/lib/chat/gate";
import { type Tool, type ToolContext, ToolRegistry } from "@/lib/chat/registry";

// The gate passes the context through untouched.
const context = { reads: new Map() } as unknown as ToolContext;

// Test-only tools: the app registers no real tools yet.
const readTool = (): Tool<{ path: string }> => ({
  name: "test_read",
  description: "Reads a test note.",
  inputSchema: { type: "object" },
  kind: "read",
  run: vi.fn(({ path }) => `text of ${path}`),
});

const writeTool = (): Tool<{ path: string; text: string }> => ({
  name: "test_write",
  description: "Writes a test note.",
  inputSchema: { type: "object" },
  kind: "write",
  run: vi.fn(({ path }) => `wrote ${path}`),
  preview: ({ path, text }) => ({ target: path, diff: `+${text}` }),
});

const call = (name: string, args: unknown) => ({
  id: "call_1",
  name,
  arguments: JSON.stringify(args),
});

// An approval the test answers by hand.
function manualApproval() {
  const requests: ApprovalRequest[] = [];
  let answer: (approved: boolean) => void = () => {};
  const approve = vi.fn(
    (request: ApprovalRequest) =>
      new Promise<boolean>((resolve) => {
        requests.push(request);
        answer = resolve;
      }),
  );
  return { approve, requests, answer: (ok: boolean) => answer(ok) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the permission gate", () => {
  it("runs a read tool at once in Manual mode", async () => {
    const tool = readTool();
    const approve = vi.fn();
    const output = await runToolCall(
      new ToolRegistry([tool]),
      call("test_read", { path: "Ada.md" }),
      { mode: "manual", approve, context },
    );

    expect(output).toEqual({ content: "text of Ada.md", isError: false });
    expect(approve).not.toHaveBeenCalled();
  });

  it("in Manual mode a write tool waits for Approve, with its preview", async () => {
    const tool = writeTool();
    const { approve, requests, answer } = manualApproval();
    const result = runToolCall(
      new ToolRegistry([tool]),
      call("test_write", { path: "Ada.md", text: "Hello" }),
      { mode: "manual", approve, context },
    );

    await flush();
    expect(tool.run).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0].tool.name).toBe("test_write");
    expect(requests[0].preview).toEqual({ target: "Ada.md", diff: "+Hello" });

    answer(true);
    expect(await result).toEqual({ content: "wrote Ada.md", isError: false });
    expect(tool.run).toHaveBeenCalledTimes(1);
  });

  it("in Manual mode Reject returns a tool error and does not run the tool", async () => {
    const tool = writeTool();
    const { approve, answer } = manualApproval();
    const result = runToolCall(
      new ToolRegistry([tool]),
      call("test_write", { path: "Ada.md", text: "Hello" }),
      { mode: "manual", approve, context },
    );

    await flush();
    answer(false);
    expect(await result).toEqual({ content: REJECTED, isError: true });
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("in Auto mode a write tool runs without asking", async () => {
    const tool = writeTool();
    const approve = vi.fn();
    const output = await runToolCall(
      new ToolRegistry([tool]),
      call("test_write", { path: "Ada.md", text: "Hello" }),
      { mode: "auto", approve, context },
    );

    expect(output).toEqual({ content: "wrote Ada.md", isError: false });
    expect(approve).not.toHaveBeenCalled();
  });

  it("a write tool without a preview names the tool as the target", async () => {
    const tool = { ...writeTool(), preview: undefined };
    const { approve, requests, answer } = manualApproval();
    const result = runToolCall(
      new ToolRegistry([tool]),
      call("test_write", { path: "Ada.md", text: "" }),
      { mode: "manual", approve, context },
    );
    await flush();
    expect(requests[0].preview).toEqual({ target: "test_write" });
    answer(true);
    await result;
  });

  it.each([
    ["an unknown tool", call("missing", {}), "There is no tool named missing."],
    [
      "arguments that are not JSON",
      { id: "c", name: "test_read", arguments: "{" },
      "The arguments are not valid JSON.",
    ],
    [
      "arguments that are not an object",
      call("test_read", [1]),
      "The arguments must be a JSON object.",
    ],
  ])("returns a tool error for %s", async (_, badCall, content) => {
    const options: GateOptions = { mode: "auto", approve: vi.fn(), context };
    const output = await runToolCall(
      new ToolRegistry([readTool()]),
      badCall,
      options,
    );
    expect(output).toEqual({ content, isError: true });
  });

  it("Stop during a slow preview shows no card and does not run the tool", async () => {
    let showPreview: () => void = () => {};
    const tool: Tool<{ path: string }> = {
      ...writeTool(),
      preview: ({ path }) =>
        new Promise((resolve) => {
          showPreview = () => resolve({ target: path });
        }),
    };
    const approve = vi.fn(async () => true);
    const stop = new AbortController();
    const output = runToolCall(
      new ToolRegistry([tool]),
      call("test_write", { path: "Ada.md" }),
      { mode: "manual", approve, signal: stop.signal, context },
    );

    await flush();
    stop.abort();
    showPreview();

    expect(await output).toEqual({ content: STOPPED, isError: true });
    expect(approve).not.toHaveBeenCalled();
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("an approval that arrives after Stop does not run the tool", async () => {
    const tool = writeTool();
    const { approve, answer } = manualApproval();
    const stop = new AbortController();
    const output = runToolCall(
      new ToolRegistry([tool]),
      call("test_write", { path: "Ada.md", text: "Hi" }),
      { mode: "manual", approve, signal: stop.signal, context },
    );

    await flush();
    stop.abort();
    answer(true);

    expect(await output).toEqual({ content: STOPPED, isError: true });
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("a call from a stopped turn does not run, in Auto mode too", async () => {
    const tool = readTool();
    const stop = new AbortController();
    stop.abort();
    const output = await runToolCall(
      new ToolRegistry([tool]),
      call("test_read", { path: "Ada.md" }),
      { mode: "auto", approve: vi.fn(), signal: stop.signal, context },
    );

    expect(output).toEqual({ content: STOPPED, isError: true });
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("returns a tool error when the tool throws", async () => {
    const tool: Tool = {
      ...readTool(),
      run: () => {
        throw new Error("Note not found.");
      },
    };
    const output = await runToolCall(
      new ToolRegistry([tool]),
      call("test_read", { path: "x" }),
      { mode: "auto", approve: vi.fn(), context },
    );
    expect(output).toEqual({ content: "Note not found.", isError: true });
  });
});

describe("the tool registry", () => {
  it("gives Rust the name, description and schema of each tool", () => {
    const registry = new ToolRegistry([readTool()]);
    expect(registry.specs()).toEqual([
      {
        name: "test_read",
        description: "Reads a test note.",
        inputSchema: { type: "object" },
      },
    ]);
  });

  it("refuses duplicate and invalid names", () => {
    const registry = new ToolRegistry([readTool()]);
    expect(() => registry.register(readTool())).toThrow(
      "Tool test_read is already registered.",
    );
    expect(() =>
      registry.register({ ...readTool(), name: "has space" }),
    ).toThrow('Tool name "has space" is not valid.');
  });
});
