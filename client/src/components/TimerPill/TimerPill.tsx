import { Pause, Play } from "lucide-react";
import {
  type TableData,
  useNow,
} from "@/components/menus/SessionMenu/useTable";
import { clockLeft, formatLeft, isOver, pillTurn } from "@/lib/session";
import styles from "./TimerPill.module.css";

// The turn timer over the main panel, on every tab: the time and a
// pause/play button. Shown while the "now" turn's timer runs or is paused,
// also in overtime ("+0:42", in the alert style); hidden before Start and
// during the interterm. A click on the time opens Session › Overview.
export function TimerPill({
  table,
  onOpen,
}: {
  table: TableData;
  onOpen: () => void;
}) {
  const turn = table.snapshot ? pillTurn(table.snapshot.rounds) : undefined;
  const now = useNow(turn?.clock.state === "running");
  if (!turn) return null;
  const state = turn.clock.state;
  const left = formatLeft(clockLeft(turn.clock, now));
  return (
    <div
      className={[
        styles.pill,
        state === "paused" ? styles.paused : "",
        isOver(turn.clock, now) ? styles.zero : "",
      ].join(" ")}
      role="timer"
      aria-label="Turn timer"
    >
      <button
        type="button"
        className={styles.time}
        aria-label={`${left}, open Session overview`}
        onClick={onOpen}
      >
        {left}
      </button>
      {state === "running" && (
        <button
          type="button"
          className={styles.button}
          aria-label="Pause timer"
          onClick={() => table.act({ type: "pause", turnId: turn.id })}
        >
          <Pause size={16} aria-hidden />
        </button>
      )}
      {state === "paused" && (
        <button
          type="button"
          className={styles.button}
          aria-label="Resume timer"
          onClick={() => table.act({ type: "resume", turnId: turn.id })}
        >
          <Play size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
