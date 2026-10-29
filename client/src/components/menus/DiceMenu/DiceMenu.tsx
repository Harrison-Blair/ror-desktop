import { type FormEvent, Fragment, useId, useState } from "react";
import { useToast } from "@/components/Toast/Toast";
import { type DiceResult, parseDiceExpression, rollDice } from "@/lib/dice";
import styles from "./DiceMenu.module.css";

export type DiceRoll = {
  id: number;
  time: Date;
  result: DiceResult;
};

export const DICE_HISTORY_LENGTH = 10;

type DiceMenuProps = {
  rolls: DiceRoll[];
  latest: DiceRoll | undefined;
  onRoll: (result: DiceResult) => void;
  onClearHistory: () => void;
};

const QUICK_SIDES = [2, 3, 4, 6, 8, 10, 12, 20];

const pad = (n: number) => String(n).padStart(2, "0");
const formatTime = (time: Date) =>
  `${pad(time.getHours())}:${pad(time.getMinutes())}`;

type NotationError = { id: number; message: string };

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export function DiceMenu({
  rolls,
  latest,
  onRoll,
  onClearHistory,
}: DiceMenuProps) {
  const id = useId();
  const notify = useToast();
  const [notation, setNotation] = useState("");
  const [notationError, setNotationError] = useState<NotationError | null>(
    null,
  );

  const roll = (expression: string) =>
    onRoll(rollDice(parseDiceExpression(expression)));

  const rollButton = (expression: string) => {
    try {
      roll(expression);
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
    }
  };

  const rollCustom = (event: FormEvent) => {
    event.preventDefault();
    try {
      roll(notation);
      setNotationError(null);
    } catch (e) {
      setNotationError((previous) => ({
        id: (previous?.id ?? 0) + 1,
        message: errorMessage(e),
      }));
    }
  };

  return (
    <div className={styles.menu}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.main}
          onClick={() => rollButton("1d100")}
        >
          <span className={styles.mainLabel}>Roll d100</span>
          <span className={styles.mainHint}>1 to 100</span>
        </button>

        <section className={styles.group} aria-labelledby={`${id}-quick`}>
          <h3 id={`${id}-quick`} className={styles.heading}>
            Quick roll · one die
          </h3>
          <div className={styles.quick}>
            {QUICK_SIDES.map((sides) => (
              <button
                key={sides}
                type="button"
                className={styles.quickButton}
                aria-label={`Roll d${sides}`}
                onClick={() => rollButton(`1d${sides}`)}
              >
                d{sides}
              </button>
            ))}
          </div>
        </section>

        <form className={styles.group} onSubmit={rollCustom}>
          <label htmlFor={`${id}-notation`} className={styles.heading}>
            Custom roll
          </label>
          <div className={styles.custom}>
            <input
              id={`${id}-notation`}
              className={styles.field}
              value={notation}
              placeholder="e.g. 2d6 + 1d30 + 3"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={notationError !== null}
              aria-describedby={notationError ? `${id}-error` : undefined}
              onChange={(event) => {
                setNotation(event.target.value);
                setNotationError(null);
              }}
            />
            <button type="submit" className={styles.rollButton}>
              Roll
            </button>
          </div>
          {notationError && (
            <p
              key={notationError.id}
              id={`${id}-error`}
              role="alert"
              className={styles.error}
            >
              {notationError.message}
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

      <section className={styles.history} aria-labelledby={`${id}-history`}>
        <div className={styles.historyHead}>
          <h3 id={`${id}-history`} className={styles.heading}>
            Last {DICE_HISTORY_LENGTH} rolls
          </h3>
          <button
            type="button"
            className={styles.textButton}
            // aria-disabled, not disabled, so focus stays on the button.
            aria-disabled={rolls.length === 0}
            onClick={() => rolls.length > 0 && onClearHistory()}
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
