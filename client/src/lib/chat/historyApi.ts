import { invoke } from "@tauri-apps/api/core";
import type { Chat } from "@/lib/chat/chatApi";

// These match the history commands in src-tauri/src/chat/mod.rs.

export type ChatSummary = {
  id: string;
  title: string;
  // Milliseconds since the Unix epoch.
  updatedAt: number;
  archived: boolean;
};

// The archived chats, or the others, newest first. A query keeps the chats
// whose title or messages contain it, in any case.
export const listChats = (archived: boolean, query: string) =>
  invoke<ChatSummary[]>("chat_list", { archived, query });

export const openChat = (id: string) => invoke<Chat>("chat_open", { id });

export const renameChat = (id: string, title: string) =>
  invoke<void>("chat_rename", { id, title });

export const setChatArchived = (id: string, archived: boolean) =>
  invoke<void>("chat_set_archived", { id, archived });

// Removes the chat's file. Ask the user first.
export const deleteChat = (id: string) => invoke<void>("chat_delete", { id });
