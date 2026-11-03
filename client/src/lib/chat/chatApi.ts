import { Channel, invoke } from "@tauri-apps/api/core";
import type { PermissionMode, ToolCall, ToolOutput } from "@/lib/chat/gate";
import type { ToolSpec } from "@/lib/chat/registry";

// These types match the chat files and events in src-tauri/src/chat.

export type BackendId = "opencode-go" | "codex";

export type Message =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      reasoning?: string;
      toolCalls?: ToolCall[];
    }
  | {
      role: "tool";
      callId: string;
      name: string;
      content: string;
      isError: boolean;
    }
  | { role: "notice"; level: "info" | "error"; text: string };

export type Usage = { inputTokens: number; outputTokens: number };

// The prompt of a chat's last reply: its size and the model's context size,
// in tokens, and the characters of each part of it.
export type Context = {
  promptTokens: number;
  // null when the context size is not known.
  window: number | null;
  systemChars: number;
  toolsChars: number;
  conversationChars: number;
  toolActivityChars: number;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  backend: BackendId;
  model: string;
  // The reasoning effort of the last turn.
  effort?: string;
  archived: boolean;
  messages: Message[];
  usage: Usage;
  // Missing before the first reply.
  context?: Context;
};

export type ChatEvent =
  | { type: "textDelta"; text: string }
  | { type: "message"; message: Message }
  // `token` names this call in this turn: the result goes back with it.
  | { type: "toolCall"; call: ToolCall; token: string }
  | { type: "usage"; usage: Usage }
  | { type: "context"; context: Context }
  | { type: "toast"; message: string };

export type TurnEnd = "done" | "stopped" | "toolLimit" | "failed";

export type ChatSettings = {
  model: string | null;
  // The backend of `model`.
  backend: BackendId;
  // The reasoning effort chosen for `model`.
  effort: string | null;
  permissionMode: PermissionMode;
};

// The providers that hold a key in the key file.
export type KeyProvider = "opencode-go" | "tavily";

export const getChatSettings = () => invoke<ChatSettings>("chat_settings");

export const saveChatModel = (
  backend: BackendId,
  model: string,
  effort: string | null,
) => invoke<void>("chat_set_model", { backend, model, effort });

export const savePermissionMode = (mode: PermissionMode) =>
  invoke<void>("chat_set_permission_mode", { mode });

// Only whether a key is saved: the key never comes back from Rust.
export const isKeySaved = (provider: KeyProvider) =>
  invoke<boolean>("key_saved", { provider });

export const saveKey = (provider: KeyProvider, key: string) =>
  invoke<void>("key_save", { provider, key });

export const removeKey = (provider: KeyProvider) =>
  invoke<void>("key_remove", { provider });

export const listModels = (backend: BackendId) =>
  invoke<string[]>("chat_models", { backend });

// A Codex model and the reasoning efforts it offers.
export type CodexModel = {
  name: string;
  efforts: { effort: string; description: string }[];
  defaultEffort: string;
};

// Codex signs in with `codex login`. Signed out, it may still list models.
export type CodexStatus =
  | { state: "ready"; models: CodexModel[] }
  | { state: "signedOut"; models: CodexModel[] }
  | { state: "notInstalled" }
  | { state: "error"; message: string };

export const codexStatus = () => invoke<CodexStatus>("codex_status");

// What models.dev says about an OpenCode Go model.
export type ModelInfo = {
  context: number | null;
  // The values of `reasoning_effort` the model takes.
  efforts: string[];
};

// null when models.dev can't be reached and nothing is cached.
export const opencodeModelInfo = (model: string) =>
  invoke<ModelInfo | null>("opencode_model_info", { model });

// The most recently updated chat that is not archived, if any.
export const latestChat = () => invoke<Chat | null>("chat_latest");

export type Send = {
  // Made before the send, so Stop can name the turn even before Rust has it.
  turnId: string;
  // null starts a new chat.
  chatId: string | null;
  // A chat stays on the backend it started on.
  backend: BackendId;
  text: string;
  model: string;
  // The reasoning effort. null asks for the model's default. Rust drops one
  // the model lacks.
  effort: string | null;
  system: string;
  tools: ToolSpec[];
  onEvent: (event: ChatEvent) => void;
};

// Runs one turn. Resolves when the turn ends.
export const sendMessage = ({ onEvent, ...args }: Send) => {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  return invoke<{ chatId: string; end: TurnEnd }>("chat_send", {
    ...args,
    onEvent: channel,
  });
};

export const sendToolResult = (token: string, output: ToolOutput) =>
  invoke<void>("chat_tool_result", { token, output });

export const stopTurn = (turnId: string) =>
  invoke<void>("chat_stop", { turnId });
