import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred, file, fixture, workspace } from "../test/workspace-fixture";
import { WorkspaceController } from "./controller";

async function ready() {
  const api = fixture();
  const controller = new WorkspaceController(api);
  await controller.initialize();
  return { api, controller };
}
afterEach(() => vi.useRealTimers());
describe("workspace transitions", () => {
  it("restores only the root and native picker cancellation preserves selection", async () => {
    const { api, controller: c } = await ready();
    expect(c.state.workspace).toEqual(workspace);
    expect(c.state.selection).toBeNull();
    await c.openFile(file("one.md"));
    await c.pickFolder();
    expect(c.state.selection?.node.path).toBe("one.md");
    expect(api.pickWorkspace).toHaveBeenCalledTimes(1);
    c.dispose();
  });
  it("ignores stale selection reads and root reads", async () => {
    const { api, controller: c } = await ready();
    const old = deferred<string>();
    api.readNote.mockImplementationOnce(() => old.promise);
    const first = c.openFile(file("one.md"));
    await Promise.resolve();
    await c.openFile(file("two.md"));
    old.resolve("stale");
    await first;
    expect(c.state.selection?.session?.content).toBe("content of two.md");
    const pending = deferred<string>();
    api.readNote.mockImplementationOnce(() => pending.promise);
    const read = c.openFile(file("one.md"));
    await Promise.resolve();
    api.pickWorkspace.mockResolvedValueOnce({ ...workspace, generation: 2 });
    await c.pickFolder();
    pending.resolve("old root");
    await read;
    expect(c.state.selection).toBeNull();
    expect(c.state.workspace?.generation).toBe(2);
    c.dispose();
  });
  it("flushes the latest edit before navigation and retains draft on failure", async () => {
    const { api, controller: c } = await ready();
    await c.openFile(file("one.md"));
    const pending = deferred<void>();
    api.writeNote.mockImplementationOnce(() => pending.promise);
    c.edit("first");
    const flush = c.state.selection?.session?.flush();
    c.edit("latest");
    const navigation = c.openFile(file("two.md"));
    pending.resolve();
    await flush;
    await navigation;
    expect(api.writeNote.mock.calls).toEqual([
      [1, "one.md", "first"],
      [1, "one.md", "latest"],
    ]);
    c.edit("keep me");
    api.writeNote.mockRejectedValueOnce(new Error("read only"));
    await c.openFile(file("one.md"));
    expect(c.state.selection?.node.path).toBe("two.md");
    expect(c.state.selection?.session?.content).toBe("keep me");
    expect(c.state.banner).toContain("staying on this note");
    await c.retrySave();
    expect(c.state.selection?.node.path).toBe("two.md");
    expect(c.state.selection?.session?.dirty).toBe(false);
    c.dispose();
  });
  it("dirty refresh freezes timer, drains active writes and discards only after successful reload", async () => {
    vi.useFakeTimers();
    const { api, controller: c } = await ready();
    await c.openFile(file("one.md"));
    const write = deferred<void>();
    api.writeNote.mockImplementationOnce(() => write.promise);
    c.edit("active");
    await vi.advanceTimersByTimeAsync(500);
    c.edit("queued");
    await c.requestRefresh();
    expect(c.state.dialog?.kind).toBe("refresh");
    const discard = c.resolveRefresh("discard");
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.refreshWorkspace).not.toHaveBeenCalled();
    write.resolve();
    await discard;
    expect(c.state.selection?.session?.content).toBe("content of one.md");
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.writeNote).toHaveBeenCalledTimes(1);
    c.edit("recoverable");
    await c.requestRefresh();
    api.readNote.mockRejectedValueOnce(new Error("unreadable"));
    await c.resolveRefresh("discard");
    expect(c.state.selection?.session?.content).toBe("recoverable");
    expect(c.state.selection?.session?.dirty).toBe(true);
    c.dispose();
  });
  it("invalid inline naming blocks blur navigation and commits once on valid retry", async () => {
    const { api, controller: c } = await ready();
    await c.openFile(file("one.md"));
    await c.beginNaming({ kind: "note", parentPath: "" });
    c.editName("bad/name");
    await c.commitNaming();
    await c.openFile(file("two.md"));
    expect(c.state.selection?.node.path).toBe("one.md");
    expect(c.state.naming?.error).toContain("Names can't contain");
    expect(api.createEntry).not.toHaveBeenCalled();
    c.editName("good.md");
    await Promise.all([c.commitNaming(), c.commitNaming()]);
    expect(api.createEntry).toHaveBeenCalledExactlyOnceWith(
      1,
      "",
      "good.md",
      "note",
    );
    c.dispose();
  });
  it("extension rename saves first and reclassifies the selected file", async () => {
    const { api, controller: c } = await ready();
    await c.openFile(file("one.md"));
    c.edit("draft");
    const renamed = file("one.txt", "other");
    api.renameEntry.mockResolvedValueOnce({
      workspace: { ...workspace, nodes: [renamed] },
      path: "one.txt",
    });
    await c.beginNaming({ kind: "rename", node: file("one.md") });
    c.editName("one.txt");
    await c.commitNaming();
    expect(api.writeNote).toHaveBeenCalledWith(1, "one.md", "draft");
    expect(c.state.selection?.node).toEqual(renamed);
    expect(c.state.selection?.session).toBeUndefined();
    c.dispose();
  });
  it("ancestor rename remaps the open note and image CRUD invalidates previews", async () => {
    const { api, controller: c } = await ready();
    const folder = {
      kind: "folder" as const,
      name: "folder",
      path: "folder",
      isSymlink: false,
      children: [file("folder/note.md")],
    };
    await c.openFile(folder.children[0]);
    api.renameEntry.mockResolvedValueOnce({
      workspace: {
        ...workspace,
        nodes: [
          {
            ...folder,
            name: "new",
            path: "new",
            children: [file("new/note.md")],
          },
        ],
      },
      path: "new",
    });
    await c.beginNaming({ kind: "rename", node: folder });
    c.editName("new");
    await c.commitNaming();
    expect(c.state.selection?.node.path).toBe("new/note.md");
    const revision = c.state.imageRevision;
    await c.requestTrash(file("photo.png", "image"));
    await c.confirmTrash();
    expect(c.state.imageRevision).toBeGreaterThan(revision);
    expect(c.state.selection?.node.path).toBe("new/note.md");
    c.dispose();
  });
  it("hidden preferences leave open note selected and serialize independent patches", async () => {
    const { api, controller: c } = await ready();
    await c.openFile(file(".hidden.md"));
    await Promise.all([
      c.patchPreferences({ lineNumbers: true }),
      c.patchPreferences({ showHidden: true }),
      c.patchPreferences({ showHidden: false }),
    ]);
    expect(c.state.preferences.lineNumbers).toBe(true);
    expect(c.state.preferences.showHidden).toBe(false);
    expect(c.state.selection?.node.path).toBe(".hidden.md");
    expect(api.updatePreferences.mock.calls.map(([patch]) => patch)).toEqual([
      { lineNumbers: true },
      { showHidden: true },
      { showHidden: false },
    ]);
    const restarted = new WorkspaceController(api);
    await restarted.initialize();
    expect(restarted.state.preferences.lineNumbers).toBe(true);
    c.dispose();
    restarted.dispose();
  });
  it("close flush failure retains the note and the approved close banner", async () => {
    const { api, controller: c } = await ready();
    await c.openFile(file("one.md"));
    c.edit("draft");
    api.writeNote.mockRejectedValueOnce(new Error("disk full"));
    expect(await c.prepareClose()).toBe(false);
    expect(c.state.banner).toContain("window stays open");
    expect(c.state.selection?.session?.content).toBe("draft");
    expect(await c.prepareClose()).toBe(true);
    c.dispose();
  });
});

