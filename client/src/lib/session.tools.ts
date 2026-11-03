// The chat agent's Session tools: read a round or a play night, and write a
// night's recap. Turn and timer actions stay buttons only.

import type { Tool } from "@/lib/chat/registry";
import { lineDiff } from "@/lib/diff";
import { type Character, listPeople } from "@/lib/peopleApi";
import {
  clockLeft,
  currentRound,
  formatClock,
  formatSpan,
  INTERTERM_LABEL,
  lengthLabel,
  nightRounds,
  nightTimes,
  period,
  playedOn,
  runningNight,
  turnLabel,
  usedAt,
} from "@/lib/session";
import {
  getSession,
  type Night,
  ROUND_NOTE_WRITTEN,
  readRoundNote,
  writeRoundNote,
} from "@/lib/sessionApi";

const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });

// A whole number input, or undefined when it is optional and missing.
function count(
  input: Record<string, unknown>,
  name: string,
  required: boolean,
) {
  const value = input[name];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${name} must be a whole number.`);
  }
  return value;
}

// The characters, for "Person · Character" names. Without them, names only.
const characters = async (): Promise<Character[]> => {
  try {
    return (await listPeople()).characters;
  } catch {
    return [];
  }
};

const STATE = { waiting: "waiting", ended: "ended" };

export const getRound: Tool = {
  name: "get_round",
  description:
    "Returns a round of play: its period, length and status, who is now, and each turn in order with its state and time used, then the interterm. Without a number, the current round.",
  inputSchema: object(
    {
      round: {
        type: "integer",
        description: "The round's number. Leave out for the current round.",
      },
    },
    [],
  ),
  kind: "read",
  run: async (input) => {
    const number = count(input, "round", false);
    const snapshot = await getSession();
    const round =
      number === undefined
        ? currentRound(snapshot.rounds)
        : snapshot.rounds.find((r) => r.number === number);
    if (!round) {
      throw new Error(
        `There is no round ${number}. The rounds are 1 to ${snapshot.rounds.length}.`,
      );
    }
    const people = await characters();
    const now = Date.now();
    const usual = formatClock(snapshot.usualSeconds * 1000);
    const nowLabel =
      round.nowId === null
        ? round.status === "closed"
          ? "nobody (the round is closed)"
          : "nobody (no players yet)"
        : round.nowId === round.interterm.id
          ? INTERTERM_LABEL
          : turnLabel(
              round.turns.find((t) => t.id === round.nowId) ?? round.turns[0],
              people,
            );
    const lines = [
      `Round ${round.number} · ${lengthLabel(round.length)} · ${period(round.start, round.end)} · ${round.status}`,
      `Now: ${nowLabel}`,
      `Timer: ${usual} per turn`,
      ...round.turns.map((turn, i) => {
        const parts = [
          `${i + 1}. ${turnLabel(turn, people)}`,
          turn.id === round.nowId ? "now" : STATE[turn.state],
        ];
        const used = usedAt(turn, now);
        if (used > 0) parts.push(`used ${formatSpan(used)} of ${usual}`);
        if (turn.id === round.nowId && turn.clock.state !== "notStarted") {
          const left = clockLeft(turn.clock, now);
          parts.push(
            left <= 0
              ? `timer ${turn.clock.state}, ${formatSpan(-left)} over`
              : `timer ${turn.clock.state}, ${formatClock(left)} left`,
          );
        }
        return parts.join(" · ");
      }),
      `${round.turns.length + 1}. ${INTERTERM_LABEL} · ${round.nowId === round.interterm.id ? "now" : STATE[round.interterm.state]} · untimed`,
    ];
    return lines.join("\n");
  },
};

// The night with `number`, or the running or latest night.
async function findNight(number: number | undefined) {
  const snapshot = await getSession();
  const nights = snapshot.nights;
  const night =
    number === undefined
      ? (runningNight(nights) ?? nights[nights.length - 1])
      : nights.find((n) => n.number === number);
  if (!night) {
    throw new Error(
      nights.length === 0
        ? "There are no sessions yet."
        : `There is no session ${number}. The sessions are 1 to ${nights.length}.`,
    );
  }
  return { night, snapshot };
}

const recapName = (night: Night) => `Session ${night.number} recap`;

export const getSessionTool: Tool = {
  name: "get_session",
  description:
    "Returns a play night (session): its date and times, the rounds it touched, and its recap. Without a number, the running or latest session.",
  inputSchema: object(
    {
      session: {
        type: "integer",
        description: "The session's number. Leave out for the latest.",
      },
    },
    [],
  ),
  kind: "read",
  run: async (input) => {
    const { night, snapshot } = await findNight(count(input, "session", false));
    const recap = await readRoundNote(night.recapNoteId);
    return [
      `Session ${night.number} · ${playedOn(night.startedAt)} · ${nightTimes(night)}`,
      `Rounds touched: ${nightRounds(night, snapshot.rounds) || "none"}`,
      "Recap:",
      recap.trim() ? recap : "(no recap yet)",
    ].join("\n");
  },
};

export const writeRecap: Tool = {
  name: "write_recap",
  description:
    "Replaces the whole recap of a play night (session) with Markdown text. Read it with get_session first to keep what is there.",
  inputSchema: object({
    session: { type: "integer", description: "The session's number." },
    text: { type: "string", description: "The recap's new Markdown text." },
  }),
  kind: "write",
  preview: async (input) => {
    const { night } = await findNight(count(input, "session", true));
    const body = input.text;
    if (typeof body !== "string") throw new Error("text must be a string.");
    const before = await readRoundNote(night.recapNoteId);
    return {
      target: recapName(night),
      diff: lineDiff(before, body),
      seen: before,
    };
  },
  run: async (input, _context, approved) => {
    const { night } = await findNight(count(input, "session", true));
    const body = input.text;
    if (typeof body !== "string") throw new Error("text must be a string.");
    if (approved?.seen !== undefined) {
      const now = await readRoundNote(night.recapNoteId);
      if (now !== approved.seen) {
        throw new Error(
          "The recap changed after you asked. Read it again with get_session.",
        );
      }
    }
    await writeRoundNote(night.recapNoteId, body);
    window.dispatchEvent(
      new CustomEvent(ROUND_NOTE_WRITTEN, { detail: night.recapNoteId }),
    );
    return `Replaced the recap of session ${night.number}.`;
  },
};

export const sessionTools = [getRound, getSessionTool, writeRecap];
