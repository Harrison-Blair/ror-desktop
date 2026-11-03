import {
  BookOpen,
  ChevronRight,
  ChevronsRight,
  File,
  Flag,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Shuffle,
  Undo2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import { gameDateError, parseDate } from "@/lib/people";
import type { Character, World } from "@/lib/peopleApi";
import {
  characterName,
  clockLeft,
  clockState,
  endTurnQuestion,
  formatClock,
  formatSpan,
  INTERTERM_LABEL,
  LENGTHS,
  lastLine,
  longDate,
  nextOf,
  nextRoundQuestion,
  nowOf,
  parseClock,
  period,
  runningNight,
  sinceLine,
  usedAt,
} from "@/lib/session";
import {
  type Night,
  type Round,
  setGameDate,
  type Turn,
} from "@/lib/sessionApi";
import { OrderDialog } from "./OrderDialog";
import styles from "./Session.module.css";
import type { TableData } from "./useTable";

const ICON = 14;

// What the Overview can open.
export type OverviewNav = {
  openNote: (noteId: string, title: string) => void;
  openRecap: (night: Night) => void;
  readRound: (round: Round) => void;
};

type Question = {
  title: string;
  message: string;
  label: string;
  run: () => void;
};

// "Ana · Marie Dubois", with the person in bold.
export function Who({
  name,
  character,
}: {
  name: string;
  character: string | null;
}) {
  return (
    <>
      <b>{name}</b>
      {character && <span className={styles.char}> · {character}</span>}
    </>
  );
}

// The play-night line: the running night, or Start session.
export function NightLine({
  table,
  nights,
  now,
  onRecap,
}: {
  table: TableData;
  nights: Night[];
  now: number;
  onRecap: (night: Night) => void;
}) {
  const running = runningNight(nights);
  const last = nights.length ? nights[nights.length - 1] : undefined;
  return (
    <section className={styles.night} aria-label="Play night">
      <span className={`${styles.dot} ${running ? "" : styles.off}`} />
      {running ? (
        <>
          <span className={styles.nightLabel}>Session {running.number}</span>
          <span className={styles.nightMeta}>{sinceLine(running, now)}</span>
          <button
            type="button"
            className={styles.link}
            onClick={() => onRecap(running)}
          >
            Recap <ChevronRight size={12} aria-hidden />
          </button>
        </>
      ) : (
        <>
          <span className={styles.nightLabel}>No session running</span>
          {last && <span className={styles.nightMeta}>{lastLine(last)}</span>}
        </>
      )}
      <div className={styles.spacer} />
      {running ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.small} ${styles.quiet}`}
          onClick={() => table.act({ type: "endNight" })}
        >
          End session
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.btn} ${styles.small}`}
          onClick={() => table.act({ type: "startNight" })}
        >
          Start session
        </button>
      )}
    </section>
  );
}

// Session › Overview: the play night, who is "now" and the current round.
export function Overview({
  table,
  people,
  now,
  nav,
  onDateDirty,
}: {
  table: TableData;
  people: PeopleData;
  now: number;
  nav: OverviewNav;
  onDateDirty: (dirty: boolean) => void;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [ordering, setOrdering] = useState(false);
  const snapshot = table.snapshot;
  if (!snapshot) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Overview</h1>
        {table.error && (
          <p className={styles.loadError} role="alert">
            {table.error}
          </p>
        )}
      </div>
    );
  }
  const round = snapshot.rounds[snapshot.rounds.length - 1];
  const characters = people.people?.characters;
  const ask = (q: Question) => setQuestion(q);

  return (
    <div className={styles.page}>
      <h1 className={styles.hidden}>Overview</h1>
      <NightLine
        table={table}
        nights={snapshot.nights}
        now={now}
        onRecap={nav.openRecap}
      />
      <NowCard
        table={table}
        round={round}
        characters={characters}
        usualSeconds={snapshot.usualSeconds}
        now={now}
        ask={ask}
        nav={nav}
        onAddPlayers={() => setOrdering(true)}
      />
      <RoundBox
        table={table}
        people={people}
        round={round}
        usualSeconds={snapshot.usualSeconds}
        now={now}
        ask={ask}
        nav={nav}
        onEditOrder={() => setOrdering(true)}
        onDateDirty={onDateDirty}
      />
      {question && (
        <ConfirmDialog
          title={question.title}
          message={question.message}
          confirmLabel={question.label}
          onConfirm={() => {
            setQuestion(null);
            question.run();
          }}
          onCancel={() => setQuestion(null)}
        />
      )}
      {ordering && (
        <OrderDialog
          round={round}
          characters={characters ?? []}
          onCancel={() => setOrdering(false)}
          onSave={async (players, usual) => {
            if (
              await table.act({
                type: "saveOrder",
                roundId: round.id,
                players,
                usual,
              })
            ) {
              setOrdering(false);
            }
          }}
        />
      )}
    </div>
  );
}

