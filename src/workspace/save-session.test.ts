import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveSession } from "./save-session";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("SaveSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("debounces 500ms and saves only the latest draft", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const session = new SaveSession("disk", write, vi.fn());
    session.edit("first");
    await vi.advanceTimersByTimeAsync(499);
    expect(write).not.toHaveBeenCalled();
    session.edit("latest");
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledExactlyOnceWith("latest");
    expect(session.status).toBe("saved");
    expect(session.dirty).toBe(false);
  });
  it("flush captures edits made during an earlier write without overlapping writes", async () => {
    const pending = deferred();
    const write = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(undefined);
    const session = new SaveSession("disk", write, vi.fn());
    session.edit("first");
    const flush = session.flush();
    session.edit("latest");
    expect(session.status).toBe("saving");
    expect(write).toHaveBeenCalledTimes(1);
    pending.resolve();
    await flush;
    expect(write.mock.calls.map(([value]) => value)).toEqual([
      "first",
      "latest",
    ]);
    expect(session.status).toBe("saved");
  });
  it("retains a failed draft and retries it explicitly", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("read only"))
      .mockResolvedValue(undefined);
    const session = new SaveSession("disk", write, vi.fn());
    session.edit("precious draft");
    await expect(session.flush()).rejects.toThrow("read only");
    expect(session.content).toBe("precious draft");
    expect(session.status).toBe("failed");
    expect(session.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(1);
    await session.flush();
    expect(session.status).toBe("saved");
  });
  it("freezes immediately, drains the active write, and fences queued drafts for discard", async () => {
    const pending = deferred();
    const write = vi.fn().mockReturnValue(pending.promise);
    const session = new SaveSession("disk", write, vi.fn());
    session.edit("already started");
    await vi.advanceTimersByTimeAsync(500);
    session.edit("queued draft");
    let drained = false;
    const freeze = session.freeze().then(() => {
      drained = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(drained).toBe(false);
    pending.resolve();
    await freeze;
    expect(write).toHaveBeenCalledExactlyOnceWith("already started");
    expect(session.dirty).toBe(true);
    session.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("cancel resumes autosave after a frozen refresh", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const session = new SaveSession("disk", write, vi.fn());
    session.edit("retained");
    await session.freeze();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).not.toHaveBeenCalled();
    session.resume();
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledExactlyOnceWith("retained");
  });
});
