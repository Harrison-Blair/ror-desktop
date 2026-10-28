import type { ReactNode } from "react";
import styles from "./MainPanel.module.css";

type MainPanelProps = {
  children?: ReactNode;
};

export function MainPanel({ children }: MainPanelProps) {
  return (
    <main className={styles.main}>
      <div className={styles.inner}>{children}</div>
    </main>
  );
}