describe("workspace recovery and mutation boundaries", () => {
  it("an invalid naming row cannot be hidden by collapsing or filtering the sidebar", async () => {
    const { controller: c, api } = await ready();
    await c.beginNaming({ kind: "note", parentPath: "" });
    c.editName("invalid/name");
    await c.patchPreferences({ sidebarCollapsed: true });
    await c.patchPreferences({ showHidden: true });
    expect(c.state.preferences.sidebarCollapsed).toBe(false);
    expect(c.state.preferences.showHidden).toBe(false);
    expect(api.updatePreferences).not.toHaveBeenCalled();
    expect(c.state.naming?.error).toBeTruthy();
    c.dispose();
  });
  it("rename failure retains selection and saved content; trash failure retains the draft", async () => {
    const { controller: c, api } = await ready();
    await c.openFile(file("one.md"));
    c.edit("retained");
    api.renameEntry.mockRejectedValueOnce(new Error("permission denied"));
    await c.beginNaming({ kind: "rename", node: file("one.md") });
    c.editName("other.md");
    expect(await c.commitNaming()).toBe(false);
    expect(c.state.selection?.node.path).toBe("one.md");
    expect(c.state.selection?.session?.content).toBe("retained");
    expect(c.state.naming?.error).toContain("permission denied");
    c.cancelNaming();
    c.edit("another draft");
    api.trashEntry.mockRejectedValueOnce(new Error("Trash unavailable"));
    await c.requestTrash(file("one.md"));
    await c.confirmTrash();
    expect(c.state.dialog?.kind).toBe("trash-error");
    expect(c.state.selection?.session?.content).toBe("another draft");
    c.dispose();
  });
  it("clean refresh clears missing selection and reloads changed source", async () => {
    const { controller: c, api } = await ready();
    await c.openFile(file("one.md"));
    api.readNote.mockResolvedValueOnce("changed outside");
    await c.requestRefresh();
    expect(c.state.selection?.session?.content).toBe("changed outside");
    api.refreshWorkspace.mockResolvedValueOnce({ ...workspace, nodes: [] });
    await c.requestRefresh();
    expect(c.state.selection).toBeNull();
    expect(c.state.message).toContain("no longer in this folder");
    c.dispose();
  });
  it("cancel resumes dirty autosave, save-and-refresh writes the draft then reads disk", async () => {
    vi.useFakeTimers();
    const { controller: c, api } = await ready();
    await c.openFile(file("one.md"));
    c.edit("cancel keeps draft");
    await c.requestRefresh();
    c.dismissDialog();
    await vi.advanceTimersByTimeAsync(500);
    expect(api.writeNote).toHaveBeenCalledWith(
      1,
      "one.md",
      "cancel keeps draft",
    );
    c.edit("save this version");
    await c.requestRefresh();
    await c.resolveRefresh("save");
    expect(api.writeNote).toHaveBeenLastCalledWith(
      1,
      "one.md",
      "save this version",
    );
    expect(api.refreshWorkspace).toHaveBeenCalledTimes(1);
    expect(c.state.dialog).toBeNull();
    c.dispose();
  });
});

