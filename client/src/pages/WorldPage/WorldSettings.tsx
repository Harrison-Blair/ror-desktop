import { useId } from "react";
import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";
import type { PeopleData } from "@/components/menus/PeopleMenu/usePeople";
import type { World } from "@/lib/peopleApi";
import { useWorldForm } from "./useWorldForm";

// World › Settings: the stat labels.
export function WorldSettings({
  data,
  onDirty,
}: {
  data: PeopleData;
  onDirty: (dirty: boolean) => void;
}) {
  if (!data.world) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Settings</h1>
        {data.worldError && (
          <p className={styles.loadError} role="alert">
            {data.worldError}
          </p>
        )}
      </div>
    );
  }
  return (
    <SettingsForm
      world={data.world}
      onSaved={data.setWorld}
      onDirty={onDirty}
    />
  );
}

const toDraft = (world: World) =>
  world.statNames.map((names) => ({ ...names }));

function SettingsForm({
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
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <h1 className={styles.h1}>Settings</h1>
        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => save({ gameDate: world.gameDate, statNames: draft })}
        >
          Save
        </button>
      </div>
      <section className={styles.section} aria-labelledby={`${id}-labels`}>
        <h2 id={`${id}-labels`} className={styles.h3}>
          Stat labels
        </h2>
        {draft.map((names, i) => (
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
                  setDraft((current) =>
                    current.map((pair, index) =>
                      index === i ? { ...pair, [side]: e.target.value } : pair,
                    ),
                  )
                }
              />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
