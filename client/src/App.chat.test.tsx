import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { Chat, ChatEvent, Send } from "@/lib/chat/chatApi";
import * as chatApi from "@/lib/chat/chatApi";
import { REJECTED } from "@/lib/chat/gate";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
}));

// A write tool whose preview waits until the test shows it.
const slow = vi.hoisted(() => ({
  showPreview: () => {},
  run: (() => {}) as (path: unknown) => void,
}));

// Rust is not there in tests: each turn waits until the test ends it.
let turn: { send: Send; end: (chatId?: string) => void } | null = null;
let latest: Chat | null = null;
let keySaved = false;
let custom: chatApi.CustomProvider | null = null;
let customKeySaved = false;
let codex: chatApi.CodexStatus = { state: "notInstalled" };
vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    backend: "opencode-go",
    permissionMode: "manual",
    customProvider: custom,
  })),
  latestChat: vi.fn(async () => latest),
  saveChatModel: vi.fn(async () => {}),
  savePermissionMode: vi.fn(async () => {}),
  isKeySaved: vi.fn(async (provider: string) =>
    provider === "opencode-go"
      ? keySaved
      : provider === "custom"
        ? customKeySaved
        : false,
  ),
  saveKey: vi.fn(async () => {
    keySaved = true;
  }),
  removeKey: vi.fn(async () => {
    keySaved = false;
  }),
  saveCustomProvider: vi.fn(async (name: string, baseUrl: string) => {
    custom = { name, baseUrl };
    return custom;
  }),
  removeCustomProvider: vi.fn(async () => {
    custom = null;
    customKeySaved = false;
  }),
  listModels: vi.fn(async (backend: string) => {
    if (backend === "custom") throw "Ollama returned HTTP 404: not found";
    return ["glm-5.3", "kimi-k3"];
  }),
  codexStatus: vi.fn(async () => codex),
  sendMessage: vi.fn(
    (send: Send) =>
      new Promise((resolve) => {
        turn = {
          send,
          end: (chatId = "chat-1") => resolve({ chatId, end: "done" }),
        };
      }),
  ),
  sendToolResult: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
}));

// A test-only write tool: the app registers no real tools yet.
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
        run: ({ path }) => `wrote ${path}`,
        preview: ({ path }) => ({
          target: String(path),
          diff: "-old line\n+new line",
        }),
      },
      {
        name: "slow_write",
        description: "Writes a test note after a slow preview.",
        inputSchema: { type: "object" },
        kind: "write",
        run: ({ path }) => {
          slow.run(path);
          return `wrote ${path}`;
        },
        preview: ({ path }) =>
          new Promise((resolve) => {
            slow.showPreview = () => resolve({ target: String(path) });
          }),
      },
    ]),
  };
});

const api = vi.mocked(chatApi);

beforeEach(() => {
  vi.clearAllMocks();
  turn = null;
  latest = null;
  keySaved = false;
  custom = null;
  customKeySaved = false;
  codex = { state: "notInstalled" };
});

async function openChat() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Chat" }));
  // Settings load when the panel first opens.
  await screen.findByRole("button", { name: "Model: glm-5.3" });
  return user;
}

const panel = () => screen.getByRole("complementary", { name: "Chat" });

// Sends an event from the running turn.
const emit = (event: ChatEvent) => act(() => turn?.send.onEvent(event));

