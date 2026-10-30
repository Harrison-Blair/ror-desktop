import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ApprovalRequest, runToolCall } from "@/lib/chat/gate";
import { type ToolContext, ToolRegistry } from "@/lib/chat/registry";
import {
  MISSING_TAVILY_KEY,
  webFetchTool,
  webSearchTool,
} from "@/lib/web.tools";
import * as webApi from "@/lib/webApi";

vi.mock("@/lib/webApi", () => ({
  webSearch: vi.fn(async () => []),
  webFetch: vi.fn(async () => ({ text: "Ogres.", truncated: false })),
}));

const web = vi.mocked(webApi);
const context = { notifyOnce: vi.fn() } as unknown as ToolContext;
const registry = new ToolRegistry([webSearchTool, webFetchTool]);

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it("returns search results with their titles, URLs and snippets", async () => {
    web.webSearch.mockResolvedValueOnce([
      {
        title: "Ogres",
        url: "https://example.com/ogres",
        snippet: "Large creatures",
      },
      {
        title: "Trolls",
        url: "https://example.com/trolls",
        snippet: "Regenerate",
      },
    ]);
    const { output } = run("web_search", { query: "creatures" }, () => false);
    expect(await output).toEqual({
      content:
        "1. Ogres\n   https://example.com/ogres\n   Large creatures\n\n2. Trolls\n   https://example.com/trolls\n   Regenerate",
      isError: false,
    });
    expect(web.webSearch).toHaveBeenCalledWith("creatures");
  });

  it("reports a missing search key to the user and the agent", async () => {
    web.webSearch.mockRejectedValueOnce({
      code: "missingKey",
      message: "No key",
    });
    const { output } = run("web_search", { query: "ogres" }, () => false);
    expect(await output).toEqual({ content: "No key", isError: true });
    expect(context.notifyOnce).toHaveBeenCalledWith(MISSING_TAVILY_KEY);
  });
});
