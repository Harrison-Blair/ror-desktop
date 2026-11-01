import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { updateWorld, type World } from "./peopleApi";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("sends the complete World in one command, preserving blank labels for the backend", async () => {
  const world: World = {
    gameDate: "1962-02-11",
    statNames: Array.from({ length: 7 }, () => ({ left: "", right: "Order" })),
  };
  const saved: World = {
    ...world,
    statNames: world.statNames.map((pair) => ({
      ...pair,
      left: "Saved label",
    })),
  };
  vi.mocked(invoke).mockResolvedValueOnce(saved);
  expect(await updateWorld(world)).toEqual(saved);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("world_update", { world });
});
