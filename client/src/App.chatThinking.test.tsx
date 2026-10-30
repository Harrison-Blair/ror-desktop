import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { Chat, ChatEvent, Send } from "@/lib/chat/chatApi";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
}));

// Rust is not there in tests: each turn waits until the test ends it.
let turn: { send: Send; end: () => void } | null = null;
let latest: Chat | null = null;
vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    backend: "opencode-go",
    permissionMode: "manual",
    customProvider: null,
  })),
  latestChat: vi.fn(async () => latest),
  saveChatModel: vi.fn(async () => {}),
  savePermissionMode: vi.fn(async () => {}),
  isKeySaved: vi.fn(async () => false),
  listModels: vi.fn(async () => ["glm-5.3"]),
  codexStatus: vi.fn(async () => ({ state: "notInstalled" })),
  sendMessage: vi.fn(
    (send: Send) =>
      new Promise((resolve) => {
        turn = {
          send,
          end: () => resolve({ chatId: "chat-1", end: "done" }),
        };
      }),
  ),
  sendToolResult: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
}));

vi.mock("@/lib/chat/features", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/chat/features")>();
  const { ToolRegistry } = await import("@/lib/chat/registry");
  return {
    ...original,
    toolRegistry: new ToolRegistry([
      {
        name: "test_write",
        description: "Writes a test note.",
        inputSchema: { type: "object" },
        kind: "write",
        run: () => "wrote",
        preview: ({ path }) => ({ target: String(path) }),
      },
    ]),
  };
});

beforeEach(() => {
  turn = null;
  latest = null;
  // Timers also advance on their own, so the app's promises settle.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const emit = (event: ChatEvent) => act(() => turn?.send.onEvent(event));
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const thinking = () => screen.queryByText("Thinking…")?.parentElement ?? null;
const status = () =>
  within(screen.getByRole("complementary", { name: "Chat" })).getByRole(
    "status",
  );

async function send(text: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Chat" }));
  await screen.findByRole("button", { name: "Model: glm-5.3" });
  await user.type(
    screen.getByRole("textbox", { name: "Message" }),
    `${text}{Enter}`,
  );
  return user;
}

const call = { id: "call_1", name: "test_write", arguments: '{"path":"A.md"}' };

describe("Thinking indicator", () => {
  it("shows from Send and counts whole seconds", async () => {
    await send("Hi");
    expect(thinking()).toHaveTextContent("Thinking… 0s");
    await wait(3000);
    expect(thinking()).toHaveTextContent("Thinking… 3s");
  });

  it("is announced once as Thinking, without the seconds", async () => {
    await send("Hi");
    await wait(2000);
    // role="status" is a polite live region. It holds the row, so the row
    // is announced when it appears.
    expect(status()).toHaveTextContent("Thinking… 2s");
    // The counter is hidden from screen readers, so its ticks are silent.
    expect(within(status()).getByText("2s")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("hides at the first text", async () => {
    await send("Hi");
    emit({ type: "message", message: { role: "user", text: "Hi" } });
    expect(thinking()).toBeInTheDocument();
    emit({ type: "textDelta", text: "Hello" });
    expect(thinking()).not.toBeInTheDocument();
  });

  it("hides while a tool runs and shows again from 0s after its result", async () => {
    await send("Edit");
    emit({ type: "message", message: { role: "user", text: "Edit" } });
    await wait(2000);
    emit({
      type: "message",
      message: { role: "assistant", text: "", toolCalls: [call] },
    });
    expect(thinking()).not.toBeInTheDocument();
    await wait(2000);
    emit({
      type: "message",
      message: {
        role: "tool",
        callId: call.id,
        name: call.name,
        content: "wrote",
        isError: false,
      },
    });
    expect(thinking()).toHaveTextContent("Thinking… 0s");
    await wait(1000);
    expect(thinking()).toHaveTextContent("Thinking… 1s");
  });

  it("a tool call left without a result by an earlier turn does not hide it", async () => {
    latest = {
      id: "old",
      title: "Old",
      createdAt: 1,
      updatedAt: 2,
      backend: "opencode-go",
      model: "glm-5.3",
      archived: false,
      messages: [
        { role: "user", text: "Edit" },
        { role: "assistant", text: "", toolCalls: [call] },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    await send("Again");
    // Before any event of the new turn.
    expect(thinking()).toHaveTextContent("Thinking… 0s");
    emit({ type: "message", message: { role: "user", text: "Again" } });
    expect(thinking()).toHaveTextContent("Thinking… 0s");
  });

  it("hides once the turn's final reply arrives, before the turn ends", async () => {
    await send("Hi");
    emit({ type: "message", message: { role: "user", text: "Hi" } });
    emit({ type: "textDelta", text: "Hello" });
    emit({ type: "message", message: { role: "assistant", text: "Hello" } });
    // The turn still runs until Rust ends it.
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(thinking()).not.toBeInTheDocument();
  });

  it("the running tool step spins like the Thinking row", async () => {
    await send("Edit");
    const spinner = thinking()?.querySelector("svg")?.getAttribute("class");
    expect(spinner).toBeTruthy();
    emit({
      type: "message",
      message: { role: "assistant", text: "", toolCalls: [call] },
    });
    const running = screen.getByLabelText("running");
    expect(running).toHaveAttribute("class", spinner);
    emit({
      type: "message",
      message: {
        role: "tool",
        callId: call.id,
        name: call.name,
        content: "wrote",
        isError: false,
      },
    });
    expect(screen.getByLabelText("done")).not.toHaveAttribute("class", spinner);
  });

  it("a reply that ended an earlier turn does not hide it", async () => {
    latest = {
      id: "old",
      title: "Old",
      createdAt: 1,
      updatedAt: 2,
      backend: "opencode-go",
      model: "glm-5.3",
      archived: false,
      messages: [
        { role: "user", text: "Hi" },
        { role: "assistant", text: "Hello" },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    await send("Again");
    // Before any event of the new turn.
    expect(thinking()).toHaveTextContent("Thinking… 0s");
  });

  it("a new chat hides its hint at Send", async () => {
    await send("Hi");
    // Before any event of the turn.
    expect(
      screen.queryByText("Ask about your campaign."),
    ).not.toBeInTheDocument();
    expect(thinking()).toHaveTextContent("Thinking… 0s");
  });

  it("hides while an approval waits", async () => {
    await send("Edit");
    emit({ type: "toolCall", call, token: "token-1" });
    await screen.findByRole("region", { name: "Allow test_write?" });
    expect(thinking()).not.toBeInTheDocument();
  });

  it("hides at Stop", async () => {
    const user = await send("Hi");
    expect(thinking()).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(thinking()).not.toBeInTheDocument();
  });

  it("hides when the turn ends", async () => {
    await send("Hi");
    expect(thinking()).toBeInTheDocument();
    await act(async () => turn?.end());
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(thinking()).not.toBeInTheDocument();
  });
});
