import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import styles from "@/components/MarkdownEditor/MarkdownEditor.module.css";
import { EditorMenu } from "@/components/menus/EditorMenu/EditorMenu";
import { ToastProvider } from "@/components/Toast/Toast";
import * as linksApi from "@/lib/linksApi";
import * as notesApi from "@/lib/notesApi";

vi.mock("@/lib/notesApi", () => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
  onNotesChanged: vi.fn(),
  listNotes: vi.fn(),
}));

vi.mock("@/lib/linksApi", () => ({ openWebLink: vi.fn() }));

const api = vi.mocked(notesApi);
const links = vi.mocked(linksApi);

let disk: Record<string, string>;
let notesChanged: () => void;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  disk = { "a.md": "Hello", "Lore/b.md": "Bee" };
  api.readNote.mockImplementation(async (path) => disk[path]);
  api.writeNote.mockResolvedValue();
  api.onNotesChanged.mockImplementation(async (handler) => {
    notesChanged = handler;
    return () => {};
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Lets pending reads and writes settle.
const settle = () => act(async () => {});

async function open(path: string | null) {
  const view = render(
    <ToastProvider>
      <EditorMenu path={path} />
    </ToastProvider>,
  );
  await settle();
  return {
    ...view,
    switchTo: async (next: string | null) => {
      view.rerender(
        <ToastProvider>
          <EditorMenu path={next} />
        </ToastProvider>,
      );
      await settle();
    },
  };
}

const editor = (name: string) => {
  const view = EditorView.findFromDOM(screen.getByRole("textbox", { name }));
  if (!view) throw new Error(`No editor for ${name}`);
  return view;
};

// Types at the end of the note, as a person would.
const type = (name: string, text: string) =>
  act(() => {
    const view = editor(name);
    view.dispatch({
      changes: { from: view.state.doc.length, insert: text },
      selection: { anchor: view.state.doc.length + text.length },
    });
  });

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("EditorMenu", () => {
  it("shows that no note is open", async () => {
    await open(null);
    expect(screen.getByText("No note open")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not open a file that isn't Markdown", async () => {
    await open("map.png");
    expect(
      screen.getByText("This file can't be shown yet."),
    ).toBeInTheDocument();
    expect(api.readNote).not.toHaveBeenCalled();
  });

  it("opens a Markdown file with its text, ignoring the case of .md", async () => {
    disk["Lore/UP.MD"] = "Shout";
    await open("Lore/UP.MD");
    expect(api.readNote).toHaveBeenCalledWith("Lore/UP.MD");
    expect(screen.getByText("UP.MD")).toBeInTheDocument();
    expect(editor("UP.MD").state.doc.toString()).toBe("Shout");
  });

  it("saves 500 ms after the last edit and not before", async () => {
    await open("a.md");
    await type("a.md", " there");
    await advance(300);
    await type("a.md", "!");
    await advance(499);
    expect(api.writeNote).not.toHaveBeenCalled();

    await advance(1);
    expect(api.writeNote).toHaveBeenCalledTimes(1);
    expect(api.writeNote).toHaveBeenCalledWith("a.md", "Hello there!");
  });

  it("saves a pending edit at once when another note opens", async () => {
    const { switchTo } = await open("a.md");
    await type("a.md", "!");
    await switchTo("Lore/b.md");

    expect(api.writeNote).toHaveBeenCalledWith("a.md", "Hello!");
    expect(editor("b.md").state.doc.toString()).toBe("Bee");
    await advance(1000);
    expect(api.writeNote).toHaveBeenCalledTimes(1);
  });

  it("saves a pending edit at once when the editor closes", async () => {
    const { unmount } = await open("a.md");
    await type("a.md", "!");
    unmount();
    expect(api.writeNote).toHaveBeenCalledWith("a.md", "Hello!");
  });

  it("takes in an outside change and keeps the cursor near its place", async () => {
    disk["a.md"] = "Hello world";
    await open("a.md");
    act(() => editor("a.md").dispatch({ selection: { anchor: 6 } }));

    disk["a.md"] = "Oh, Hello world";
    notesChanged();
    await settle();

    const view = editor("a.md");
    expect(view.state.doc.toString()).toBe("Oh, Hello world");
    expect(view.state.selection.main.head).toBe(10);
    expect(api.writeNote).not.toHaveBeenCalled();
  });

  it("keeps unsaved edits when the file changes outside", async () => {
    await open("a.md");
    await type("a.md", "!");
    disk["a.md"] = "Outside";
    notesChanged();
    await settle();

    expect(editor("a.md").state.doc.toString()).toBe("Hello!");
    await advance(500);
    expect(api.writeNote).toHaveBeenCalledWith("a.md", "Hello!");
  });

  it("does not reload while a save is still being written", async () => {
    let finish: () => void = () => {};
    api.writeNote.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await open("a.md");
    await type("a.md", "!");
    await advance(500);
    expect(api.writeNote).toHaveBeenCalledWith("a.md", "Hello!");

    // The disk still holds the old text until the write lands.
    notesChanged();
    await settle();
    expect(editor("a.md").state.doc.toString()).toBe("Hello!");
    await act(async () => finish());
  });

  it("reads again after a save when the file changed during it", async () => {
    let finish: () => void = () => {};
    api.writeNote.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await open("a.md");
    await type("a.md", "!");
    await advance(500);

    disk["a.md"] = "Outside";
    notesChanged();
    await settle();
    expect(editor("a.md").state.doc.toString()).toBe("Hello!");

    await act(async () => finish());
    expect(editor("a.md").state.doc.toString()).toBe("Outside");
  });

  it("writes one save at a time, so the newest text lands last", async () => {
    const pending: (() => void)[] = [];
    api.writeNote.mockImplementation(
      (path, text) =>
        new Promise((resolve) => {
          pending.push(() => {
            disk[path] = text;
            resolve();
          });
        }),
    );
    await open("a.md");
    await type("a.md", "!");
    await advance(500);
    await type("a.md", "?");
    await advance(500);

    // Finishes the newest write first whenever two are running.
    while (pending.length > 0) {
      const done = pending.pop();
      await act(async () => done?.());
    }

    expect(disk["a.md"]).toBe("Hello!?");
    expect(api.writeNote).toHaveBeenLastCalledWith("a.md", "Hello!?");
  });

  it("takes in only the newest of two reloads", async () => {
    await open("a.md");
    const answers: ((text: string) => void)[] = [];
    api.readNote.mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    );
    notesChanged();
    notesChanged();
    await act(async () => answers[1]("Newer"));
    await act(async () => answers[0]("Older"));

    expect(editor("a.md").state.doc.toString()).toBe("Newer");
  });

  it("drops a reload that an edit overtook", async () => {
    await open("a.md");
    let answer: (text: string) => void = () => {};
    api.readNote.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    notesChanged();
    await type("a.md", "!");
    await act(async () => answer("Outside"));

    expect(editor("a.md").state.doc.toString()).toBe("Hello!");
  });

  it("changes nothing when the file still holds the editor's text", async () => {
    await open("a.md");
    await type("a.md", "!");
    await advance(500);
    disk["a.md"] = "Hello!";
    const before = editor("a.md").state;

    notesChanged();
    await settle();

    expect(api.readNote).toHaveBeenCalledTimes(2);
    expect(editor("a.md").state).toBe(before);
  });

  it("switches between live preview and raw source", async () => {
    disk["a.md"] = "Intro\n# Title";
    await open("a.md");
    const toggle = screen.getByRole("button", { name: "Raw source" });
    const content = screen.getByRole("textbox", { name: "a.md" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(content).not.toHaveTextContent("# Title");
    expect(content).toHaveTextContent("Title");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(content).toHaveTextContent("# Title");

    fireEvent.click(toggle);
    expect(content).not.toHaveTextContent("# Title");
  });

  it("shows a failed save and keeps the text, then tries again", async () => {
    api.writeNote.mockRejectedValueOnce({
      code: "io",
      message: "Couldn't save “a.md”: disk full.",
    });
    const { unmount } = await open("a.md");
    await type("a.md", "!");
    await advance(500);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't save “a.md”: disk full.",
    );
    expect(editor("a.md").state.doc.toString()).toBe("Hello!");

    // A failed save leaves the edit unsaved, so a reload can't replace it.
    disk["a.md"] = "Outside";
    notesChanged();
    await settle();
    expect(editor("a.md").state.doc.toString()).toBe("Hello!");

    unmount();
    expect(api.writeNote).toHaveBeenCalledTimes(2);
    expect(api.writeNote).toHaveBeenLastCalledWith("a.md", "Hello!");
  });
});

describe("EditorMenu links", () => {
  const onOpenNote = vi.fn();

  beforeEach(async () => {
    disk["Lore/b.md"] = [
      "[web](https://x.y/a)",
      "[note](../My%20Notes/c.md#top)",
      "[gone](gone.md)",
      "[out](../../c.md)",
      "[script](javascript:alert(1))",
    ].join("\n");
    api.listNotes.mockResolvedValue([
      {
        kind: "folder",
        name: "My Notes",
        path: "My Notes",
        children: [{ kind: "file", name: "c.md", path: "My Notes/c.md" }],
      },
      { kind: "file", name: "c.md", path: "c.md" },
      { kind: "folder", name: "Lore", path: "Lore", children: [] },
    ]);
    links.openWebLink.mockResolvedValue();
    render(
      <ToastProvider>
        <EditorMenu path="Lore/b.md" onOpenNote={onOpenNote} />
      </ToastProvider>,
    );
    await settle();
  });

  // Ctrl+clicks the link that shows `text`.
  const ctrlClick = async (text: string) => {
    const link = [...document.querySelectorAll(`.${styles.link}`)].find(
      (el) => el.textContent === text,
    );
    if (!link) throw new Error(`No link ${text}`);
    fireEvent.mouseDown(link, { button: 0, ctrlKey: true });
    await settle();
  };

  it("opens a web link outside the app", async () => {
    await ctrlClick("web");
    expect(links.openWebLink).toHaveBeenCalledWith("https://x.y/a");
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it("opens the note that a relative link names", async () => {
    await ctrlClick("note");
    expect(onOpenNote).toHaveBeenCalledWith("My Notes/c.md");
    expect(links.openWebLink).not.toHaveBeenCalled();
  });

  it.each([
    ["gone", "gone.md"],
    ["out", "../../c.md"],
  ])("shows that the %s note can't be found", async (text, href) => {
    await ctrlClick(text);
    expect(screen.getByRole("alert")).toHaveTextContent(
      `Couldn't find “${href}”.`,
    );
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it("stays on the note when its edit can't be saved before a link opens", async () => {
    api.writeNote.mockRejectedValue({ code: "io", message: "Disk full." });
    await type("b.md", "!");

    await ctrlClick("note");

    expect(onOpenNote).not.toHaveBeenCalled();
    expect(editor("b.md").state.doc.toString()).toMatch(/!$/);
    expect(
      screen.getByText("Couldn't save “b.md”, so the link wasn't opened."),
    ).toBeInTheDocument();
  });

  it("refuses a link with another scheme", async () => {
    await ctrlClick("script");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Can't open this link.",
    );
    expect(links.openWebLink).not.toHaveBeenCalled();
    expect(onOpenNote).not.toHaveBeenCalled();
  });
});