const btn = (...extra: string[]) => [styles.btn, ...extra].join(" ");

// Ends the turn, asking first before 0:00.
const endTurn = (
  table: TableData,
  turn: Turn,
  now: number,
  ask: (q: Question) => void,
) => {
  const run = () => table.act({ type: "endTurn", turnId: turn.id });
  const q = endTurnQuestion(turn, now);
  if (q) ask({ ...q, label: "End turn", run });
  else run();
};

// Moves on to the next round, asking first while a turn has not ended.
export const nextRound = (
  table: TableData,
  round: Round,
  ask: (q: Question) => void,
) => {
  const run = () => table.act({ type: "nextRound", roundId: round.id });
  const q = nextRoundQuestion(round);
  if (q) ask({ ...q, label: "Close round", run });
  else run();
};

function NowCard({
  table,
  round,
  characters,
  usualSeconds,
  now,
  ask,
  nav,
  onAddPlayers,
}: {
  table: TableData;
  round: Round;
  characters: Character[] | undefined;
  usualSeconds: number;
  now: number;
  ask: (q: Question) => void;
  nav: OverviewNav;
  onAddPlayers: () => void;
}) {
  const current = nowOf(round);
  if (round.turns.length === 0) {
    return (
      <section className={styles.now} aria-label="Now">
        <div className={styles.nowHead}>
          <span className={styles.eyebrow}>NOW</span>
          <h2 className={styles.who}>No players yet</h2>
          <span className={styles.next}>
            Add the players in their usual turn order.
          </span>
        </div>
        <div />
        <div className={styles.acts}>
          <button
            type="button"
            className={btn(styles.primary)}
            onClick={onAddPlayers}
          >
            Add players
          </button>
        </div>
      </section>
    );
  }
  if (current.kind === "interterm") {
    return (
      <section className={styles.now} aria-label="Now">
        <div className={styles.nowHead}>
          <span className={styles.eyebrow}>NOW · INTERTERM</span>
          <h2 className={styles.who}>
            <Who name="GM" character="Interterm" />
          </h2>
          <span className={styles.next}>
            Every turn has ended. The interterm is not timed.
          </span>
        </div>
        <div className={styles.clock}>
          <span className={styles.clockState}>Untimed</span>
        </div>
        <div className={styles.acts}>
          <button
            type="button"
            className={btn(styles.quiet)}
            onClick={() =>
              nav.openNote(round.interterm.noteId, INTERTERM_LABEL)
            }
          >
            <File size={ICON} aria-hidden /> Open interterm note
          </button>
        </div>
        <div className={styles.timerActs}>
          <button
            type="button"
            className={btn(styles.primary)}
            onClick={() => nextRound(table, round, ask)}
          >
            <ChevronsRight size={ICON} aria-hidden /> Next round
          </button>
        </div>
      </section>
    );
  }
  if (current.kind !== "turn") return null;
  const { turn, index } = current;
  const state = clockState(turn.clock, now);
  const left = clockLeft(turn.clock, now);
  const next = nextOf(round, characters);
  const character = characterName(turn.characterId, characters);
  const label = character ? `${turn.name} · ${character}` : turn.name;
  const act = (type: "start" | "pause" | "resume" | "reset") =>
    table.act({ type, turnId: turn.id });
  const stateLine = {
    notStarted: "Not started",
    running: `Running · ${formatClock(usualSeconds * 1000)} per turn`,
    paused: "Paused · Enter sets the time left for this turn",
    atZero: "Time is up",
  }[state];

  return (
    <section
      className={`${styles.now} ${state === "atZero" ? styles.zero : ""}`}
      aria-label="Now"
    >
      <div className={styles.nowHead}>
        <span className={styles.eyebrow}>
          NOW · TURN {index + 1} OF {round.turns.length}
        </span>
        <h2 className={styles.who}>
          <Who name={turn.name} character={character} />
        </h2>
        <span className={styles.next}>
          Next: <b>{next[0]}</b>
          {next[1] && `, then ${next[1]}`}
        </span>
      </div>
      <div className={styles.clock}>
        {state === "paused" ? (
          <TimeLeftInput
            key={`${turn.id}-${turn.clock.leftMs}`}
            leftMs={left}
            onSet={(seconds) =>
              table.act({ type: "setLeft", turnId: turn.id, seconds })
            }
          />
        ) : (
          <span className={styles.time} role="timer" aria-label="Time left">
            {formatClock(left)}
          </span>
        )}
        <span className={styles.clockState}>{stateLine}</span>
      </div>
      <div className={styles.acts}>
        <button
          type="button"
          className={btn(styles.quiet)}
          onClick={() => nav.openNote(turn.noteId, label)}
        >
          <File size={ICON} aria-hidden /> Open turn note
        </button>
        <button
          type="button"
          className={btn(
            state === "atZero" ? styles.alert : "",
            state === "notStarted" ? styles.quiet : "",
          )}
          onClick={() => endTurn(table, turn, now, ask)}
        >
          <Flag size={ICON} aria-hidden /> End turn
        </button>
      </div>
      <div className={styles.timerActs}>
        {state === "notStarted" && (
          <button
            type="button"
            className={btn(styles.primary)}
            onClick={() => act("start")}
          >
            <Play size={ICON} aria-hidden /> Start
          </button>
        )}
        {state === "running" && (
          <button
            type="button"
            className={btn(styles.small)}
            onClick={() => act("pause")}
          >
            <Pause size={ICON} aria-hidden /> Pause
          </button>
        )}
        {state === "paused" && (
          <button
            type="button"
            className={btn(styles.small)}
            onClick={() => act("resume")}
          >
            <Play size={ICON} aria-hidden /> Resume
          </button>
        )}
        {state !== "notStarted" && (
          <button
            type="button"
            className={btn(styles.small, styles.quiet)}
            onClick={() => act("reset")}
          >
            <RotateCcw size={ICON} aria-hidden /> Reset
          </button>
        )}
      </div>
    </section>
  );
}

