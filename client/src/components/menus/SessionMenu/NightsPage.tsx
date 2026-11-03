import { File } from "lucide-react";
import { useEffect, useState } from "react";
import { nightRounds, nightTimes, playedOn } from "@/lib/session";
import { type Night, type Round, readRoundNote } from "@/lib/sessionApi";
import { NightLine } from "./Overview";
import styles from "./Session.module.css";
import type { TableData } from "./useTable";

// The first line of a recap with text, without Markdown marks.
const firstLine = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/^[#>*\-\s]+/, "").trim())
    .find((line) => line) ?? "";

// Session › Sessions: the play nights, newest first.
export function NightsPage({
  table,
  nights,
  rounds,
  now,
  onRecap,
}: {
  table: TableData;
  nights: Night[];
  rounds: Round[];
  now: number;
  onRecap: (night: Night) => void;
}) {
  const newest = [...nights].reverse();
  const ids = newest.map((n) => n.recapNoteId).join(",");
  const [recaps, setRecaps] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    if (!ids) return;
    Promise.allSettled(
      ids.split(",").map(async (id) => [id, await readRoundNote(id)] as const),
    ).then((read) => {
      if (!alive) return;
      setRecaps(
        Object.fromEntries(
          read.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [ids]);

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Sessions</h1>
      <NightLine table={table} nights={nights} now={now} onRecap={onRecap} />
      {newest.length === 0 ? (
        <p className={styles.muted}>No sessions yet.</p>
      ) : (
        <section className={styles.table} aria-label="Sessions">
          <div className={`${styles.tr} ${styles.nights} ${styles.head}`}>
            {["Session", "Played", "Time", "Rounds", "Recap", ""].map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          {newest.map((night) => {
            const recap = firstLine(recaps[night.recapNoteId] ?? "");
            return (
              <div
                key={night.id}
                className={`${styles.tr} ${styles.nights} ${night.endedAt === null ? styles.cur : ""}`}
              >
                <span className={`${styles.cell} ${styles.first}`}>
                  Session {night.number}
                </span>
                <span className={styles.mono}>{playedOn(night.startedAt)}</span>
                <span className={`${styles.cell} ${styles.mono}`}>
                  {nightTimes(night)}
                </span>
                <span className={styles.mono}>
                  {nightRounds(night, rounds)}
                </span>
                <span className={`${styles.cell} ${styles.recap}`}>
                  {recap || "No recap yet"}
                </span>
                <span className={styles.endCell}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.small} ${styles.quiet}`}
                    aria-label={`Session ${night.number} recap`}
                    onClick={() => onRecap(night)}
                  >
                    <File size={14} aria-hidden /> Recap
                  </button>
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
