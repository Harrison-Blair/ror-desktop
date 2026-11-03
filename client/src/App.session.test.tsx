import { EditorView } from "@codemirror/view";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import sessionStyles from "@/components/menus/SessionMenu/Session.module.css";
import pillStyles from "@/components/TimerPill/TimerPill.module.css";
import type { Action, Snapshot } from "@/lib/sessionApi";
import { api, character, resetPeople, store } from "@/test/fakePeople";
import {
  clock,
  MIN,
  night,
  resetSession,
  round,
  session,
  sessionApi,
  turn,
} from "@/test/fakeSession";

vi.mock("@/lib/notesApi", () => ({
  listNotes: async () => [],
  onNotesChanged: async () => () => {},
  getNotesFolder: async () => ({ path: "/notes", missing: null }),
  readNote: async () => "",
  writeNote: async () => {},
}));

vi.mock("@/lib/peopleApi", async () =>
  (await import("@/test/fakePeople")).mockModule(),
);

vi.mock("@/lib/sessionApi", async () =>
  (await import("@/test/fakeSession")).mockModule(),
);

const main = () => within(screen.getByRole("main"));
const rail = () =>
  within(screen.getByRole("region", { name: "Session rail panel" }));
const nowCard = () => within(main().getByRole("region", { name: "Now" }));
const roundBox = () => within(main().getByRole("region", { name: "Round" }));
const dialog = () => within(screen.getByRole("alertdialog"));
const findAlert = () =>
  within(screen.getByRole("region", { name: "Notifications" })).findByRole(
    "alert",
  );
const acts = () =>
  sessionApi.sessionAct.mock.calls.map(([action]) => action as Action);

// Round 4: Ana ended, Ben now, Cleo waiting, as in the mockups.
const ana = () =>
  turn("Ana", "marie-dubois", {
    state: "ended",
    usedMs: 14 * MIN + 20_000,
    clock: clock({ state: "paused", leftMs: 40_000 }),
  });
const ben = (extra: Parameters<typeof turn>[2] = {}) =>
  turn("Ben", "karl-weber", extra);
const cleo = () => turn("Cleo", "rosa-alvarez");
const roundFour = (benExtra: Parameters<typeof turn>[2] = {}) =>
  round(4, [ana(), ben(benExtra), cleo()]);

const withRounds = (...rounds: Snapshot["rounds"]) => {
  session.snapshot = { ...session.snapshot, rounds };
};

// The editor measures text, which jsdom can't.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

// Types at the end of the open note, as a person would.
const typeInNote = async (text: string) => {
  const box = await main().findByRole("textbox");
  act(() => {
    const view = EditorView.findFromDOM(box);
    if (!view) throw new Error("No editor");
    view.dispatch({
      changes: { from: view.state.doc.length, insert: text },
      selection: { anchor: view.state.doc.length + text.length },
    });
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  resetPeople();
  resetSession();
  store.characters = [
    character("Marie Dubois"),
    character("Karl Weber"),
    character("Rosa Alvarez"),
  ];
});

async function openSession() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Session" }));
  await main().findByRole("region", { name: "Now" });
  // The characters' names load with People.
  await waitFor(() => expect(api.listPeople).toHaveBeenCalled());
  return user;
}