// The time left of a paused turn, edited in place. Enter sets it.
function TimeLeftInput({
  leftMs,
  onSet,
}: {
  leftMs: number;
  onSet: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState(formatClock(leftMs));
  const [invalid, setInvalid] = useState(false);
  return (
    <input
      className={`${styles.timeEdit} ${invalid ? styles.invalid : ""}`}
      aria-label="Time left"
      aria-invalid={invalid}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        setInvalid(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(formatClock(leftMs));
          setInvalid(false);
        }
        if (e.key !== "Enter") return;
        const seconds = parseClock(draft);
        if (seconds === null || seconds < 1) {
          setInvalid(true);
          return;
        }
        onSet(seconds);
      }}
    />
  );
}

function RoundBox({
  table,
  people,
  round,
  usualSeconds,
  now,
  ask,
  nav,
  onEditOrder,
  onDateDirty,
}: {
  table: TableData;
  people: PeopleData;
  round: Round;
  usualSeconds: number;
  now: number;
  ask: (q: Question) => void;
  nav: OverviewNav;
  onEditOrder: () => void;
  onDateDirty: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState<"date" | "timer" | null>(null);
  const characters = people.people?.characters;
  const current = nowOf(round);
  const usualMs = usualSeconds * 1000;
  const gameDate = people.world?.gameDate;

  return (
    <section className={styles.box} aria-label="Round">
      <div className={styles.roundHead}>
        <div className={styles.roundLine}>
          <h2 className={styles.roundTitle}>Round {round.number}</h2>
          <div
            className={styles.segs}
            role="radiogroup"
            aria-label="Round length"
          >
            {LENGTHS.map(({ id, label }) => (
              // biome-ignore lint/a11y/useSemanticElements: a segmented control
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={round.length === id}
                className={styles.seg}
                onClick={() =>
                  round.length !== id &&
                  table.act({
                    type: "setLength",
                    roundId: round.id,
                    length: id,
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <span className={styles.mono}>{period(round.start, round.end)}</span>
          <span className={styles.status}>Open</span>
          <div className={styles.spacer} />
          <button
            type="button"
            className={btn(styles.small, styles.quiet)}
            onClick={() => setEditing("date")}
            disabled={editing === "date" || !gameDate}
          >
            <Pencil size={ICON} aria-hidden /> Edit date
          </button>
        </div>
        <div className={styles.roundLine}>
          {editing === "date" && gameDate ? (
            <DateEdit
              gameDate={gameDate}
              onDone={(world) => {
                if (world) people.setWorld(world);
                setEditing(null);
              }}
              onDirty={onDateDirty}
            />
          ) : (
            <span className={styles.roundMeta}>
              Game date {gameDate ? longDate(gameDate) : "not loaded"}
            </span>
          )}
          <span className={styles.roundMeta}>·</span>
          {editing === "timer" ? (
            <TimerEdit
              usualSeconds={usualSeconds}
              onSave={async (seconds) => {
                if (await table.act({ type: "setUsual", seconds })) {
                  setEditing(null);
                }
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <>
              <span className={styles.roundMeta}>
                Timer{" "}
                <span className={`${styles.mono} ${styles.value}`}>
                  {formatClock(usualMs)}
                </span>{" "}
                per turn
              </span>
              <button
                type="button"
                className={btn(styles.small, styles.quiet)}
                aria-label="Edit timer length"
                onClick={() => setEditing("timer")}
              >
                <Pencil size={ICON} aria-hidden /> Edit
              </button>
            </>
          )}
          <div className={styles.spacer} />
          <button
            type="button"
            className={btn(styles.small, styles.quiet)}
            onClick={() => table.act({ type: "shuffle", roundId: round.id })}
          >
            <Shuffle size={ICON} aria-hidden /> Shuffle
          </button>
          <button
            type="button"
            className={btn(styles.small, styles.quiet)}
            onClick={onEditOrder}
          >
            Edit order
          </button>
        </div>
      </div>
      <TurnRows
        round={round}
        characters={characters}
        usualMs={usualMs}
        now={now}
        nav={nav}
        onMakeNow={(turn) => table.act({ type: "makeNow", turnId: turn.id })}
        onReopen={(turn) => table.act({ type: "reopenTurn", turnId: turn.id })}
      />
      <div className={styles.roundFoot}>
        <button
          type="button"
          className={btn(styles.small, styles.quiet)}
          onClick={() => nav.readRound(round)}
        >
          <BookOpen size={ICON} aria-hidden /> Read whole round
        </button>
        <div className={styles.spacer} />
        <button
          type="button"
          className={btn(
            styles.small,
            current.kind === "interterm" ? styles.primary : "",
          )}
          onClick={() => nextRound(table, round, ask)}
        >
          <ChevronsRight size={ICON} aria-hidden /> Next round
        </button>
      </div>
    </section>
  );
}

// One row per turn, then the interterm. Without `onMakeNow` and `onReopen`
// the rows only open notes.
export function TurnRows({
  round,
  characters,
  usualMs,
  now,
  nav,
  onMakeNow,
  onReopen,
}: {
  round: Round;
  characters: Character[] | undefined;
  usualMs: number;
  now: number;
  nav: Pick<OverviewNav, "openNote">;
  onMakeNow?: (turn: Turn) => void;
  onReopen?: (turn: Turn) => void;
}) {
  const row = (
    key: string,
    position: number,
    who: ReactNode,
    label: string,
    stateName: "Now" | "Waiting" | "Ended",
    used: ReactNode,
    acts: ReactNode,
    onPick?: () => void,
  ) => (
    <div
      key={key}
      className={[
        styles.row,
        stateName === "Now" ? styles.isNow : "",
        stateName === "Ended" ? styles.ended : "",
      ].join(" ")}
    >
      <span className={styles.pos}>{position}</span>
      {onPick ? (
        <button
          type="button"
          className={styles.name}
          aria-label={`Make ${label} now`}
          onClick={onPick}
        >
          {who}
        </button>
      ) : (
        <span className={styles.name}>{who}</span>
      )}
      <span
        className={[
          styles.state,
          stateName === "Now" ? styles.isNow : "",
          stateName === "Ended" ? styles.ended : "",
        ].join(" ")}
      >
        {stateName}
      </span>
      {used}
      <div className={styles.rowActs}>{acts}</div>
    </div>
  );
  const open = (noteId: string, label: string) => (
    <button
      type="button"
      className={btn(styles.small, styles.quiet)}
      aria-label={`Open ${label} note`}
      onClick={() => nav.openNote(noteId, label)}
    >
      <File size={ICON} aria-hidden /> Open
    </button>
  );

  return (
    <>
      {round.turns.map((turn, i) => {
        const character = characterName(turn.characterId, characters);
        const label = character ? `${turn.name} · ${character}` : turn.name;
        const isNow = round.nowId === turn.id;
        const stateName =
          turn.state === "ended" ? "Ended" : isNow ? "Now" : "Waiting";
        const used = usedAt(turn, now);
        const usedText =
          used > 0
            ? `used ${formatSpan(used)} of ${formatClock(usualMs)}`
            : isNow && turn.clock.state === "notStarted"
              ? "not started"
              : "";
        return row(
          turn.id,
          i + 1,
          <Who name={turn.name} character={character} />,
          label,
          stateName,
          <span
            className={`${styles.used} ${used > usualMs ? styles.over : ""}`}
          >
            {usedText}
          </span>,
          <>
            {turn.state === "ended" && onReopen && (
              <button
                type="button"
                className={btn(styles.small, styles.quiet)}
                aria-label={`Reopen ${label}`}
                onClick={() => onReopen(turn)}
              >
                <Undo2 size={ICON} aria-hidden /> Reopen
              </button>
            )}
            {open(turn.noteId, label)}
          </>,
          stateName === "Waiting" && onMakeNow
            ? () => onMakeNow(turn)
            : undefined,
        );
      })}
      {row(
        round.interterm.id,
        round.turns.length + 1,
        <Who name="GM" character="Interterm" />,
        INTERTERM_LABEL,
        round.interterm.state === "ended"
          ? "Ended"
          : round.nowId === round.interterm.id
            ? "Now"
            : "Waiting",
        <span className={styles.used}>untimed</span>,
        open(round.interterm.noteId, INTERTERM_LABEL),
      )}
    </>
  );
}

function TimerEdit({
  usualSeconds,
  onSave,
  onCancel,
}: {
  usualSeconds: number;
  onSave: (seconds: number) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(formatClock(usualSeconds * 1000));
  const [invalid, setInvalid] = useState(false);
  const save = () => {
    const seconds = parseClock(draft);
    if (seconds === null || seconds < 1) {
      setInvalid(true);
      return;
    }
    onSave(seconds);
  };
  return (
    <span className={styles.inlineEdit}>
      <span className={styles.roundMeta}>Timer</span>
      <input
        className={`${styles.input} ${styles.lengthInput} ${invalid ? styles.invalid : ""}`}
        aria-label="Timer length per turn"
        aria-invalid={invalid}
        value={draft}
        // biome-ignore lint/a11y/noAutofocus: opened by Edit
        autoFocus
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
      />
      <button type="button" className={btn(styles.small)} onClick={save}>
        Save
      </button>
      <button
        type="button"
        className={btn(styles.small, styles.quiet)}
        onClick={onCancel}
      >
        Cancel
      </button>
    </span>
  );
}

// Edit date: changes only the game date. The round keeps its period.
function DateEdit({
  gameDate,
  onDone,
  onDirty,
}: {
  gameDate: string;
  onDone: (world?: World) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const notify = useToast();
  const [draft, setDraft] = useState(longDate(gameDate));
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = shown ? gameDateError(draft) : undefined;
  const dirty = draft !== longDate(gameDate) || busy;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const save = async () => {
    setShown(true);
    const parsed = parseDate(draft);
    if (gameDateError(draft) || !("date" in parsed)) return;
    setBusy(true);
    try {
      onDone(await setGameDate(parsed.date));
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <span className={styles.inlineEdit}>
      <span className={styles.roundMeta}>Game date</span>
      <input
        className={`${styles.input} ${styles.dateInput} ${error ? styles.invalid : ""}`}
        aria-label="Game date"
        aria-invalid={!!error}
        aria-describedby={error ? "session-date-error" : undefined}
        placeholder="Day Month Year"
        value={draft}
        disabled={busy}
        // biome-ignore lint/a11y/noAutofocus: opened by Edit date
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onDone();
        }}
      />
      <button
        type="button"
        className={btn(styles.small)}
        disabled={busy}
        onClick={save}
      >
        Save
      </button>
      <button
        type="button"
        className={btn(styles.small, styles.quiet)}
        disabled={busy}
        onClick={() => onDone()}
      >
        Cancel
      </button>
      {error && (
        <span id="session-date-error" className={styles.fieldError}>
          {error}
        </span>
      )}
    </span>
  );
}
