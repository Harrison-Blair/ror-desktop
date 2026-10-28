import { type FormEvent, Fragment, useState } from "react";
import { type DiceResult, parseDiceExpression, rollDice } from "@/lib/dice";
import styles from "./DicePanel.module.css";

export type DiceRoll = {
  id: number;
  time: Date;
  result: DiceResult;
};

type DicePanelProps = {
  rolls: DiceRoll[];
  onRoll: (result: DiceResult) => void;
  onClearHistory: () => void;
};

const QUICK_SIDES = [2, 3, 4, 6, 8, 10, 12, 20];

const pad = (n: number) => String(n).padStart(2, "0");
const formatTime = (time: Date) =>
  `${pad(time.getHours())}:${pad(time.getMinutes())}`;

export function DicePanel({ rolls, onRoll, onClearHistory }: DicePanelProps) {
  const [notation, setNotation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const latest = rolls[0];

  const roll = (expression: string) => {
    try {
      onRoll(rollDice(parseDiceExpression(expression)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const rollCustom = (event: FormEvent) => {
    event.preventDefault();
    roll(notation);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.main}
          onClick={() => roll("1d100")}
        >
          <span className={styles.mainLabel}>Roll d100</span>
          <span className={styles.mainHint}>1 to 100</span>
        </button>

        <section className={styles.group} aria-labelledby="dice-quick">
          <h3 id="dice-quick" className={styles.heading}>
            Quick roll · one die
          </h3>
          <div className={styles.quick}>
            {QUICK_SIDES.map((sides) => (
              <button
                key={sides}
                type="button"
                className={styles.quickButton}
                aria-label={`Roll d${sides}`}
                onClick={() => roll(`1d${sides}`)}
              >
                d{sides}
              </button>
            ))}
          </div>
        </section>

        <form className={styles.group} onSubmit={rollCustom}>
          <label htmlFor="dice-notation" className={styles.heading}>
            Custom roll
          </label>
          <div className={styles.custom}>
            <input
              id="dice-notation"
              className={styles.field}
              value={notation}
              placeholder="e.g. 2d6 + 1d30 + 3"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error !== null}
              aria-describedby={error ? "dice-error" : undefined}
              onChange={(event) => setNotation(event.target.value)}
            />
            <button type="submit" className={styles.rollButton}>
              Roll
            </button>
          </div>
          {error && (
            <p id="dice-error" role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </form>
      </div>

      <section
        className={styles.result}
        aria-label="Latest roll"
        aria-live="polite"
      >
        {latest ? (
          // Keyed by roll so a repeat of the same result is announced again.
          <Fragment key={latest.id}>
            <span className={styles.total}>{latest.result.total}</span>
            <span className={styles.breakdown}>
              {latest.result.calculation}
            </span>
          </Fragment>
        ) : (
          <span className={styles.empty}>No rolls yet</span>
        )}
      </section>

      <section className={styles.history} aria-labelledby="dice-history">
        <div className={styles.historyHead}>
          <h3 id="dice-history" className={styles.heading}>
            Last 10 rolls
          </h3>
          <button
            type="button"
            className={styles.textButton}
            disabled={rolls.length === 0}
            onClick={onClearHistory}
          >
            Clear history
          </button>
        </div>
        {rolls.length > 0 ? (
          <ol className={styles.rows}>
            {rolls.map(({ id, time, result }) => (
              <li key={id} className={styles.row}>
                <time className={styles.muted} dateTime={time.toISOString()}>
                  {formatTime(time)}
                </time>
                <span className={styles.muted}>{result.calculation}</span>
                <span className={styles.rowTotal}>{result.total}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>Rolls will appear here.</p>
        )}
      </section>
    </div>
  );
}
