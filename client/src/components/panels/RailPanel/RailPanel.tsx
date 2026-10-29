import type { ReactNode } from "react";
import styles from "./RailPanel.module.css";

type RailPanelProps = {
  title: string;
  open?: boolean;
  children?: ReactNode;
  width?: number;
  resizeHandle?: ReactNode;
  actions?: ReactNode;
};

export function RailPanel({
  title,
  open = true,
  children,
  width,
  resizeHandle,
  actions,
}: RailPanelProps) {
  if (!open) return null;

  return (
    <section
      className={styles.panel}
      aria-label={`${title} rail panel`}
      style={{ width }}
    >
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={styles.body}>{children}</div>
      {resizeHandle}
    </section>
  );
}
