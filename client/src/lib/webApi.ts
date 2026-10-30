import { invoke } from "@tauri-apps/api/core";

// Rust rejects with a code: "missingKey" means the user must add a Tavily key.
export type WebError = { code: "missingKey" | "failed"; message: string };

export type WebResult = { title: string; url: string; snippet: string };

// Searches the web through Tavily, with the key from the key file.
export const webSearch = (query: string) =>
  invoke<WebResult[]>("web_search", { query });

// Loads an http or https page as text. `truncated` is true when the text was
// cut at 100 KB.
export const webFetch = (url: string) =>
  invoke<{ text: string; truncated: boolean }>("web_fetch", { url });
