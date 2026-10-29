import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import type { Entry } from "@/lib/notesApi";
import styles from "./DeleteDialog.module.css";

function countInside(entry: Entry) {
  let notes = 0;
  let folders = 0;
  for (const child of entry.children ?? []) {
    if (child.kind === "note") notes++;
    else {
      folders++;
      const inner = countInside(child);
      notes += inner.notes;
      folders += inner.folders;
    }
  }
  return { notes, folders };
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export function deleteQuestion(entry: Entry) {
  const { notes, folders } = countInside(entry);
  const parts = [
    notes > 0 && plural(notes, "note"),
    folders > 0 && plural(folders, "folder"),
  ].filter(Boolean);
  if (parts.length === 0) return `Move “${entry.name}” to the trash?`;
  return `Move “${entry.name}” and the ${parts.join(" and ")} inside it to the trash?`;
}

export function DeleteDialog({
  entry,
  onCancel,
  onConfirm,
}: {
  entry: Entry;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = [...(dialog.current?.querySelectorAll("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.shiftKey ? -1 : 1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
    event.preventDefault();
  };

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        className={styles.dialog}
        onKeyDown={onKeyDown}
      >
        <h2 id={`${id}-title`} className={styles.title}>
          {deleteQuestion(entry)}
        </h2>
        <p id={`${id}-text`} className={styles.text}>
          You can restore it from the system trash.
        </p>
        <div className={styles.actions}>
          <button
            ref={cancel}
            type="button"
            className={styles.button}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={onConfirm}
          >
            Move to trash
          </button>
        </div>
      </div>
    </div>
  );
}
