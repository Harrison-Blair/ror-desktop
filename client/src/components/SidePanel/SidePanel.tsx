import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./SidePanel.module.css";

type SidePanelProps = {
  open?: boolean;
  onClose?: () => void;
  label?: string;
  children?: ReactNode;
  width?: number;
  resizeHandle?: ReactNode;
};

export function SidePanel({
  open = true,
  onClose,
  label = "Side panel",
  children,
  width,
  resizeHandle,
}: SidePanelProps) {
  if (!open) return null;

  return (
    <aside className={styles.panel} aria-label={label} style={{ width }}>
      <div className={styles.scroll}>
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
      </div>
      {resizeHandle}
    </aside>
  );
}