describe("Chat panel", () => {
  it("opens from the Chat button, replaces Dice, and closes on a second click", async () => {
    const user = userEvent.setup();
    render(<App />);
    const chat = screen.getByRole("button", { name: "Chat", pressed: false });
    const dice = screen.getByRole("button", { name: "Dice" });

    await user.click(dice);
    expect(
      screen.getByRole("complementary", { name: "Dice" }),
    ).toBeInTheDocument();

    await user.click(chat);
    expect(panel()).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Dice" }),
    ).not.toBeInTheDocument();
    expect(chat).toHaveAttribute("aria-pressed", "true");
    expect(dice).toHaveAttribute("aria-pressed", "false");

    await user.click(chat);
    expect(
      screen.queryByRole("complementary", { name: "Chat" }),
    ).not.toBeInTheDocument();
    expect(chat).toHaveAttribute("aria-pressed", "false");
  });

  it("reopens the last chat", async () => {
    latest = {
      id: "old",
      title: "Ogres",
      createdAt: 1,
      updatedAt: 2,
      backend: "opencode-go",
      model: "glm-5.3",
      archived: false,
      messages: [
        { role: "user", text: "Who are the ogres?" },
        { role: "assistant", text: "Hill **giants**." },
      ],
      usage: { inputTokens: 1200, outputTokens: 300 },
    };
    await openChat();

    expect(await screen.findByText("Who are the ogres?")).toBeInTheDocument();
    expect(within(panel()).getByText("giants").tagName).toBe("STRONG");
    expect(within(panel()).getByText("1.5k tokens")).toBeInTheDocument();
  });

  it("Enter sends, Shift+Enter adds a line, and the reply streams in", async () => {
    const user = await openChat();
    const field = screen.getByRole("textbox", { name: "Message" });

    await user.type(field, "Roll{Shift>}{Enter}{/Shift}for me");
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(field).toHaveValue("Roll\nfor me");

    await user.type(field, "{Enter}");
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(turn?.send).toMatchObject({
      chatId: null,
      text: "Roll\nfor me",
      model: "glm-5.3",
      tools: [
        expect.objectContaining({ name: "test_write" }),
        expect.objectContaining({ name: "slow_write" }),
      ],
    });
    expect(turn?.send.system).toContain("No note is open.");
    expect(field).toHaveValue("");

    emit({ type: "message", message: { role: "user", text: "Roll\nfor me" } });
    emit({ type: "textDelta", text: "You rolled " });
    emit({ type: "textDelta", text: "*17*." });
    expect(within(panel()).getByText("17").tagName).toBe("EM");
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop" }));
    const firstTurn = turn?.send.turnId;
    expect(firstTurn).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.stopTurn).toHaveBeenCalledWith(firstTurn);

    emit({
      type: "message",
      message: { role: "assistant", text: "You rolled *17*." },
    });
    await act(async () => turn?.end("chat-1"));
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(within(panel()).getAllByText("17")).toHaveLength(1);

    // The next message goes to the same chat, as a new turn that Stop names.
    await user.type(field, "Again{Enter}");
    expect(turn?.send.chatId).toBe("chat-1");
    const secondTurn = turn?.send.turnId;
    expect(secondTurn).not.toBe(firstTurn);
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(api.stopTurn).toHaveBeenLastCalledWith(secondTurn);
  });

  it("in Manual a write tool shows an approval card; Approve runs it", async () => {
    const user = await openChat();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Edit{Enter}",
    );
    const call = {
      id: "call_1",
      name: "test_write",
      arguments: '{"path":"Ada.md"}',
    };
    emit({
      type: "message",
      message: { role: "assistant", text: "", toolCalls: [call] },
    });
    emit({ type: "toolCall", call, token: "token-1" });

    const card = await screen.findByRole("region", {
      name: "Allow test_write?",
    });
    expect(card).toHaveTextContent("Ada.md");
    expect(card).toHaveTextContent("-old line");
    expect(card).toHaveTextContent("+new line");
    expect(api.sendToolResult).not.toHaveBeenCalled();

    await user.click(within(card).getByRole("button", { name: "Approve" }));
    expect(api.sendToolResult).toHaveBeenCalledWith("token-1", {
      content: "wrote Ada.md",
      isError: false,
    });
    expect(
      screen.queryByRole("region", { name: "Allow test_write?" }),
    ).not.toBeInTheDocument();
  });

  it("Reject returns a tool error to the model", async () => {
    const user = await openChat();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Edit{Enter}",
    );
    emit({
      type: "toolCall",
      call: { id: "call_2", name: "test_write", arguments: '{"path":"A.md"}' },
      token: "token-2",
    });

    const card = await screen.findByRole("region", {
      name: "Allow test_write?",
    });
    await user.click(within(card).getByRole("button", { name: "Reject" }));
    expect(api.sendToolResult).toHaveBeenCalledWith("token-2", {
      content: REJECTED,
      isError: true,
    });
  });

  it("in Auto a write tool runs without a card, and the mode is saved", async () => {
    const user = await openChat();
    const auto = screen.getByRole("button", { name: "Auto" });
    await user.click(auto);
    expect(auto).toHaveAttribute("aria-pressed", "true");
    expect(api.savePermissionMode).toHaveBeenCalledWith("auto");

    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Edit{Enter}",
    );
    await act(async () =>
      turn?.send.onEvent({
        type: "toolCall",
        call: {
          id: "call_3",
          name: "test_write",
          arguments: '{"path":"B.md"}',
        },
        token: "token-3",
      }),
    );

    expect(api.sendToolResult).toHaveBeenCalledWith("token-3", {
      content: "wrote B.md",
      isError: false,
    });
    expect(
      screen.queryByRole("region", { name: "Allow test_write?" }),
    ).not.toBeInTheDocument();
  });

  it("shows an error line in the thread and a toast for a missing key", async () => {
    const user = await openChat();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    const message = "Add an OpenCode Go key in the model menu.";
    emit({
      type: "message",
      message: { role: "notice", level: "error", text: message },
    });
    emit({ type: "toast", message });

    expect(within(panel()).getByText(message)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByRole(
        "alert",
      ),
    ).toHaveTextContent(message);
  });

  it("the model menu saves a key, then lists and picks models", async () => {
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    await user.click(
      await within(menu).findByRole("button", { name: "Add OpenCode Go key" }),
    );
    await user.type(within(menu).getByLabelText("OpenCode Go key"), "sk-1");
    await user.click(within(menu).getByRole("button", { name: "Save" }));
    expect(api.saveKey).toHaveBeenCalledWith("opencode-go", "sk-1");
    expect(
      await within(menu).findByRole("button", {
        name: "Remove OpenCode Go key",
      }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByLabelText("OpenCode Go key"),
    ).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: "kimi-k3" }));
    expect(api.saveChatModel).toHaveBeenCalledWith("opencode-go", "kimi-k3");
    expect(
      screen.getByRole("button", { name: "Model: kimi-k3" }),
    ).toBeInTheDocument();
  });

  it("New chat clears the thread and starts a new chat", async () => {
    latest = {
      id: "old",
      title: "",
      createdAt: 1,
      updatedAt: 2,
      backend: "opencode-go",
      model: "glm-5.3",
      archived: false,
      messages: [{ role: "user", text: "Earlier" }],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    const user = await openChat();
    expect(await screen.findByText("Earlier")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText("Earlier")).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send.chatId).toBeNull();
  });

  it("Stop during a slow preview shows no card and runs nothing", async () => {
    const user = await openChat();
    const run = vi.fn();
    slow.run = run;
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Edit{Enter}",
    );
    emit({
      type: "toolCall",
      call: { id: "call_4", name: "slow_write", arguments: '{"path":"S.md"}' },
      token: "token-4",
    });

    await user.click(screen.getByRole("button", { name: "Stop" }));
    await act(async () => slow.showPreview());

    expect(
      screen.queryByRole("region", { name: "Allow slow_write?" }),
    ).not.toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
    // The stopped turn takes no result.
    expect(api.sendToolResult).not.toHaveBeenCalled();
  });

  it("a tool call event after Stop shows no card", async () => {
    const user = await openChat();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Edit{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));
    emit({
      type: "toolCall",
      call: { id: "call_5", name: "test_write", arguments: '{"path":"A.md"}' },
      token: "token-5",
    });
    await act(async () => {});

    expect(
      screen.queryByRole("region", { name: "Allow test_write?" }),
    ).not.toBeInTheDocument();
    expect(api.sendToolResult).not.toHaveBeenCalled();
  });

  it("a mode picked while the settings load wins over the saved mode", async () => {
    let loadSettings: () => void = () => {};
    api.getChatSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          loadSettings = () =>
            resolve({
              model: "glm-5.3",
              backend: "opencode-go",
              permissionMode: "auto",
              customProvider: null,
            });
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await user.click(screen.getByRole("button", { name: "Auto" }));
    await user.click(screen.getByRole("button", { name: "Manual" }));

    await act(async () => loadSettings());
    await screen.findByRole("button", { name: "Model: glm-5.3" });
    expect(screen.getByRole("button", { name: "Manual" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The write tool still asks first.
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Edit{Enter}",
    );
    emit({
      type: "toolCall",
      call: { id: "call_6", name: "test_write", arguments: '{"path":"A.md"}' },
      token: "token-6",
    });
    expect(
      await screen.findByRole("region", { name: "Allow test_write?" }),
    ).toBeInTheDocument();
    expect(api.sendToolResult).not.toHaveBeenCalled();
  });

  it("saving a key does not send the draft", async () => {
    const user = await openChat();
    const field = screen.getByRole("textbox", { name: "Message" });
    await user.type(field, "Draft");
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    const add = () =>
      within(menu).findByRole("button", { name: "Add OpenCode Go key" });

    await user.click(await add());
    await user.type(within(menu).getByLabelText("OpenCode Go key"), "sk-1");
    await user.click(within(menu).getByRole("button", { name: "Save" }));
    await user.click(
      await within(menu).findByRole("button", {
        name: "Remove OpenCode Go key",
      }),
    );
    await user.click(await add());
    await user.type(
      within(menu).getByLabelText("OpenCode Go key"),
      "sk-2{Enter}",
    );

    expect(api.saveKey).toHaveBeenNthCalledWith(1, "opencode-go", "sk-1");
    expect(api.saveKey).toHaveBeenNthCalledWith(2, "opencode-go", "sk-2");
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(field).toHaveValue("Draft");
  });

  it("Remove deletes a saved key", async () => {
    keySaved = true;
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });

    await user.click(
      await within(menu).findByRole("button", {
        name: "Remove OpenCode Go key",
      }),
    );
    expect(api.removeKey).toHaveBeenCalledWith("opencode-go");
    expect(
      await within(menu).findByRole("button", { name: "Add OpenCode Go key" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByText("Add a key below to list the models."),
    ).toBeInTheDocument();
  });

  it("adds a custom provider, takes a typed model id when /models fails, and locks the chat to it", async () => {
    keySaved = true;
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    let menu = screen.getByRole("dialog", { name: "Models and keys" });
    await user.click(
      await within(menu).findByRole("button", { name: "Add custom provider" }),
    );
    await user.type(within(menu).getByLabelText("Name"), "Ollama");
    await user.type(
      within(menu).getByLabelText("Base URL"),
      "http://localhost:11434/v1",
    );
    await user.click(within(menu).getByRole("button", { name: "Save" }));
    expect(api.saveCustomProvider).toHaveBeenCalledWith(
      "Ollama",
      "http://localhost:11434/v1",
      null,
    );

    expect(
      await within(menu).findByText(
        "Could not list models from this provider.",
      ),
    ).toBeInTheDocument();
    expect(api.listModels).toHaveBeenCalledWith("custom");
    expect(within(menu).getByText("No key")).toBeInTheDocument();
    await user.type(within(menu).getByLabelText("Model id"), "llama3");
    await user.click(within(menu).getByRole("button", { name: "Use" }));
    expect(api.saveChatModel).toHaveBeenCalledWith("custom", "llama3");

    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({ backend: "custom", model: "llama3" });

    // The chat stays on the custom provider.
    await user.click(screen.getByRole("button", { name: "Model: llama3" }));
    menu = screen.getByRole("dialog", { name: "Models and keys" });
    expect(
      await within(menu).findByRole("button", { name: "kimi-k3" }),
    ).toBeDisabled();
    expect(
      within(menu).getByText(
        "This chat uses Ollama. Start a new chat to use another provider.",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(menu).getByRole("button", { name: "Remove custom provider" }),
    );
    expect(api.removeCustomProvider).toHaveBeenCalled();
    expect(
      await within(menu).findByRole("button", { name: "Add custom provider" }),
    ).toBeInTheDocument();
    expect(within(menu).getByText("Custom provider")).toBeInTheDocument();
    // Its model is no longer chosen.
    expect(
      screen.getByRole("button", { name: "Model: none" }),
    ).toBeInTheDocument();
  });

  it("disables Save and Remove while a provider change runs", async () => {
    keySaved = true;
    custom = { name: "Ollama", baseUrl: "http://localhost:11434/v1" };
    let finish = () => {};
    api.removeCustomProvider.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            custom = null;
            resolve();
          };
        }),
    );
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    const remove = await within(menu).findByRole("button", {
      name: "Remove custom provider",
    });

    await user.click(remove);
    expect(remove).toBeDisabled();
    expect(
      within(menu).getByRole("button", { name: "Remove OpenCode Go key" }),
    ).toBeDisabled();
    await user.click(
      within(menu).getByRole("button", { name: "Edit custom provider" }),
    );
    expect(within(menu).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(remove);
    expect(api.removeCustomProvider).toHaveBeenCalledTimes(1);

    act(() => finish());
    expect(
      await within(menu).findByRole("button", { name: "Add custom provider" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("button", { name: "Remove OpenCode Go key" }),
    ).toBeEnabled();
  });

  it("shows the key a failed first save left, with Remove, at once", async () => {
    const error =
      "Couldn't save the provider: disk full. Its key also couldn't be put back (keychain locked). Save the provider again, or remove it to delete the key.";
    api.saveCustomProvider.mockImplementationOnce(async () => {
      customKeySaved = true;
      throw { message: error };
    });
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    await user.click(
      await within(menu).findByRole("button", { name: "Add custom provider" }),
    );
    await user.type(within(menu).getByLabelText("Name"), "Ollama");
    await user.type(
      within(menu).getByLabelText("Base URL"),
      "http://localhost:11434/v1",
    );
    await user.type(within(menu).getByLabelText("API key (optional)"), "sk-1");
    await user.click(within(menu).getByRole("button", { name: "Save" }));

    expect(await within(menu).findByText("Key only")).toBeInTheDocument();
    expect(
      within(menu).getByRole("button", { name: "Remove custom provider key" }),
    ).toBeEnabled();
    expect(within(menu).getByText(error)).toBeInTheDocument();
  });

  it("offers Remove for a custom key left without a provider", async () => {
    customKeySaved = true;
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    expect(await within(menu).findByText("Key only")).toBeInTheDocument();

    await user.click(
      within(menu).getByRole("button", { name: "Remove custom provider key" }),
    );
    expect(api.removeCustomProvider).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(within(menu).queryByText("Key only")).not.toBeInTheDocument(),
    );
    expect(
      within(menu).queryByRole("button", {
        name: "Remove custom provider key",
      }),
    ).not.toBeInTheDocument();
  });

  it("the Codex group says when Codex is not installed", async () => {
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    expect(await within(menu).findByText("Install Codex")).toBeInTheDocument();
    expect(
      within(menu).getByText("Install the Codex CLI, then run codex login."),
    ).toBeInTheDocument();
    expect(within(menu).queryByRole("list", { name: "Codex" })).toBeNull();
  });

  it("the Codex group asks for codex login and disables its models when signed out", async () => {
    codex = { state: "signedOut", models: ["gpt-6.1-sol", "gpt-5.6-terra"] };
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    expect(
      await within(menu).findByText("Run codex login"),
    ).toBeInTheDocument();
    expect(
      within(menu).getByText(
        "Run codex login in a terminal to use these models.",
      ),
    ).toBeInTheDocument();
    const models = within(menu).getByRole("list", { name: "Codex" });
    expect(
      within(models).getByRole("button", { name: "gpt-6.1-sol" }),
    ).toBeDisabled();
    expect(
      within(models).getByRole("button", { name: "gpt-5.6-terra" }),
    ).toBeDisabled();
  });

  it("picks a Codex model when signed in and locks the chat to Codex", async () => {
    keySaved = true;
    codex = { state: "ready", models: ["gpt-6.1-sol", "gpt-5.6-terra"] };
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    let menu = screen.getByRole("dialog", { name: "Models and keys" });
    expect(await within(menu).findByText("Signed in")).toBeInTheDocument();
    await user.click(
      await within(menu).findByRole("button", { name: "gpt-6.1-sol" }),
    );
    expect(api.saveChatModel).toHaveBeenCalledWith("codex", "gpt-6.1-sol");

    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({
      backend: "codex",
      model: "gpt-6.1-sol",
    });

    await user.click(
      screen.getByRole("button", { name: "Model: gpt-6.1-sol" }),
    );
    menu = screen.getByRole("dialog", { name: "Models and keys" });
    expect(
      await within(menu).findByRole("button", { name: "kimi-k3" }),
    ).toBeDisabled();
    expect(
      within(menu).getByText(
        "This chat uses Codex. Start a new chat to use another provider.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(menu).findByRole("button", { name: "gpt-5.6-terra" }),
    ).toBeEnabled();
  });

  it("a chat on OpenCode Go shows the Codex models locked", async () => {
    keySaved = true;
    codex = { state: "ready", models: ["gpt-6.1-sol"] };
    const user = await openChat();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({ backend: "opencode-go" });
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models and keys" });
    expect(
      await within(menu).findByRole("button", { name: "gpt-6.1-sol" }),
    ).toBeDisabled();
    expect(
      within(menu).getByText(
        "This chat uses OpenCode Go. Start a new chat to use another provider.",
      ),
    ).toBeInTheDocument();
  });
});
