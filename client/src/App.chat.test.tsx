import { act, render, screen, waitFor, within } from "@testing-library/react";
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
let codex: chatApi.CodexStatus = { state: "notInstalled" };
// What models.dev says about each OpenCode Go model. null: nothing known.
let goInfo: chatApi.ModelInfo | null = null;
vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    backend: "opencode-go",
    effort: null,
    permissionMode: "manual",
  })),
  latestChat: vi.fn(async () => latest),
  saveChatModel: vi.fn(async () => {}),
  savePermissionMode: vi.fn(async () => {}),
  isKeySaved: vi.fn(async (provider: string) =>
    provider === "opencode-go" ? keySaved : false,
  ),
  saveKey: vi.fn(async () => {
    keySaved = true;
  }),
  removeKey: vi.fn(async () => {
    keySaved = false;
  }),
  listModels: vi.fn(async () => ["glm-5.3", "kimi-k3"]),
  codexStatus: vi.fn(async () => codex),
  opencodeModelInfo: vi.fn(async () => goInfo),
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

// A Codex model with low, medium and high effort, medium by default.
const codexModel = (name: string): chatApi.CodexModel => ({
  name,
  efforts: [
    { effort: "low", description: "Fast" },
    { effort: "medium", description: "Balanced" },
    { effort: "high", description: "Thorough" },
  ],
  defaultEffort: "medium",
});

