import { describe, expect, it, vi } from "vitest";
import { type ApprovalRequest, runToolCall } from "@/lib/chat/gate";
import { type ToolContext, ToolRegistry } from "@/lib/chat/registry";
import { webFetchTool, webSearchTool } from "@/lib/web.tools";
import * as webApi from "@/lib/webApi";

vi.mock("@/lib/webApi", () => ({
  webSearch: vi.fn(async () => []),
  webFetch: vi.fn(async () => ({ text: "Ogres.", truncated: false })),
}));

const web = vi.mocked(webApi);
const context = { notifyOnce: vi.fn() } as unknown as ToolContext;
const registry = new ToolRegistry([webSearchTool, webFetchTool]);

const run = (name: string, args: unknown, approve: () => boolean) => {
  const requests: ApprovalRequest[] = [];
  const output = runToolCall(
    registry,
    { id: "call_1", name, arguments: JSON.stringify(args) },
    {
      mode: "manual",
      approve: async (request) => {
        requests.push(request);
        return approve();
      },
      context,
    },
  );
  return { output, requests };
};

describe("the web tools in Manual mode", () => {
  it("web_fetch asks first, with the URL on the card", async () => {
    const url = "https://example.com/ogres";
    const rejected = run("web_fetch", { url }, () => false);
    expect((await rejected.output).isError).toBe(true);
    expect(rejected.requests.map((r) => r.preview)).toEqual([{ target: url }]);
    expect(web.webFetch).not.toHaveBeenCalled();

    const approved = run("web_fetch", { url }, () => true);
    expect(await approved.output).toEqual({
      content: "Ogres.",
      isError: false,
    });
    expect(web.webFetch).toHaveBeenCalledWith(url);
  });

  it("web_search runs without asking", async () => {
    const { output, requests } = run("web_search", { query: "ogres" }, () => {
      throw new Error("asked");
    });
    expect(await output).toEqual({ content: "No results.", isError: false });
    expect(requests).toEqual([]);
  });
});
