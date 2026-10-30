import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { Send } from "@/lib/chat/chatApi";
import * as chatApi from "@/lib/chat/chatApi";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
}));

// Rust is not there in tests: each turn waits until the test ends it.
let turn: { send: Send } | null = null;
let keys: Record<string, boolean> = {};
let custom: chatApi.CustomProvider | null = null;
let goModels = ["glm-5.3", "kimi-k3"];
let customModels: string[] | null = null;
let codex: chatApi.CodexStatus = { state: "notInstalled" };
vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    backend: "opencode-go",
    permissionMode: "manual",
    customProvider: custom,
  })),
  latestChat: vi.fn(async () => null),
  saveChatModel: vi.fn(async () => {}),
  savePermissionMode: vi.fn(async () => {}),
  isKeySaved: vi.fn(async (provider: string) => keys[provider] ?? false),
  saveKey: vi.fn(async (provider: string) => {
    keys[provider] = true;
  }),
  removeKey: vi.fn(async (provider: string) => {
    keys[provider] = false;
  }),
  saveCustomProvider: vi.fn(
    async (name: string, baseUrl: string, key: string | null) => {
      custom = { name, baseUrl };
      if (key) keys.custom = true;
      return custom;
    },
  ),
  removeCustomProvider: vi.fn(async () => {
    custom = null;
    keys.custom = false;
  }),
  listModels: vi.fn(async (backend: string) => {
    if (backend === "custom") {
      if (customModels === null) throw "Ollama returned HTTP 404: not found";
      return customModels;
    }
    return goModels;
  }),
  codexStatus: vi.fn(async () => codex),
  sendMessage: vi.fn(
    (send: Send) =>
      new Promise(() => {
        turn = { send };
      }),
  ),
  sendToolResult: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
}));

const api = vi.mocked(chatApi);

beforeEach(() => {
  vi.clearAllMocks();
  turn = null;
  keys = {};
  custom = null;
  goModels = ["glm-5.3", "kimi-k3"];
  customModels = null;
  codex = { state: "notInstalled" };
});

async function openSettings() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  return user;
}

const page = () => screen.getByRole("main");
const section = (name: string) => within(page()).getByRole("region", { name });

// Opens the chat's model menu.
async function openModelMenu(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole("complementary", { name: "Chat" })) {
    await user.click(screen.getByRole("button", { name: "Chat" }));
  }
  await user.click(await screen.findByRole("button", { name: /^Model: / }));
  return screen.getByRole("dialog", { name: "Models" });
}

