import type { BackendId } from "@/lib/chat/chatApi";

// The name a model shows with. Codex models drop the `gpt-` all of them
// share. The id that is saved and sent stays as it is.
export const modelLabel = (backend: BackendId, model: string) =>
  backend === "codex" ? model.replace(/^gpt-/, "") : model;