describe("Session rail", () => {
  it("lists Overview, Rounds and Sessions and starts on Overview", async () => {
    await openSession();
    expect(
      rail()
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Overview", "Rounds", "Sessions"]);
    expect(
      rail().getByRole("button", { name: "Overview", pressed: true }),
    ).toBeVisible();
    expect(
      main().getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
  });
});

describe("The now card", () => {
  it("names the turn as Person · Character with the next ones", async () => {
    withRounds(roundFour());
    await openSession();
    await waitFor(() =>
      expect(nowCard().getByRole("heading", { level: 2 })).toHaveTextContent(
        "Ben · Karl Weber",
      ),
    );
    expect(nowCard().getByText("NOW · TURN 2 OF 3")).toBeVisible();
    expect(nowCard().getByText(/^Next:/)).toHaveTextContent(
      "Next: Cleo · Rosa Alvarez, then GM · Interterm",
    );
    expect(nowCard().getByRole("timer")).toHaveTextContent("15:00");
    expect(nowCard().getByText("Not started")).toBeVisible();
    expect(nowCard().getByRole("button", { name: "Start" })).toHaveClass(
      sessionStyles.primary,
    );
  });

  it("shows the name only for a player with no character", async () => {
    withRounds(round(1, [turn("Dee", null)]));
    await openSession();
    expect(nowCard().getByRole("heading", { level: 2 })).toHaveTextContent(
      /^Dee$/,
    );
  });

  it("starts, pauses and resets the turn's timer", async () => {
    withRounds(roundFour());
    const user = await openSession();
    await user.click(nowCard().getByRole("button", { name: "Start" }));
    expect(acts()).toEqual([{ type: "start", turnId: "turn-ben" }]);
  });

  it("asks before ending a turn early", async () => {
    withRounds(
      roundFour({
        clock: clock({ state: "paused", leftMs: 8 * MIN + 42_000 }),
      }),
    );
    const user = await openSession();
    await user.click(nowCard().getByRole("button", { name: "End turn" }));
    expect(
      dialog().getByRole("heading", { name: "End Ben’s turn early?" }),
    ).toBeVisible();
    expect(
      dialog().getByText(
        "8:42 is left on the timer. The turn note stays editable.",
      ),
    ).toBeVisible();
    await user.click(dialog().getByRole("button", { name: "Cancel" }));
    expect(acts()).toEqual([]);
    await user.click(nowCard().getByRole("button", { name: "End turn" }));
    await user.click(dialog().getByRole("button", { name: "End turn" }));
    expect(acts()).toEqual([{ type: "endTurn", turnId: "turn-ben" }]);
  });

  it("counts on past 0:00 and ends the turn without asking, with End turn in red", async () => {
    withRounds(
      roundFour({
        clock: clock({ state: "running", runningSince: Date.now() - 20 * MIN }),
      }),
    );
    const user = await openSession();
    expect(nowCard().getByText("Time is up")).toBeVisible();
    expect(nowCard().getByRole("timer")).toHaveTextContent(/^\+5:0\d$/);
    expect(main().getByRole("region", { name: "Now" })).toHaveClass(
      sessionStyles.zero,
    );
    // Time used passes the usual length and shows in amber.
    expect(roundBox().getByText(/^used 20:0\d of 15:00$/)).toHaveClass(
      sessionStyles.over,
    );
    // Pause works in overtime.
    expect(nowCard().getByRole("button", { name: "Pause" })).toBeVisible();
    const end = nowCard().getByRole("button", { name: "End turn" });
    expect(end).toHaveClass(sessionStyles.alert);
    await user.click(end);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(acts()).toEqual([{ type: "endTurn", turnId: "turn-ben" }]);
  });

  it("shows paused overtime in red and takes a new positive time", async () => {
    withRounds(
      roundFour({
        usedMs: 15 * MIN + 42_000,
        clock: clock({ state: "paused", leftMs: -42_000 }),
      }),
    );
    const user = await openSession();
    const left = nowCard().getByLabelText("Time left");
    expect(left).toHaveValue("+0:42");
    expect(main().getByRole("region", { name: "Now" })).toHaveClass(
      sessionStyles.zero,
    );
    expect(roundBox().getByText("used 15:42 of 15:00")).toHaveClass(
      sessionStyles.over,
    );
    // No question once past 0:00, also while paused.
    await user.click(nowCard().getByRole("button", { name: "End turn" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.clear(left);
    await user.type(left, "2:00{Enter}");
    await user.click(nowCard().getByRole("button", { name: "Resume" }));
    expect(acts()).toEqual([
      { type: "endTurn", turnId: "turn-ben" },
      { type: "setLeft", turnId: "turn-ben", seconds: 120 },
      { type: "resume", turnId: "turn-ben" },
    ]);
  });

  it("sets the time left of a paused turn with Enter", async () => {
    withRounds(roundFour({ clock: clock({ state: "paused", leftMs: MIN }) }));
    const user = await openSession();
    const left = nowCard().getByLabelText("Time left");
    expect(left).toHaveValue("01:00");
    await user.clear(left);
    await user.type(left, "10:00{Enter}");
    expect(acts()).toEqual([
      { type: "setLeft", turnId: "turn-ben", seconds: 600 },
    ]);
  });

  it("shows No players yet with Add players", async () => {
    const user = await openSession();
    expect(nowCard().getByText("No players yet")).toBeVisible();
    // Nobody is now: the interterm waits and Next round is not filled.
    const rows = main()
      .getByRole("region", { name: "Round" })
      .querySelectorAll(`.${sessionStyles.row}`);
    expect([...rows].map((r) => r.textContent)).toEqual([
      "1GM · IntertermWaitinguntimed Open",
    ]);
    expect(
      roundBox().getByRole("button", { name: "Next round" }),
    ).not.toHaveClass(sessionStyles.primary);
    await user.click(nowCard().getByRole("button", { name: "Add players" }));
    await user.type(
      screen.getByRole("dialog").querySelector("input") as HTMLElement,
      "Ana",
    );
    const order = within(screen.getByRole("dialog"));
    await user.selectOptions(
      order.getByLabelText("Player 1 character"),
      "Marie Dubois",
    );
    await user.click(order.getByRole("button", { name: "Save" }));
    await user.click(
      order.getByRole("button", { name: "The usual order too" }),
    );
    expect(acts()).toEqual([
      {
        type: "saveOrder",
        roundId: "round-1",
        players: [{ id: null, name: "Ana", characterId: "marie-dubois" }],
        usual: true,
      },
    ]);
  });

  it("during the interterm offers Next round and no timer", async () => {
    withRounds(round(4, [ana()], { nowId: "interterm-4" }));
    const user = await openSession();
    expect(nowCard().getByText("NOW · INTERTERM")).toBeVisible();
    expect(nowCard().getByText("Untimed")).toBeVisible();
    expect(nowCard().queryByRole("timer")).not.toBeInTheDocument();
    await user.click(nowCard().getByRole("button", { name: "Next round" }));
    // Every turn has ended, so Next round doesn't ask.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(acts()).toEqual([{ type: "nextRound", roundId: "round-4" }]);
  });
});

describe("The round", () => {
  it("lists the turns and the interterm with their states and time used", async () => {
    withRounds(roundFour());
    await openSession();
    const rows = main()
      .getByRole("region", { name: "Round" })
      .querySelectorAll(`.${sessionStyles.row}`);
    expect([...rows].map((r) => r.textContent)).toEqual([
      "1Ana · Marie DuboisEndedused 14:20 of 15:00 Reopen Open",
      "2Ben · Karl WeberNownot started Open",
      "3Cleo · Rosa AlvarezWaiting Open",
      "4GM · IntertermWaitinguntimed Open",
    ]);
  });

  it("shows time used past the usual length in amber", async () => {
    withRounds(
      round(4, [
        turn("Ana", null, { state: "ended", usedMs: 16 * MIN }),
        cleo(),
      ]),
    );
    await openSession();
    expect(roundBox().getByText("used 16:00 of 15:00")).toHaveClass(
      sessionStyles.over,
    );
  });

  it("makes a clicked turn now and reopens an ended one", async () => {
    withRounds(roundFour());
    const user = await openSession();
    await user.click(
      roundBox().getByRole("button", { name: "Make Cleo · Rosa Alvarez now" }),
    );
    await user.click(
      roundBox().getByRole("button", { name: "Reopen Ana · Marie Dubois" }),
    );
    expect(acts()).toEqual([
      { type: "makeNow", turnId: "turn-cleo" },
      { type: "reopenTurn", turnId: "turn-ana" },
    ]);
    // The turn that is now and the ended one are not offered as now.
    expect(
      roundBox().queryByRole("button", { name: /^Make (Ben|Ana)/ }),
    ).not.toBeInTheDocument();
  });

  it("asks before Next round while a turn has not ended, then moves the game date", async () => {
    withRounds(roundFour());
    session.onAct = (action, snapshot) => {
      if (action.type !== "nextRound") return undefined;
      store.world = { ...store.world, gameDate: "1962-05-10" };
      return {
        ...snapshot,
        rounds: [
          { ...snapshot.rounds[0], status: "closed", nowId: null },
          round(5, [turn("Ana", "marie-dubois")], {
            start: "1962-05-10",
            end: "1962-08-10",
          }),
        ],
        world: structuredClone(store.world),
      };
    };
    const user = await openSession();
    await user.click(roundBox().getByRole("button", { name: "Next round" }));
    expect(
      dialog().getByRole("heading", { name: "Close round 4?" }),
    ).toBeVisible();
    expect(
      dialog().getByText(
        "Ben’s and Cleo’s turns and the interterm have not ended. Round 5 opens at once: 10 May 1962 → 10 Aug 1962, Quarter.",
      ),
    ).toBeVisible();
    await user.click(dialog().getByRole("button", { name: "Cancel" }));
    expect(acts()).toEqual([]);
    await user.click(roundBox().getByRole("button", { name: "Next round" }));
    await user.click(dialog().getByRole("button", { name: "Close round" }));
    expect(acts()).toEqual([{ type: "nextRound", roundId: "round-4" }]);
    expect(
      await roundBox().findByRole("heading", { name: "Round 5" }),
    ).toBeVisible();
    expect(roundBox().getByText("Game date 10 May 1962")).toBeVisible();
  });

  it("changes the length, shuffles and edits the usual timer length", async () => {
    withRounds(roundFour());
    const user = await openSession();
    expect(
      roundBox().getByRole("radio", { name: "Quarter", checked: true }),
    ).toBeVisible();
    expect(roundBox().getByText("10 Feb 1962 → 10 May 1962")).toBeVisible();
    await user.click(roundBox().getByRole("radio", { name: "Month" }));
    await user.click(roundBox().getByRole("button", { name: "Shuffle" }));
    await user.click(
      roundBox().getByRole("button", { name: "Edit timer length" }),
    );
    const length = roundBox().getByLabelText("Timer length per turn");
    await user.clear(length);
    await user.type(length, "20:00");
    await user.click(roundBox().getByRole("button", { name: "Save" }));
    expect(acts()).toEqual([
      { type: "setLength", roundId: "round-4", length: "month" },
      { type: "shuffle", roundId: "round-4" },
      { type: "setUsual", seconds: 1200 },
    ]);
  });

  it("Edit order shows why a removal is refused and stays open", async () => {
    withRounds(roundFour());
    sessionApi.sessionAct.mockRejectedValueOnce(
      "Ana’s turn has ended. Remove Ana from the usual order instead.",
    );
    const user = await openSession();
    await user.click(roundBox().getByRole("button", { name: "Edit order" }));
    const order = within(screen.getByRole("dialog"));
    await user.click(order.getByRole("button", { name: "Remove player 1" }));
    await user.click(order.getByRole("button", { name: "Save" }));
    await user.click(order.getByRole("button", { name: "This round only" }));
    expect(await order.findByRole("alert")).toHaveTextContent(
      "Ana’s turn has ended. Remove Ana from the usual order instead.",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    // The reason shows in the dialog, not as a toast.
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).queryByRole(
        "alert",
      ),
    ).not.toBeInTheDocument();
    await user.click(
      order.getByRole("button", { name: "The usual order too" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Edit order saves for this round only", async () => {
    withRounds(roundFour());
    const user = await openSession();
    await user.click(roundBox().getByRole("button", { name: "Edit order" }));
    const order = within(screen.getByRole("dialog"));
    await user.click(order.getByRole("button", { name: "Move player 3 up" }));
    await user.clear(order.getByLabelText("Player 1 name"));
    await user.click(order.getByRole("button", { name: "Save" }));
    expect(order.getByRole("alert")).toHaveTextContent(
      "Enter a name for every player.",
    );
    await user.type(order.getByLabelText("Player 1 name"), "Anna");
    await user.click(order.getByRole("button", { name: "Save" }));
    await user.click(order.getByRole("button", { name: "This round only" }));
    expect(acts()).toEqual([
      {
        type: "saveOrder",
        roundId: "round-4",
        players: [
          { id: "player-ana", name: "Anna", characterId: "marie-dubois" },
          { id: "player-cleo", name: "Cleo", characterId: "rosa-alvarez" },
          { id: "player-ben", name: "Ben", characterId: "karl-weber" },
        ],
        usual: false,
      },
    ]);
  });
});

describe("Edit date", () => {
  const editDate = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(roundBox().getByRole("button", { name: "Edit date" }));
    return roundBox().getByLabelText("Game date");
  };

  it("saves only the game date, and World Settings keeps it", async () => {
    const user = await openSession();
    const date = await editDate(user);
    expect(date).toHaveValue("10 February 1962");
    await user.clear(date);
    await user.type(date, "12 March 1963");
    await user.click(roundBox().getByRole("button", { name: "Save" }));
    expect(sessionApi.setGameDate).toHaveBeenCalledWith("1963-03-12");
    expect(api.updateWorld).not.toHaveBeenCalled();
    expect(
      await roundBox().findByText("Game date 12 March 1963"),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "World" }));
    await user.click(
      within(
        screen.getByRole("region", { name: "World rail panel" }),
      ).getByRole("button", { name: "Settings" }),
    );
    const left = await main().findByLabelText("Stat 1 left name");
    await user.clear(left);
    await user.type(left, "Order");
    await user.click(main().getByRole("button", { name: "Save" }));
    expect(store.world.statNames[0].left).toBe("Order");
    expect(store.world.gameDate).toBe("1963-03-12");
  });

  it.each([
    ["", "Enter a game date."],
    ["31 February 1962", "Not a real date."],
  ])("refuses %j", async (value, message) => {
    const user = await openSession();
    const date = await editDate(user);
    await user.clear(date);
    if (value) await user.type(date, value);
    await user.click(roundBox().getByRole("button", { name: "Save" }));
    expect(roundBox().getByText(message)).toBeVisible();
    expect(sessionApi.setGameDate).not.toHaveBeenCalled();
  });

  it("keeps the edit after a failed save", async () => {
    sessionApi.setGameDate.mockRejectedValueOnce("Disk full.");
    const user = await openSession();
    const date = await editDate(user);
    await user.clear(date);
    await user.type(date, "11 February 1962");
    await user.click(roundBox().getByRole("button", { name: "Save" }));
    expect(await findAlert()).toHaveTextContent("Disk full.");
    expect(roundBox().getByLabelText("Game date")).toHaveValue(
      "11 February 1962",
    );
  });

  it("asks before leaving an unsaved date edit", async () => {
    const user = await openSession();
    await user.type(await editDate(user), "x");
    await user.click(screen.getByRole("button", { name: "Notes" }));
    const discard = within(
      screen.getByRole("alertdialog", { name: "Discard changes?" }),
    );
    await user.click(discard.getByRole("button", { name: "Cancel" }));
    expect(roundBox().getByLabelText("Game date")).toHaveValue(
      "10 February 1962x",
    );
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(
      within(
        screen.getByRole("alertdialog", { name: "Discard changes?" }),
      ).getByRole("button", { name: "Discard" }),
    );
    await user.click(screen.getByRole("button", { name: "Session" }));
    expect(
      await roundBox().findByText("Game date 10 February 1962"),
    ).toBeVisible();
    expect(sessionApi.setGameDate).not.toHaveBeenCalled();
  });
});

describe("The play night line", () => {
  it("starts a session when none runs", async () => {
    session.snapshot.nights = [night(11)];
    const user = await openSession();
    const line = within(main().getByRole("region", { name: "Play night" }));
    expect(line.getByText("No session running")).toBeVisible();
    expect(
      line.getByText("Last: Session 11 · 26 Oct · 3 h 35 min"),
    ).toBeVisible();
    await user.click(line.getByRole("button", { name: "Start session" }));
    expect(acts()).toEqual([{ type: "startNight" }]);
  });

  it("shows Start session once the running session ends idle", async () => {
    session.snapshot.nights = [
      night(12, {
        startedAt: Date.now() - 7 * 60 * MIN,
        endedAt: null,
        lastActivityAt: Date.now() - 6 * 60 * MIN + 500,
      }),
    ];
    await openSession();
    const line = within(main().getByRole("region", { name: "Play night" }));
    expect(line.getByRole("button", { name: "End session" })).toBeVisible();
    // The app ends the night at its idle deadline.
    session.snapshot.nights = [
      night(12, { endedAt: Date.now() - 6 * 60 * MIN, endedIdle: true }),
    ];
    expect(
      await line.findByRole(
        "button",
        { name: "Start session" },
        {
          timeout: 3000,
        },
      ),
    ).toBeVisible();
  });

  it("shows Start session when End session finds the session already ended", async () => {
    session.snapshot.nights = [
      night(12, {
        startedAt: Date.now() - 85 * MIN,
        endedAt: null,
        lastActivityAt: Date.now(),
      }),
    ];
    const user = await openSession();
    session.snapshot.nights = [night(12, { endedIdle: true })];
    sessionApi.sessionAct.mockRejectedValueOnce("No session is running.");
    const line = within(main().getByRole("region", { name: "Play night" }));
    await user.click(line.getByRole("button", { name: "End session" }));
    expect(
      await line.findByRole("button", { name: "Start session" }),
    ).toBeVisible();
  });

  it("shows the running session with Recap and End session", async () => {
    session.snapshot.nights = [
      night(12, {
        startedAt: Date.now() - 85 * MIN,
        endedAt: null,
      }),
    ];
    const user = await openSession();
    const line = within(main().getByRole("region", { name: "Play night" }));
    expect(line.getByText("Session 12")).toBeVisible();
    expect(line.getByText(/^since \d\d:\d\d · 1 h 25 min$/)).toBeVisible();
    await user.click(line.getByRole("button", { name: "End session" }));
    expect(acts()).toEqual([{ type: "endNight" }]);
    await user.click(line.getByRole("button", { name: "Recap" }));
    expect(
      await main().findByRole("heading", { name: "Session 12 recap" }),
    ).toBeVisible();
    expect(main().getByRole("button", { name: "← Overview" })).toBeVisible();
  });
});

describe("Round notes", () => {
  it("open in Session, save as you type and lead back to Overview", async () => {
    withRounds(roundFour());
    session.notes.set("note-ben", "# Plans");
    const user = await openSession();
    await user.click(nowCard().getByRole("button", { name: "Open turn note" }));
    expect(
      await main().findByRole("heading", { name: "Ben · Karl Weber" }),
    ).toBeVisible();
    expect(main().getByText("Round 4 · turn note")).toBeVisible();
    await typeInNote(" strike");
    await waitFor(
      () => expect(session.notes.get("note-ben")).toBe("# Plans strike"),
      { timeout: 2000 },
    );
    await user.click(main().getByRole("button", { name: "← Overview" }));
    expect(await main().findByRole("region", { name: "Now" })).toBeVisible();
  });

  it("saves a pending edit when Session is left", async () => {
    withRounds(roundFour());
    const user = await openSession();
    await user.click(
      roundBox().getByRole("button", { name: "Open GM · Interterm note" }),
    );
    await typeInNote("Strike");
    await user.click(screen.getByRole("button", { name: "World" }));
    expect(session.notes.get("note-interterm-4")).toBe("Strike");
  });

  it("Read whole round shows every note in turn order", async () => {
    withRounds(roundFour());
    session.notes.set("note-ana", "Ana *went first*.");
    session.notes.set("note-interterm-4", "The strike spreads.");
    const user = await openSession();
    await user.click(
      roundBox().getByRole("button", { name: "Read whole round" }),
    );
    await main().findByText("The strike spreads.");
    const titles = main()
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual([
      "1Ana · Marie Dubois Open",
      "2Ben · Karl Weber Open",
      "3Cleo · Rosa Alvarez Open",
      "4GM · Interterm Open",
    ]);
    expect(main().getByText("went first")).toBeVisible();
    expect(main().getAllByText("No note yet.")).toHaveLength(2);
  });
});

describe("Rounds and Sessions pages", () => {
  it("Rounds lists every round newest first and opens a closed one to reopen it", async () => {
    session.snapshot.nights = [night(11, { roundIds: ["round-3", "round-4"] })];
    withRounds(
      round(3, [turn("Ana", null, { state: "ended" })], {
        status: "closed",
        start: "1961-11-10",
        end: "1962-02-10",
      }),
      roundFour(),
    );
    const user = await openSession();
    await user.click(rail().getByRole("button", { name: "Rounds" }));
    const rows = [
      ...main()
        .getByRole("region", { name: "Rounds" })
        .querySelectorAll(`.${sessionStyles.tr}`),
    ].slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "Round 410 Feb 1962 → 10 May 1962QuarterOpen1 of 3 ended11Open",
      "Round 310 Nov 1961 → 10 Feb 1962QuarterClosed1 of 1 ended11Open",
    ]);
    await user.click(main().getByRole("button", { name: "Open round 3" }));
    expect(main().getByRole("heading", { name: "Round 3" })).toBeVisible();
    expect(main().getByText("Closed")).toBeVisible();
    await user.click(main().getByRole("button", { name: "Reopen" }));
    expect(acts()).toEqual([{ type: "reopenRound", roundId: "round-3" }]);
    await user.click(main().getByRole("button", { name: "← Rounds" }));
    expect(main().getByRole("heading", { name: "Rounds" })).toBeVisible();
  });

  it("Sessions lists the play nights with their recaps", async () => {
    withRounds(roundFour());
    session.snapshot.nights = [
      night(9, { endedIdle: true, roundIds: ["round-4"] }),
      night(10),
    ];
    session.notes.set("recap-9", "# Start\nCampaign start.");
    const user = await openSession();
    await user.click(rail().getByRole("button", { name: "Sessions" }));
    const table = main().getByRole("region", { name: "Sessions" });
    await within(table).findByText("Start");
    const rows = [...table.querySelectorAll(`.${sessionStyles.tr}`)].slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "Session 10Mon 26 Oct 202619:30 → 23:05No recap yet Recap",
      "Session 9Mon 26 Oct 202619:30 → 23:05 · ended idle4Start Recap",
    ]);
    await user.click(main().getByRole("button", { name: "Session 9 recap" }));
    expect(
      await main().findByRole("heading", { name: "Session 9 recap" }),
    ).toBeVisible();
    await user.click(main().getByRole("button", { name: "← Sessions" }));
    expect(
      rail().getByRole("button", { name: "Sessions", pressed: true }),
    ).toBeVisible();
  });
});

