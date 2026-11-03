import { invoke } from "@tauri-apps/api/core";
import type { World } from "@/lib/peopleApi";

// The table that Session runs (src-tauri/src/table.rs). Times are
// milliseconds since 1970 on this device's clock. Dates are "YYYY-MM-DD".

export type Length = "month" | "quarter" | "year";
export type ClockState = "notStarted" | "running" | "paused" | "atZero";
export type StepState = "waiting" | "ended";

export type Player = {
  id: string;
  name: string;
  characterId: string | null;
  updatedAt: number;
};

// While it runs, the time left is leftMs minus the time since runningSince.
export type Clock = {
  state: ClockState;
  leftMs: number;
  runningSince: number | null;
};

export type Turn = {
  id: string;
  playerId: string;
  name: string;
  characterId: string | null;
  state: StepState;
  usedMs: number;
  clock: Clock;
  noteId: string;
  updatedAt: number;
};

export type Interterm = {
  id: string;
  state: StepState;
  noteId: string;
  updatedAt: number;
};

export type Round = {
  id: string;
  number: number;
  start: string;
  length: Length;
  end: string;
  status: "open" | "closed";
  turns: Turn[];
  interterm: Interterm;
  nowOverride: string | null;
  updatedAt: number;
  // The turn or interterm that is "now", or null.
  nowId: string | null;
};

// A play night.
export type Night = {
  id: string;
  number: number;
  startedAt: number;
  endedAt: number | null;
  endedIdle: boolean;
  recapNoteId: string;
  roundIds: string[];
  lastActivityAt: number;
  updatedAt: number;
};

export type Snapshot = {
  players: Player[];
  // Oldest first.
  rounds: Round[];
  usualSeconds: number;
  // Oldest first.
  nights: Night[];
  // Set when the action changed the World.
  world: World | null;
};

export type PlayerInput = {
  id: string | null;
  name: string;
  characterId: string | null;
};

export type Action =
  | { type: "makeNow"; turnId: string }
  | { type: "endTurn"; turnId: string }
  | { type: "reopenTurn"; turnId: string }
  | { type: "start"; turnId: string }
  | { type: "pause"; turnId: string }
  | { type: "resume"; turnId: string }
  | { type: "reset"; turnId: string }
  | { type: "setLeft"; turnId: string; seconds: number }
  | { type: "setUsual"; seconds: number }
  | { type: "setLength"; roundId: string; length: Length }
  | { type: "shuffle"; roundId: string }
  | {
      type: "saveOrder";
      roundId: string;
      players: PlayerInput[];
      usual: boolean;
    }
  | { type: "nextRound"; roundId: string }
  | { type: "reopenRound"; roundId: string }
  | { type: "closeRound"; roundId: string }
  | { type: "startNight" }
  | { type: "endNight" };

// With no round, round 1 opens at the game date as a Quarter.
export const getSession = () => invoke<Snapshot>("session_get");

// Rejects with a message when the action doesn't apply.
export const sessionAct = (action: Action) =>
  invoke<Snapshot>("session_act", { action });

// A note that was never written is "".
export const readRoundNote = (noteId: string) =>
  invoke<string>("round_note_read", { noteId });

// The window event, with the note id as detail, that tells an open round
// note that something else wrote it.
export const ROUND_NOTE_WRITTEN = "round-note-written";

export const writeRoundNote = (noteId: string, text: string) =>
  invoke<void>("round_note_write", { noteId, text });

// Changes only the game date.
export const setGameDate = (date: string) =>
  invoke<World>("world_set_game_date", { date });
