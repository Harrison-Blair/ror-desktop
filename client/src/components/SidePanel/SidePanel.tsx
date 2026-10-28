import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./SidePanel.module.css";

type SidePanelProps = {
  open?: boolean;
  onClose?: () => void;
  label?: string;
  children?: ReactNode;
};

export function SidePanel({
  open = true,
  onClose,
  label = "Side panel",
  children,
}: SidePanelProps) {
  if (!open) return null;

  return (
    <aside className={styles.panel} aria-label={label}>
      {onClose && (
        <button
          type="button"
          className={styles.close}
          aria-label={`Close ${label}`}
          onClick={onClose}
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <div className={styles.body}>{children}</div>
    </aside>
  );
}
