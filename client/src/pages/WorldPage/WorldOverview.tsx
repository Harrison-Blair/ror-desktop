import { useEffect, useId, useRef, useState } from "react";
import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { useToast } from "@/components/Toast/Toast";
import { errorMessage } from "@/lib/errorMessage";
import {
  formatBoxDate,
  gameDateError,
  parseDate,
  periodStart,
} from "@/lib/people";
import { type Character, updateWorld, type World } from "@/lib/peopleApi";

export function WorldOverview({
  data,
  onDirty,
}: {
  data: PeopleData;
  onDirty: (dirty: boolean) => void;
}) {
  if (!data.world) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Overview</h1>
        {data.worldError && (
          <p className={styles.loadError} role="alert">
            {data.worldError}
          </p>
        )}
      </div>
    );
  }
  return (
    <OverviewForm
      world={data.world}
      characters={data.people?.characters ?? NO_CHARACTERS}
      onSaved={data.setWorld}
      onDirty={onDirty}
    />
  );
}

// One empty list while the characters are missing, so a render alone does
// not count as a change of the characters.
const NO_CHARACTERS: Character[] = [];

// The error for a typed game date before the start of a job, the same that
// the save would get.
const jobBlockError = (text: string, characters: Character[]) => {
  const parsed = parseDate(text);
  if (!("date" in parsed)) return undefined;
  for (const person of characters) {
    const job = person.resume.find(
      (job) => periodStart(job.startDate) > parsed.date,
    );
    if (job) {
      return `Game date is before the start of ${person.name}'s job as ${job.job}.`;
    }
  }
  return undefined;
};

// Rust's refusals of a game date: before a job's start or a death date.
const REFUSED_DATE = /^Game date is before /;

const toDraft = (world: World) => ({
  gameDate: formatBoxDate(world.gameDate),
  statNames: world.statNames.map((names) => ({ ...names })),
});

function OverviewForm({
  world,
  characters,
  onSaved,
  onDirty,
}: {
  world: World;
  characters: Character[];
  onSaved: (world: World) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const id = useId();
  const notify = useToast();
  const [draft, setDraft] = useState(() => toDraft(world));
  const [previousWorld, setPreviousWorld] = useState(world);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // A game date that the save refused, with why. The message shows while the
  // box holds that date. It covers characters that this form can't check,
  // as when they failed to load. A change of the characters clears it, since
  // the date may be valid now.
  const [refused, setRefused] = useState<{ date: string; message: string }>();
  const [previousCharacters, setPreviousCharacters] = useState(characters);
  if (characters !== previousCharacters) {
    setRefused(undefined);
    setPreviousCharacters(characters);
  }
  const saving = useRef(false);
  // A reload can finish after this form mounts. Follow it only while the
  // draft still matches its previous source; keep edits and pending saves.
  if (world !== previousWorld) {
    if (
      !busy &&
      JSON.stringify(draft) === JSON.stringify(toDraft(previousWorld))
    ) {
      setDraft(toDraft(world));
    }
    setPreviousWorld(world);
  }
  const dirty =
    busy || JSON.stringify(draft) !== JSON.stringify(toDraft(world));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const refusal = (text: string) => {
    const parsed = parseDate(text);
    return "date" in parsed && parsed.date === refused?.date
      ? refused.message
      : undefined;
  };
  // The errors that this form finds itself. A refusal does not block Save:
  // Rust decides again.
  const dateError = (text: string) =>
    gameDateError(text) ?? jobBlockError(text, characters);
  const error = shown
    ? (dateError(draft.gameDate) ?? refusal(draft.gameDate))
    : undefined;
  const save = async () => {
    if (saving.current) return;
    setShown(true);
    if (dateError(draft.gameDate)) return;
    const parsed = parseDate(draft.gameDate);
    if (!("date" in parsed)) return;
    saving.current = true;
    setBusy(true);
    try {
      const saved = await updateWorld({
        gameDate: parsed.date,
        statNames: draft.statNames,
      });
      onSaved(saved);
      setDraft(toDraft(saved));
      setRefused(undefined);
    } catch (e) {
      const message = errorMessage(e);
      if (REFUSED_DATE.test(message)) {
        setRefused({ date: parsed.date, message });
      } else {
        notify({ kind: "error", message });
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <h1 className={styles.h1}>Overview</h1>
        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={save}
        >
          Save
        </button>
      </div>
      <div className={styles.section}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Game date</span>
          <input
            className={`${styles.input} ${error ? styles.invalid : ""}`}
            type="text"
            placeholder="Day Month Year"
            value={draft.gameDate}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-date-error` : undefined}
            onChange={(e) =>
              setDraft((current) => ({ ...current, gameDate: e.target.value }))
            }
            onBlur={() => {
              const parsed = parseDate(draft.gameDate);
              if ("date" in parsed)
                setDraft((current) => ({
                  ...current,
                  gameDate: formatBoxDate(parsed.date),
                }));
            }}
          />
        </label>
        {error && (
          <span id={`${id}-date-error`} className={styles.fieldError}>
            {error}
          </span>
        )}
      </div>
      <section className={styles.section} aria-labelledby={`${id}-labels`}>
        <h2 id={`${id}-labels`} className={styles.h3}>
          Stat labels
        </h2>
        {draft.statNames.map((names, i) => (
          // The eight pairs have a fixed order.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed stat pairs
          <div key={i} className={styles.labelRow}>
            <span className={styles.fieldLabel}>Stat {i + 1}</span>
            {(["left", "right"] as const).map((side) => (
              <input
                key={side}
                type="text"
                className={styles.input}
                aria-label={`Stat ${i + 1} ${side} name`}
                value={names[side]}
                disabled={busy}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    statNames: current.statNames.map((pair, index) =>
                      index === i ? { ...pair, [side]: e.target.value } : pair,
                    ),
                  }))
                }
              />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
