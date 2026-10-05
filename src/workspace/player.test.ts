import { describe, expect, it, vi } from "vitest";
import { deferred, file, fixture, workspace } from "../test/workspace-fixture";
import { WorkspaceController } from "./controller";

const profile = {
  version: 1 as const,
  name: "Hero",
  photoPath: null,
  stats: [{ label: "Strength", value: "12" }],
};
describe("player workspace", () => {
  it("inspects without writing and creates each edited file only once", async () => {
    const api = fixture();
    const c = new WorkspaceController(api);
    await c.initialize();
    expect(c.state.activeFunction).toBe("player");
    expect(api.writePlayer).not.toHaveBeenCalled();
    expect(api.writePlayerDescription).not.toHaveBeenCalled();
    c.editPlayer(profile);
    c.editDescription("first");
    await c.prepareClose();
    expect(api.writePlayer).toHaveBeenLastCalledWith(1, profile, true);
    expect(api.writePlayerDescription).toHaveBeenLastCalledWith(
      1,
      "first",
      true,
    );
    c.editPlayer({ ...profile, name: "Other" });
    c.editDescription("second");
    await c.prepareClose();
    expect(api.writePlayer).toHaveBeenLastCalledWith(
      1,
      { ...profile, name: "Other" },
      false,
    );
    expect(api.writePlayerDescription).toHaveBeenLastCalledWith(
      1,
      "second",
      false,
    );
    c.dispose();
  });
  it("retains all drafts and blocks navigation on metadata failure, then retries in order", async () => {
    const api = fixture();
    const c = new WorkspaceController(api);
    await c.initialize();
    await c.openFile(file("one.md"));
    c.editPlayer(profile);
    c.editDescription("description");
    c.edit("note");
    api.writePlayer.mockRejectedValueOnce(new Error("denied"));
    await c.switchFunction("player");
    expect(c.state.activeFunction).toBe("notes");
    expect(c.state.selection?.session?.content).toBe("note");
    expect(c.state.player.description?.content).toBe("description");
    expect(api.writePlayerDescription).not.toHaveBeenCalled();
    await c.retrySave();
    expect(api.writePlayerDescription).toHaveBeenCalledWith(
      1,
      "description",
      true,
    );
    expect(api.writeNote).toHaveBeenCalledWith(1, "one.md", "note");
    expect(api.writePlayer.mock.invocationCallOrder[1]).toBeLessThan(
      api.writePlayerDescription.mock.invocationCallOrder[0],
    );
    expect(api.writePlayerDescription.mock.invocationCallOrder[0]).toBeLessThan(
      api.writeNote.mock.invocationCallOrder[0],
    );
    c.dispose();
  });
  it("uses one description session across Player and Notes", async () => {
    const api = fixture();
    const c = new WorkspaceController(api);
    await c.initialize();
    c.editDescription("shared");
    await c.openFile(file("player.md"));
    expect(c.state.selection?.session).toBe(c.state.player.description);
    c.edit("from notes");
    await c.switchFunction("player");
    expect(c.state.player.description?.content).toBe("from notes");
    expect(api.writeNote).not.toHaveBeenCalled();
    c.dispose();
  });
  it("allows description recovery despite malformed metadata without writing metadata", async () => {
    const api = fixture();
    api.readPlayer.mockRejectedValue(new Error("Malformed JSON"));
    api.readNote.mockResolvedValue("recover");
    api.writePlayerDescription.mockResolvedValue();
    const c = new WorkspaceController(api);
    await c.initialize();
    await c.openFile(file("player.md"));
    c.edit("repaired");
    await c.prepareClose();
    expect(c.state.player.metadata).toBeUndefined();
    expect(c.state.selection?.session).toBe(c.state.player.description);
    expect(api.writePlayerDescription).toHaveBeenCalledWith(
      1,
      "repaired",
      false,
    );
    expect(api.writePlayer).not.toHaveBeenCalled();
    c.dispose();
  });
  it("keeps the Notes description owner when the initial profile reply arrives late", async () => {
    const api = fixture();
    const held = deferred<Awaited<ReturnType<typeof api.readPlayer>>>();
    api.readPlayer.mockReturnValueOnce(held.promise);
    api.writePlayerDescription.mockResolvedValue();
    const c = new WorkspaceController(api);
    const loading = c.initialize();
    await Promise.resolve();
    await c.openFile(file("player.md"));
    const owner = c.state.selection?.session;
    c.edit("latest Notes draft");
    held.resolve({
      profile,
      description: "stale disk",
      metadataExists: true,
      descriptionExists: true,
    });
    await loading;
    expect(c.state.player.description).toBe(owner);
    expect(c.state.player.description?.content).toBe("latest Notes draft");
    await c.switchFunction("player");
    expect(api.writePlayerDescription).toHaveBeenCalledExactlyOnceWith(
      1,
      "latest Notes draft",
      false,
    );
    expect(api.writeNote).not.toHaveBeenCalled();
    c.dispose();
  });
  it("retains every frozen draft and the dialog after a failed profile refresh", async () => {
    vi.useFakeTimers();
    try {
      const api = fixture();
      const c = new WorkspaceController(api);
      await c.initialize();
      await c.openFile(file("one.md"));
      c.editPlayer(profile);
      c.editDescription("description draft");
      c.edit("note draft");
      const before = { player: c.state.player, selection: c.state.selection };
      await c.requestRefresh();
      api.readPlayer.mockRejectedValueOnce(new Error("Permission denied"));
      await c.resolveRefresh("discard");
      expect(c.state.player).toBe(before.player);
      expect(c.state.selection).toBe(before.selection);
      expect(c.state.dialog?.kind).toBe("refresh");
      expect(c.state.busy).toBe(false);
      expect(c.state.message).toContain("Permission denied");
      await vi.advanceTimersByTimeAsync(600);
      expect(api.writePlayer).not.toHaveBeenCalled();
      c.dismissDialog();
      await vi.advanceTimersByTimeAsync(600);
      expect(api.writePlayer).toHaveBeenCalledWith(1, profile, true);
      expect(api.writePlayerDescription).toHaveBeenCalledWith(
        1,
        "description draft",
        true,
      );
      expect(api.writeNote).toHaveBeenCalledWith(1, "one.md", "note draft");
      c.editDescription("retry draft");
      await c.requestRefresh();
      await c.resolveRefresh("discard");
      expect(c.state.dialog).toBeNull();
      expect(c.state.player.description?.content).toBe("description draft");
      c.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
  it("protects root aliases but allows nested matching names", async () => {
    const api = fixture();
    const c = new WorkspaceController(api);
    await c.initialize();
    await c.beginNaming({ kind: "rename", node: file("PLAYER.MD") });
    expect(c.state.naming).toBeNull();
    await c.requestTrash(file("Player.Json", "other"));
    expect(c.state.dialog).toBeNull();
    await c.beginNaming({ kind: "note", parentPath: "" });
    c.editName("PLAYER.MD");
    expect(await c.commitNaming()).toBe(false);
    expect(api.createEntry).not.toHaveBeenCalled();
    c.cancelNaming();
    await c.beginNaming({ kind: "note", parentPath: "nested" });
    c.editName("player.md");
    expect(await c.commitNaming()).toBe(true);
    c.dispose();
  });
  it("refresh freeze cancel resumes all drafts and discard reloads them", async () => {
    vi.useFakeTimers();
    const api = fixture();
    const c = new WorkspaceController(api);
    await c.initialize();
    c.editPlayer(profile);
    c.editDescription("draft");
    await c.requestRefresh();
    await vi.advanceTimersByTimeAsync(600);
    expect(api.writePlayer).not.toHaveBeenCalled();
    c.dismissDialog();
    await vi.advanceTimersByTimeAsync(600);
    expect(api.writePlayer).toHaveBeenCalled();
    c.editDescription("discard");
    await c.requestRefresh();
    await c.resolveRefresh("discard");
    expect(c.state.player.description?.content).toBe("draft");
    c.dispose();
    vi.useRealTimers();
  });
  it("shares the Player owner when Notes finishes reading after the profile", async () => {
    const api = fixture();
    const player = deferred<Awaited<ReturnType<typeof api.readPlayer>>>();
    const note = deferred<string>();
    api.readPlayer.mockReturnValueOnce(player.promise);
    api.readNote.mockReturnValueOnce(note.promise);
    const c = new WorkspaceController(api);
    const loading = c.initialize();
    await Promise.resolve();
    const opening = c.openFile(file("player.md"));
    await Promise.resolve();
    player.resolve({
      profile,
      description: "profile description",
      metadataExists: true,
      descriptionExists: true,
    });
    await loading;
    const owner = c.state.player.description;
    note.resolve("older note snapshot");
    await opening;
    expect(c.state.selection?.session).toBe(owner);
    c.dispose();
  });
  it("finishes an initial Player load despite unrelated note selection", async () => {
    const api = fixture();
    const held = deferred<Awaited<ReturnType<typeof api.readPlayer>>>();
    api.readPlayer.mockReturnValueOnce(held.promise);
    const c = new WorkspaceController(api);
    const loading = c.initialize();
    await Promise.resolve();
    await c.openFile(file("one.md"));
    held.resolve({
      profile,
      description: "loaded",
      metadataExists: true,
      descriptionExists: true,
    });
    await loading;
    expect(c.state.player.loading).toBeUndefined();
    expect(c.state.player.description?.content).toBe("loaded");
    c.dispose();
  });
  it("ignores an initial same-folder response superseded by Refresh", async () => {
    const api = fixture();
    const held = deferred<Awaited<ReturnType<typeof api.readPlayer>>>();
    api.readPlayer.mockReturnValueOnce(held.promise);
    const c = new WorkspaceController(api);
    const loading = c.initialize();
    await Promise.resolve();
    await c.requestRefresh();
    const current = c.state.player;
    held.resolve({
      profile,
      description: "superseded",
      metadataExists: true,
      descriptionExists: true,
    });
    await loading;
    expect(c.state.player).toBe(current);
    c.dispose();
  });
  it("ignores stale player loads after selecting another folder", async () => {
    const api = fixture();
    const held = deferred<Awaited<ReturnType<typeof api.readPlayer>>>();
    api.readPlayer.mockReturnValueOnce(held.promise);
    const c = new WorkspaceController(api);
    const loading = c.initialize();
    await Promise.resolve();
    api.pickWorkspace.mockResolvedValue({
      ...workspace,
      generation: 2,
      name: "other",
    });
    await c.pickFolder();
    held.resolve({
      profile,
      description: "old",
      metadataExists: true,
      descriptionExists: true,
    });
    await loading;
    expect(c.state.workspace?.generation).toBe(2);
    expect(c.state.player.description?.content).toBe("");
    c.dispose();
  });
});
