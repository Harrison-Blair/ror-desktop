import type { ReactNode } from "react";
import styles from "./MainPanel.module.css";

type MainPanelProps = {
  children?: ReactNode;
  // Floats over the top of the panel, such as the timer pill.
  overlay?: ReactNode;
};

export function MainPanel({ children, overlay }: MainPanelProps) {
  return (
    <main className={styles.main}>
      {overlay && <div className={styles.overlay}>{overlay}</div>}
      <div className={styles.inner}>{children}</div>
    </main>
  );
}
