// What Session shows, worked out from the table.

import { formatBoxDate, MONTHS } from "@/lib/people";
import type { Character } from "@/lib/peopleApi";
import type { Clock, Length, Night, Round, Turn } from "@/lib/sessionApi";

export const LENGTHS: { id: Length; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

export const lengthLabel = (length: Length) =>
  LENGTHS.find((l) => l.id === length)?.label ?? length;

const pad = (n: number) => String(n).padStart(2, "0");

const daysIn = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// The round's end, date to date on the real calendar, as in table.rs.
export const endDate = (start: string, length: Length) => {
  const [year, month, day] = start.split("-").map(Number);
  const months = { month: 1, quarter: 3, year: 12 }[length];
  const total = year * 12 + (month - 1) + months;
  const [y, m] = [Math.floor(total / 12), (total % 12) + 1];
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(Math.min(day, daysIn(y, m)))}`;
};

// "10 Feb 1962".
export const shortDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1].slice(0, 3)} ${year}`;
};

// "10 Feb 1962 → 10 May 1962".
export const period = (start: string, end: string) =>
  `${shortDate(start)} → ${shortDate(end)}`;

export const longDate = formatBoxDate;

// The time left at `now`. Below zero is overtime.
export const clockLeft = (clock: Clock, now: number) =>
  clock.state === "running" && clock.runningSince !== null
    ? clock.leftMs - Math.max(0, now - clock.runningSince)
    : clock.leftMs;

// True at or past 0:00, running or paused.
export const isOver = (clock: Clock, now: number) =>
  clock.state !== "notStarted" && clockLeft(clock, now) <= 0;

// "08:42" while time is left, "+0:42" in overtime.
export const formatLeft = (ms: number) =>
  ms > 0 ? formatClock(ms) : `+${formatSpan(-ms)}`;

// The time the turn's timer ran, up to `now`.
export const usedAt = (turn: Turn, now: number) =>
  turn.usedMs + (turn.clock.leftMs - clockLeft(turn.clock, now));

// "08:42", or "1:02:03" from an hour. Rounds up, so 0:00 shows only at zero.
export const formatClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const [h, m, s] = [
    Math.floor(total / 3600),
    Math.floor(total / 60) % 60,
    total % 60,
  ];
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

// "6:18", or "1:02:03" from an hour. Rounds down, for time used.
export const formatSpan = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const [h, m, s] = [
    Math.floor(total / 3600),
    Math.floor(total / 60) % 60,
    total % 60,
  ];
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

// Reads "15:00", "15", "1:30:00" or "90s"-free minutes as seconds. Null
// when it isn't a time.
export const parseClock = (text: string) => {
  const t = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(":").map(Number);
  if (parts.slice(1).some((p) => p > 59)) return null;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

// The character's current name, or null.
export const characterName = (
  id: string | null,
  characters: Character[] | undefined,
) => (id && characters?.find((c) => c.id === id)?.name) || null;

// "Ana · Marie Dubois", or "Ana" with no character.
export const turnLabel = (turn: Turn, characters: Character[] | undefined) => {
  const character = characterName(turn.characterId, characters);
  return character ? `${turn.name} · ${character}` : turn.name;
};

export const INTERTERM_LABEL = "GM · Interterm";

export type Now =
  | { kind: "turn"; turn: Turn; index: number }
  | { kind: "interterm" }
  | { kind: "none" };

export const nowOf = (round: Round): Now => {
  if (round.nowId === null) return { kind: "none" };
  if (round.nowId === round.interterm.id) return { kind: "interterm" };
  const index = round.turns.findIndex((t) => t.id === round.nowId);
  return index < 0
    ? { kind: "none" }
    : { kind: "turn", turn: round.turns[index], index };
};

// The next one or two after "now": waiting turns in order, then the
// interterm.
export const nextOf = (round: Round, characters: Character[] | undefined) =>
  [
    ...round.turns
      .filter((t) => t.state === "waiting" && t.id !== round.nowId)
      .map((t) => turnLabel(t, characters)),
    INTERTERM_LABEL,
  ].slice(0, 2);

// "Cleo’s turn", "Ana’s and Cleo’s turns", "Ana’s, Ben’s and Cleo’s turns".
const turnsPhrase = (names: string[]) => {
  const owned = names.map((n) => `${n}’s`);
  const list =
    owned.length === 1
      ? owned[0]
      : `${owned.slice(0, -1).join(", ")} and ${owned[owned.length - 1]}`;
  return `${list} ${owned.length === 1 ? "turn" : "turns"}`;
};

// The Next round question, or null when every turn has ended.
export const nextRoundQuestion = (round: Round) => {
  const waiting = round.turns.filter((t) => t.state === "waiting");
  if (waiting.length === 0) return null;
  const end = endDate(round.end, round.length);
  return {
    title: `Close round ${round.number}?`,
    message: `${turnsPhrase(waiting.map((t) => t.name))} and the interterm have not ended. Round ${round.number + 1} opens at once: ${period(round.end, end)}, ${lengthLabel(round.length)}.`,
  };
};

// The End turn question, or null at zero.
export const endTurnQuestion = (turn: Turn, now: number) => {
  const left = clockLeft(turn.clock, now);
  if (left <= 0) return null;
  return {
    title: `End ${turn.name}’s turn early?`,
    message: `${formatSpan(Math.ceil(left / 1000) * 1000)} is left on the timer. The turn note stays editable.`,
  };
};

// The latest round.
export const currentRound = (rounds: Round[]) =>
  rounds.length ? rounds[rounds.length - 1] : undefined;

// The clock the pill shows: the "now" turn of the current round, while its
// timer has started.
export const pillTurn = (rounds: Round[]) => {
  const round = currentRound(rounds);
  if (!round) return undefined;
  const now = nowOf(round);
  if (now.kind !== "turn" || now.turn.clock.state === "notStarted") {
    return undefined;
  }
  return now.turn;
};

const time = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// "1 h 25 min", "25 min".
export const formatDuration = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} h ${minutes % 60} min` : `${minutes} min`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Mon 2 Nov 2026".
export const playedOn = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};

// "26 Oct".
const dayMonth = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};

export const runningNight = (nights: Night[]) =>
  nights.find((n) => n.endedAt === null);

// "since 19:40 · 1 h 25 min".
export const sinceLine = (night: Night, now: number) =>
  `since ${time(night.startedAt)} · ${formatDuration(now - night.startedAt)}`;

// "Last: Session 11 · 26 Oct · 3 h 35 min".
export const lastLine = (night: Night) =>
  `Last: Session ${night.number} · ${dayMonth(night.startedAt)} · ${formatDuration((night.endedAt ?? night.startedAt) - night.startedAt)}`;

// "19:40 → running", "19:30 → 23:05", "20:00 → 01:10 · ended idle".
export const nightTimes = (night: Night) =>
  night.endedAt === null
    ? `${time(night.startedAt)} → running`
    : `${time(night.startedAt)} → ${time(night.endedAt)}${night.endedIdle ? " · ended idle" : ""}`;

// The numbers of the rounds the night touched: "3, 4".
export const nightRounds = (night: Night, rounds: Round[]) =>
  night.roundIds
    .map((id) => rounds.find((r) => r.id === id)?.number)
    .filter((n) => n !== undefined)
    .sort((a, b) => a - b)
    .join(", ");

// The numbers of the nights that touched the round: "11, 12".
export const roundNights = (round: Round, nights: Night[]) =>
  nights
    .filter((n) => n.roundIds.includes(round.id))
    .map((n) => n.number)
    .join(", ");

export const nightTitle = (night: Night) => `Session ${night.number}`;
