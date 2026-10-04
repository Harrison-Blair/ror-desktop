import { expect, it, vi } from "vitest";
import { deferred } from "../test/workspace-fixture";
import { closeGuard } from "./close-guard";

it("prevents close synchronously, then awaits save and listener removal before normal close", async () => {
  let callback!: (event: { preventDefault(): void }) => void;
  const pending = deferred<boolean>();
  const removed = deferred<void>();
  const stop = vi.fn(() => removed.promise);
  const host = {
    onCloseRequested: vi.fn(async (fn) => {
      callback = fn;
      return stop;
    }),
    close: vi.fn(async () => {}),
  };
  const prepare = vi.fn(() => pending.promise);
  const dispose = closeGuard(host, prepare, vi.fn());
  const preventDefault = vi.fn();
  callback({ preventDefault });
  callback({ preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(2);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(host.close).not.toHaveBeenCalled();
  pending.resolve(true);
  await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  expect(host.close).not.toHaveBeenCalled();
  removed.resolve();
  await vi.waitFor(() => expect(host.close).toHaveBeenCalledTimes(1));
  dispose();
});

it("keeps interception after failed saves and restores it if native close fails", async () => {
  let callback!: (event: { preventDefault(): void }) => void;
  let listening = false;
  const host = {
    onCloseRequested: vi.fn(async (fn) => {
      listening = true;
      callback = fn;
      return () => {
        listening = false;
      };
    }),
    close: vi.fn(async () => {
      expect(listening).toBe(false);
      throw new Error("Close failed");
    }),
  };
  const failed = vi.fn();
  const prepare = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const dispose = closeGuard(host, prepare, failed);
  callback({ preventDefault: vi.fn() });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(listening).toBe(true);
  expect(host.close).not.toHaveBeenCalled();
  callback({ preventDefault: vi.fn() });
  await vi.waitFor(() => expect(failed).toHaveBeenCalled());
  expect(host.onCloseRequested).toHaveBeenCalledTimes(2);
  expect(listening).toBe(true);
  const preventDefault = vi.fn();
  callback({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  dispose();
});

it("does not close after disposal while listener removal is pending", async () => {
  let callback!: (event: { preventDefault(): void }) => void;
  const removed = deferred<void>();
  const stop = vi.fn(() => removed.promise);
  const host = {
    onCloseRequested: vi.fn(async (fn) => {
      callback = fn;
      return stop;
    }),
    close: vi.fn(async () => {}),
  };
  const dispose = closeGuard(host, async () => true, vi.fn());
  callback({ preventDefault: vi.fn() });
  await vi.waitFor(() => expect(stop).toHaveBeenCalled());
  dispose();
  removed.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(host.close).not.toHaveBeenCalled();
  expect(host.onCloseRequested).toHaveBeenCalledTimes(1);
});

it("does not re-register after disposal while native close is pending", async () => {
  let callback!: (event: { preventDefault(): void }) => void;
  const closed = deferred<void>();
  const host = {
    onCloseRequested: vi.fn(async (fn) => {
      callback = fn;
      return vi.fn();
    }),
    close: vi.fn(() => closed.promise),
  };
  const failed = vi.fn();
  const dispose = closeGuard(host, async () => true, failed);
  callback({ preventDefault: vi.fn() });
  await vi.waitFor(() => expect(host.close).toHaveBeenCalled());
  dispose();
  closed.reject(new Error("Close failed"));
  await vi.waitFor(() => expect(failed).toHaveBeenCalled());
  expect(host.onCloseRequested).toHaveBeenCalledTimes(1);
});
