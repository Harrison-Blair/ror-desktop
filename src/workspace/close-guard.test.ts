import { expect, it, vi } from "vitest";
import { deferred } from "../test/workspace-fixture";
import { closeGuard } from "./close-guard";

it("prevents native close synchronously and permits a single guarded reentry after the latest save", async () => {
  let callback!: (event: { preventDefault(): void }) => void;
  const pending = deferred<boolean>();
  const preventDefault = vi.fn();
  const reentry = vi.fn();
  const host = {
    onCloseRequested: vi.fn(async (fn) => {
      callback = fn;
      return vi.fn();
    }),
    close: vi.fn(async () => {
      callback({ preventDefault: reentry });
    }),
  };
  const prepare = vi.fn(() => pending.promise);
  const dispose = closeGuard(host, prepare, vi.fn());
  callback({ preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(host.close).not.toHaveBeenCalled();
  pending.resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(host.close).toHaveBeenCalledTimes(1);
  expect(reentry).not.toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledTimes(1);
  dispose();
});
