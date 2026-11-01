import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { resetChangeGuard } from "@/components/menus/SettingsMenu/changeGuard";
import * as chatApi from "@/lib/chat/chatApi";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
}));

let keys: Record<string, boolean> = {};
let goModels = ["glm-5.3", "kimi-k3"];
let codex: chatApi.CodexStatus = { state: "notInstalled" };
vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    backend: "opencode-go",
    permissionMode: "manual",
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
  listModels: vi.fn(async () => goModels),
  codexStatus: vi.fn(async () => codex),
  // Rust is not there in tests: a turn never ends.
  sendMessage: vi.fn(() => new Promise(() => {})),
  sendToolResult: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
}));

const api = vi.mocked(chatApi);

beforeEach(() => {
  vi.clearAllMocks();
  resetChangeGuard();
  keys = {};
  goModels = ["glm-5.3", "kimi-k3"];
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
      within(page()).getByText(
        /Keys are kept in a file in the app config folder/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByText("Settings is not implemented yet."),
    ).not.toBeInTheDocument();
    expect(section("Built in")).toBeInTheDocument();
    expect(section("Web search")).toBeInTheDocument();
    expect(within(page()).getAllByRole("region")).toHaveLength(2);
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

  it("keeps a key corrected while its save runs", async () => {
    let finish = () => {};
    api.saveKey.mockImplementationOnce(
      (provider: string) =>
        new Promise<void>((resolve) => {
          finish = () => {
            keys[provider] = true;
            resolve();
          };
        }),
    );
    const user = await openSettings();
    const built = section("Built in");
    await user.type(
      await within(built).findByLabelText("OpenCode Go key"),
      "sk-1",
    );
    await user.click(
      within(built).getByRole("button", { name: "Save OpenCode Go key" }),
    );
    await user.type(within(built).getByLabelText("OpenCode Go key"), "x");
    act(() => finish());

    expect(await within(built).findByText("Key saved")).toBeInTheDocument();
    expect(api.saveKey).toHaveBeenCalledWith("opencode-go", "sk-1");
    expect(within(built).getByLabelText("OpenCode Go key")).toHaveValue(
      "sk-1x",
    );
    await user.click(
      within(built).getByRole("button", { name: "Save OpenCode Go key" }),
    );
    expect(api.saveKey).toHaveBeenLastCalledWith("opencode-go", "sk-1x");
    await vi.waitFor(() =>
      expect(
        within(built).queryByLabelText("OpenCode Go key"),
      ).not.toBeInTheDocument(),
    );
  });

  it("Replace waits while a key removal runs", async () => {
    keys["opencode-go"] = true;
    let finish = () => {};
    api.removeKey.mockImplementationOnce(
      (provider: string) =>
        new Promise<void>((resolve) => {
          finish = () => {
            keys[provider] = false;
            resolve();
          };
        }),
    );
    const user = await openSettings();
    const built = section("Built in");
    await user.click(
      await within(built).findByRole("button", {
        name: "Remove OpenCode Go key",
      }),
    );
    const replace = within(built).getByRole("button", {
      name: "Replace OpenCode Go key",
    });
    expect(replace).toBeDisabled();
    await user.click(replace);
    expect(
      within(built).queryByLabelText("OpenCode Go key"),
    ).not.toBeInTheDocument();

    act(() => finish());
    expect(await within(built).findByText("No key")).toBeInTheDocument();
  });

  it("a change still running when Settings is left and reopened holds the new page until it ends", async () => {
    let finish = () => {};
    api.saveKey.mockImplementationOnce(
      (provider: string) =>
        new Promise<void>((resolve) => {
          finish = () => {
            keys[provider] = true;
            resolve();
          };
        }),
    );
    const user = await openSettings();
    await user.type(
      await within(section("Built in")).findByLabelText("OpenCode Go key"),
      "sk-1",
    );
    await user.click(
      within(section("Built in")).getByRole("button", {
        name: "Save OpenCode Go key",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));

    // The new page shows no key state, so no second change can start.
    const search = section("Web search");
    expect(within(search).queryByLabelText("Tavily key")).toBeNull();
    expect(within(search).queryByRole("button")).toBeNull();
    expect(within(section("Built in")).queryByText("No key")).toBeNull();

    act(() => finish());
    // It loads the keys as the change left them.
    expect(
      await within(section("Built in")).findByText("Key saved"),
    ).toBeInTheDocument();
    expect(
      await within(search).findByLabelText("Tavily key"),
    ).toBeInTheDocument();
    expect(api.saveKey).toHaveBeenCalledTimes(1);
  });

  it("disables Save and Remove while a key change runs", async () => {
    keys["opencode-go"] = true;
    let finish = () => {};
    api.removeKey.mockImplementationOnce(
      (provider: string) =>
        new Promise<void>((resolve) => {
          finish = () => {
            keys[provider] = false;
            resolve();
          };
        }),
    );
    const user = await openSettings();
    const remove = await within(section("Built in")).findByRole("button", {
      name: "Remove OpenCode Go key",
    });

    await user.click(remove);
    expect(remove).toBeDisabled();
    expect(
      within(section("Web search")).getByRole("button", {
        name: "Save Tavily key",
      }),
    ).toBeDisabled();
    await user.click(remove);
    expect(api.removeKey).toHaveBeenCalledTimes(1);

    act(() => finish());
    expect(
      await within(section("Web search")).findByRole("button", {
        name: "Save Tavily key",
      }),
    ).toBeEnabled();
    expect(
      await within(section("Built in")).findByText("No key"),
    ).toBeInTheDocument();
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
  it("lists models only: no key fields, key buttons or Settings link", async () => {
    keys["opencode-go"] = true;
    const user = userEvent.setup();
    render(<App />);
    const menu = await openModelMenu(user);
    expect(
      await within(menu).findByRole("button", { name: "kimi-k3" }),
    ).toBeInTheDocument();
    expect(within(menu).getByText("Key saved")).toBeInTheDocument();
    const buttons = within(menu)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons).toEqual(["glm-5.3", "kimi-k3"]);
    expect(within(menu).queryAllByRole("textbox")).toHaveLength(0);
    expect(menu.querySelector("input")).toBeNull();
    expect(within(menu).queryByRole("link")).not.toBeInTheDocument();
    expect(within(menu).queryByText(/Providers and keys/)).toBeNull();
  });

  it("a provider without a key shows No key and points to Settings in text", async () => {
    const user = userEvent.setup();
    render(<App />);
    const menu = await openModelMenu(user);
    expect(await within(menu).findByText("No key")).toBeInTheDocument();
    expect(within(menu).getByText("Add a key in Settings")).toBeInTheDocument();
    expect(within(menu).queryByRole("link")).not.toBeInTheDocument();
    expect(within(menu).queryByRole("button")).not.toBeInTheDocument();
    expect(menu.querySelector("input")).toBeNull();
  });

  it("a provider with a key has no Add a key line", async () => {
    keys["opencode-go"] = true;
    const user = userEvent.setup();
    render(<App />);
    const menu = await openModelMenu(user);
    expect(await within(menu).findByText("Key saved")).toBeInTheDocument();
    expect(within(menu).queryByText("Add a key in Settings")).toBeNull();
  });

  it("a line separates the provider groups", async () => {
    keys["opencode-go"] = true;
    const user = userEvent.setup();
    render(<App />);
    const menu = await openModelMenu(user);
    await within(menu).findByRole("list", { name: "OpenCode Go" });
    const separator = within(menu).getByRole("separator");
    const codex = within(menu).getByRole("heading", { name: "Codex" });
    const goList = within(menu).getByRole("list", { name: "OpenCode Go" });
    // After the OpenCode Go models, before the Codex heading.
    expect(
      goList.compareDocumentPosition(separator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      separator.compareDocumentPosition(codex) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
