import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { ToastProvider } from "@/components/Toast/Toast";
import type { Character } from "@/lib/peopleApi";
import { api, character, resetPeople, store } from "@/test/fakePeople";
import { WorldOverview } from "./WorldOverview";

vi.mock("@/lib/peopleApi", async () =>
  (await import("@/test/fakePeople")).mockModule(),
);

beforeEach(() => {
  vi.clearAllMocks();
  resetPeople();
});

const DEATH_REFUSAL = "Game date is before the death date of Jun Nakamura.";

// The Overview with the given characters. `reload` gives it new characters,
// as a reload of the people data does after a change by the chat agent.
// `undefined` stands for characters that failed to load.
function renderOverview(characters: Character[] | undefined) {
  const data = (characters: Character[] | undefined): PeopleData => ({
    people: characters && { characters, meId: null },
    world: store.world,
    photoVersion: 0,
    reload: async () => {},
    setWorld: () => {},
    photoChanged: () => {},
  });
  const view = (characters: Character[] | undefined) => (
    <ToastProvider>
      <WorldOverview data={data(characters)} onDirty={() => {}} />
    </ToastProvider>
  );
  const { rerender } = render(view(characters));
  return {
    reload: (next: Character[] | undefined) => rerender(view(next)),
  };
}

// Types a game date before Jun's death and saves; the save refuses it.
async function refuseDate() {
  const user = userEvent.setup();
  const date = screen.getByLabelText("Game date");
  api.updateWorld.mockRejectedValueOnce(DEATH_REFUSAL);
  await user.clear(date);
  await user.type(date, "1 June 1954");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(date).toHaveAccessibleDescription(DEATH_REFUSAL));
  return { user, date };
}

const dead = character("Jun Nakamura", { deathDate: "1961-08-03" });

describe("A game date refused by the save", () => {
  it("is saved once the conflicting character changes", async () => {
    const { reload } = renderOverview([dead]);
    const { user, date } = await refuseDate();

    // The chat agent removes the death date.
    reload([{ ...dead, deathDate: null }]);
    expect(date).not.toHaveAccessibleDescription();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.world.gameDate).toBe("1954-06-01"));
    expect(api.updateWorld).toHaveBeenCalledTimes(2);
    expect(date).not.toHaveAccessibleDescription();
  });

  it("can be sent again while its message shows, and Rust decides", async () => {
    renderOverview([dead]);
    const { user, date } = await refuseDate();

    // The refusal was made on old data that the form can't see.
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.world.gameDate).toBe("1954-06-01"));
    expect(api.updateWorld).toHaveBeenCalledTimes(2);
    expect(date).not.toHaveAccessibleDescription();
  });

  it("stays while the characters are unchanged", async () => {
    const characters = [dead];
    const { reload } = renderOverview(characters);
    const { date } = await refuseDate();

    reload(characters);
    expect(date).toHaveAccessibleDescription(DEATH_REFUSAL);
  });

  it("stays while the characters are still missing", async () => {
    const { reload } = renderOverview(undefined);
    const { date } = await refuseDate();

    reload(undefined);
    expect(date).toHaveAccessibleDescription(DEATH_REFUSAL);
  });
});
