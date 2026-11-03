import { vi } from "vitest";
import type {
  Action,
  Clock,
  Night,
  Round,
  Snapshot,
  Turn,
} from "@/lib/sessionApi";
import { store as people } from "@/test/fakePeople";

// A stand-in for the Rust session commands (src-tauri/src/table.rs). It
// serves `session.snapshot` and records each action; a test that needs the
// table to change sets `session.onAct`. The table's rules are tested in Rust.
//   vi.mock("@/lib/sessionApi", async () => (await import("@/test/fakeSession")).mockModule());

type SessionStore = {
  snapshot: Snapshot;
  notes: Map<string, string>;
  // Changes the snapshot for an action, or throws a refusal.
  onAct?: (action: Action, snapshot: Snapshot) => Snapshot | undefined;
};

export const MIN = 60_000;

export const clock = (extra: Partial<Clock> = {}): Clock => ({
  state: "notStarted",
  leftMs: 15 * MIN,
  runningSince: null,
  ...extra,
});

// A waiting turn whose ids come from the name.
export const turn = (
  name: string,
  characterId: string | null,
  extra: Partial<Turn> = {},
): Turn => {
  const id = name.toLowerCase();
  return {
    id: `turn-${id}`,
    playerId: `player-${id}`,
    name,
    characterId,
    state: "waiting",
    usedMs: 0,
    clock: clock(),
    noteId: `note-${id}`,
    kept: false,
    updatedAt: 0,
    ...extra,
  };
};

// An open round; `nowId` is the first waiting turn, else the interterm, and
// nobody with no players.
export const round = (
  number: number,
  turns: Turn[],
  extra: Partial<Round> = {},
): Round => {
  const interterm = {
    id: `interterm-${number}`,
    state: "waiting" as const,
    noteId: `note-interterm-${number}`,
    updatedAt: 0,
  };
  return {
    id: `round-${number}`,
    number,
    start: "1962-02-10",
    length: "quarter",
    end: "1962-05-10",
    status: "open",
    turns,
    interterm,
    nowOverride: null,
    updatedAt: 0,
    nowId:
      extra.status === "closed" || turns.length === 0
        ? null
        : (turns.find((t) => t.state === "waiting")?.id ?? interterm.id),
    ...extra,
  };
};

export const night = (number: number, extra: Partial<Night> = {}): Night => ({
  id: `night-${number}`,
  number,
  startedAt: new Date(2026, 9, 26, 19, 30).getTime(),
  endedAt: new Date(2026, 9, 26, 23, 5).getTime(),
  endedIdle: false,
  recapNoteId: `recap-${number}`,
  roundIds: [],
  lastActivityAt: 0,
  updatedAt: 0,
  ...extra,
});

const fresh = (): SessionStore => ({
  snapshot: {
    players: [],
    rounds: [round(1, [])],
    usualSeconds: 900,
    nights: [],
    world: null,
  },
  notes: new Map(),
});

export const session: SessionStore = fresh();

export const resetSession = () => {
  Object.assign(session, { onAct: undefined }, fresh());
};

const copy = <T>(value: T): T => structuredClone(value);

export const sessionApi = {
  getSession: vi.fn(async () => copy(session.snapshot)),
  sessionAct: vi.fn(async (action: Action) => {
    const next = session.onAct?.(action, copy(session.snapshot));
    if (next) session.snapshot = next;
    const answer = copy(session.snapshot);
    session.snapshot.world = null;
    return answer;
  }),
  readRoundNote: vi.fn(
    async (noteId: string) => session.notes.get(noteId) ?? "",
  ),
  writeRoundNote: vi.fn(async (noteId: string, text: string) => {
    session.notes.set(noteId, text);
  }),
  // Like world_set_game_date: only the date changes.
  setGameDate: vi.fn(async (date: string) => {
    people.world = { ...people.world, gameDate: date };
    return copy(people.world);
  }),
};

export const mockModule = async () => ({
  ...(await vi.importActual<typeof import("@/lib/sessionApi")>(
    "@/lib/sessionApi",
  )),
  ...sessionApi,
});