beforeEach(() => {
  vi.clearAllMocks();
  turn = null;
  latest = null;
  keySaved = false;
  codex = { state: "notInstalled" };
  goInfo = null;
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

type User = ReturnType<typeof userEvent.setup>;

// Opens the permission menu and picks `mode`.
async function pickMode(user: User, mode: "Manual" | "Auto") {
  await user.click(screen.getByRole("button", { name: /^Permission mode: / }));
  const menu = screen.getByRole("menu", { name: "Permission mode" });
  await user.click(within(menu).getByRole("menuitemradio", { name: mode }));
}

const effortButton = () => screen.findByRole("button", { name: /^Effort: / });

// The effort menu's levels, and the checked one. Closes the menu again.
async function effortLevels(user: User) {
  await user.click(await effortButton());
  const menu = screen.getByRole("menu", { name: "Effort" });
  const items = within(menu).getAllByRole("menuitemradio");
  const name = (item: HTMLElement) => item.textContent;
  const levels = {
    names: items.map(name),
    checked: items
      .filter((i) => i.getAttribute("aria-checked") === "true")
      .map(name),
  };
  await user.keyboard("{Escape}");
  return levels;
}

async function pickEffort(user: User, level: string) {
  await user.click(await effortButton());
  const menu = screen.getByRole("menu", { name: "Effort" });
  await user.click(within(menu).getByRole("menuitemradio", { name: level }));
}

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
      usage: { inputTokens: 1_200_000, outputTokens: 30_000 },
      context: {
        promptTokens: 168_000,
        window: 400_000,
        systemChars: 12_000,
        toolsChars: 24_000,
        conversationChars: 560_000,
        toolActivityChars: 48_000,
      },
    };
    const user = await openChat();

    expect(await screen.findByText("Who are the ogres?")).toBeInTheDocument();
    expect(within(panel()).getByText("giants").tagName).toBe("STRONG");
    expect(
      within(panel()).getByRole("button", { name: "Model: glm-5.3" }),
    ).toHaveAttribute("title", "glm-5.3");
    // The saved fill shows at once, with its parts on hover.
    const meter = within(panel()).getByRole("button", { name: "Context 42%" });
    expect(meter).toHaveTextContent("42%");
    await user.hover(meter);
    const card = screen.getByRole("region", { name: "Context usage" });
    expect(within(card).getByText("168k of 400k")).toBeInTheDocument();
    const rows = [...card.querySelectorAll("dt")].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    // 4 characters a token: 3k + 6k + 140k + 12k, so 7k is left for Other.
    expect(rows).toEqual([
      ["System prompt", "≈ 3k"],
      ["Tools", "≈ 6k"],
      ["Conversation", "≈ 140k"],
      ["Tool activity", "≈ 12k"],
      ["Other", "≈ 7k"],
      ["Free", "232k"],
      ["This chat spent", "1.2M"],
    ]);
  });

  it("shows a notice's detail on its own line under the message", async () => {
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
        {
          role: "notice",
          level: "error",
          text: "Could not reach OpenCode Go.\nerror sending request for url (http://127.0.0.1:1/v1)",
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    await openChat();

    const notice = await within(panel()).findByText(
      "Could not reach OpenCode Go.",
    );
    const detail = within(notice).getByText(
      "error sending request for url (http://127.0.0.1:1/v1)",
    );
    expect(detail).not.toBe(notice);
  });

  it("shows any other multiline notice as one block", async () => {
    const text = "Fake returned HTTP 500: service failed\nTry another model";
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
        { role: "notice", level: "error", text },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    await openChat();

    const notice = await within(panel()).findByText(
      (_, element) => element?.tagName === "P" && element.textContent === text,
    );
    expect(notice.children).toHaveLength(0);
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
    await pickMode(user, "Auto");
    expect(
      screen.getByRole("button", { name: "Permission mode: Auto" }),
    ).toBeInTheDocument();
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
    const message = "Add an OpenCode Go key in Settings.";
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
              effort: null,
              permissionMode: "auto",
            });
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    await pickMode(user, "Auto");
    await pickMode(user, "Manual");

    await act(async () => loadSettings());
    await screen.findByRole("button", { name: "Model: glm-5.3" });
    expect(
      screen.getByRole("button", { name: "Permission mode: Manual" }),
    ).toBeInTheDocument();

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

  it("the model button points its chevron up while the menu is open", async () => {
    const user = await openChat();
    const button = screen.getByRole("button", { name: "Model: glm-5.3" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.querySelector(".lucide-chevron-down")).not.toBeNull();
    expect(button.querySelector(".lucide-chevron-up")).toBeNull();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button.querySelector(".lucide-chevron-up")).not.toBeNull();
    expect(button.querySelector(".lucide-chevron-down")).toBeNull();

    await user.click(button);
    expect(button.querySelector(".lucide-chevron-down")).not.toBeNull();
  });

  it("the Codex group says when Codex is not installed", async () => {
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models" });
    expect(await within(menu).findByText("Install Codex")).toBeInTheDocument();
    // Codex comes first, OpenCode Go under it.
    expect(
      within(menu)
        .getAllByRole("heading")
        .map((h) => h.textContent),
    ).toEqual(["Codex", "OpenCode Go"]);
    expect(
      within(menu).getByText("Install the Codex CLI, then run codex login."),
    ).toBeInTheDocument();
    expect(within(menu).queryByRole("list", { name: "Codex" })).toBeNull();
  });

  it("the Codex group says Not signed in and disables its models when signed out", async () => {
    codex = {
      state: "signedOut",
      models: [codexModel("gpt-6.1-sol"), codexModel("gpt-5.6-terra")],
    };
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models" });
    expect(await within(menu).findByText("Not signed in")).toBeInTheDocument();
    expect(
      within(menu).getByText(
        "Run codex login in a terminal to use these models.",
      ),
    ).toBeInTheDocument();
    const models = within(menu).getByRole("list", { name: "Codex" });
    expect(
      within(models).getByRole("button", { name: "6.1-sol" }),
    ).toBeDisabled();
    expect(
      within(models).getByRole("button", { name: "5.6-terra" }),
    ).toBeDisabled();
  });

  it("picks a Codex model when signed in and locks the chat to Codex", async () => {
    keySaved = true;
    codex = {
      state: "ready",
      models: [codexModel("gpt-6.1-sol"), codexModel("gpt-5.6-terra")],
    };
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    let menu = screen.getByRole("dialog", { name: "Models" });
    expect(await within(menu).findByText("Signed in")).toBeInTheDocument();
    await user.click(
      await within(menu).findByRole("button", { name: "6.1-sol" }),
    );
    expect(api.saveChatModel).toHaveBeenCalledWith(
      "codex",
      "gpt-6.1-sol",
      "medium",
    );

    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({
      backend: "codex",
      model: "gpt-6.1-sol",
    });

    await user.click(screen.getByRole("button", { name: "Model: 6.1-sol" }));
    menu = screen.getByRole("dialog", { name: "Models" });
    expect(
      await within(menu).findByRole("button", { name: "kimi-k3" }),
    ).toBeDisabled();
    expect(
      within(menu).getByText(
        "This chat uses Codex. Start a new chat to use another provider.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(menu).findByRole("button", { name: "5.6-terra" }),
    ).toBeEnabled();
  });

  it("an OpenCode Go model shows no effort and sends none", async () => {
    keySaved = true;
    codex = { state: "ready", models: [codexModel("gpt-6.1-sol")] };
    const user = await openChat();
    await screen.findByRole("button", { name: "Context 0%" });
    expect(screen.queryByRole("button", { name: /^Effort/ })).toBeNull();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({ backend: "opencode-go", effort: null });
  });

  it("a Codex model offers its efforts, starts at its default, and saves a pick", async () => {
    codex = {
      state: "ready",
      models: [
        codexModel("gpt-6.1-sol"),
        {
          name: "gpt-5.6-terra",
          efforts: [
            { effort: "minimal", description: "Quickest" },
            { effort: "xhigh", description: "Deepest" },
          ],
          defaultEffort: "xhigh",
        },
      ],
    };
    const user = await openChat();
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    let menu = screen.getByRole("dialog", { name: "Models" });
    await user.click(
      await within(menu).findByRole("button", { name: "6.1-sol" }),
    );
    expect(api.saveChatModel).toHaveBeenLastCalledWith(
      "codex",
      "gpt-6.1-sol",
      "medium",
    );
    expect(await effortLevels(user)).toEqual({
      names: ["low", "medium", "high"],
      checked: ["medium"],
    });
    await user.click(await effortButton());
    const efforts = screen.getByRole("menu", { name: "Effort" });
    expect(within(efforts).getByText("6.1-sol")).toBeInTheDocument();
    await user.click(
      within(efforts).getByRole("menuitemradio", { name: "high" }),
    );
    expect(screen.queryByRole("menu", { name: "Effort" })).toBeNull();
    expect(await effortButton()).toHaveAccessibleName("Effort: high");
    expect(api.saveChatModel).toHaveBeenLastCalledWith(
      "codex",
      "gpt-6.1-sol",
      "high",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({
      backend: "codex",
      model: "gpt-6.1-sol",
      effort: "high",
    });
    act(() => turn?.end());

    // Another model starts at its own default.
    await user.click(screen.getByRole("button", { name: "Model: 6.1-sol" }));
    menu = screen.getByRole("dialog", { name: "Models" });
    await user.click(
      await within(menu).findByRole("button", { name: "5.6-terra" }),
    );
    expect(api.saveChatModel).toHaveBeenLastCalledWith(
      "codex",
      "gpt-5.6-terra",
      "xhigh",
    );
    await waitFor(async () =>
      expect(await effortLevels(user)).toEqual({
        names: ["minimal", "xhigh"],
        checked: ["xhigh"],
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Again{Enter}",
    );
    expect(turn?.send).toMatchObject({
      model: "gpt-5.6-terra",
      effort: "xhigh",
    });
  });

  it("a saved effort the model no longer offers shows the model's default", async () => {
    codex = { state: "ready", models: [codexModel("gpt-6.1-sol")] };
    api.getChatSettings.mockResolvedValueOnce({
      model: "gpt-6.1-sol",
      backend: "codex",
      effort: "ultra",
      permissionMode: "manual",
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(await effortButton()).toHaveAccessibleName("Effort: medium");
  });

  it("a reopened Codex chat continues at its own effort", async () => {
    codex = { state: "ready", models: [codexModel("gpt-6.1-sol")] };
    latest = {
      id: "chat-9",
      title: "Lair",
      createdAt: 1,
      updatedAt: 1,
      backend: "codex",
      model: "gpt-6.1-sol",
      effort: "low",
      archived: false,
      messages: [{ role: "assistant", text: "A dragon." }],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(await effortButton()).toHaveAccessibleName("Effort: low");
  });

  it("an OpenCode Go model offers Default and the models.dev efforts", async () => {
    keySaved = true;
    goInfo = { context: 1_000_000, efforts: ["low", "high", "max"] };
    const user = await openChat();
    expect(await effortLevels(user)).toEqual({
      names: ["Default", "low", "high", "max"],
      checked: ["Default"],
    });
    expect(api.opencodeModelInfo).toHaveBeenCalledWith("glm-5.3");

    // Default sends no effort.
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({ backend: "opencode-go", effort: null });
    act(() => turn?.end());

    await pickEffort(user, "high");
    expect(api.saveChatModel).toHaveBeenLastCalledWith(
      "opencode-go",
      "glm-5.3",
      "high",
    );
    expect(await effortButton()).toHaveAccessibleName("Effort: high");
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Again{Enter}",
    );
    expect(turn?.send).toMatchObject({ effort: "high" });
  });

  it("the context doughnut fills from the last reply and colours its level", async () => {
    keySaved = true;
    const user = await openChat();
    const meter = () =>
      within(panel()).getByRole("button", { name: /^Context/ });
    // A new chat: an empty ring.
    expect(meter()).toHaveAccessibleName("Context 0%");
    expect(meter()).toHaveAttribute("data-level", "normal");

    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    const context = (promptTokens: number, window: number | null) =>
      emit({
        type: "context",
        context: {
          promptTokens,
          window,
          systemChars: 0,
          toolsChars: 0,
          conversationChars: 0,
          toolActivityChars: 0,
        },
      });
    context(312_000, 400_000);
    expect(meter()).toHaveAccessibleName("Context 78%");
    expect(meter()).toHaveAttribute("data-level", "warn");
    context(376_000, 400_000);
    expect(meter()).toHaveAccessibleName("Context 94%");
    expect(meter()).toHaveAttribute("data-level", "danger");

    // An unknown context size: a dashed ring and ?%, without Free.
    context(168_000, null);
    expect(meter()).toHaveAccessibleName("Context unknown");
    expect(meter()).toHaveTextContent("?%");
    await user.hover(meter());
    const card = screen.getByRole("region", { name: "Context usage" });
    expect(within(card).getByText("168k of ?")).toBeInTheDocument();
    expect(within(card).queryByText("Free")).toBeNull();
    // Quietly: no toast.
    expect(screen.queryByRole("alert")).toBeNull();

    // New chat empties it again.
    act(() => turn?.end());
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(meter()).toHaveAccessibleName("Context 0%");
  });

  it("the context card opens on hover and focus, and a click pins it", async () => {
    const user = await openChat();
    const meter = within(panel()).getByRole("button", { name: "Context 0%" });
    const card = () => screen.queryByRole("region", { name: "Context usage" });

    await user.hover(meter);
    expect(card()).toHaveTextContent("No reply yet.");
    expect(meter).toHaveAttribute("aria-expanded", "true");
    // The pointer can move from the button into the card.
    await user.unhover(meter);
    await user.hover(card() as HTMLElement);
    await new Promise((r) => setTimeout(r, 200));
    expect(card()).not.toBeNull();
    await user.unhover(card() as HTMLElement);
    await waitFor(() => expect(card()).toBeNull());

    // A click pins it: leaving keeps it, Esc closes it.
    await user.click(meter);
    await user.unhover(meter);
    await new Promise((r) => setTimeout(r, 200));
    expect(card()).toHaveTextContent("Pinned");
    await user.keyboard("{Escape}");
    expect(card()).toBeNull();

    // Pinned again, a click outside closes it.
    await user.click(meter);
    await user.unhover(meter);
    await user.click(screen.getByRole("textbox", { name: "Message" }));
    await waitFor(() => expect(card()).toBeNull());

    // Pinned from the keyboard, Esc closes it after focus moves on.
    act(() => meter.focus());
    await user.keyboard("{Enter}");
    const message = screen.getByRole("textbox", { name: "Message" });
    act(() => message.focus());
    expect(card()).toHaveTextContent("Pinned");
    await user.keyboard("{Escape}");
    expect(card()).toBeNull();

    // With a menu open over a pinned card, Esc closes the menu first and
    // returns focus to its button, then a second Esc closes the card.
    act(() => meter.focus());
    await user.keyboard("{Enter}");
    const permission = within(panel()).getByRole("button", {
      name: "Permission mode: Manual",
    });
    act(() => permission.focus());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "Permission mode" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Permission mode" })).toBeNull();
    expect(permission).toHaveFocus();
    expect(card()).toHaveTextContent("Pinned");
    await user.keyboard("{Escape}");
    expect(card()).toBeNull();

    // Keyboard focus opens it too.
    act(() => meter.focus());
    expect(card()).not.toBeNull();
    act(() => meter.blur());
    expect(card()).toBeNull();
  });

  it("a chat on OpenCode Go shows the Codex models locked", async () => {
    keySaved = true;
    codex = { state: "ready", models: [codexModel("gpt-6.1-sol")] };
    const user = await openChat();
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({ backend: "opencode-go" });
    await user.click(screen.getByRole("button", { name: "Model: glm-5.3" }));
    const menu = screen.getByRole("dialog", { name: "Models" });
    expect(
      await within(menu).findByRole("button", { name: "6.1-sol" }),
    ).toBeDisabled();
    expect(
      within(menu).getByText(
        "This chat uses OpenCode Go. Start a new chat to use another provider.",
      ),
    ).toBeInTheDocument();
  });
});
