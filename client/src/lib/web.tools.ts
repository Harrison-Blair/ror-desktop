// The chat agent's web tools. Rust makes the requests and holds the Tavily
// key.

import type { Tool } from "@/lib/chat/registry";
import { type WebError, webFetch, webSearch } from "@/lib/webApi";

export const MISSING_TAVILY_KEY =
  "Add a Tavily key in the chat's model menu to let the chat search the web.";

const isWebError = (e: unknown): e is WebError =>
  typeof e === "object" && e !== null && "code" in e && "message" in e;

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Searches the web. Returns the title, URL and a snippet of up to 8 results.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  kind: "read",
  run: async ({ query }, { notifyOnce }) => {
    if (typeof query !== "string") throw new Error("query must be a string.");
    let results: Awaited<ReturnType<typeof webSearch>>;
    try {
      results = await webSearch(query);
    } catch (e) {
      if (isWebError(e) && e.code === "missingKey")
        notifyOnce(MISSING_TAVILY_KEY);
      throw e;
    }
    if (results.length === 0) return "No results.";
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");
  },
};

export const webFetchTool: Tool = {
  name: "web_fetch",
  description:
    "Loads an http or https page and returns its text, at most 100 KB.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string", description: "The page's URL." } },
    required: ["url"],
    additionalProperties: false,
  },
  kind: "read",
  // A page can carry note text out in its URL, so Manual mode asks first.
  ask: true,
  preview: ({ url }) => {
    if (typeof url !== "string") throw new Error("url must be a string.");
    return { target: url };
  },
  run: async ({ url }) => {
    if (typeof url !== "string") throw new Error("url must be a string.");
    return (await webFetch(url)).text;
  },
};
