import { BookOpen, Undo2 } from "lucide-react";
import type { Character } from "@/lib/peopleApi";
import { formatClock, lengthLabel, period, roundNights } from "@/lib/session";
import type { Night, Round } from "@/lib/sessionApi";
import { TurnRows } from "./Overview";
import styles from "./Session.module.css";
import type { TableData } from "./useTable";

// Session › Rounds: every round, newest first.
export function RoundsList({
  rounds,
  nights,
  onOpen,
}: {
  rounds: Round[];
  nights: Night[];
  onOpen: (round: Round) => void;
}) {
  const newest = [...rounds].reverse();
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Rounds</h1>
      <section className={styles.table} aria-label="Rounds">
        <div className={`${styles.tr} ${styles.rounds} ${styles.head}`}>
          {["Round", "Period", "Length", "Status", "Turns", "Sessions", ""].map(
            (h) => (
              <span key={h}>{h}</span>
            ),
          )}
        </div>
        {newest.map((round, i) => {
          const ended = round.turns.filter((t) => t.state === "ended").length;
          return (
            <div
              key={round.id}
              className={`${styles.tr} ${styles.rounds} ${i === 0 ? styles.cur : ""}`}
            >
              <span className={`${styles.cell} ${styles.first}`}>
                Round {round.number}
              </span>
              <span className={`${styles.cell} ${styles.mono}`}>
                {period(round.start, round.end)}
              </span>
              <span>{lengthLabel(round.length)}</span>
              <span>
                <span
                  className={`${styles.status} ${round.status === "closed" ? styles.closed : ""}`}
                >
                  {round.status === "open" ? "Open" : "Closed"}
                </span>
              </span>
              <span className={styles.mono}>
                {ended} of {round.turns.length} ended
              </span>
              <span className={`${styles.cell} ${styles.mono}`}>
                {roundNights(round, nights)}
              </span>
              <span className={styles.endCell}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.small} ${styles.quiet}`}
                  aria-label={`Open round ${round.number}`}
                  onClick={() => onOpen(round)}
                >
                  Open
                </button>
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// One round with its turns, notes, time used and interterm. A closed round
// offers Reopen; a reopened round that is not the current one offers Close
// again.
export function RoundDetail({
  table,
  round,
  current,
  characters,
  usualSeconds,
  now,
  onBack,
  onOpenNote,
  onRead,
}: {
  table: TableData;
  round: Round;
  current: boolean;
  characters: Character[] | undefined;
  usualSeconds: number;
  now: number;
  onBack: () => void;
  onOpenNote: (noteId: string, title: string) => void;
  onRead: () => void;
}) {
  const closed = round.status === "closed";
  return (
    <div className={styles.page}>
      <div className={styles.noteHead}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← Rounds
        </button>
      </div>
      <section className={styles.box} aria-label="Round">
        <div className={styles.roundHead}>
          <div className={styles.roundLine}>
            <h1 className={styles.roundTitle}>Round {round.number}</h1>
            <span className={styles.roundMeta}>
              {lengthLabel(round.length)}
            </span>
            <span className={styles.mono}>
              {period(round.start, round.end)}
            </span>
            <span className={`${styles.status} ${closed ? styles.closed : ""}`}>
              {closed ? "Closed" : "Open"}
            </span>
            <div className={styles.spacer} />
            {closed && (
              <button
                type="button"
                className={`${styles.btn} ${styles.small}`}
                onClick={() =>
                  table.act({ type: "reopenRound", roundId: round.id })
                }
              >
                <Undo2 size={14} aria-hidden /> Reopen
              </button>
            )}
            {!closed && !current && (
              <button
                type="button"
                className={`${styles.btn} ${styles.small}`}
                onClick={() =>
                  table.act({ type: "closeRound", roundId: round.id })
                }
              >
                Close again
              </button>
            )}
          </div>
          {current && (
            <p className={styles.muted}>
              The current round. Run it from Overview. Timer{" "}
              {formatClock(usualSeconds * 1000)} per turn.
            </p>
          )}
        </div>
        <TurnRows
          round={round}
          characters={characters}
          usualMs={usualSeconds * 1000}
          now={now}
          nav={{ openNote: onOpenNote }}
        />
        <div className={styles.roundFoot}>
          <button
            type="button"
            className={`${styles.btn} ${styles.small} ${styles.quiet}`}
            onClick={onRead}
          >
            <BookOpen size={14} aria-hidden /> Read whole round
          </button>
        </div>
      </section>
    </div>
  );
}
