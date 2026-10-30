import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { Chat, Send } from "@/lib/chat/chatApi";
import * as chatApi from "@/lib/chat/chatApi";
import * as historyApi from "@/lib/chat/historyApi";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
}));

// The saved chats, as the Rust store would hold them.
let saved: Chat[] = [];
let latest: Chat | null = null;
let turn: { send: Send; end: (chatId?: string) => void } | null = null;

vi.mock("@/lib/chat/chatApi", () => ({
  getChatSettings: vi.fn(async () => ({
    model: "glm-5.3",
    permissionMode: "manual",
  })),
  latestChat: vi.fn(async () => latest),
  saveChatModel: vi.fn(async () => {}),
  savePermissionMode: vi.fn(async () => {}),
  isKeySaved: vi.fn(async () => true),
  saveKey: vi.fn(async () => {}),
  listModels: vi.fn(async () => []),
  sendMessage: vi.fn(
    (send: Send) =>
      new Promise((resolve) => {
        turn = {
          send,
          end: (chatId = "new-chat") => resolve({ chatId, end: "done" }),
        };
      }),
  ),
  sendToolResult: vi.fn(async () => {}),
  stopTurn: vi.fn(async () => {}),
}));

// The store's search is tested in Rust. This fake matches titles only.
vi.mock("@/lib/chat/historyApi", () => ({
  listChats: vi.fn(async (archived: boolean, query: string) =>
    saved
      .filter(
        (c) =>
          c.archived === archived &&
          c.title.toLowerCase().includes(query.trim().toLowerCase()),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, title, updatedAt, archived }) => ({
        id,
        title,
        updatedAt,
        archived,
      })),
  ),
  openChat: vi.fn(async (id: string) => {
    const chat = saved.find((c) => c.id === id);
    if (!chat) throw new Error("Couldn't open the chat.");
    return chat;
  }),
  renameChat: vi.fn(async (id: string, title: string) => {
    for (const c of saved) if (c.id === id) c.title = title;
  }),
  setChatArchived: vi.fn(async (id: string, archived: boolean) => {
    for (const c of saved) if (c.id === id) c.archived = archived;
  }),
  deleteChat: vi.fn(async (id: string) => {
    saved = saved.filter((c) => c.id !== id);
  }),
}));

const api = vi.mocked(chatApi);
const history = vi.mocked(historyApi);

const DAY = 24 * 60 * 60 * 1000;

function chat(
  id: string,
  title: string,
  updatedAt: number,
  extra: Partial<Chat> = {},
): Chat {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    backend: "opencode-go",
    model: "glm-5.3",
    archived: false,
    messages: [
      { role: "user", text: `About ${title}` },
      { role: "assistant", text: `Reply in ${title}` },
    ],
    usage: { inputTokens: 0, outputTokens: 0 },
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  turn = null;
  const now = Date.now();
  saved = [
    chat("ogre", "Ogre ambush", now),
    chat("dragon", "Dragon lair", now - 3 * DAY),
    chat("lich", "Lich tower", now - 30 * DAY),
    chat("kobold", "Kobold mines", now - DAY, { archived: true }),
  ];
  latest = saved[0];
});

async function openChat() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Chat" }));
  await screen.findByRole("button", { name: "Model: glm-5.3" });
  // The last chat reopens.
  await within(panel()).findByText("Reply in Ogre ambush");
  return user;
}

async function openHistory() {
  const user = await openChat();
  await user.click(screen.getByRole("button", { name: "Chat history" }));
  await within(panel()).findByRole("button", { name: /^Ogre ambush/ });
  return user;
}

const panel = () => screen.getByRole("complementary", { name: "Chat" });

// The titles in the list, in order.
const titles = () =>
  within(panel())
    .queryAllByRole("listitem")
    .map((row) => row.querySelector("button")?.firstChild?.textContent);

