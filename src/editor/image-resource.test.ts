import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred, fixture } from "../test/workspace-fixture";
import { loadImage } from "./image-resource";

afterEach(() => vi.unstubAllGlobals());
describe("image resource lifetime", () => {
  it("releases a loaded Blob on removal and passes note-relative destinations unchanged", async () => {
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const api = fixture();
    const ready = vi.fn();
    const dispose = loadImage(
      api,
      3,
      "../photo%20.png",
      "notes/a.md",
      ready,
      vi.fn(),
    );
    await Promise.resolve();
    expect(api.readImage).toHaveBeenCalledWith(
      3,
      "../photo%20.png",
      "notes/a.md",
    );
    expect(ready).toHaveBeenCalledWith("blob:test");
    dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:test");
  });
  it("does not publish or leak stale completions", async () => {
    const create = vi.fn(() => "blob:stale");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const api = fixture();
    const pending = deferred<ArrayBuffer>();
    api.readImage.mockReturnValue(pending.promise);
    const ready = vi.fn();
    const dispose = loadImage(api, 1, "a.png", undefined, ready, vi.fn());
    expect(api.readImage).toHaveBeenCalledWith(1, "a.png", undefined);
    dispose();
    pending.resolve(new ArrayBuffer(8));
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    expect(create.mock.calls.length - revoke.mock.calls.length).toBe(0);
  });
});
