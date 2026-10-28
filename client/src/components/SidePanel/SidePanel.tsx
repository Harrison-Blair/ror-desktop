import { X } from "lucide-react";
import { type ReactNode, useId } from "react";
import styles from "./SidePanel.module.css";

type SidePanelProps = {
  open?: boolean;
  onClose?: () => void;
  title: string;
  children?: ReactNode;
  width?: number;
  resizeHandle?: ReactNode;
};

export function SidePanel({
  open = true,
  onClose,
  title,
  children,
  width,
  resizeHandle,
}: SidePanelProps) {
  const titleId = useId();
  if (!open) return null;

  return (
    <aside className={styles.panel} aria-labelledby={titleId} style={{ width }}>
      <div className={styles.scroll}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {onClose && (
            <button
              type="button"
              className={styles.close}
              aria-label={`Close ${title}`}
              onClick={onClose}
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
      {resizeHandle}
    </aside>
  );
}
