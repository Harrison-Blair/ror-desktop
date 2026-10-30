import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { Chat, ChatEvent, Send } from "@/lib/chat/chatApi";
import * as chatApi from "@/lib/chat/chatApi";
import type { ToolCall } from "@/lib/chat/gate";

// The real notes tools run against a fake disk of note texts by path.
let disk: Map<string, string>;
vi.mock("@/lib/notesApi", () => ({
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
  listNotes: vi.fn(async () =>
    [...disk.keys()].map((path) => ({ kind: "file", name: path, path })),
  ),
  onNotesChanged: async () => () => {},
  readNote: vi.fn(async (path: string) => {
    const text = disk.get(path);
    if (text === undefined) throw { message: `“${path}” no longer exists.` };
    return text;
  }),
  writeNote: vi.fn(async (path: string, text: string) => {
    disk.set(path, text);
  }),
}));

let saved: Chat[] = [];
let turn: { send: Send; end: () => void } | null = null;

vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    backend: "opencode-go",
    permissionMode: "auto",
    customProvider: { name: "Ollama", baseUrl: "http://localhost:11434/v1" },
  })),
  latestChat: vi.fn(async () => saved[0]),
  saveChatModel: vi.fn(async () => {}),
  savePermissionMode: vi.fn(async () => {}),
  isKeySaved: vi.fn(async () => true),
  listModels: vi.fn(async () => []),
  sendMessage: vi.fn(
    (send: Send) =>
      new Promise((resolve) => {
        turn = {
          send,
          end: () => resolve({ chatId: send.chatId ?? "new", end: "done" }),
        };
      }),
  ),
  sendToolResult: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
}));

vi.mock("@/lib/chat/historyApi", () => ({
  listChats: vi.fn(async () =>
    saved.map(({ id, title, updatedAt, archived }) => ({
      id,
      title,
      updatedAt,
      archived,
    })),
  ),
  openChat: vi.fn(async (id: string) => saved.find((c) => c.id === id)),
  renameChat: vi.fn(async () => {}),
  setChatArchived: vi.fn(async () => {}),
  deleteChat: vi.fn(async () => {}),
}));

const api = vi.mocked(chatApi);

function chat(id: string, title: string, extra: Partial<Chat>): Chat {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    backend: "opencode-go",
    model: "glm-5.3",
    archived: false,
    messages: [{ role: "assistant", text: `Reply in ${title}` }],
    usage: { inputTokens: 0, outputTokens: 0 },
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  turn = null;
  disk = new Map([["Ogres.md", "Ogres eat goats."]]);
  saved = [
    chat("ogre", "Ogre ambush", { updatedAt: 2 }),
    chat("dragon", "Dragon lair", { backend: "custom", model: "llama3" }),
  ];
});

const panel = () => screen.getByRole("complementary", { name: "Chat" });
const message = () => within(panel()).getByRole("textbox", { name: "Message" });

let calls = 0;
// Runs a tool call from the model and returns its result.
async function runTool(name: string, args: Record<string, unknown>) {
  const call: ToolCall = {
    id: `call_${++calls}`,
    name,
    arguments: JSON.stringify(args),
  };
  const token = `token-${calls}`;
  const event: ChatEvent = { type: "toolCall", call, token };
  act(() => turn?.send.onEvent(event));
  await vi.waitFor(() =>
    expect(api.sendToolResult).toHaveBeenCalledWith(token, expect.anything()),
  );
  return api.sendToolResult.mock.calls.find(([t]) => t === token)?.[1];
}

describe("a chat opened from history", () => {
  it("continues on its own backend and model, with no notes read", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await within(panel()).findByText("Reply in Ogre ambush");

    // In the last chat, a read lets the agent replace the note.
    await user.type(message(), "Go{Enter}");
    await runTool("notes_read", { path: "Ogres.md" });
    expect(
      await runTool("notes_write", { path: "Ogres.md", text: "Ogres eat." }),
    ).toEqual({ content: 'Replaced the text of "Ogres.md".', isError: false });
    await runTool("notes_read", { path: "Ogres.md" });
    act(() => turn?.end());

    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await user.click(
      await within(panel()).findByRole("button", { name: /^Dragon lair/ }),
    );
    await within(panel()).findByText("Reply in Dragon lair");
    expect(
      screen.getByRole("button", { name: "Model: llama3" }),
    ).toBeInTheDocument();

    await user.type(message(), "Go{Enter}");
    expect(api.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chatId: "dragon",
        backend: "custom",
        model: "llama3",
      }),
    );
    // The read from the other chat doesn't count here.
    expect(
      await runTool("notes_write", { path: "Ogres.md", text: "Gone." }),
    ).toEqual({
      content: 'Read "Ogres.md" with notes_read before you replace it.',
      isError: true,
    });
    expect(disk.get("Ogres.md")).toBe("Ogres eat.");
  });
});
