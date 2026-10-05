import { afterEach, expect, it, vi } from "vitest";
import {
  file,
  fixture,
  preferences,
  workspace,
} from "../test/workspace-fixture";
import { WorkspaceController } from "./controller";

async function ready(animation = false) {
  const api = fixture();
  const random = vi.fn((values: Uint32Array) => {
    values[0] = 3;
  });
  const c = new WorkspaceController(api, {
    random,
    reducedMotion: () => !animation,
  });
  await c.initialize();
  await c.switchFunction("dice");
  return { c, api, random };
}
afterEach(() => vi.useRealTimers());
it("preserves typed input for quick rolls and rerolls the latest actual spec", async () => {
  const { c } = await ready();
  c.editDice("2d6+3");
  c.submitDice("1d4");
  expect(c.state.dice.input).toBe("2d6+3");
  expect(c.state.dice.latest?.total).toBe(4);
  c.editDice("invalid");
  c.rerollDice();
  expect(c.state.dice.history.map((roll) => roll.spec.expression)).toEqual([
    "1d4",
    "1d4",
  ]);
  c.dispose();
});
it("validates before RNG and preserves complete results after partial RNG failure", async () => {
  const { c, random } = await ready();
  c.submitDice("d6");
  const latest = c.state.dice.latest;
  const history = c.state.dice.history;
  random.mockClear();
  for (const input of [
    "d6+bad",
    "",
    " ",
    "d6+-2",
    "__proto__",
    "d6".padEnd(201, " "),
  ])
    c.submitDice(input);
  expect(random).not.toHaveBeenCalled();
  expect(c.state.dice.latest).toBe(latest);
  random
    .mockImplementationOnce((values) => {
      values[0] = 2;
    })
    .mockImplementationOnce(() => {
      throw new Error("secret");
    });
  c.submitDice("2d6");
  expect(c.state.dice.latest).toBe(latest);
  expect(c.state.dice.history).toBe(history);
  expect(c.state.dice.error).toBe(
    "Couldn't generate a secure roll. Please try again.",
  );
  c.dispose();
});
it("caps history at 50 and clearing keeps the latest result and reroll", async () => {
  const { c } = await ready();
  for (let index = 0; index < 55; index++) c.submitDice(`d6+${index}`);
  expect(c.state.dice.history).toHaveLength(50);
  expect(c.state.dice.history[0].spec.expression).toBe("d6+54");
  const latest = c.state.dice.latest;
  c.clearDiceHistory();
  expect(c.state.dice.history).toEqual([]);
  expect(c.state.dice.latest).toBe(latest);
  c.rerollDice();
  expect(c.state.dice.history[0].spec.expression).toBe("d6+54");
  c.dispose();
});
it("owns animation timers by captured context across same-tick clicks, navigation and disposal", async () => {
  vi.useFakeTimers();
  const { c, api, random } = await ready(true);
  c.submitDice("d6");
  for (let index = 0; index < 10; index++) {
    c.submitDice("d20");
    c.rerollDice();
    c.clearDiceHistory();
  }
  expect(c.state.dice.history).toHaveLength(1);
  expect(random).toHaveBeenCalledTimes(1);
  api.pickWorkspace.mockResolvedValueOnce({
    ...workspace,
    name: "B",
    displayPath: "/B",
    generation: 2,
  });
  await c.pickFolder();
  expect(c.state.activeFunction).toBe("dice");
  expect(c.state.dice.latest).toBeNull();
  c.submitDice("d4");
  await vi.advanceTimersByTimeAsync(600);
  expect(c.state.dice.rolling).toBe(false);
  api.pickWorkspace.mockResolvedValueOnce({ ...workspace, generation: 3 });
  await c.pickFolder();
  expect(c.state.dice.latest?.spec.expression).toBe("d6");
  expect(c.state.dice.rolling).toBe(false);
  c.submitDice("d8");
  c.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("separates temporary and opaque folder paths and restores A/B/A across generations and refresh", async () => {
  const { c, api } = await ready();
  c.editDice("A input");
  c.submitDice("d6");
  api.pickWorkspace.mockResolvedValueOnce({
    ...workspace,
    displayPath: "__proto__",
    generation: 2,
  });
  await c.pickFolder();
  c.submitDice("d8");
  c.editDice("B input");
  api.pickWorkspace.mockResolvedValueOnce({ ...workspace, generation: 3 });
  await c.pickFolder();
  expect(c.state.dice.input).toBe("A input");
  expect(c.state.dice.latest?.spec.expression).toBe("d6");
  await c.requestRefresh();
  expect(c.state.dice.input).toBe("A input");
  expect(c.state.dice.history).toHaveLength(1);
  const restarted = new WorkspaceController(api);
  await restarted.initialize();
  expect(restarted.state.dice.history).toEqual([]);
  expect(restarted.state.activeFunction).toBe("player");
  restarted.dispose();
  c.dispose();
  const emptyApi = fixture();
  emptyApi.initializeWorkspace.mockResolvedValue({
    preferences,
    workspace: null,
    restoreError: null,
  });
  const temp = new WorkspaceController(emptyApi, { reducedMotion: () => true });
  await temp.initialize();
  await temp.switchFunction("dice");
  temp.submitDice("d1");
  emptyApi.pickWorkspace.mockResolvedValueOnce({
    ...workspace,
    displayPath: "Temporary session",
  });
  await temp.pickFolder();
  expect(temp.state.dice.latest).toBeNull();
  temp.dispose();
});
it("picker cancellation/error retains Dice and ordinary folder opening starts Player", async () => {
  const { c, api } = await ready();
  c.submitDice("d6");
  const context = c.state.dice;
  await c.pickFolder();
  expect(c.state.dice).toBe(context);
  api.pickWorkspace.mockRejectedValueOnce(new Error("picker unavailable"));
  await c.pickFolder();
  expect(c.state.dice).toBe(context);
  expect(c.state.activeFunction).toBe("dice");
  await c.switchFunction("notes");
  api.pickWorkspace.mockResolvedValueOnce({ ...workspace, generation: 2 });
  await c.pickFolder();
  expect(c.state.activeFunction).toBe("player");
  c.dispose();
});
it("failed note and shared player description saves and invalid naming block Dice", async () => {
  const { c, api } = await ready();
  await c.openFile(file("one.md"));
  c.edit("keep draft");
  api.writeNote.mockRejectedValueOnce(new Error("denied"));
  await c.switchFunction("dice");
  expect(c.state.activeFunction).toBe("notes");
  expect(c.state.selection?.session?.content).toBe("keep draft");
  await c.retrySave();
  await c.beginNaming({ kind: "note", parentPath: "" });
  c.editName("bad/name");
  await c.switchFunction("dice");
  expect(c.state.activeFunction).toBe("notes");
  c.cancelNaming();
  await c.openFile(file("player.md"));
  expect(c.state.selection?.session).toBe(c.state.player.description);
  c.edit("shared draft");
  api.writePlayerDescription.mockRejectedValueOnce(new Error("denied"));
  await c.switchFunction("dice");
  expect(c.state.activeFunction).toBe("notes");
  expect(c.state.player.description?.content).toBe("shared draft");
  await c.switchFunction("dice");
  expect(c.state.activeFunction).toBe("dice");
  expect(await c.prepareClose()).toBe(true);
  c.dispose();
});