const row = (title: string) =>
  within(panel())
    .getAllByRole("listitem")
    .find((r) => r.textContent?.includes(title)) as HTMLElement;

describe("Chat history", () => {
  it("opens from the header button in place of the thread and closes on a second click", async () => {
    const user = await openChat();
    const button = screen.getByRole("button", {
      name: "Chat history",
      pressed: false,
    });

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(
      within(panel()).getByRole("heading", { name: "Chat" }),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByRole("searchbox", { name: "Search chats" }),
    ).toHaveAttribute("placeholder", "Search titles and messages");
    expect(
      within(panel()).getByRole("button", { name: "Chats", pressed: true }),
    ).toBeInTheDocument();
    expect(
      within(panel()).queryByRole("textbox", { name: "Message" }),
    ).not.toBeInTheDocument();
    await within(panel()).findByRole("button", { name: /^Ogre ambush/ });
    expect(titles()).toEqual(["Ogre ambush", "Dragon lair", "Lich tower"]);
    for (const [group, title] of [
      ["Today", "Ogre ambush"],
      ["This week", "Dragon lair"],
      ["Earlier", "Lich tower"],
    ]) {
      expect(
        within(within(panel()).getByRole("region", { name: group })).getByText(
          title,
        ),
      ).toBeInTheDocument();
    }

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(
      within(panel()).getByRole("textbox", { name: "Message" }),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByText("Reply in Ogre ambush"),
    ).toBeInTheDocument();
  });

  it("marks the open chat as the current row", async () => {
    await openHistory();
    expect(
      within(panel()).getByRole("button", { name: /^Ogre ambush/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      within(panel()).getByRole("button", { name: /^Dragon lair/ }),
    ).not.toHaveAttribute("aria-current");
  });

  it("filters by search", async () => {
    const user = await openHistory();

    await user.type(
      within(panel()).getByRole("searchbox", { name: "Search chats" }),
      "LAIR",
    );

    await vi.waitFor(() => expect(titles()).toEqual(["Dragon lair"]));
    expect(history.listChats).toHaveBeenLastCalledWith(false, "LAIR");

    await user.type(
      within(panel()).getByRole("searchbox", { name: "Search chats" }),
      "x",
    );
    expect(
      await within(panel()).findByText("No chats match."),
    ).toBeInTheDocument();
  });

  it("switches between Chats and Archived", async () => {
    const user = await openHistory();

    await user.click(within(panel()).getByRole("button", { name: "Archived" }));

    expect(
      within(panel()).getByRole("button", { name: "Archived", pressed: true }),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(titles()).toEqual(["Kobold mines"]));
    expect(history.listChats).toHaveBeenLastCalledWith(true, "");

    saved = saved.filter((c) => !c.archived);
    await user.click(within(panel()).getByRole("button", { name: "Chats" }));
    await vi.waitFor(() => expect(titles()).toHaveLength(3));
    await user.click(within(panel()).getByRole("button", { name: "Archived" }));
    expect(
      await within(panel()).findByText("No archived chats."),
    ).toBeInTheDocument();
  });

  it("archives a chat and unarchives it", async () => {
    const user = await openHistory();

    await user.click(
      within(row("Dragon lair")).getByRole("button", {
        name: "Archive Dragon lair",
      }),
    );

    expect(history.setChatArchived).toHaveBeenCalledWith("dragon", true);
    await vi.waitFor(() =>
      expect(titles()).toEqual(["Ogre ambush", "Lich tower"]),
    );

    await user.click(within(panel()).getByRole("button", { name: "Archived" }));
    await vi.waitFor(() =>
      expect(titles()).toEqual(["Kobold mines", "Dragon lair"]),
    );
    await user.click(
      within(row("Dragon lair")).getByRole("button", {
        name: "Unarchive Dragon lair",
      }),
    );

    expect(history.setChatArchived).toHaveBeenLastCalledWith("dragon", false);
    await vi.waitFor(() => expect(titles()).toEqual(["Kobold mines"]));
    await user.click(within(panel()).getByRole("button", { name: "Chats" }));
    await vi.waitFor(() =>
      expect(titles()).toEqual(["Ogre ambush", "Dragon lair", "Lich tower"]),
    );
    // The open chat stays open.
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    expect(
      within(panel()).getByText("Reply in Ogre ambush"),
    ).toBeInTheDocument();
  });

  it("archiving the open chat starts a new empty chat", async () => {
    const user = await openHistory();

    await user.click(
      within(row("Ogre ambush")).getByRole("button", {
        name: "Archive Ogre ambush",
      }),
    );
    await vi.waitFor(() =>
      expect(titles()).toEqual(["Dragon lair", "Lich tower"]),
    );
    await user.click(screen.getByRole("button", { name: "Chat history" }));

    expect(
      within(panel()).getByText("Ask about your campaign."),
    ).toBeInTheDocument();
    await user.type(
      within(panel()).getByRole("textbox", { name: "Message" }),
      "Hello{Enter}",
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: null, text: "Hello" }),
    );
  });

  it("renames a chat inline: Enter saves, Escape cancels, empty is refused", async () => {
    const user = await openHistory();
    const rename = () =>
      user.click(
        within(row("Dragon lair")).getByRole("button", {
          name: "Rename Dragon lair",
        }),
      );

    await rename();
    let field = within(panel()).getByRole("textbox", { name: "Chat name" });
    expect(field).toHaveValue("Dragon lair");
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, "Ignored{Escape}");
    expect(
      within(panel()).queryByRole("textbox", { name: "Chat name" }),
    ).not.toBeInTheDocument();
    expect(titles()).toContain("Dragon lair");

    await rename();
    field = within(panel()).getByRole("textbox", { name: "Chat name" });
    await user.clear(field);
    await user.type(field, "   {Enter}");
    expect(field).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");

    await user.clear(field);
    await user.type(field, " The red dragon {Enter}");

    expect(history.renameChat).toHaveBeenCalledTimes(1);
    expect(history.renameChat).toHaveBeenCalledWith("dragon", "The red dragon");
    await vi.waitFor(() =>
      expect(titles()).toEqual(["Ogre ambush", "The red dragon", "Lich tower"]),
    );
  });

  it("deletes a chat only after the user confirms", async () => {
    const user = await openHistory();
    const remove = () =>
      user.click(
        within(row("Lich tower")).getByRole("button", {
          name: "Delete Lich tower",
        }),
      );

    await remove();
    let dialog = screen.getByRole("alertdialog", { name: "Delete chat?" });
    expect(dialog).toHaveTextContent("“Lich tower” will be deleted.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(history.deleteChat).not.toHaveBeenCalled();
    expect(titles()).toContain("Lich tower");

    await remove();
    dialog = screen.getByRole("alertdialog", { name: "Delete chat?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(history.deleteChat).toHaveBeenCalledWith("lich");
    await vi.waitFor(() =>
      expect(titles()).toEqual(["Ogre ambush", "Dragon lair"]),
    );
  });

  it("deleting the open chat starts a new empty chat", async () => {
    const user = await openHistory();
    await user.click(
      within(row("Ogre ambush")).getByRole("button", {
        name: "Delete Ogre ambush",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() =>
      expect(titles()).toEqual(["Dragon lair", "Lich tower"]),
    );
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    expect(
      within(panel()).getByText("Ask about your campaign."),
    ).toBeInTheDocument();
  });

  it("opening a row shows that chat and returns to the thread", async () => {
    const user = await openHistory();

    await user.click(
      within(panel()).getByRole("button", { name: /^Lich tower/ }),
    );

    expect(history.openChat).toHaveBeenCalledWith("lich");
    expect(
      await within(panel()).findByText("Reply in Lich tower"),
    ).toBeInTheDocument();
    expect(
      within(panel()).queryByText("Reply in Ogre ambush"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chat history" }),
    ).toHaveAttribute("aria-pressed", "false");

    await user.type(
      within(panel()).getByRole("textbox", { name: "Message" }),
      "Climb{Enter}",
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "lich", text: "Climb" }),
    );
  });

  it("disables row changes while a reply runs", async () => {
    const user = await openChat();
    await user.type(
      within(panel()).getByRole("textbox", { name: "Message" }),
      "Go{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await within(panel()).findByRole("button", { name: /^Dragon lair/ });

    for (const action of ["Rename", "Archive", "Delete"]) {
      expect(
        within(row("Dragon lair")).getByRole("button", {
          name: `${action} Dragon lair`,
        }),
      ).toBeDisabled();
    }
    turn?.end("ogre");
    await vi.waitFor(() =>
      expect(
        within(row("Dragon lair")).getByRole("button", {
          name: "Archive Dragon lair",
        }),
      ).toBeEnabled(),
    );
  });
});

// A promise the test settles.
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const message = () => within(panel()).getByRole("textbox", { name: "Message" });
const sendButton = () => within(panel()).getByRole("button", { name: "Send" });

describe("Chat history operations in flight", () => {
  it.each(["rename", "archive"] as const)(
    "a pending %s holds sends and opens until it is saved",
    async (operation) => {
      const pending = deferred();
      const user = await openHistory();
      if (operation === "rename") {
        history.renameChat.mockImplementationOnce(async (id, title) => {
          await pending.promise;
          for (const c of saved) if (c.id === id) c.title = title;
        });
        await user.click(
          within(row("Dragon lair")).getByRole("button", {
            name: "Rename Dragon lair",
          }),
        );
        await user.type(
          within(panel()).getByRole("textbox", { name: "Chat name" }),
          " cave{Enter}",
        );
      } else {
        history.setChatArchived.mockImplementationOnce(async () => {
          await pending.promise;
        });
        await user.click(
          within(row("Dragon lair")).getByRole("button", {
            name: "Archive Dragon lair",
          }),
        );
      }
      expect(
        within(row("Lich tower")).getByRole("button", {
          name: "Delete Lich tower",
        }),
      ).toBeDisabled();

      await user.click(
        within(panel()).getByRole("button", { name: /^Dragon lair/ }),
      );
      await user.type(message(), "Hello{Enter}");

      expect(history.openChat).not.toHaveBeenCalled();
      expect(api.sendMessage).not.toHaveBeenCalled();
      expect(sendButton()).toBeDisabled();

      await act(async () => pending.resolve());

      expect(
        await within(panel()).findByText("Reply in Dragon lair"),
      ).toBeInTheDocument();
      expect(history.openChat).toHaveBeenCalledWith("dragon");
      await vi.waitFor(() => expect(sendButton()).toBeEnabled());
      await user.click(sendButton());
      expect(api.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: "dragon", text: "Hello" }),
      );
    },
  );

  it.each(["archive", "delete"] as const)(
    "a late %s of the open chat leaves the chat opened since",
    async (operation) => {
      const pending = deferred();
      const user = await openHistory();
      const mock =
        operation === "archive" ? history.setChatArchived : history.deleteChat;
      mock.mockImplementationOnce(async () => {
        await pending.promise;
      });
      await user.click(
        within(row("Ogre ambush")).getByRole("button", {
          name: `${operation === "archive" ? "Archive" : "Delete"} Ogre ambush`,
        }),
      );
      if (operation === "delete") {
        await user.click(screen.getByRole("button", { name: "Delete" }));
      }
      await user.click(
        within(panel()).getByRole("button", { name: /^Lich tower/ }),
      );

      await act(async () => pending.resolve());

      expect(
        await within(panel()).findByText("Reply in Lich tower"),
      ).toBeInTheDocument();
      expect(
        within(panel()).queryByText("Ask about your campaign."),
      ).not.toBeInTheDocument();
      await vi.waitFor(() => expect(sendButton()).toBeEnabled());
      await user.type(message(), "Climb{Enter}");
      expect(api.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: "lich" }),
      );
    },
  );

  it("opening the running chat reads it after its stopped turn has saved", async () => {
    const user = await openChat();
    await user.type(message(), "Go{Enter}");
    await user.click(screen.getByRole("button", { name: "Chat history" }));

    await user.click(
      await within(panel()).findByRole("button", { name: /^Ogre ambush/ }),
    );

    expect(api.stopTurn).toHaveBeenCalled();
    // Rust saves the stopped turn, then the turn ends.
    saved[0] = {
      ...saved[0],
      messages: [
        ...saved[0].messages,
        { role: "user", text: "Go" },
        { role: "assistant", text: "Part of a reply" },
        { role: "notice", level: "info", text: "Stopped." },
      ],
    };
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(history.openChat).not.toHaveBeenCalled();

    await act(async () => turn?.end("ogre"));

    expect(
      await within(panel()).findByText("Part of a reply"),
    ).toBeInTheDocument();
    expect(within(panel()).getByText("Stopped.")).toBeInTheDocument();
    expect(history.openChat).toHaveBeenCalledTimes(1);
  });

  it("a pending open holds the composer, and a failed open keeps the chat shown", async () => {
    const user = await openHistory();
    const opening = deferred<Chat>();
    history.openChat.mockImplementationOnce(() => opening.promise);

    await user.click(
      within(panel()).getByRole("button", { name: /^Dragon lair/ }),
    );
    await user.type(message(), "Hello{Enter}");

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(sendButton()).toBeDisabled();
    await act(async () => opening.resolve(saved[1]));
    expect(
      await within(panel()).findByText("Reply in Dragon lair"),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(sendButton()).toBeEnabled());

    history.openChat.mockImplementationOnce(async () => {
      throw new Error("Couldn't open the chat: gone.");
    });
    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await user.click(
      await within(panel()).findByRole("button", { name: /^Lich tower/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't open the chat: gone.",
    );
    expect(
      within(panel()).getByText("Reply in Dragon lair"),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(sendButton()).toBeEnabled());
    await user.type(message(), "Again{Enter}");
    expect(api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "dragon", text: "Again" }),
    );
  });
});

