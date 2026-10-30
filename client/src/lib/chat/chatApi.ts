import { Channel, invoke } from "@tauri-apps/api/core";
import type { PermissionMode, ToolCall, ToolOutput } from "@/lib/chat/gate";
import type { ToolSpec } from "@/lib/chat/registry";

// These types match the chat files and events in src-tauri/src/chat.

export type BackendId = "opencode-go" | "custom" | "codex";

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

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  backend: BackendId;
  model: string;
  archived: boolean;
  messages: Message[];
  usage: Usage;
};

export type ChatEvent =
  | { type: "textDelta"; text: string }
  | { type: "message"; message: Message }
  // `token` names this call in this turn: the result goes back with it.
  | { type: "toolCall"; call: ToolCall; token: string }
  | { type: "usage"; usage: Usage }
  | { type: "toast"; message: string };

export type TurnEnd = "done" | "stopped" | "toolLimit" | "failed";

// The user's own OpenAI-compatible provider. Its key is in the keychain.
export type CustomProvider = { name: string; baseUrl: string };

export type ChatSettings = {
  model: string | null;
  // The backend of `model`.
  backend: BackendId;
  permissionMode: PermissionMode;
  customProvider: CustomProvider | null;
};

// The providers that hold a key in the system keychain.
export type KeyProvider = "opencode-go" | "tavily" | "custom";

export const getChatSettings = () => invoke<ChatSettings>("chat_settings");

export const saveChatModel = (backend: BackendId, model: string) =>
  invoke<void>("chat_set_model", { backend, model });

export const savePermissionMode = (mode: PermissionMode) =>
  invoke<void>("chat_set_permission_mode", { mode });

// Only whether a key is saved: the key never comes back from Rust.
export const isKeySaved = (provider: KeyProvider) =>
  invoke<boolean>("key_saved", { provider });

export const saveKey = (provider: KeyProvider, key: string) =>
  invoke<void>("key_save", { provider, key });

export const removeKey = (provider: KeyProvider) =>
  invoke<void>("key_remove", { provider });

// A null or empty key keeps the saved key.
export const saveCustomProvider = (
  name: string,
  baseUrl: string,
  key: string | null,
) => invoke<CustomProvider>("custom_provider_save", { name, baseUrl, key });

// Removes the custom provider's name, URL and key.
export const removeCustomProvider = () =>
  invoke<void>("custom_provider_remove");

export const listModels = (backend: BackendId) =>
  invoke<string[]>("chat_models", { backend });

// Codex signs in with `codex login`. Signed out, it may still list models.
export type CodexStatus =
  | { state: "ready"; models: string[] }
  | { state: "signedOut"; models: string[] }
  | { state: "notInstalled" }
  | { state: "error"; message: string };

export const codexStatus = () => invoke<CodexStatus>("codex_status");

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