describe("Settings", () => {
  it("opens from the Settings rail button in the main panel", async () => {
    await openSettings();
    const railPanel = screen.getByRole("region", {
      name: "Settings rail panel",
    });
    expect(
      within(railPanel).getByRole("button", { name: "Providers and keys" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(page()).getByRole("heading", { name: "Providers and keys" }),
    ).toBeInTheDocument();
    expect(
      within(page()).getByText(/Keys are kept in the system keychain/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByText("Settings is not implemented yet."),
    ).not.toBeInTheDocument();
    expect(section("Built in")).toBeInTheDocument();
    expect(section("Custom provider")).toBeInTheDocument();
    expect(section("Web search")).toBeInTheDocument();
  });

  it("Notes leaves Settings, and the Settings button toggles it", async () => {
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(
      screen.getByRole("region", { name: "Notes rail panel" }),
    ).toBeInTheDocument();
    expect(
      within(page()).queryByRole("heading", { name: "Providers and keys" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("region", { name: "Notes rail panel" }),
    ).toBeInTheDocument();
  });

  it("saves, replaces and removes the OpenCode Go key, and the model menu follows", async () => {
    const user = await openSettings();
    const built = section("Built in");
    expect(await within(built).findByText("No key")).toBeInTheDocument();

    await user.type(within(built).getByLabelText("OpenCode Go key"), "sk-1");
    await user.click(
      within(built).getByRole("button", { name: "Save OpenCode Go key" }),
    );
    expect(api.saveKey).toHaveBeenCalledWith("opencode-go", "sk-1");
    expect(await within(built).findByText("Key saved")).toBeInTheDocument();
    expect(
      within(built).queryByLabelText("OpenCode Go key"),
    ).not.toBeInTheDocument();
    const chips = await within(built).findByRole("list", {
      name: "OpenCode Go models",
    });
    expect(within(chips).getByText("kimi-k3")).toBeInTheDocument();

    let menu = await openModelMenu(user);
    await user.click(
      await within(menu).findByRole("button", { name: "kimi-k3" }),
    );
    expect(api.saveChatModel).toHaveBeenCalledWith("opencode-go", "kimi-k3");

    await user.click(
      within(built).getByRole("button", { name: "Replace OpenCode Go key" }),
    );
    await user.type(
      within(built).getByLabelText("OpenCode Go key"),
      "sk-2{Enter}",
    );
    expect(api.saveKey).toHaveBeenLastCalledWith("opencode-go", "sk-2");
    expect(await within(built).findByText("Key saved")).toBeInTheDocument();

    await user.click(
      within(built).getByRole("button", { name: "Remove OpenCode Go key" }),
    );
    expect(api.removeKey).toHaveBeenCalledWith("opencode-go");
    expect(await within(built).findByText("No key")).toBeInTheDocument();
    expect(
      within(built).queryByRole("list", { name: "OpenCode Go models" }),
    ).not.toBeInTheDocument();

    menu = await openModelMenu(user);
    expect(await within(menu).findByText("No key")).toBeInTheDocument();
    expect(
      within(menu).queryByRole("button", { name: "glm-5.3" }),
    ).not.toBeInTheDocument();
  });

  it("Replace can be cancelled and keeps the key", async () => {
    keys["opencode-go"] = true;
    const user = await openSettings();
    const built = section("Built in");
    await user.click(
      await within(built).findByRole("button", {
        name: "Replace OpenCode Go key",
      }),
    );
    await user.click(within(built).getByRole("button", { name: "Cancel" }));
    expect(
      within(built).queryByLabelText("OpenCode Go key"),
    ).not.toBeInTheDocument();
    expect(within(built).getByText("Key saved")).toBeInTheDocument();
    expect(api.saveKey).not.toHaveBeenCalled();
  });

  it("saves and removes the Tavily key, with no model list", async () => {
    const user = await openSettings();
    const search = section("Web search");
    expect(await within(search).findByText("No key")).toBeInTheDocument();
    await user.type(within(search).getByLabelText("Tavily key"), "tv-1");
    await user.click(
      within(search).getByRole("button", { name: "Save Tavily key" }),
    );
    expect(api.saveKey).toHaveBeenCalledWith("tavily", "tv-1");
    expect(await within(search).findByText("Key saved")).toBeInTheDocument();
    expect(within(search).queryByRole("list")).not.toBeInTheDocument();

    await user.click(
      within(search).getByRole("button", { name: "Remove Tavily key" }),
    );
    expect(api.removeKey).toHaveBeenCalledWith("tavily");
    expect(await within(search).findByText("No key")).toBeInTheDocument();
  });

  it("Enter in a key field saves the key and does not send the chat draft", async () => {
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Chat" }));
    const field = await screen.findByRole("textbox", { name: "Message" });
    await user.type(field, "Draft");

    const built = section("Built in");
    await user.type(
      await within(built).findByLabelText("OpenCode Go key"),
      "sk-1{Enter}",
    );
    expect(api.saveKey).toHaveBeenCalledWith("opencode-go", "sk-1");
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(field).toHaveValue("Draft");
  });

  it("shows at most 10 model ids, then how many more", async () => {
    keys["opencode-go"] = true;
    goModels = Array.from({ length: 13 }, (_, i) => `model-${i + 1}`);
    await openSettings();
    const chips = await within(section("Built in")).findByRole("list", {
      name: "OpenCode Go models",
    });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(10);
    expect(within(chips).getByText("model-10")).toBeInTheDocument();
    expect(within(chips).queryByText("model-11")).not.toBeInTheDocument();
    expect(
      within(section("Built in")).getByText("… and 3 more"),
    ).toBeInTheDocument();
  });

  it("shows all 10 model ids, and no more text, when there are 10", async () => {
    keys["opencode-go"] = true;
    goModels = Array.from({ length: 10 }, (_, i) => `model-${i + 1}`);
    await openSettings();
    const chips = await within(section("Built in")).findByRole("list", {
      name: "OpenCode Go models",
    });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(10);
    expect(
      within(section("Built in")).queryByText(/more$/),
    ).not.toBeInTheDocument();
  });

  it("caps the custom provider's models the same way", async () => {
    custom = { name: "Ollama", baseUrl: "http://localhost:11434/v1" };
    customModels = Array.from({ length: 11 }, (_, i) => `m${i + 1}`);
    await openSettings();
    const chips = await within(section("Custom provider")).findByRole("list", {
      name: "Ollama models",
    });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(10);
    expect(
      within(section("Custom provider")).getByText("… and 1 more"),
    ).toBeInTheDocument();
  });

  it("adds a custom provider; the model menu takes a typed model id when /models fails; Remove clears the chat's model", async () => {
    keys["opencode-go"] = true;
    const user = await openSettings();
    const form = section("Custom provider");
    await user.type(within(form).getByLabelText("Name"), "Ollama");
    await user.type(
      within(form).getByLabelText("Base URL"),
      "http://localhost:11434/v1",
    );
    expect(
      within(form).getByText(
        "OpenAI-compatible. The model list comes from GET /models.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(form).getByRole("button", { name: "Save custom provider" }),
    );
    expect(api.saveCustomProvider).toHaveBeenCalledWith(
      "Ollama",
      "http://localhost:11434/v1",
      null,
    );
    expect(
      await within(form).findByText(
        "Could not list models from this provider.",
      ),
    ).toBeInTheDocument();
    expect(within(form).getByText("No key")).toBeInTheDocument();

    let menu = await openModelMenu(user);
    expect(
      await within(menu).findByText(
        "Could not list models from this provider.",
      ),
    ).toBeInTheDocument();
    await user.type(within(menu).getByLabelText("Model id"), "llama3");
    await user.click(within(menu).getByRole("button", { name: "Use" }));
    expect(api.saveChatModel).toHaveBeenCalledWith("custom", "llama3");

    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    expect(turn?.send).toMatchObject({ backend: "custom", model: "llama3" });

    // The chat stays on the custom provider.
    menu = await openModelMenu(user);
    expect(
      await within(menu).findByRole("button", { name: "kimi-k3" }),
    ).toBeDisabled();
    expect(
      within(menu).getByText(
        "This chat uses Ollama. Start a new chat to use another provider.",
      ),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(
      within(form).getByRole("button", { name: "Remove custom provider" }),
    );
    expect(api.removeCustomProvider).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(
        within(form).queryByRole("button", { name: "Remove custom provider" }),
      ).not.toBeInTheDocument(),
    );
    expect(within(form).getByLabelText("Name")).toHaveValue("");
    // Its model is no longer chosen.
    expect(
      screen.getByRole("button", { name: "Model: none" }),
    ).toBeInTheDocument();
  });

  it("disables Save and Remove while a provider change runs", async () => {
    keys["opencode-go"] = true;
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
    const user = await openSettings();
    const remove = await within(section("Custom provider")).findByRole(
      "button",
      { name: "Remove custom provider" },
    );

    await user.click(remove);
    expect(remove).toBeDisabled();
    expect(
      within(section("Custom provider")).getByRole("button", {
        name: "Save custom provider",
      }),
    ).toBeDisabled();
    expect(
      within(section("Built in")).getByRole("button", {
        name: "Remove OpenCode Go key",
      }),
    ).toBeDisabled();
    expect(
      within(section("Web search")).getByRole("button", {
        name: "Save Tavily key",
      }),
    ).toBeDisabled();
    await user.click(remove);
    expect(api.removeCustomProvider).toHaveBeenCalledTimes(1);

    act(() => finish());
    await vi.waitFor(() =>
      expect(
        within(section("Custom provider")).queryByRole("button", {
          name: "Remove custom provider",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(section("Built in")).getByRole("button", {
        name: "Remove OpenCode Go key",
      }),
    ).toBeEnabled();
  });

  it("shows the key a failed first save left, with Remove, at once", async () => {
    const error =
      "Couldn't save the provider: disk full. Its key also couldn't be put back (keychain locked). Save the provider again, or remove it to delete the key.";
    api.saveCustomProvider.mockImplementationOnce(async () => {
      keys.custom = true;
      throw { message: error };
    });
    const user = await openSettings();
    const form = section("Custom provider");
    await user.type(within(form).getByLabelText("Name"), "Ollama");
    await user.type(
      within(form).getByLabelText("Base URL"),
      "http://localhost:11434/v1",
    );
    await user.type(within(form).getByLabelText("API key (optional)"), "sk-1");
    await user.click(
      within(form).getByRole("button", { name: "Save custom provider" }),
    );

    expect(await within(form).findByText("Key only")).toBeInTheDocument();
    expect(
      within(form).getByRole("button", { name: "Remove custom provider key" }),
    ).toBeEnabled();
    expect(within(form).getByText(error)).toBeInTheDocument();
  });

  it("offers Remove for a custom key left without a provider", async () => {
    keys.custom = true;
    const user = await openSettings();
    const form = section("Custom provider");
    expect(await within(form).findByText("Key only")).toBeInTheDocument();

    await user.click(
      within(form).getByRole("button", { name: "Remove custom provider key" }),
    );
    expect(api.removeCustomProvider).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(within(form).queryByText("Key only")).not.toBeInTheDocument(),
    );
    expect(
      within(form).queryByRole("button", {
        name: "Remove custom provider key",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows the Codex status as words", async () => {
    codex = { state: "ready", models: ["gpt-6.1-sol"] };
    const user = await openSettings();
    const built = section("Built in");
    expect(await within(built).findByText("Signed in")).toBeInTheDocument();

    codex = { state: "signedOut", models: ["gpt-6.1-sol"] };
    await user.click(
      within(built).getByRole("button", { name: "Check again" }),
    );
    expect(await within(built).findByText("Not signed in")).toBeInTheDocument();
    expect(
      within(built).getByText(
        "Run codex login in a terminal to use these models.",
      ),
    ).toBeInTheDocument();

    codex = { state: "notInstalled" };
    await user.click(
      within(built).getByRole("button", { name: "Check again" }),
    );
    expect(await within(built).findByText("Not installed")).toBeInTheDocument();
    expect(
      within(built).getByText("Install the Codex CLI, then run codex login."),
    ).toBeInTheDocument();
  });
});

describe("Model menu", () => {
  it("lists models only: no key fields, key buttons, provider form or Settings link", async () => {
    keys["opencode-go"] = true;
    custom = { name: "Ollama", baseUrl: "http://localhost:11434/v1" };
    customModels = ["qwen3:14b"];
    const user = userEvent.setup();
    render(<App />);
    const menu = await openModelMenu(user);
    expect(
      await within(menu).findByRole("button", { name: "qwen3:14b" }),
    ).toBeInTheDocument();
    expect(within(menu).getByText("Key saved")).toBeInTheDocument();
    const buttons = within(menu)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons).toEqual(["glm-5.3", "kimi-k3", "qwen3:14b"]);
    expect(within(menu).queryAllByRole("textbox")).toHaveLength(0);
    expect(menu.querySelector("input")).toBeNull();
    expect(within(menu).queryByRole("link")).not.toBeInTheDocument();
    expect(within(menu).queryByText(/Providers and keys/)).toBeNull();
  });

  it("a provider without a key shows only No key", async () => {
    const user = userEvent.setup();
    render(<App />);
    const menu = await openModelMenu(user);
    expect(await within(menu).findByText("No key")).toBeInTheDocument();
    expect(within(menu).queryByRole("button")).not.toBeInTheDocument();
    expect(menu.querySelector("input")).toBeNull();
    expect(within(menu).queryByText(/Add a key/)).toBeNull();
  });
});