describe("The first read of the last chat", () => {
  it.each(["delete", "archive"] as const)(
    "a chat that is %sd while it first loads leaves an empty new chat",
    async (operation) => {
      const reading = deferred<Chat | null>();
      api.latestChat.mockImplementationOnce(() => reading.promise);
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole("button", { name: "Chat" }));
      await screen.findByRole("button", { name: "Model: glm-5.3" });
      await user.click(screen.getByRole("button", { name: "Chat history" }));
      await within(panel()).findByRole("button", { name: /^Ogre ambush/ });
      const ogre = saved[0];

      await user.click(
        within(row("Ogre ambush")).getByRole("button", {
          name: `${operation === "delete" ? "Delete" : "Archive"} Ogre ambush`,
        }),
      );
      if (operation === "delete") {
        await user.click(screen.getByRole("button", { name: "Delete" }));
      }
      await act(async () => reading.resolve(ogre));

      await vi.waitFor(() =>
        expect(titles()).toEqual(["Dragon lair", "Lich tower"]),
      );
      await user.click(screen.getByRole("button", { name: "Chat history" }));
      expect(
        within(panel()).getByText("Ask about your campaign."),
      ).toBeInTheDocument();
      expect(
        within(panel()).queryByText("Reply in Ogre ambush"),
      ).not.toBeInTheDocument();
      await vi.waitFor(() => expect(sendButton()).toBeEnabled());
      await user.type(message(), "Hello{Enter}");
      expect(api.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: null, text: "Hello" }),
      );
    },
  );
});
