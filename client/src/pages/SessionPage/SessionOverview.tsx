import { useId, useState } from "react";
import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import { formatBoxDate, gameDateError, parseDate } from "@/lib/people";
import type { World } from "@/lib/peopleApi";
import { useWorldForm } from "@/pages/WorldPage/useWorldForm";

// Session › Overview: the game date.
export function SessionOverview({
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
      onSaved={data.setWorld}
      onDirty={onDirty}
    />
  );
}

const toDraft = (world: World) => formatBoxDate(world.gameDate);

function OverviewForm({
  world,
  onSaved,
  onDirty,
}: {
  world: World;
  onSaved: (world: World) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const id = useId();
  const { draft, setDraft, busy, save } = useWorldForm({
    world,
    toDraft,
    onSaved,
    onDirty,
  });
  const [shown, setShown] = useState(false);
  const error = shown ? gameDateError(draft) : undefined;
  const submit = () => {
    setShown(true);
    const parsed = parseDate(draft);
    if (gameDateError(draft) || !("date" in parsed)) return;
    save({ gameDate: parsed.date, statNames: world.statNames });
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
          onClick={submit}
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
            value={draft}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-date-error` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const parsed = parseDate(draft);
              if ("date" in parsed) setDraft(formatBoxDate(parsed.date));
            }}
          />
        </label>
        {error && (
          <span id={`${id}-date-error`} className={styles.fieldError}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
