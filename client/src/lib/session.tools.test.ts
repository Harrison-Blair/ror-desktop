import { beforeEach, describe, expect, it, vi } from "vitest";
import { features, toolRegistry } from "@/lib/chat/features";
import {
  type ApprovalRequest,
  type PermissionMode,
  REJECTED,
  runToolCall,
} from "@/lib/chat/gate";
import type { ToolContext } from "@/lib/chat/registry";
import { character, resetPeople, store } from "@/test/fakePeople";
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

vi.mock("@/lib/peopleApi", async () =>
  (await import("@/test/fakePeople")).mockModule(),
);

vi.mock("@/lib/sessionApi", async () =>
  (await import("@/test/fakeSession")).mockModule(),
);

let context: ToolContext;

beforeEach(() => {
  vi.clearAllMocks();
  resetPeople();
  resetSession();
  store.characters = [character("Marie Dubois"), character("Karl Weber")];
  session.snapshot.rounds = [
    round(3, [turn("Ana", "marie-dubois", { state: "ended" })], {
      status: "closed",
      start: "1961-11-10",
      end: "1962-02-10",
      nowId: null,
    }),
    round(4, [
      turn("Ana", "marie-dubois", {
        state: "ended",
        usedMs: 14 * MIN + 20_000,
      }),
      turn("Ben", "karl-weber", {
        usedMs: 6 * MIN + 18_000,
        clock: clock({ state: "paused", leftMs: 8 * MIN + 42_000 }),
      }),
      turn("Cleo", null),
    ]),
  ];
  session.snapshot.nights = [
    night(11, { roundIds: ["round-3", "round-4"] }),
    night(12, { endedAt: null, roundIds: ["round-4"] }),
  ];
  session.notes.set("recap-11", "The strike spreads.");
  context = {
    app: {
      notesFolder: () => "/notes",
      openNote: () => null,
      flushOpenNote: vi.fn(async () => true),
      showNote: vi.fn(async () => true),
      pathChanged: vi.fn(),
      addRoll: vi.fn(),
      showPerson: vi.fn(async () => true),
      peopleChanged: vi.fn(),
    },
    reads: new Map(),
    notifyOnce: vi.fn(),
  };
});

const call = (
  name: string,
  args: Record<string, unknown>,
  mode: PermissionMode = "auto",
  approve: (request: ApprovalRequest) => Promise<boolean> = async () => true,
) =>
  runToolCall(
    toolRegistry,
    { id: "call_1", name, arguments: JSON.stringify(args) },
    { mode, approve, context },
  );

const ok = (content: string) => ({ content, isError: false });
const error = (content: string) => ({ content, isError: true });

describe("the Session feature", () => {
  it("offers get_round and get_session to read and write_recap to write", () => {
    const sessionFeature = features.find((f) => f.name === "Session");
    expect(sessionFeature?.tools.map((t) => [t.name, t.kind])).toEqual([
      ["get_round", "read"],
      ["get_session", "read"],
      ["write_recap", "write"],
    ]);
    expect(sessionFeature?.summary).not.toContain("not built");
  });
});

describe("get_round", () => {
  it("reads the current round with who is now and the time used", async () => {
    expect(await call("get_round", {})).toEqual(
      ok(
        [
          "Round 4 · Quarter · 10 Feb 1962 → 10 May 1962 · open",
          "Now: Ben · Karl Weber",
          "Timer: 15:00 per turn",
          "1. Ana · Marie Dubois · ended · used 14:20 of 15:00",
          "2. Ben · Karl Weber · now · used 6:18 of 15:00 · timer paused, 08:42 left",
          "3. Cleo · waiting",
          "4. GM · Interterm · waiting · untimed",
        ].join("\n"),
      ),
    );
  });

  it("reads a round by number", async () => {
    expect(await call("get_round", { round: 3 })).toEqual(
      ok(
        [
          "Round 3 · Quarter · 10 Nov 1961 → 10 Feb 1962 · closed",
          "Now: nobody (the round is closed)",
          "Timer: 15:00 per turn",
          "1. Ana · Marie Dubois · ended",
          "2. GM · Interterm · waiting · untimed",
        ].join("\n"),
      ),
    );
  });

  it("refuses a round that doesn't exist", async () => {
    expect(await call("get_round", { round: 9 })).toEqual(
      error("There is no round 9. The rounds are 1 to 2."),
    );
    expect(await call("get_round", { round: "4" })).toEqual(
      error("round must be a whole number."),
    );
  });
});

describe("get_session", () => {
  it("reads the running session by default", async () => {
    const result = await call("get_session", {});
    expect(result.isError).toBe(false);
    expect(result.content.split("\n")).toEqual([
      "Session 12 · Mon 26 Oct 2026 · 19:30 → running",
      "Rounds touched: 4",
      "Recap:",
      "(no recap yet)",
    ]);
  });

  it("reads a session by number with its recap", async () => {
    expect(await call("get_session", { session: 11 })).toEqual(
      ok(
        [
          "Session 11 · Mon 26 Oct 2026 · 19:30 → 23:05",
          "Rounds touched: 3, 4",
          "Recap:",
          "The strike spreads.",
        ].join("\n"),
      ),
    );
  });

  it("says when there are no sessions", async () => {
    session.snapshot.nights = [];
    expect(await call("get_session", {})).toEqual(
      error("There are no sessions yet."),
    );
  });
});

describe("write_recap", () => {
  it("replaces the recap in Auto mode", async () => {
    expect(
      await call("write_recap", { session: 11, text: "Lyon strikes." }),
    ).toEqual(ok("Replaced the recap of session 11."));
    expect(session.notes.get("recap-11")).toBe("Lyon strikes.");
  });

  it("waits for approval in Manual mode, with the change shown", async () => {
    const approve = vi.fn(async (_request: ApprovalRequest) => true);
    await call(
      "write_recap",
      { session: 11, text: "Lyon strikes." },
      "manual",
      approve,
    );
    expect(approve).toHaveBeenCalledOnce();
    expect(approve.mock.calls[0][0].preview).toEqual({
      target: "Session 11 recap",
      diff: "-The strike spreads.\n+Lyon strikes.",
      seen: "The strike spreads.",
    });
    expect(session.notes.get("recap-11")).toBe("Lyon strikes.");
  });

  it("writes nothing when the user rejects it", async () => {
    expect(
      await call(
        "write_recap",
        { session: 11, text: "Lyon strikes." },
        "manual",
        async () => false,
      ),
    ).toEqual(error(REJECTED));
    expect(sessionApi.writeRoundNote).not.toHaveBeenCalled();
    expect(session.notes.get("recap-11")).toBe("The strike spreads.");
  });

  it("writes nothing when the recap changed after the approval card showed", async () => {
    const result = await call(
      "write_recap",
      { session: 11, text: "Lyon strikes." },
      "manual",
      async () => {
        session.notes.set("recap-11", "Edited by hand.");
        return true;
      },
    );
    expect(result).toEqual(
      error(
        "The recap changed after you asked. Read it again with get_session.",
      ),
    );
    expect(session.notes.get("recap-11")).toBe("Edited by hand.");
  });

  it("refuses a session that doesn't exist", async () => {
    expect(await call("write_recap", { session: 3, text: "x" })).toEqual(
      error("There is no session 3. The sessions are 1 to 2."),
    );
  });
});