describe("The timer pill", () => {
  const pill = () => screen.queryByRole("timer", { name: "Turn timer" });

  it("is hidden before Start and during the interterm", async () => {
    withRounds(roundFour());
    render(<App />);
    await waitFor(() => expect(sessionApi.getSession).toHaveBeenCalled());
    await act(async () => {});
    expect(pill()).not.toBeInTheDocument();
    session.snapshot.rounds = [round(4, [ana()], { nowId: "interterm-4" })];
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Session" }));
    await main().findByText("NOW · INTERTERM");
    expect(pill()).not.toBeInTheDocument();
  });

  it("shows on every tab while the timer runs, pauses it, and opens Overview", async () => {
    withRounds(
      roundFour({
        clock: clock({ state: "running", runningSince: Date.now() - MIN }),
      }),
    );
    render(<App />);
    const user = userEvent.setup();
    const shown = await screen.findByRole("timer", { name: "Turn timer" });
    expect(
      within(shown).getByRole("button", { name: /^14:0\d, open/ }),
    ).toBeVisible();
    await user.click(
      within(shown).getByRole("button", { name: "Pause timer" }),
    );
    expect(acts()).toEqual([{ type: "pause", turnId: "turn-ben" }]);
    await user.click(
      within(shown).getByRole("button", { name: /open Session overview/ }),
    );
    expect(
      screen.getByRole("button", { name: "Session", pressed: true }),
    ).toBeVisible();
    expect(await main().findByRole("region", { name: "Now" })).toBeVisible();
  });

  it("is dimmed while paused and red at zero", async () => {
    withRounds(roundFour({ clock: clock({ state: "paused", leftMs: MIN }) }));
    const { unmount } = render(<App />);
    expect(
      await screen.findByRole("timer", { name: "Turn timer" }),
    ).toHaveClass(pillStyles.paused);
    expect(screen.getByRole("button", { name: "Resume timer" })).toBeVisible();
    unmount();
    withRounds(
      roundFour({
        clock: clock({ state: "running", runningSince: Date.now() - 20 * MIN }),
      }),
    );
    render(<App />);
    const zero = await screen.findByRole("timer", { name: "Turn timer" });
    expect(zero).toHaveClass(pillStyles.zero);
    expect(zero).toHaveTextContent(/^\+5:0\d$/);
    // Pause works in overtime.
    expect(
      within(zero).getByRole("button", { name: "Pause timer" }),
    ).toBeVisible();
  });
});
