// biome-ignore-all lint/suspicious/noArrayIndexKey: Dice and history rows are display-only and have no component state.
import { RotateCw } from "lucide-react";
import type {
  WorkspaceController,
  WorkspaceState,
} from "../workspace/controller";
import "../styles/dice.css";

const standardSides = [4, 6, 8, 10, 12, 20, 100];
function Die({ sides, value }: { sides: number; value?: number }) {
  const shape =
    sides === 4
      ? "32,4 60,56 4,56"
      : sides === 6
        ? "12,14 26,4 58,8 58,48 46,58 12,52"
        : sides === 10
          ? "32,2 57,28 32,62 7,28"
          : sides === 8
            ? "32,3 60,32 32,61 4,32"
            : sides === 12
              ? "20,4 44,4 60,22 56,46 32,61 8,46 4,22"
              : sides === 20
                ? "18,5 46,5 61,32 46,59 18,59 3,32"
                : "12,10 50,10 58,18 58,53 12,53 5,45 5,18";
  return (
    <span
      className={`die-shape ${value === undefined ? "die-outline" : "die-face"}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        {sides === 100 ? (
          <>
            <circle cx="32" cy="32" r="27" />
            <ellipse cx="32" cy="32" rx="12" ry="27" />
            <ellipse cx="32" cy="32" rx="27" ry="10" />
          </>
        ) : (
          <>
            <polygon points={shape} />
            {sides === 4 ? (
              <path d="M32 4v35L4 56m28-17 28 17" />
            ) : sides === 6 ? (
              <path d="M12 14 46 18 58 8M46 18v40" />
            ) : sides === 10 ? (
              <path d="M32 2 42 32 32 62 22 32 32 2M7 28l15 4m20 0 15-4" />
            ) : sides === 8 ? (
              <path d="M32 3v58M4 32h56" />
            ) : sides === 12 ? (
              <path d="m32 15 17 12-6 20H21l-6-20 17-12V4M15 27 4 22m17 25L8 46m35 1 13-1M49 27l11-5" />
            ) : sides === 20 ? (
              <path d="m18 5 28 54L3 32h58L18 59 46 5 3 32m58 0L18 5m0 54L46 5" />
            ) : null}
          </>
        )}
      </svg>
      {value !== undefined && (
        <span
          className={
            String(value).length > 4 ? "die-value die-value-long" : "die-value"
          }
        >
          {value}
        </span>
      )}
    </span>
  );
}
export function Dice({
  controller,
  state,
}: {
  controller: WorkspaceController;
  state: WorkspaceState;
}) {
  const { dice, workspace } = state;
  const disabled = dice.rolling || state.busy || !!state.dialog;
  const result = dice.latest;
  return (
    <div className="dice-page">
      <p
        className="dice-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {result ? `Roll ${dice.rollNumber}: ${result.calculation}` : ""}
      </p>
      <h1>Dice</h1>
      <p className="dice-context">
        {workspace
          ? `${workspace.name} · Session history`
          : "Temporary session"}
      </p>
      <h2>Quick roll</h2>
      <div className="dice-quick">
        {standardSides.map((sides) => (
          <button
            type="button"
            key={sides}
            aria-label={`Roll d${sides}`}
            disabled={disabled}
            onClick={() => controller.submitDice(`1d${sides}`)}
          >
            <Die sides={sides} />
            <span>d{sides}</span>
          </button>
        ))}
      </div>
      <form
        className="dice-form"
        onSubmit={(event) => {
          event.preventDefault();
          controller.submitDice();
        }}
      >
        <label htmlFor="dice-expression">Roll expression</label>
        <div className="dice-input-row">
          <input
            id="dice-expression"
            value={dice.input}
            maxLength={200}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!dice.error}
            aria-describedby={dice.error ? "dice-error" : undefined}
            onChange={(event) => controller.editDice(event.target.value)}
          />
          <button type="submit" className="dice-roll" disabled={disabled}>
            Roll
          </button>
        </div>
      </form>
      {dice.error && (
        <p id="dice-error" className="dice-error" role="alert">
          {dice.error}
        </p>
      )}
      {result ? (
        <section
          className={`dice-result${dice.rolling ? " dice-rolling" : ""}`}
          aria-label="Latest roll"
        >
          <div className="dice-result-main">
            <div className="dice-total">
              <span>Total</span>
              <strong>{result.total}</strong>
            </div>
            <div className="dice-faces">
              {result.terms.flatMap(({ term, values }, termIndex) =>
                term.kind === "dice" ? (
                  values.map((value, dieIndex) => (
                    <div
                      className="dice-face-item"
                      key={`${termIndex}-${dieIndex}`}
                    >
                      <Die sides={term.sides} value={value} />
                      <span>
                        {term.sign < 0 ? "−" : ""}d{term.sides}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="dice-modifier" key={`modifier-${termIndex}`}>
                    {term.sign < 0 ? "−" : "+"} {term.value}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="dice-result-footer">
            <p>{result.calculation}</p>
            <button
              type="button"
              className="pill"
              disabled={disabled}
              onClick={() => controller.rerollDice()}
            >
              <RotateCw />
              Roll again
            </button>
          </div>
        </section>
      ) : (
        <div className="dice-result dice-empty">
          Choose a die or enter an expression to roll.
        </div>
      )}
      <div className="dice-history-heading">
        <h2>Recent rolls</h2>
        <button
          type="button"
          disabled={disabled || !dice.history.length}
          onClick={() => controller.clearDiceHistory()}
        >
          Clear history
        </button>
      </div>
      {dice.history.length ? (
        <table className="dice-history">
          <thead>
            <tr>
              <th>Expression</th>
              <th>Results</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {dice.history.map((roll, index) => (
              <tr key={`roll-${dice.history.length - index}`}>
                <td>{roll.spec.expression}</td>
                <td>
                  {roll.terms
                    .map(
                      ({ term, values }, termIndex) =>
                        `${termIndex ? (term.sign < 0 ? " − " : " + ") : term.sign < 0 ? "−" : ""}${term.kind === "dice" ? `(${values.join(", ")})` : term.value}`,
                    )
                    .join("")}
                </td>
                <td>{roll.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="dice-history-empty">Your rolls will appear here.</p>
      )}
    </div>
  );
}
