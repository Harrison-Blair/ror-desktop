import { useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import { formatBoxDate, gameDateError, parseDate } from "@/lib/people";
import { setGameDate, type World } from "@/lib/peopleApi";
import styles from "./WorldMenu.module.css";

// The game date line: click to type a new date. Enter or leaving the box
// saves; Escape cancels. The box stays open while an error shows. When the
// box goes away with a date that wasn't saved (a switch to another tab), a
// toast says so.
function GameDate({
  gameDate,
  onSaved,
}: {
  gameDate: string;
  onSaved: (world: World) => void;
}) {
  const id = useId();
  const notify = useToast();
  const [text, setText] = useState<string | null>(null);
  // The error shows after the first try to save, then follows the typing.
  const [shown, setShown] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  // Set while the box is open, so a blur after Escape or a save does nothing.
  const open = useRef(false);
  const saving = useRef(false);
  // True while a save is pending: the box can't be changed.
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  const notChanged = (message: string) =>
    notify({
      kind: "error",
      message: `The game date was not changed: ${message}`,
    });

  const start = () => {
    open.current = true;
    setText(formatBoxDate(gameDate));
    setShown(false);
    setSaveError(undefined);
  };
  const close = () => {
    open.current = false;
    setText(null);
  };

  const commit = async () => {
    if (!open.current || saving.current || text === null) return;
    const parsed = parseDate(text);
    const error = gameDateError(text);
    if (error || !("date" in parsed)) {
      // When the box went away, the date is dropped.
      if (!mounted.current) notChanged(error ?? "Not a real date.");
      else setShown(true);
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      onSaved(await setGameDate(parsed.date));
      close();
    } catch (e) {
      if (mounted.current) setSaveError(errorMessage(e));
      else notChanged(errorMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  // When the box goes away while open, as on a switch to another tab, the
  // typed date is still saved, or a toast says why not. A save in progress
  // reports its own failure.
  const latestCommit = useRef(commit);
  latestCommit.current = commit;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      latestCommit.current();
    };
  }, []);

  // A failed save opens the box for typing again.
  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);

  if (text === null) {
    return (
      <button
        type="button"
        className={styles.gameDate}
        title="Change game date"
        onClick={start}
      >
        Game date · {formatBoxDate(gameDate)}
      </button>
    );
  }

  const error = (shown ? gameDateError(text) : undefined) ?? saveError;
  return (
    <div className={styles.box}>
      <label className={styles.label} htmlFor={`${id}-box`}>
        Game date
      </label>
      <input
        ref={input}
        id={`${id}-box`}
        className={`${styles.input} ${error ? styles.invalid : ""}`}
        type="text"
        placeholder="Day Month Year"
        value={text}
        disabled={busy}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        // biome-ignore lint/a11y/noAutofocus: the box opens on a click
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          setSaveError(undefined);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      />
      {error && (
        <span id={`${id}-error`} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}

export type WorldSection = "people";

// The World rail panel: the game date and the sections. Only People of
// interest is built so far.
export function WorldMenu({
  gameDate,
  onGameDateSaved,
  section,
  onSelect,
}: {
  // Undefined until the world is loaded, or when it can't be.
  gameDate: string | undefined;
  onGameDateSaved: (world: World) => void;
  section: WorldSection;
  onSelect: (section: WorldSection) => void;
}) {
  return (
    <>
      {gameDate !== undefined && (
        <GameDate gameDate={gameDate} onSaved={onGameDateSaved} />
      )}
      <button
        type="button"
        className={styles.item}
        aria-pressed={section === "people"}
        onClick={() => onSelect("people")}
      >
        People of interest
      </button>
    </>
  );
}
