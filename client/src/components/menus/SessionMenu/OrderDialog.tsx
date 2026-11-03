import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import type { Character } from "@/lib/peopleApi";
import type { PlayerInput, Round } from "@/lib/sessionApi";
import styles from "./Session.module.css";

type Row = PlayerInput & { key: string };

let nextKey = 0;
const newKey = () => `new-${++nextKey}`;

// Edit order: the round's players in order. Each has a name and the
// character they play, picked from People. Save then asks whether the change
// is for this round only or the usual order too.
export function OrderDialog({
  round,
  characters,
  onSave,
  onCancel,
}: {
  round: Round;
  characters: Character[];
  // Resolves to why the save was refused, or null.
  onSave: (players: PlayerInput[], usual: boolean) => Promise<string | null>;
  onCancel: () => void;
}) {
  const id = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    round.turns.length
      ? round.turns.map((t) => ({
          key: t.id,
          id: t.playerId,
          name: t.name,
          characterId: t.characterId,
        }))
      : [{ key: newKey(), id: null, name: "", characterId: null }],
  );
  const [step, setStep] = useState<"edit" | "scope">("edit");
  const [shown, setShown] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const blank = rows.some((r) => !r.name.trim());

  const change = (key: string, part: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...part } : r)));
  const move = (index: number, by: number) =>
    setRows((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (step === "scope") setStep("edit");
      else onCancel();
    }
  };
  const save = async (usual: boolean) =>
    setRefused(
      await onSave(
        rows.map(({ id, name, characterId }) => ({ id, name, characterId })),
        usual,
      ),
    );

  return (
    <div className={styles.backdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={styles.dialog}
        onKeyDown={onKeyDown}
      >
        <h2 id={`${id}-title`} className={styles.dialogTitle}>
          {step === "edit"
            ? `Turn order for round ${round.number}`
            : "Save the order for"}
        </h2>
        {step === "edit" ? (
          <>
            {rows.length === 0 && (
              <p className={styles.dialogText}>No players.</p>
            )}
            {rows.map((row, i) => (
              <div key={row.key} className={styles.playerRow}>
                <span className={styles.pos}>{i + 1}</span>
                <input
                  className={`${styles.input} ${shown && !row.name.trim() ? styles.invalid : ""}`}
                  aria-label={`Player ${i + 1} name`}
                  placeholder="Player name"
                  value={row.name}
                  // biome-ignore lint/a11y/noAutofocus: the dialog's first field
                  autoFocus={i === 0}
                  onChange={(e) => change(row.key, { name: e.target.value })}
                />
                <select
                  className={styles.input}
                  aria-label={`Player ${i + 1} character`}
                  value={row.characterId ?? ""}
                  onChange={(e) =>
                    change(row.key, { characterId: e.target.value || null })
                  }
                >
                  <option value="">No character</option>
                  {row.characterId &&
                    !characters.some((c) => c.id === row.characterId) && (
                      <option value={row.characterId}>
                        (a deleted character)
                      </option>
                    )}
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className={styles.acts}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={`Move player ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={`Move player ${i + 1} down`}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={`Remove player ${i + 1}`}
                    onClick={() =>
                      setRows((list) => list.filter((r) => r.key !== row.key))
                    }
                  >
                    <X size={14} aria-hidden />
                  </button>
                </span>
              </div>
            ))}
            <div>
              <button
                type="button"
                className={`${styles.btn} ${styles.small} ${styles.quiet}`}
                onClick={() =>
                  setRows((list) => [
                    ...list,
                    { key: newKey(), id: null, name: "", characterId: null },
                  ])
                }
              >
                <Plus size={14} aria-hidden /> Add player
              </button>
            </div>
            {shown && blank && (
              <span className={styles.fieldError} role="alert">
                Enter a name for every player.
              </span>
            )}
            <div className={styles.dialogActs}>
              <button
                type="button"
                className={`${styles.btn} ${styles.quiet}`}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  setShown(true);
                  if (!blank) setStep("scope");
                }}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.dialogText}>
              Change this round only, or make this the usual order that the next
              rounds copy.
            </p>
            {refused && (
              <span className={styles.fieldError} role="alert">
                {refused}
              </span>
            )}
            <div className={styles.dialogActs}>
              <button
                type="button"
                className={`${styles.btn} ${styles.quiet}`}
                onClick={() => {
                  setRefused(null);
                  setStep("edit");
                }}
              >
                Back
              </button>
              <button
                type="button"
                className={styles.btn}
                // biome-ignore lint/a11y/noAutofocus: the step's first choice
                autoFocus
                onClick={() => save(false)}
              >
                This round only
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => save(true)}
              >
                The usual order too
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
