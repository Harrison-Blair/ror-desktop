import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import styles from "./ConfirmDialog.module.css";

export type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  // Shows the confirm button in the error colour, for an action that deletes.
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
        aria-describedby={message ? `${id}-text` : undefined}
        className={styles.dialog}
        onKeyDown={onKeyDown}
      >
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
        {message && (
          <p id={`${id}-text`} className={styles.text}>
            {message}
          </p>
        )}
        <div className={styles.actions}>
          <button
            ref={cancel}
            type="button"
            className={styles.button}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}${danger ? ` ${styles.danger}` : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