it("an unrelated trash completion cannot replace a note read that finished during it", async () => {
  const { controller: c, api } = await ready();
  const note = deferred<string>();
  const trash = deferred<typeof workspace>();
  api.readNote.mockReturnValueOnce(note.promise);
  api.trashEntry.mockReturnValueOnce(trash.promise);
  const opening = c.openFile(file("one.md"));
  await c.requestTrash(file("photo.png", "image"));
  const deleting = c.confirmTrash();
  note.resolve("loaded while trash pending");
  await opening;
  trash.resolve(workspace);
  await deleting;
  expect(c.state.selection?.session?.content).toBe(
    "loaded while trash pending",
  );
  c.dispose();
});
it("a failed refresh during note loading leaves a retryable error instead of an endless spinner", async () => {
  const { controller: c, api } = await ready();
  const note = deferred<string>();
  api.readNote.mockReturnValueOnce(note.promise);
  const opening = c.openFile(file("one.md"));
  api.refreshWorkspace.mockRejectedValueOnce(new Error("unavailable"));
  await c.requestRefresh();
  note.resolve("stale");
  await opening;
  expect(c.state.selection?.loading).not.toBe(true);
  expect(c.state.selection?.error).toContain("unavailable");
  await c.openFile(file("one.md"));
  expect(c.state.selection?.session?.content).toBe("content of one.md");
  c.dispose();
});
