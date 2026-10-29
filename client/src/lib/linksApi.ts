import { invoke } from "@tauri-apps/api/core";

// Opens a web or mail link in the system's browser or mail app. Any other
// link is refused.
export const openWebLink = (url: string) =>
  invoke<void>("open_web_link", { url });
